# metrados.py
#
# Fusión por prioridad de los 5 valores de metrado (lon, area, vol,
# weight, count) que terminan mapeados a metrado_elements.{length,area,
# volume,weight,quantity} en la BD. Esto reemplaza el comportamiento
# viejo de core.py, que siempre calculaba el metrado a partir de
# dimensiones e ignoraba por completo lo que el IFC ya traía calculado
# (metrados_revit se guardaba aparte, nunca se usaba para decidir).
#
# Regla (confirmada con el usuario):
#   lon/area/vol  -> metrados_revit (IfcElementQuantity /
#                    IfcPropertySingleValue, lo que exportó Revit) si
#                    existe; si no, se calcula por geometría a partir de
#                    dimensiones (extraction.calcular_metrados, mismas
#                    condicionales por clase de elemento que ya existían).
#   weight        -> SIEMPRE null, excepto IfcReinforcingBar (acero):
#                    ahí se calcula por diámetro nominal contra
#                    TABLA_PESOS_ACERO (fallback: CrossSectionArea *
#                    densidad si el diámetro no está en la tabla).
#   count         -> metrados_revit["count"] si existe, si no 1.0.
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
    """
    if not el.is_a('IfcReinforcingBar'):
        return None

    largo = el.BarLength
    if not largo:
        return None

    weight = None
    volumen = None

    diametro = el.NominalDiameter
    if diametro:
        kg_por_m = peso_nominal_kg_por_metro(diametro)
        if kg_por_m is not None:
            weight = largo * kg_por_m
            volumen = weight / DENSIDAD_ACERO_KG_M3

    if weight is None:
        area_sec = el.CrossSectionArea
        if area_sec:
            volumen = area_sec * largo
            weight = volumen * DENSIDAD_ACERO_KG_M3

    return {"lon": largo, "area": 0.0, "vol": volumen, "weight": weight, "count": 1.0}


def calcular_metrados_final(el, dims, metrados_revit):
    """Punto de entrada único: dado el elemento IFC, sus dimensiones
    (obtener_dimensiones) y lo que se pudo extraer directo del IFC
    (extraction.extraer_metrados_revit_completo), devuelve el dict
    final de 5 valores: {lon, area, vol, weight, count}."""

    acero = _metrados_acero(el)
    if acero is not None:
        vol = acero["vol"]
        if vol is None:
            # No hubo diámetro ni sección transversal para calcular vol —
            # como último recurso, geometría a partir de dimensiones.
            vol = calcular_metrados(dims, el)["vol"]
        return {
            "lon": acero["lon"],
            "area": acero["area"],
            "vol": vol,
            "weight": acero["weight"],
            "count": acero["count"],
        }

    lon = metrados_revit.get("lon")
    area = metrados_revit.get("area")
    vol = metrados_revit.get("vol")
    count = metrados_revit.get("count")

    if lon is None or area is None or vol is None:
        geometrico = calcular_metrados(dims, el)
        if lon is None:
            lon = geometrico["lon"]
        if area is None:
            area = geometrico["area"]
        if vol is None:
            vol = geometrico["vol"]

    if count is None:
        count = 1.0

    return {"lon": lon, "area": area, "vol": vol, "weight": None, "count": count}
