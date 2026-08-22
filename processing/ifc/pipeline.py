# pipeline.py
#
# Punto de entrada único para procesar un IFC de punta a punta:
# clasificación (contra la norma, o manual por propiedades — Fase 4) +
# fusión de metrados por prioridad + normalización al contrato alineado
# a la BD. Lo usan por igual cli.py (standalone) y el runner de Node
# (subprocess) — no hay dos caminos de extracción, solo dos formas de
# dispararlo.
import json

import ifcopenshell

from .extraction import indexar_norma
from .classify import clasificar_elementos, clasificar_elementos_manual, reasignar_sin_clasificacion
from .normalize import normalizar


def procesar_ifc(ifc_path: str, norma_path: str, classification_config: dict | None = None) -> dict:
    """classification_config=None (default): modo 'norma', comportamiento
    de siempre. Si viene un dict (Fase 4, forma: {"mode": "manual",
    "property_prefix": ..., "code_property_set"/"code_property_name",
    "description_property_set"/"description_property_name" (opcionales),
    "unit_property_set"/"unit_property_name" (opcionales)}), clasifica
    por propiedades en vez de contra norma_completa.json — norma_path
    igual se necesita (se abre norma.json solo para poder llamar
    normalizar() con un norma_index consistente, aunque clasificar_elementos_manual
    no lo use para clasificar)."""
    with open(norma_path, "r", encoding="utf-8") as f:
        norma = json.load(f)
    norma_index, hijos = indexar_norma(norma)

    model = ifcopenshell.open(ifc_path)

    modo_manual = classification_config is not None and classification_config.get("mode") == "manual"

    if modo_manual:
        elementos, sin_clasificacion = clasificar_elementos_manual(model, classification_config)
        property_prefix = classification_config.get("property_prefix")
    else:
        elementos, sin_clasificacion = clasificar_elementos(model, norma_index, hijos)
        property_prefix = None

    if sin_clasificacion:
        reasignados, _sin_asignar = reasignar_sin_clasificacion(
            sin_clasificacion, elementos, model, property_prefix=property_prefix
        )
        elementos.extend(reasignados)

    return normalizar(elementos, norma_index, model.schema)
