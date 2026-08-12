# normalize.py
#
# Reemplaza construir_jerarquia() + exportar_json() de core.py. En vez
# de un árbol anidado por nivel/espacio (presentación para Excel), arma
# el JSON plano alineado 1:1 a las tablas de la BD (ver contrato en el
# plan / docs). Nada de metrados_bruto/huecos/aristas por elemento acá
# — eso ya se usó y se descartó en classify.py, no se serializa.
from .config import CLAVE_SIN_ESPECIALIDAD, CLAVE_FUERA_DE_NORMA
from .extraction import normalizar_codigo


def _registrar_partida(partidas, code, parent_code, description, unit):
    existente = partidas.get(code)
    if existente is None:
        partidas[code] = {
            "code": code,
            "parent_code": parent_code,
            "description": description,
            "unit": unit,
            "sort_order": len(partidas),
        }
        return
    # Un código puede materializarse primero como ancestro/carpeta
    # (unit=None, de paso mientras se registran los ancestros de otro
    # elemento) y más tarde resolverse como la partida real con unidad.
    if unit is not None and existente["unit"] is None:
        existente["unit"] = unit
        existente["description"] = description


def _registrar_ancestros_norma(partidas, tup, norma_index):
    """Materializa tup y todos sus ancestros (raíz -> tup) como
    partidas/carpetas, devuelve el código de tup (o None si tup no está
    en la norma)."""
    padre_code = None
    for i in range(1, len(tup) + 1):
        sub_tup = tup[:i]
        entrada = norma_index.get(sub_tup)
        if entrada is None:
            break
        unit = entrada.get("unidad") if entrada["tipo"] == "partida" else None
        _registrar_partida(partidas, entrada["codigo"], padre_code, entrada["descripcion"], unit)
        padre_code = entrada["codigo"]
    return padre_code


_DESCRIPCION_CONTENEDOR = {
    CLAVE_SIN_ESPECIALIDAD: "Elementos sin especialidad activa",
    CLAVE_FUERA_DE_NORMA: "Elementos fuera de norma",
}


def normalizar(elementos, norma_index, schema_version):
    """elementos: salida de classify.clasificar_elementos() (+ los
    reasignados de reasignar_sin_clasificacion, si corresponde), ya
    concatenados en una sola lista."""
    partidas = {}
    metrado_elements = []
    elements = []
    seen_express_ids = set()

    property_definitions = set()
    property_values = set()
    element_property_map = {}

    for elem in elementos:
        express_id = elem["express_id"]

        if express_id not in seen_express_ids:
            seen_express_ids.add(express_id)
            el = elem["el"]
            elements.append({
                "express_id": express_id,
                "global_id": getattr(el, "GlobalId", None),
                "tag": elem["tag"],
                "ifc_type": el.is_a(),
                "name": getattr(el, "Name", None),
                "level_name": elem["storey"],
                "space_name": elem["space"],
            })
            for prop_name, prop_value in elem["propiedades"].items():
                val_str = str(prop_value)
                property_definitions.add(("", prop_name))
                property_values.add(("", prop_name, val_str))
                element_property_map.setdefault(express_id, set()).add(("", prop_name, val_str))

        if elem["tipo"] == "partida":
            tup_base = normalizar_codigo(elem["codigo_base"])
            if tup_base is not None:
                _registrar_ancestros_norma(partidas, tup_base, norma_index)
            if elem["codigo_reporte"] != elem["codigo_base"]:
                _registrar_partida(partidas, elem["codigo_reporte"], elem["codigo_base"],
                                    elem["nombre_partida"], elem["unidad"])
        else:  # sin_especialidad / fuera_de_norma
            contenedor = elem["codigo_padre"]
            _registrar_partida(partidas, contenedor, None,
                                _DESCRIPCION_CONTENEDOR.get(contenedor, contenedor), None)
            _registrar_partida(partidas, elem["codigo_reporte"], contenedor,
                                elem["nombre_partida"], elem["unidad"])

        dims = elem["dimensiones"]
        met = elem["metrados"]
        metrado_elements.append({
            "partida_code": elem["codigo_reporte"],
            "express_id": express_id,
            "length": met["lon"],
            "width": dims.get("Ancho"),
            "height": dims.get("Alto"),
            "quantity": met["count"],
            "area": met["area"],
            "volume": met["vol"],
            "weight": met["weight"],
        })

    definitions = [{"property_set": d[0], "property_name": d[1]} for d in property_definitions]
    values = [{"property_set": v[0], "property_name": v[1], "value": v[2]} for v in property_values]
    relations = []
    for express_id, props in element_property_map.items():
        for pset, name, value in props:
            relations.append({"express_id": express_id, "property_set": pset, "property_name": name, "value": value})

    return {
        "schema_version": schema_version,
        "elements": elements,
        "properties": {"definitions": definitions, "values": values, "relations": relations},
        "partidas": list(partidas.values()),
        "metrado_elements": metrado_elements,
    }
