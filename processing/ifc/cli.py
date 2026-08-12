# cli.py
#
# Uso standalone (sin pasar por Node ni el endpoint):
#   python3 -m processing.ifc.cli archivo.ifc --norma norma.json --out resultado.json
#   python3 -m processing.ifc.cli archivo.ifc --norma norma.json        (imprime a stdout)
#
# Es la misma función (pipeline.procesar_ifc) que invoca el runner de
# Node como subprocess — no hay dos implementaciones de la extracción,
# solo dos formas de dispararla.
import argparse
import json
import sys

from .pipeline import procesar_ifc


def main():
    parser = argparse.ArgumentParser(description="Procesa un IFC y produce el JSON normalizado de metrados.")
    parser.add_argument("ifc_path", help="Ruta al archivo .ifc")
    parser.add_argument("--norma", required=True, help="Ruta al norma.json")
    parser.add_argument("--out", help="Archivo de salida (si se omite, imprime el JSON a stdout)")
    args = parser.parse_args()

    resultado = procesar_ifc(args.ifc_path, args.norma)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False)
        # El mensaje de confirmación va a stderr a propósito: si alguna
        # vez se invoca sin --out, stdout tiene que ser SOLO el JSON.
        print(f"✔ JSON normalizado escrito en {args.out}", file=sys.stderr)
    else:
        print(json.dumps(resultado, ensure_ascii=False))


if __name__ == "__main__":
    main()
