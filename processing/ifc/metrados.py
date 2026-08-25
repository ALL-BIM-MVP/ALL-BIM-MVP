# metrados.py
#
# Fusión por prioridad de los 5 valores de metrado (lon, area, vol,
# weight, count) que terminan mapeados a metrado_elements.{length,area,
# volume,weight,quantity} en la BD. Esto reemplaza el comportamiento
# viejo de core.py, que siempre calculaba el metrado a partir de
# dimensiones e ignoraba por completo lo que el IFC ya traía calculado
# (metrados_revit se guardaba aparte, nunca se usaba para decidir).
#
# Regla (revisada — antes esto era "Revit (tipado o de texto,
# indistinto) siempre gana, geométrico solo si Revit no trajo nada").
# Eso enmascaraba por completo cualquier mejora al cálculo geométrico
# (ver extraction.obtener_dimensiones/geometria_proyeccion) para
# cualquier elemento donde el fallback de texto de Revit encontrara
# ALGO, aunque fuera un valor mal etiquetado (bug real, confirmado con
# datos: una ventana con "ALTURA DE EXTREMO INICIAL" terminaba de
# longitud). La nueva prioridad, de más a menos confiable:
#   lon/area/vol  -> 1) metrados_tipados (IfcElementQuantity — typed,
#                       sin ambigüedad de nombre)
#                    2) geometría real (extraction.calcular_metrados a
#                       partir de obtener_dimensiones, que ya incluye
#                       la proyección de caras — más confiable que
#                       adivinar por palabra clave)
#                    3) metrados_texto (IfcPropertySingleValue
#                       adivinado por nombre — último recurso, ahora
#                       protegido con descalificadores + no-negatividad,
#                       pero sigue siendo una adivinanza de texto)
#   weight        -> SIEMPRE null, excepto IfcReinforcingBar (acero):
#                    ahí se calcula por diámetro nominal contra
#                    TABLA_PESOS_ACERO (fallback: CrossSectionArea *
#                    densidad si el diámetro no está en la tabla).
#   count         -> metrados_tipados["count"] si existe, si no
#                    metrados_texto["count"], si no 1.0.
#                    (Nota: partidas 'und' sin NINGUNA propiedad Revit
#                    de conteo, ej. "bisagras por puerta", van a caer
#                    en count=1.0 por defecto — no hay con qué inferir
#                    ese tipo de regla de negocio solo desde el IFC.
#                    Se deja documentado, no resuelto acá.)
#
# width/height (metrado_elements.width/height) NO pasan por esta
# fusión — el llamador los toma directo de dimensiones["Ancho"]/["Alto"]
# (obtener_dimensiones), porque Revit no tiene un IfcQuantity análogo a
# "ancho"/"alto", solo Length/Area/Volume/Count/Weight.

from .config import DENSIDAD_ACERO_KG_M3
from .extraction import calcular_metrados, peso_nominal_kg_por_metro


def _metrados_acero(el):
    """Solo para IfcReinforcingBar con BarLength. Devuelve None si el
    elemento no es una barra de acero o no trae BarLength (ahí no hay
    caso especial, sigue la prioridad normal revit/geométrico más abajo,
    y weight queda null como cualquier otro elemento).

    Si SÍ es una barra con BarLength: lon/area/count quedan fijos
    (lon=BarLength, area=0.0 — una barra no tiene "área" como metrado,
    count=1.0), igual que en el pipeline original. weight/vol se
    calculan si hay diámetro nominal o sección transversal disponible;
    si ninguno está, quedan en None (no hay con qué inventarlos) pero
    lon/area/count se fijan igual.

    fuente_peso: 'acero_diametro' | 'acero_seccion' | None — de dónde
    salió weight/vol acá (ver origen_metrado en calcular_metrados_final,
    docs/roadmap/consolidacion-y-hardening.md punto 6). None si no hubo
    ni diámetro ni sección (vol queda para el fallback geométrico del
    llamador, weight queda null)."""
    if not el.is_a('IfcReinforcingBar'):
        return None

    largo = el.BarLength
    if not largo:
        return None

    weight = None
    volumen = None
    fuente_peso = None

    diametro = el.NominalDiameter
    if diametro:
        kg_por_m = peso_nominal_kg_por_metro(diametro)
        if kg_por_m is not None:
            weight = largo * kg_por_m
            volumen = weight / DENSIDAD_ACERO_KG_M3
            fuente_peso = "acero_diametro"

    if weight is None:
        area_sec = el.CrossSectionArea
        if area_sec:
            volumen = area_sec * largo
            weight = volumen * DENSIDAD_ACERO_KG_M3
            fuente_peso = "acero_seccion"

    return {"lon": largo, "area": 0.0, "vol": volumen, "weight": weight, "count": 1.0, "fuente_peso": fuente_peso}


def calcular_metrados_final(el, dims, metrados_tipados, metrados_texto, prioridad="norma"):
    """Punto de entrada único: dado el elemento IFC, sus dimensiones
    (obtener_dimensiones) y las dos fuentes que se pudieron extraer
    directo del IFC (extraction.extraer_metrados_revit_completo —
    tipada y de texto, por separado a propósito, ver comentario de
    cabecera), devuelve el dict final de 5 valores:
    {lon, area, vol, weight, count}.

    prioridad="norma" (default, sin cambios de comportamiento): tipado
    > geométrico > texto, tal cual el comentario de cabecera.

    prioridad="manual" (Fase 4, ver classify.clasificar_elementos_manual):
    el orden se invierte en las puntas — texto > geométrico > tipado.
    En este modo, metrados_texto ya viene FILTRADO por property_prefix
    (solo lo que el usuario escribió a mano, ver
    extraction.extraer_metrados_revit_completo) — es la fuente más
    confiable acá, al revés que en modo norma. metrados_tipados
    (IfcElementQuantity/Qto_*) es SIEMPRE generado por el exportador de
    Revit, nunca algo que el usuario tipeó — por eso pasa a ser el
    último recurso, no el primero. geometría real queda en el medio en
    los dos modos, sin cambios.

    Además de los 5 valores, devuelve de dónde salió CADA UNO
    (`_fuente_lon/_fuente_area/_fuente_vol/_fuente_count/_fuente_peso`
    — 'tipado'|'geometrico'|'texto'|'default'|'acero'|'acero_diametro'|
    'acero_seccion'|None) — ver docs/roadmap/consolidacion-y-hardening.md
    punto 6. El llamador (classify.py) se queda con UNA sola de estas 5
    según la unidad de la partida (origen_metrado), el resto se
    descarta — no se guardan las 5 en la BD, solo la que de verdad
    importa para esa partida."""
    fuente_primero, fuente_ultimo = ("texto", "tipado") if prioridad == "manual" else ("tipado", "texto")
    primero, ultimo = (metrados_texto, metrados_tipados) if prioridad == "manual" else (metrados_tipados, metrados_texto)

    acero = _metrados_acero(el)
    if acero is not None:
        vol = acero["vol"]
        fuente_vol = acero["fuente_peso"]
        if vol is None:
            # No hubo diámetro ni sección transversal para calcular vol —
            # como último recurso, geometría a partir de dimensiones.
            vol = calcular_metrados(dims, el)["vol"]
            fuente_vol = "geometrico"
        return {
            "lon": acero["lon"],
            "area": acero["area"],
            "vol": vol,
            "weight": acero["weight"],
            "count": acero["count"],
            # Una barra de acero no tiene vanos (get_openings nunca la
            # toca), así que estas banderas no cambian nada acá — se
            # incluyen solo para que el dict tenga la misma forma que
            # el resto de los retornos de esta función.
            "_area_neta_huecos": False,
            "_vol_neta_huecos": False,
            # lon/area/count salen directo de BarLength del elemento —
            # ni tipado, ni geométrico, ni texto, un origen propio.
            "_fuente_lon": "acero", "_fuente_area": "acero", "_fuente_count": "acero",
            "_fuente_vol": fuente_vol, "_fuente_peso": acero["fuente_peso"],
        }

    # 1. Primera fuente según el modo (tipado en 'norma', texto filtrado
    # por prefijo en 'manual' — ver docstring)
    lon = primero.get("lon")
    area = primero.get("area")
    vol = primero.get("vol")
    count = primero.get("count")
    fuente_lon = fuente_primero if lon is not None else None
    fuente_area = fuente_primero if area is not None else None
    fuente_vol = fuente_primero if vol is not None else None
    fuente_count = fuente_primero if count is not None else None

    # area_neta_huecos/vol_neta_huecos: si el valor final terminó
    # saliendo de la geometría (calcular_metrados) Y esa geometría vino
    # de la malla real (area_geom/vol_geom, no de la fórmula por
    # clase), YA viene neta de vanos — IfcOpenShell resuelve los
    # IfcRelVoidsElement al triangular el sólido por default (ver
    # extraction.calcular_metrados, confirmado con datos reales) — así
    # que classify._aplicar_descuento_huecos NO debe restar de nuevo.
    # Si en cambio el valor vino de tipado (IfcElementQuantity) o de
    # texto (más abajo), la bandera queda en False — no hay evidencia
    # con datos reales de este proyecto de que esos valores de Revit ya
    # vengan netos de vanos (no se tocó ese comportamiento, sigue
    # descontando como siempre).
    area_neta_huecos = False
    vol_neta_huecos = False

    # 2. Geometría real (obtener_dimensiones, incluye proyección de caras)
    if lon is None or area is None or vol is None:
        geometrico = calcular_metrados(dims, el)
        if lon is None:
            lon = geometrico["lon"]
            fuente_lon = "geometrico"
        if area is None:
            area = geometrico["area"]
            area_neta_huecos = geometrico["_area_neta_huecos"]
            fuente_area = "geometrico"
        if vol is None:
            vol = geometrico["vol"]
            vol_neta_huecos = geometrico["_vol_neta_huecos"]
            fuente_vol = "geometrico"

    # 3. Última fuente según el modo (texto en 'norma', tipado en
    # 'manual' — ver docstring)
    if lon is None:
        lon = ultimo.get("lon")
        fuente_lon = fuente_ultimo if lon is not None else None
    if area is None:
        area = ultimo.get("area")
        fuente_area = fuente_ultimo if area is not None else None
    if vol is None:
        vol = ultimo.get("vol")
        fuente_vol = fuente_ultimo if vol is not None else None
    if count is None:
        count = ultimo.get("count")
        fuente_count = fuente_ultimo if count is not None else None

    if count is None:
        count = 1.0
        fuente_count = "default"

    return {
        "lon": lon, "area": area, "vol": vol, "weight": None, "count": count,
        "_area_neta_huecos": area_neta_huecos,
        "_vol_neta_huecos": vol_neta_huecos,
        "_fuente_lon": fuente_lon, "_fuente_area": fuente_area, "_fuente_vol": fuente_vol,
        "_fuente_count": fuente_count, "_fuente_peso": None,
    }
