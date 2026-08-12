# pipeline.py
#
# Punto de entrada único para procesar un IFC de punta a punta:
# clasificación contra la norma + fusión de metrados por prioridad +
# normalización al contrato alineado a la BD. Lo usan por igual cli.py
# (standalone) y el runner de Node (subprocess) — no hay dos caminos de
# extracción, solo dos formas de dispararlo.
import json

import ifcopenshell

from .extraction import indexar_norma
from .classify import clasificar_elementos, reasignar_sin_clasificacion
from .normalize import normalizar


def procesar_ifc(ifc_path: str, norma_path: str) -> dict:
    with open(norma_path, "r", encoding="utf-8") as f:
        norma = json.load(f)
    norma_index, hijos = indexar_norma(norma)

    model = ifcopenshell.open(ifc_path)

    elementos, sin_clasificacion = clasificar_elementos(model, norma_index, hijos)

    if sin_clasificacion:
        reasignados, _sin_asignar = reasignar_sin_clasificacion(sin_clasificacion, elementos, model)
        elementos.extend(reasignados)

    return normalizar(elementos, norma_index, model.schema)
