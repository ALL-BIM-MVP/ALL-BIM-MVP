# dev_tools/excel_report.py
#
# SOLO PARA PRUEBAS — no lo importa pipeline.py ni cli.py, no corre
# nunca en el camino real (Node no lo llama). Es para inspeccionar a
# ojo el resultado de un procesamiento mientras se valida el pipeline.
# Cuando se borre proceso-metrados-base, este archivo se puede borrar
# entero sin tocar nada de lo demás.
#
# A diferencia del Excel de 14 columnas del pipeline original (agrupado
# por nivel/espacio/dimensiones con estilos), esto es deliberadamente
# más simple: una hoja "Resumido" (ITEM/DESCRIPCIÓN/UND/TOTAL, sumando
# metrado_elements por partida según la unidad, mismo criterio que
# queries.sql) y una hoja "Detallado" (una fila por elemento, sin
# agrupar). Alcanza para revisar que el procesamiento tiene sentido,
# no busca reemplazar el reporte final que use el producto.
#
# Requiere openpyxl (no es dependencia de processing/requirements.txt
# porque el pipeline real no la necesita — instalar aparte para usar
# esto: pip install openpyxl).
import sys

from ..pipeline import procesar_ifc

COLUMNA_POR_UNIDAD = {
    "m": "length",
    "m2": "area",
    "m3": "volume",
    "kg": "weight",
}


def _valor_metrado(unit, metrado_element):
    columna = COLUMNA_POR_UNIDAD.get(unit, "quantity")
    return metrado_element.get(columna) or 0.0


def generar_excel(resultado: dict, out_path: str) -> None:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()

    partidas_por_code = {p["code"]: p for p in resultado["partidas"]}
    totales = {code: 0.0 for code in partidas_por_code}
    for me in resultado["metrado_elements"]:
        partida = partidas_por_code.get(me["partida_code"])
        if not partida:
            continue
        totales[me["partida_code"]] += _valor_metrado(partida["unit"], me)

    ws_resumen = wb.active
    ws_resumen.title = "Resumido"
    ws_resumen.append(["ITEM", "DESCRIPCIÓN", "UND", "TOTAL"])
    for cell in ws_resumen[1]:
        cell.font = Font(bold=True)
    for p in sorted(partidas_por_code.values(), key=lambda x: x["code"]):
        ws_resumen.append([p["code"], p["description"], p["unit"] or "", round(totales.get(p["code"], 0.0), 2)])

    elements_by_id = {e["express_id"]: e for e in resultado["elements"]}
    ws_detalle = wb.create_sheet("Detallado")
    ws_detalle.append(["ITEM", "DESCRIPCIÓN", "UND", "TAG", "NIVEL", "ESPACIO",
                        "Largo", "Ancho", "Alto", "Cant.", "Área", "Vol.", "Kg."])
    for cell in ws_detalle[1]:
        cell.font = Font(bold=True)
    for me in resultado["metrado_elements"]:
        partida = partidas_por_code.get(me["partida_code"], {})
        el = elements_by_id.get(me["express_id"], {})
        ws_detalle.append([
            me["partida_code"], partida.get("description", ""), partida.get("unit", ""),
            el.get("tag"), el.get("level_name"), el.get("space_name"),
            me["length"], me["width"], me["height"], me["quantity"], me["area"], me["volume"], me["weight"],
        ])

    wb.save(out_path)
    print(f"✔ Excel de prueba exportado a {out_path}")


def main():
    if len(sys.argv) < 4:
        print("Uso: python -m processing.ifc.dev_tools.excel_report <ifc> <norma.json> <salida.xlsx>", file=sys.stderr)
        raise SystemExit(1)
    ifc_path, norma_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    resultado = procesar_ifc(ifc_path, norma_path)
    generar_excel(resultado, out_path)


if __name__ == "__main__":
    main()
