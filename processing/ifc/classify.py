# classify.py
#
# Clasificación de elementos IFC contra la norma (OE.xx.xx...) — port de
# proceso-metrados-base/core.py: procesar_elementos() +
# reasignar_sin_clasificacion(), con dos cambios de fondo:
#   1) el metrado de cada elemento ya no se calcula siempre por
#      dimensiones acá — se delega a metrados.calcular_metrados_final()
#      (prioridad revit > geométrico, weight solo acero).
#   2) el resultado es una lista plana de elementos clasificados, no un
#      árbol de presentación (eso lo arma normalize.py).
import ifcopenshell.util.element

from .config import ESPECIALIDADES_ACTIVAS, CLAVE_SIN_ESPECIALIDAD, CLAVE_FUERA_DE_NORMA
from .extraction import (
    extraer_datos_clasificacion, normalizar_codigo, formatear_codigo,
    buscar_entrada_norma, obtener_dimensiones, inferir_unidad,
    get_storey_and_space, obtener_unidad_por_mayoria,
    extraer_dimensiones_parametricas, extraer_dimensiones_por_aristas,
    get_openings, extraer_element_id, extraer_metrados_revit_completo,
)
from .metrados import calcular_metrados_final


def _procesar_huecos_descuento(el, dims):
    """Área/volumen que hay que restarle al elemento por sus vanos
    (puertas/ventanas empotradas en un muro, por ejemplo). Devuelve
    (area_huecos, volumen_huecos), (0.0, 0.0) si no tiene o no se
    pudieron medir.

    Bug real encontrado con datos (no solo de ordenamiento de ejes,
    conceptual): un IfcOpeningElement se modela con una extrusión a
    propósito MÁS PROFUNDA que el espesor real de cualquier capa
    individual del muro (para garantizar que el vano atraviese TODAS
    las capas de un muro compuesto de una sola vez) — confirmado con un
    vano real: profundidad de extrusión 3.048m para una puerta de
    0.8×2.15m. extraer_dimensiones_parametricas() SIEMPRE devuelve esa
    profundidad como "Largo" (nunca una dimensión de la cara — ver su
    propio código: depth->Largo, profile.XDim->Ancho, profile.YDim->Alto,
    estructuralmente, no por casualidad), así que:
      - El ÁREA real del vano es Ancho×Alto (el perfil, XDim×YDim) — NO
        depende de reordenar por eje Z, el producto da lo mismo sea
        cual sea la orientación real.
      - El VOLUMEN a descontar NO debe salir de multiplicar por la
        profundidad propia del vano (eso daría el volumen del vano
        completo, atravesando capas que no son ESTA capa) — tiene que
        ser área_vano × espesor de ESTE elemento (dims["Ancho"], ya
        resuelto por obtener_dimensiones/geometria_proyeccion antes de
        llegar acá). Con el bug: un vano normal en un muro de
        tarrajeo de 1cm terminaba descontando ~17 m³ (la profundidad
        completa del vano) de un muro que en total mide ~0.11 m³ —
        alcanzaba de sobra para anular el metrado entero."""
    openings = get_openings(el)
    if not openings:
        return 0.0, 0.0
    espesor_el = dims.get("Ancho") or 0.0
    area_total = 0.0
    vol_total = 0.0
    for opening in openings:
        dims_op = extraer_dimensiones_parametricas(opening)
        if dims_op and dims_op.get("Ancho") and dims_op.get("Alto"):
            area_opening = dims_op["Ancho"] * dims_op["Alto"]
        else:
            dims_edges = extraer_dimensiones_por_aristas(opening)
            area_opening = dims_edges["Largo"] * dims_edges["Alto"] if dims_edges else None
        if area_opening:
            area_total += area_opening
            vol_total += area_opening * espesor_el
    return area_total, vol_total


def _aplicar_descuento_huecos(metrados, el, dims, unidad):
    """Resta el área/volumen de los vanos SOLO del campo que todavía no
    los tiene descontados. metrados_final marca cada campo con
    _area_neta_huecos/_vol_neta_huecos=True cuando salió de la malla
    real (obtener_dimensiones -> _area_geom/_vol_geom) — IfcOpenShell
    ya resuelve los IfcRelVoidsElement al triangular el sólido por
    default, así que ESE valor ya viene sin el material de los vanos.
    Restar acá de nuevo sobre un valor así sería descontar el mismo
    vano dos veces — confirmado con datos reales: muro 2045 de
    desenlazado.ifc, 2 ventanas, volumen de malla ya neto = 1.30 m³;
    con el descuento de acá aplicado igual (bug, antes de esta
    bandera) bajaba a 0.74 m³, un ~43% de más. Cuando el campo NO es
    neto (vino de la fórmula por clase de calcular_metrados, o de
    Revit tipado/texto — sobre esos dos no hay evidencia de que ya
    vengan netos, se mantiene el descuento como siempre) esta resta
    sigue siendo necesaria."""
    if unidad not in ("m2", "m3"):
        return metrados
    area_huecos, vol_huecos = _procesar_huecos_descuento(el, dims)
    if area_huecos == 0.0 and vol_huecos == 0.0:
        return metrados
    metrados = dict(metrados)
    if not metrados.get("_area_neta_huecos"):
        metrados["area"] = max(0.0, metrados["area"] - area_huecos)
    if not metrados.get("_vol_neta_huecos"):
        metrados["vol"] = max(0.0, metrados["vol"] - vol_huecos)
    return metrados


def _elemento_base(el, dims, metrados, storey, space, propiedades, **kwargs):
    elem = {
        "el": el,
        "express_id": el.id(),
        "tag": extraer_element_id(el),
        "dimensiones": dims,
        "metrados": metrados,
        "storey": storey,
        "space": space,
        "propiedades": propiedades,
    }
    elem.update(kwargs)
    return elem


def clasificar_elementos(model, norma_index, hijos):
    """Recorre todos los IfcProduct del modelo y los clasifica contra la
    norma. Devuelve (elementos, elementos_sin_clasificacion) — las
    propiedades por elemento (para ifc_properties/ifc_property_values/
    ifc_element_property_values) las arma normalize.py directo desde
    elem["propiedades"], no hace falta llevar un mapa global aparte acá
    (y así los elementos reasignados por reasignar_sin_clasificacion,
    que se agregan después, quedan cubiertos igual sin duplicar lógica)."""
    elementos = []
    elementos_sin_clasificacion = []
    codigos_malformados = 0
    incompletos = 0

    for el in model.by_type("IfcProduct"):
        if el.is_a('IfcOpeningElement') or el.is_a('IfcSpace'):
            continue

        codigo, nombre_partida = extraer_datos_clasificacion(el)
        if not codigo:
            elementos_sin_clasificacion.append({
                "express_id": el.id(),
                "clase": el.is_a(),
                "nombre": getattr(el, "Name", None),
            })
            continue

        tup = normalizar_codigo(codigo)
        if not tup:
            codigos_malformados += 1
            continue

        psets = ifcopenshell.util.element.get_psets(el)
        dims = obtener_dimensiones(el, psets)

        revit_data = extraer_metrados_revit_completo(el)
        metrados_tipados = revit_data["metrados_tipados"]
        metrados_texto = revit_data["metrados_texto"]
        propiedades = revit_data["propiedades"]

        metrados = calcular_metrados_final(el, dims, metrados_tipados, metrados_texto)
        storey, space = get_storey_and_space(el, model)

        # --- Sin especialidad activa (n1 fuera de ESPECIALIDADES_ACTIVAS) ---
        if tup[0] not in ESPECIALIDADES_ACTIVAS:
            unidad = inferir_unidad(dims)
            metrados = _aplicar_descuento_huecos(metrados, el, dims, unidad)
            elementos.append(_elemento_base(
                el, dims, metrados, storey, space, propiedades,
                tipo="sin_especialidad",
                codigo_reporte=codigo,
                codigo_padre=CLAVE_SIN_ESPECIALIDAD,
                nombre_partida=nombre_partida or codigo,
                unidad=unidad,
            ))
            continue

        tup_hallado, entrada, es_exacta = buscar_entrada_norma(tup, norma_index)

        # --- Fuera de norma (no matchea ningún ancestro en la norma) ---
        if entrada is None:
            unidad = inferir_unidad(dims)
            metrados = _aplicar_descuento_huecos(metrados, el, dims, unidad)
            codigo_fmt = formatear_codigo(tup)
            elementos.append(_elemento_base(
                el, dims, metrados, storey, space, propiedades,
                tipo="fuera_de_norma",
                codigo_reporte=codigo_fmt,
                codigo_padre=CLAVE_FUERA_DE_NORMA,
                nombre_partida=nombre_partida or codigo_fmt,
                unidad=unidad,
            ))
            continue

        # --- Clasificación incompleta (matcheó una carpeta, no una partida) ---
        if entrada["tipo"] == "carpeta":
            incompletos += 1
            continue

        # --- Partida válida (exacta o via sub-nivel) ---
        unidad_norma = entrada.get("unidad")
        if not es_exacta and len(tup) < len(tup_hallado):
            unidad_norma = unidad_norma or obtener_unidad_por_mayoria(tup_hallado, norma_index, hijos)

        if not es_exacta and len(tup) > len(tup_hallado):
            sufijo = tup[len(tup_hallado):]
            sufijo_txt = ".".join(str(s) for s in sufijo)
            codigo_reporte = f"{entrada['codigo']}.{sufijo_txt}"
            nombre_efectivo = nombre_partida if nombre_partida else sufijo_txt
        else:
            codigo_reporte = entrada["codigo"]
            nombre_efectivo = nombre_partida if nombre_partida else entrada["descripcion"]

        if unidad_norma is None:
            unidad_norma = inferir_unidad(dims)

        metrados = _aplicar_descuento_huecos(metrados, el, dims, unidad_norma)

        elementos.append(_elemento_base(
            el, dims, metrados, storey, space, propiedades,
            tipo="partida",
            codigo_reporte=codigo_reporte,
            codigo_base=entrada["codigo"],
            codigo_padre=entrada["codigo"] if codigo_reporte != entrada["codigo"] else None,
            nombre_partida=nombre_efectivo,
            unidad=unidad_norma,
        ))

    if codigos_malformados > 0:
        print(f"⚠ {codigos_malformados} elementos descartados por código mal formado.")
    if incompletos > 0:
        print(f"⚠ {incompletos} elementos con clasificación incompleta (matchean una carpeta, no una partida).")

    return elementos, elementos_sin_clasificacion


def reasignar_sin_clasificacion(elementos_sin_clasificacion, elementos_clasificados, model):
    """Segundo intento para los elementos que no traían código OE.xx:
    si el nombre del elemento contiene el nombre de una partida ya
    detectada (heurística por texto), se lo asigna ahí. Port de
    core.py:reasignar_sin_clasificacion, adaptado a la lista plana."""
    nombres_partidas = {}
    for elem in elementos_clasificados:
        if elem["tipo"] != "partida":
            continue
        codigo = elem["codigo_reporte"]
        if codigo not in nombres_partidas:
            nombres_partidas[codigo] = {
                "nombre_norm": elem["nombre_partida"].upper().strip(),
                "nombre": elem["nombre_partida"],
                "unidad": elem["unidad"],
            }

    reasignados = []
    sin_asignar = []

    for elem in elementos_sin_clasificacion:
        nombre_completo = str(elem.get("nombre") or "").upper().strip()
        if not nombre_completo:
            sin_asignar.append(elem)
            continue

        encontrado = None
        for codigo, datos in nombres_partidas.items():
            if datos["nombre_norm"] and datos["nombre_norm"] in nombre_completo:
                encontrado = (codigo, datos)
                break

        if not encontrado:
            sin_asignar.append(elem)
            continue

        el_ifc = model.by_id(elem["express_id"])
        if not el_ifc:
            sin_asignar.append(elem)
            continue

        codigo, datos = encontrado
        psets = ifcopenshell.util.element.get_psets(el_ifc)
        dims = obtener_dimensiones(el_ifc, psets)
        revit_data = extraer_metrados_revit_completo(el_ifc)
        metrados = calcular_metrados_final(el_ifc, dims, revit_data["metrados_tipados"], revit_data["metrados_texto"])
        unidad = datos["unidad"] or inferir_unidad(dims)
        metrados = _aplicar_descuento_huecos(metrados, el_ifc, dims, unidad)
        storey, space = get_storey_and_space(el_ifc, model)

        reasignados.append(_elemento_base(
            el_ifc, dims, metrados, storey, space, revit_data["propiedades"],
            tipo="partida",
            codigo_reporte=codigo,
            codigo_base=codigo,
            codigo_padre=None,
            nombre_partida=datos["nombre"],
            unidad=unidad,
        ))

    print(f"  Elementos sin clasificación reasignados: {len(reasignados)}")
    print(f"  Elementos sin clasificación sin asignar: {len(sin_asignar)}")
    return reasignados, sin_asignar
