# cli.py
#
# Uso standalone (sin pasar por Node ni el endpoint):
#   python3 -m processing.ifc.cli archivo.ifc --norma norma.json
#       -> sin --out, se guarda solo en processing/output/<archivo>.json
#          (carpeta DENTRO del repo, se crea sola si no existe — para
#          uso manual/de prueba esto es más útil que tirar 2-3MB de
#          JSON crudo a la terminal, y no depende de /tmp del sistema
#          ni de acordarse de pasar --out). CON formato/indentado (más
#          fácil de leer a mano, pesa más) — es el único caso donde se
#          activa solo, justo porque es el que un humano va a abrir.
#   python3 -m processing.ifc.cli archivo.ifc --norma norma.json --out ruta/propia.json
#       -> guarda exactamente ahí (relativo o absoluto), COMPACTO por
#          defecto — esto es lo que usa el runner de Node
#          (ifc-processing-runner.ts), siempre con un path propio en el
#          tmp del SO: nadie lo lee a mano, se borra apenas se procesa,
#          no tiene sentido pagar el peso extra del indentado ahí.
#   python3 -m processing.ifc.cli archivo.ifc --norma norma.json --out -
#       -> imprime el JSON a stdout (para pipear a jq, etc.), no guarda nada.
#   Agregá --pretty en cualquiera de los tres casos para forzar el
#   indentado (o sacarlo del default con --out sin --pretty).
#
# Es la misma función (pipeline.procesar_ifc) que invoca el runner de
# Node como subprocess — no hay dos implementaciones de la extracción,
# solo tres formas de recibir el resultado.
import argparse
import json
import sys
from pathlib import Path

from .pipeline import procesar_ifc, probar_ifc

# Resuelto relativo a ESTE archivo (no al cwd desde donde se invoque)
# para que el default sea siempre el mismo lugar dentro del repo, sin
# importar desde qué carpeta corriste `python -m processing.ifc.cli`.
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def main():
    parser = argparse.ArgumentParser(description="Procesa un IFC y produce el JSON normalizado de metrados.")
    parser.add_argument("ifc_path", help="Ruta al archivo .ifc")
    parser.add_argument("--norma", help="Ruta al norma.json (obligatorio salvo con --dry-run)")
    parser.add_argument(
        "--classification-config",
        help=(
            "Ruta a un JSON con la config de clasificación manual (Fase 4) — "
            "{\"mode\": \"manual\", \"property_prefix\": ..., "
            "\"code_property_set\"/\"code_property_name\", "
            "\"description_property_set\"/\"description_property_name\" (opcionales), "
            "\"unit_property_set\"/\"unit_property_name\" (opcionales)}. "
            "Si se omite, clasifica en modo 'norma' (comportamiento de siempre)."
        ),
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help=(
            "Consolidación punto 5 — en vez de procesar el IFC completo "
            "(geometría + metrado + insertar), solo escanea qué elementos "
            "matchean la config de clasificación manual (--classification-config, "
            "obligatorio acá) y devuelve un resumen chico — no un JSON "
            "normalizado completo. Mucho más rápido (sin geometría), pensado "
            "para 'probar esta config antes de comprometerse a un reproceso "
            "de minutos'. No necesita --norma."
        ),
    )
    parser.add_argument(
        "--out",
        help=(
            "Archivo de salida. Si se omite, se guarda en "
            f"{DEFAULT_OUTPUT_DIR}/<nombre_del_ifc>.json. Usá '-' para "
            "imprimir el JSON a stdout en vez de guardarlo."
        ),
    )
    parser.add_argument(
        "--pretty", action="store_true",
        help=(
            "Indenta el JSON de salida (más legible, pesa más). Se activa "
            "solo por defecto cuando NO se pasa --out (uso manual) — con "
            "--out explícito (lo que usa el backend) queda compacto salvo "
            "que pidas --pretty a propósito."
        ),
    )
    args = parser.parse_args()

    if args.dry_run and not args.classification_config:
        parser.error("--dry-run necesita --classification-config (no hay nada que probar sin una config).")
    if not args.dry_run and not args.norma:
        parser.error("--norma es obligatorio salvo con --dry-run.")

    classification_config = None
    if args.classification_config:
        with open(args.classification_config, "r", encoding="utf-8") as f:
            classification_config = json.load(f)

    if args.dry_run:
        resultado = probar_ifc(args.ifc_path, classification_config)
    else:
        resultado = procesar_ifc(args.ifc_path, args.norma, classification_config)

    # Sin --out (uso manual, pensado para que un humano lo abra) ->
    # indentado por defecto. Con --out explícito (el runner de Node
    # siempre lo usa) -> compacto por defecto. --pretty fuerza el
    # indentado en cualquiera de los dos casos.
    pretty = args.pretty or not args.out
    dump_kwargs = {"ensure_ascii": False, "indent": 2 if pretty else None}

    if args.out == "-":
        print(json.dumps(resultado, **dump_kwargs))
        return

    out_path = Path(args.out) if args.out else DEFAULT_OUTPUT_DIR / f"{Path(args.ifc_path).stem}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(resultado, f, **dump_kwargs)

    # El mensaje de confirmación va a stderr a propósito: si alguna vez
    # se combina con '--out -' (stdout), stdout tiene que ser SOLO el
    # JSON — acá no aplica (ese caso ya retornó arriba), pero se
    # mantiene el mismo criterio por consistencia.
    suffix = " (con formato)" if pretty else ""
    print(f"✔ JSON normalizado escrito en {out_path.resolve()}{suffix}", file=sys.stderr)


if __name__ == "__main__":
    main()
