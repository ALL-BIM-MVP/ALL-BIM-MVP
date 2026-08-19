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


def calcular_metrados_final(el, dims, metrados_tipados, metrados_texto):
    """Punto de entrada único: dado el elemento IFC, sus dimensiones
    (obtener_dimensiones) y las dos fuentes que se pudieron extraer
    directo del IFC (extraction.extraer_metrados_revit_completo —
    tipada y de texto, por separado a propósito, ver comentario de
    cabecera), devuelve el dict final de 5 valores:
    {lon, area, vol, weight, count}."""

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
            # Una barra de acero no tiene vanos (get_openings nunca la
            # toca), así que estas banderas no cambian nada acá — se
            # incluyen solo para que el dict tenga la misma forma que
            # el resto de los retornos de esta función.
            "_area_neta_huecos": False,
            "_vol_neta_huecos": False,
        }

    # 1. Tipado (IfcElementQuantity)
    lon = metrados_tipados.get("lon")
    area = metrados_tipados.get("area")
    vol = metrados_tipados.get("vol")
    count = metrados_tipados.get("count")

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
        if area is None:
            area = geometrico["area"]
            area_neta_huecos = geometrico["_area_neta_huecos"]
        if vol is None:
            vol = geometrico["vol"]
            vol_neta_huecos = geometrico["_vol_neta_huecos"]

    # 3. Texto de Revit (último recurso, adivinado por nombre de propiedad)
    if lon is None:
        lon = metrados_texto.get("lon")
    if area is None:
        area = metrados_texto.get("area")
    if vol is None:
        vol = metrados_texto.get("vol")
    if count is None:
        count = metrados_texto.get("count")

    if count is None:
        count = 1.0

    return {
        "lon": lon, "area": area, "vol": vol, "weight": None, "count": count,
        "_area_neta_huecos": area_neta_huecos,
        "_vol_neta_huecos": vol_neta_huecos,
    }
