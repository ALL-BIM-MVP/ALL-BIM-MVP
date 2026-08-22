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
    """classification_config=None (default): modo 'norma', sin prefijo —
    comportamiento de siempre. Si viene un dict (Fase 4), tiene DOS
    llaves INDEPENDIENTES entre sí (ver
    docs/roadmap-modulos-y-permisos.md, sección Fase 4 — no son lo
    mismo, un proyecto puede combinar cualquier par):
      - "mode": "norma" (default) | "manual" — CÓMO se agrupan los
        elementos en partidas. "manual" además necesita
        "code_property_set"/"code_property_name" (obligatorio),
        "description_property_set"/"description_property_name" y
        "unit_property_set"/"unit_property_name" (opcionales).
      - "property_prefix": aplica en CUALQUIER mode — filtra qué
        propiedades se capturan en general para el archivo, y decide la
        prioridad de metrado (texto-prefijado > geométrico > tipado si
        hay prefijo; tipado > geométrico > texto si no).
    norma_path siempre se necesita (se abre norma.json para poder llamar
    normalizar() con un norma_index consistente, aunque
    clasificar_elementos_manual no lo use para clasificar)."""
    with open(norma_path, "r", encoding="utf-8") as f:
        norma = json.load(f)
    norma_index, hijos = indexar_norma(norma)

    model = ifcopenshell.open(ifc_path)

    config = classification_config or {}
    modo_manual = config.get("mode") == "manual"
    property_prefix = config.get("property_prefix") or None  # "" también cuenta como "sin prefijo"

    if modo_manual:
        elementos, sin_clasificacion = clasificar_elementos_manual(model, config)
    else:
        elementos, sin_clasificacion = clasificar_elementos(model, norma_index, hijos, property_prefix=property_prefix)

    if sin_clasificacion:
        reasignados, _sin_asignar = reasignar_sin_clasificacion(
            sin_clasificacion, elementos, model, property_prefix=property_prefix
        )
        elementos.extend(reasignados)

    return normalizar(elementos, norma_index, model.schema)
