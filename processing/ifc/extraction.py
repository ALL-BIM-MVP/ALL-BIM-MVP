# extraction.py
#
# Helpers de bajo nivel: geometría, dimensiones, clasificación contra la
# norma, cantidades de Revit. Puerto casi textual de
# proceso-metrados-base/utils.py — son funciones agnósticas de la forma
# de salida (siguen siendo válidas tanto si el resultado se arma como
# árbol de presentación como si se arma normalizado). Se dejó afuera a
# propósito `extraer_cantidades_qto` (no la usaba nadie en el pipeline
# original). `calcular_metrados_geometrico`/`_agrupar_caras` (el cálculo
# de área/volumen por malla triangular cruda de proceso-metrados-base)
# SÍ se reemplazó — ver geometria_proyeccion.py, corrige dos bugs de
# fondo que tenía el original (nunca soldaba vértices, agrupamiento
# O(n²)) y sí está cableado acá abajo, en obtener_dimensiones().
import math
import re
import ifcopenshell
import ifcopenshell.geom
from collections import Counter

from .config import DENSIDAD_ACERO_KG_M3
from .geometria_proyeccion import (
    calcular_dimensiones_por_proyeccion, calcular_metrado_circular,
    calcular_volumen_malla, triangulos_y_normales,
)

GEOM_SETTINGS = ifcopenshell.geom.settings()
GEOM_SETTINGS.set(GEOM_SETTINGS.USE_WORLD_COORDS, True)

PALABRAS_LARGO = ["LENGTH", "LONGITUD", "LARGO"]
PALABRAS_ANCHO = ["WIDTH", "ANCHO"]
PALABRAS_ALTO = ["HEIGHT", "ALTURA", "DEPTH", "PERALTE", "ESPESOR", "THICKNESS"]

# Tabla de pesos nominales Aceros Arequipa (kg/m) según diámetro comercial (mm)
TABLA_PESOS_ACERO = {
    6:    0.222,
    8:    0.395,
    9.525: 0.560,   # 3/8"
    12:   0.888,
    12.7: 0.994,    # 1/2"
    15.875: 1.552,  # 5/8"
    19.05: 2.235,   # 3/4"
    25.4: 3.973,    # 1"
    31.75: 6.208,   # 1 1/4"
    38.1: 8.938,    # 1 1/2"
}


def unidad_map(unidad):
    mapping = {"m": "lon", "m2": "area", "m3": "vol", "kg": "kg", "und": "und"}
    return mapping.get(unidad, "und")


# ----------------------------------------------------------------------
# Clasificación y norma
# ----------------------------------------------------------------------
def limpiar_codigo_partida(texto_sucio):
    if not texto_sucio:
        return None
    coincidencia = re.search(r'OE(?:\.\d+)+', str(texto_sucio), re.IGNORECASE)
    return coincidencia.group(0).upper() if coincidencia else None


def normalizar_codigo(codigo):
    partes = codigo.split('.')[1:]
    try:
        return tuple(int(p) for p in partes if p != "")
    except ValueError:
        return None


def formatear_codigo(tupla):
    return "OE." + ".".join(f"{p:02d}" for p in tupla)


def extraer_datos_clasificacion(el):
    for association in getattr(el, "HasAssociations", []):
        if association.is_a("IfcRelAssociatesClassification"):
            ref = association.RelatingClassification
            codigo = limpiar_codigo_partida(getattr(ref, "ItemReference", None))
            nombre = getattr(ref, "Name", None)
            if codigo:
                return codigo, str(nombre).strip() if nombre else ""
    return None, None


def extraer_valor_propiedad(psets, property_set, property_name):
    """Fase 4 (clasificación manual, ver classify.clasificar_elementos_manual)
    — lee el valor CRUDO (sin uppercase, sin pasar por el fallback de
    texto de extraer_metrados_revit_completo) de una propiedad puntual,
    identificada por su nombre EXACTO tal cual lo escribió el usuario al
    configurar el proyecto (ej. "CSRT-Partida1") — nunca se reconstruye
    por patrón/prefijo, se busca literal.

    property_set: si viene ("" no cuenta, se trata como "cualquiera"),
    restringe la búsqueda a ESE IfcPropertySet puntual — si no, recorre
    todos (mismo criterio que el resto del pipeline: nunca asumir que
    todo vive en un Pset con nombre fijo, ver comentario de
    clasificar_elementos_manual). Devuelve None si no está la propiedad,
    o si está pero vacía ("" o None) — un valor vacío no cuenta como
    "el usuario lo puso"."""
    if not property_name:
        return None
    if property_set:
        valor = psets.get(property_set, {}).get(property_name)
        return valor if valor not in (None, "") else None
    for props in psets.values():
        if property_name in props:
            valor = props[property_name]
            if valor not in (None, ""):
                return valor
    return None


def indexar_norma(norma):
    norma_index = {}
    for codigo_str, datos in norma.items():
        tup = normalizar_codigo(codigo_str)
        if tup is None:
            continue
        norma_index[tup] = {
            "codigo": datos.get("codigo", codigo_str),
            "descripcion": datos.get("descripcion", ""),
            "tipo": datos.get("tipo", "partida"),
            "unidad": datos.get("unidad"),
            "tuple": tup,
        }
    hijos = {}
    for tup in norma_index:
        if len(tup) > 1:
            padre = tup[:-1]
            hijos.setdefault(padre, []).append(tup)
    for padre in hijos:
        hijos[padre].sort()
    return norma_index, hijos


def buscar_entrada_norma(tup, norma_index):
    if tup in norma_index:
        return tup, norma_index[tup], True
    for i in range(len(tup) - 1, 0, -1):
        ancestro = tup[:i]
        if ancestro in norma_index:
            return ancestro, norma_index[ancestro], False
    return None, None, False


def obtener_unidad_por_mayoria(tup_padre, norma_index, hijos):
    unidades_hijas = []
    for hijo in hijos.get(tup_padre, []):
        entrada_hijo = norma_index.get(hijo)
        if entrada_hijo and entrada_hijo["tipo"] == "partida":
            unidad = entrada_hijo.get("unidad")
            if unidad:
                unidades_hijas.append(unidad)
    if not unidades_hijas:
        return None
    freq = Counter(unidades_hijas)
    return freq.most_common(1)[0][0]


# ----------------------------------------------------------------------
# Geometría y dimensiones (helpers básicos)
# ----------------------------------------------------------------------
def get_shape(el):
    """Obtiene el shape geométrico del elemento una sola vez."""
    try:
        shape = ifcopenshell.geom.create_shape(GEOM_SETTINGS, el)
        if shape and shape.geometry.verts and shape.geometry.faces:
            return shape
    except Exception:
        pass
    return None


def buscar_valor_en_psets(psets, palabras_clave):
    for pset_name, properties in psets.items():
        for prop_name, value in properties.items():
            if any(clave.upper() in prop_name.upper() for clave in palabras_clave):
                try:
                    val_float = float(value)
                    if val_float > 0:
                        return val_float
                except (ValueError, TypeError):
                    continue
    return None


def extraer_dimensiones_qto(el):
    dims = {"Largo": None, "Ancho": None, "Alto": None}
    for rel in getattr(el, "IsDefinedBy", []):
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        prop_def = rel.RelatingPropertyDefinition
        if not (prop_def and prop_def.is_a("IfcElementQuantity")):
            continue
        for q in getattr(prop_def, "Quantities", []):
            if not q.is_a("IfcQuantityLength") or q.LengthValue is None:
                continue
            nombre_q = (getattr(q, "Name", "") or "").upper()
            val = float(q.LengthValue)
            if dims["Alto"] is None and any(p in nombre_q for p in PALABRAS_ALTO):
                dims["Alto"] = val
            elif dims["Ancho"] is None and any(p in nombre_q for p in PALABRAS_ANCHO):
                dims["Ancho"] = val
            elif dims["Largo"] is None and any(p in nombre_q for p in PALABRAS_LARGO):
                dims["Largo"] = val
    return dims


def extraer_dimensiones_geometria(el, shape=None):
    """AABB clásico, como último recurso."""
    dims = {"Largo": None, "Ancho": None, "Alto": None}
    if shape is None:
        shape = get_shape(el)
    if shape is None:
        return dims
    verts = shape.geometry.verts
    xs = verts[0::3]
    ys = verts[1::3]
    zs = verts[2::3]
    dx = max(xs) - min(xs)
    dy = max(ys) - min(ys)
    dz = max(zs) - min(zs)
    dims["Largo"] = dx if dx >= dy else dy
    dims["Ancho"] = dy if dx >= dy else dx
    dims["Alto"] = dz
    return dims


# ----------------------------------------------------------------------
# PCA / OBB
# ----------------------------------------------------------------------
def extraer_dimensiones_orientadas(el, shape=None):
    """OBB mediante PCA. Retorna Largo, Ancho, Alto y los tres ejes."""
    if shape is None:
        shape = get_shape(el)
    if shape is None:
        return None
    verts = shape.geometry.verts
    n = len(verts) // 3
    if n < 3:
        return None
    puntos = [verts[i*3:(i+1)*3] for i in range(n)]

    cx = sum(p[0] for p in puntos) / n
    cy = sum(p[1] for p in puntos) / n
    cz = sum(p[2] for p in puntos) / n

    cov = [[0.0, 0.0, 0.0],
           [0.0, 0.0, 0.0],
           [0.0, 0.0, 0.0]]
    for p in puntos:
        dx, dy, dz = p[0]-cx, p[1]-cy, p[2]-cz
        cov[0][0] += dx*dx
        cov[0][1] += dx*dy
        cov[0][2] += dx*dz
        cov[1][1] += dy*dy
        cov[1][2] += dy*dz
        cov[2][2] += dz*dz
    cov[1][0] = cov[0][1]
    cov[2][0] = cov[0][2]
    cov[2][1] = cov[1][2]

    # Jacobi
    max_iter, tol = 50, 1e-12
    v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    for _ in range(max_iter):
        p, q = 0, 1
        max_val = abs(cov[0][1])
        if abs(cov[0][2]) > max_val:
            p, q = 0, 2
            max_val = abs(cov[0][2])
        if abs(cov[1][2]) > max_val:
            p, q = 1, 2
            max_val = abs(cov[1][2])
        if max_val < tol:
            break
        theta = math.pi/4 if cov[p][p] == cov[q][q] else 0.5 * math.atan2(2*cov[p][q], cov[p][p]-cov[q][q])
        cos, sin = math.cos(theta), math.sin(theta)
        new_cov = [row[:] for row in cov]
        for i in range(3):
            if i != p and i != q:
                new_cov[i][p] = cos*cov[i][p] - sin*cov[i][q]
                new_cov[p][i] = new_cov[i][p]
                new_cov[i][q] = sin*cov[i][p] + cos*cov[i][q]
                new_cov[q][i] = new_cov[i][q]
        new_cov[p][p] = cos*cos*cov[p][p] + sin*sin*cov[q][q] - 2*sin*cos*cov[p][q]
        new_cov[q][q] = sin*sin*cov[p][p] + cos*cos*cov[q][q] + 2*sin*cos*cov[p][q]
        new_cov[p][q] = new_cov[q][p] = 0.0
        cov = new_cov
        for i in range(3):
            vi_p, vi_q = v[i][p], v[i][q]
            v[i][p] = cos*vi_p - sin*vi_q
            v[i][q] = sin*vi_p + cos*vi_q

    evals = [cov[i][i] for i in range(3)]
    idx = sorted(range(3), key=lambda i: evals[i], reverse=True)
    ejes = [[v[0][i], v[1][i], v[2][i]] for i in idx]  # normalizados

    dims = [0.0, 0.0, 0.0]
    for i, eje in enumerate(ejes):
        vals = [eje[0]*p[0] + eje[1]*p[1] + eje[2]*p[2] for p in puntos]
        dims[i] = max(vals) - min(vals)

    z_vals = [abs(e[2]) for e in ejes]
    idx_alto = z_vals.index(max(z_vals))
    alto = dims[idx_alto]
    ejes_resto = [i for i in range(3) if i != idx_alto]
    dims_resto = [dims[i] for i in ejes_resto]
    largo = max(dims_resto)
    ancho = min(dims_resto)

    return {
        "Largo": largo,
        "Ancho": ancho,
        "Alto": alto,
        "ejes": {
            "alto": ejes[idx_alto],
            "largo": ejes[ejes_resto[0]] if dims_resto[0] >= dims_resto[1] else ejes[ejes_resto[1]],
            "ancho": ejes[ejes_resto[1]] if dims_resto[0] >= dims_resto[1] else ejes[ejes_resto[0]],
        }
    }


# ----------------------------------------------------------------------
# Aristas duras
# ----------------------------------------------------------------------
def obtener_aristas_duras(el, shape=None):
    if shape is None:
        shape = get_shape(el)
    if shape is None:
        return []

    verts = shape.geometry.verts
    faces = shape.geometry.faces
    nv = len(verts) // 3
    vertices = [(verts[i*3], verts[i*3+1], verts[i*3+2]) for i in range(nv)]
    triangulos = [(faces[i*3], faces[i*3+1], faces[i*3+2]) for i in range(len(faces)//3)]

    edge_map = {}
    for idx, (i0, i1, i2) in enumerate(triangulos):
        p0, p1, p2 = vertices[i0], vertices[i1], vertices[i2]
        v1 = (p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2])
        v2 = (p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2])
        nx = v1[1]*v2[2] - v1[2]*v2[1]
        ny = v1[2]*v2[0] - v1[0]*v2[2]
        nz = v1[0]*v2[1] - v1[1]*v2[0]
        norm = math.sqrt(nx*nx+ny*ny+nz*nz)
        normal = (nx/norm, ny/norm, nz/norm) if norm > 1e-12 else (0, 0, 0)
        for a, b in [(i0, i1), (i1, i2), (i2, i0)]:
            key = (min(a, b), max(a, b))
            edge_map.setdefault(key, []).append((idx, normal))

    angle_thresh = math.cos(math.radians(25))
    hard_edges = []
    for (i1, i2), faces_info in edge_map.items():
        v1, v2 = vertices[i1], vertices[i2]
        length = math.dist(v1, v2)
        if length < 0.05:
            continue
        is_hard = len(faces_info) == 1
        if not is_hard:
            for i in range(len(faces_info)):
                for j in range(i+1, len(faces_info)):
                    dot = faces_info[i][1][0]*faces_info[j][1][0] + faces_info[i][1][1]*faces_info[j][1][1] + faces_info[i][1][2]*faces_info[j][1][2]
                    if dot < angle_thresh:
                        is_hard = True
                        break
                if is_hard:
                    break
        if is_hard:
            dx, dy, dz = v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2]
            dir_len = math.sqrt(dx*dx+dy*dy+dz*dz)
            hard_edges.append((length, (dx/dir_len, dy/dir_len, dz/dir_len)))

    if not hard_edges:
        return []

    group_thresh = math.cos(math.radians(15))
    groups = []
    for length, dir in hard_edges:
        added = False
        for g in groups:
            dot = abs(g["direction"][0]*dir[0] + g["direction"][1]*dir[1] + g["direction"][2]*dir[2])
            if dot > group_thresh:
                g["max_length"] = max(g["max_length"], length)
                g["edges"] += 1
                w = length
                g["direction"] = (
                    g["direction"][0]*g["total_weight"] + dir[0]*w,
                    g["direction"][1]*g["total_weight"] + dir[1]*w,
                    g["direction"][2]*g["total_weight"] + dir[2]*w
                )
                g["total_weight"] += w
                norm = math.sqrt(g["direction"][0]**2 + g["direction"][1]**2 + g["direction"][2]**2)
                if norm > 1e-12:
                    g["direction"] = (g["direction"][0]/norm, g["direction"][1]/norm, g["direction"][2]/norm)
                added = True
                break
        if not added:
            groups.append({
                "direction": dir,
                "max_length": length,
                "edges": 1,
                "total_weight": length
            })

    if len(groups) < 2:
        return []

    obb = extraer_dimensiones_orientadas(el, shape)
    if obb and "ejes" in obb:
        eje_alto = obb["ejes"]["alto"]
        eje_largo = obb["ejes"]["largo"]
        eje_ancho = obb["ejes"]["ancho"]
        for g in groups:
            d = g["direction"]
            dots = [
                abs(d[0]*eje_alto[0] + d[1]*eje_alto[1] + d[2]*eje_alto[2]),
                abs(d[0]*eje_largo[0] + d[1]*eje_largo[1] + d[2]*eje_largo[2]),
                abs(d[0]*eje_ancho[0] + d[1]*eje_ancho[1] + d[2]*eje_ancho[2]),
            ]
            g["tipo"] = ["alto", "largo", "ancho"][dots.index(max(dots))]
    else:
        idx_alto = max(range(len(groups)), key=lambda i: abs(groups[i]["direction"][2]))
        groups[idx_alto]["tipo"] = "alto"
        resto = [i for i in range(len(groups)) if i != idx_alto]
        if len(resto) >= 2:
            groups[resto[0]]["tipo"] = "largo"
            groups[resto[1]]["tipo"] = "ancho"
        elif len(resto) == 1:
            groups[resto[0]]["tipo"] = "largo"

    resultado = []
    for g in groups:
        resultado.append({
            "longitud": round(g["max_length"], 4),
            "direccion": [round(g["direction"][0], 4), round(g["direction"][1], 4), round(g["direction"][2], 4)],
            "tipo": g.get("tipo", "otro"),
            "cantidad_aristas": g["edges"]
        })
    return resultado


def extraer_dimensiones_por_aristas(el, shape=None):
    grupos = obtener_aristas_duras(el, shape)
    if not grupos:
        return None
    alto = largo = ancho = 0.0
    for g in grupos:
        if g["tipo"] == "alto":
            alto = max(alto, g["longitud"])
        elif g["tipo"] == "largo":
            largo = max(largo, g["longitud"])
        elif g["tipo"] == "ancho":
            ancho = max(ancho, g["longitud"])
    if alto and largo and ancho:
        return {"Largo": largo, "Ancho": ancho, "Alto": alto}
    return None


# ----------------------------------------------------------------------
# Normalización por categoría
# ----------------------------------------------------------------------
def normalizar_ejes_por_categoria(largo, ancho, alto, ejes, categoria):
    if categoria == 'wall':
        return {
            "Largo": max(largo, ancho),
            "Ancho": min(largo, ancho),
            "Alto": alto
        }
    elif categoria == 'floor':
        dims = sorted([largo, ancho, alto], reverse=True)
        return {
            "Largo": dims[0],
            "Ancho": dims[1],
            "Alto": dims[2]
        }
    else:
        if ejes:
            z_alto = abs(ejes["alto"][2])
            z_largo = abs(ejes["largo"][2])
            z_ancho = abs(ejes["ancho"][2])
            if z_alto >= z_largo and z_alto >= z_ancho:
                return {"Largo": largo, "Ancho": ancho, "Alto": alto}
            if z_largo >= z_alto and z_largo >= z_ancho:
                return {"Largo": alto, "Ancho": ancho, "Alto": largo}
            else:
                return {"Largo": largo, "Ancho": alto, "Alto": ancho}
        return {"Largo": largo, "Ancho": ancho, "Alto": alto}


def inferir_categoria(el):
    clase = el.is_a()
    if clase in ("IfcWall", "IfcWallStandardCase", "IfcCurtainWall"):
        return 'wall'
    if clase in ("IfcSlab", "IfcRoof", "IfcRamp", "IfcRampFlight"):
        return 'floor'
    return None


# ----------------------------------------------------------------------
# Métodos de extracción principales
# ----------------------------------------------------------------------
def extraer_dimensiones_circulares(el):
    """IfcExtrudedAreaSolid + perfil circular (tubos — confirmado con
    datos reales: los 294 IfcFlowSegment de Vista3D_SANITARIAS.ifc usan
    consistentemente IfcCircleProfileDef). El radio viene EXACTO y
    tipado en el IFC — no hace falta reconstruirlo de una malla como el
    resto de los métodos de esta cascada, así que va primero, antes que
    cualquier alternativa geométrica.

    Devuelve {"Largo": profundidad de extrusión, "Diametro": 2×radio} —
    Ancho/Alto NO se llenan a propósito: una sección circular no tiene
    "ancho" ni "alto" distintos, sería el mismo número repetido con
    nombres que no le corresponden a la figura (mismo criterio que ya
    se usa para figuras irregulares: solo se reportan las dimensiones
    que de verdad aplican).

    is_a('IfcCircleProfileDef') también matchea IfcCircleHollowProfileDef
    (subtipo, agrega WallThickness) — Radius ahí sigue siendo el radio
    EXTERIOR en los dos casos, que es lo que importa para el diámetro
    nominal del tubo."""
    try:
        rep = el.Representation
        if not rep:
            return None
        for rep_map in rep.Representations:
            for item in rep_map.Items:
                if item.is_a('IfcExtrudedAreaSolid'):
                    profile = item.SweptArea
                    if profile.is_a('IfcCircleProfileDef'):
                        return {"Largo": float(item.Depth), "Diametro": float(profile.Radius) * 2}
                    return None
    except Exception:
        return None
    return None


def extraer_dimensiones_parametricas(el):
    """IfcExtrudedAreaSolid + perfil rectangular."""
    try:
        rep = el.Representation
        if not rep:
            return None
        for rep_map in rep.Representations:
            for item in rep_map.Items:
                if item.is_a('IfcExtrudedAreaSolid'):
                    depth = float(item.Depth)
                    profile = item.SweptArea
                    if profile.is_a('IfcRectangleProfileDef'):
                        return {
                            "Largo": depth,
                            "Ancho": float(profile.XDim),
                            "Alto": float(profile.YDim)
                        }
                    elif profile.is_a('IfcArbitraryClosedProfileDef'):
                        outer = profile.OuterCurve
                        if outer.is_a('IfcPolyline'):
                            pts = outer.Points
                            xs = [p.Coordinates[0] for p in pts]
                            ys = [p.Coordinates[1] for p in pts]
                            ancho = max(xs) - min(xs)
                            alto = max(ys) - min(ys)
                            return {
                                "Largo": depth,
                                "Ancho": ancho,
                                "Alto": alto
                            }
                    return None
    except Exception:
        return None


def reordenar_dims_por_extent_z(shape, dims):
    """Reordena {Largo,Ancho,Alto} para que "Alto" sea el que mejor
    coincide con la extensión real en Z del elemento (bounding box del
    shape ya resuelto en coordenadas mundiales — GEOM_SETTINGS ya tiene
    USE_WORLD_COORDS activado).

    Hace falta porque extraer_dimensiones_parametricas (IfcExtrudedAreaSolid
    + perfil rectangular) asigna Ancho=profile.XDim/Alto=profile.YDim a
    ciegas, sin ninguna verificación de hacia dónde apunta cada eje —
    para la gran mayoría de muros la convención de exportación coincide
    por casualidad, pero se confirmó con datos reales que NO es
    universal: un muro delgado y vertical (una capa de pintura modelada
    como IfcWallStandardCase aparte) tenía su dirección de extrusión
    apuntando distinto, y esa asignación ciega terminaba poniendo el
    espesor (1mm) en "Alto" y la altura real (2.3m) en "Largo" — el
    mismo tipo de bug de fondo que geometria_proyeccion ya resuelve
    para su propio cálculo, acá aplicado al resultado de paramétrico.

    Público (no `_`) a propósito — classify._procesar_huecos_descuento
    la reusa tal cual para los vanos (IfcOpeningElement), que tienen
    EXACTAMENTE el mismo problema y confirmado que sí ocurre en la
    práctica: un vano de puerta/ventana normal (0.8×2.15m) salía como
    "Largo=3.048 (la profundidad del vano, sin sentido como 'largo'),
    Alto=0.8" en vez de Ancho=0.8/Alto=2.15 — inflando muchísimo el
    descuento de área/volumen del muro que lo contiene."""
    if shape is None:
        return dims
    zs = shape.geometry.verts[2::3]
    if not zs:
        return dims
    extent_z = max(zs) - min(zs)
    valores = [dims["Largo"], dims["Ancho"], dims["Alto"]]
    idx_alto = min(range(3), key=lambda i: abs(valores[i] - extent_z))
    alto = valores[idx_alto]
    restantes = sorted((valores[i] for i in range(3) if i != idx_alto), reverse=True)
    return {"Largo": restantes[0], "Ancho": restantes[1], "Alto": alto}


def extraer_dimensiones_fierro(el):
    if el.is_a('IfcReinforcingBar'):
        largo = float(el.BarLength) if el.BarLength else None
        diam = float(el.NominalDiameter) if el.NominalDiameter else None
        area_sec = float(el.CrossSectionArea) if el.CrossSectionArea else None
        return {
            "Largo": largo,
            "Ancho": diam,
            "Alto": diam,
            "Diametro": diam,
            "AreaSeccion": area_sec,
        }
    return None


def extraer_dimensiones_explicitas(el):
    """Dimensiones para puertas y ventanas desde atributos IFC."""
    if el.is_a('IfcDoor') or el.is_a('IfcWindow'):
        alto = float(el.OverallHeight) if el.OverallHeight else None
        largo = float(el.OverallWidth) if el.OverallWidth else None
        if alto is not None and largo is not None:
            return {
                "Largo": largo,
                "Ancho": 0.0,
                "Alto": alto
            }
    return None


def fallback_dimensiones(el, psets, shape):
    dims = extraer_dimensiones_qto(el)
    if dims["Largo"] is None:
        dims["Largo"] = buscar_valor_en_psets(psets, PALABRAS_LARGO)
    if dims["Ancho"] is None:
        dims["Ancho"] = buscar_valor_en_psets(psets, PALABRAS_ANCHO)
    if dims["Alto"] is None:
        dims["Alto"] = buscar_valor_en_psets(psets, PALABRAS_ALTO)
    if any(v is None for v in dims.values()):
        dims_geo = extraer_dimensiones_geometria(el, shape)
        for k in dims:
            if dims[k] is None:
                dims[k] = dims_geo.get(k)
    return dims


def obtener_dimensiones(el, psets):
    """Punto de entrada real — resuelve Largo/Ancho/Alto (y Diametro,
    si aplica) por la cascada de prioridad de abajo, y le adjunta
    _vol_geom SIEMPRE que haya una malla disponible, sin importar qué
    paso de la cascada terminó resolviendo las dimensiones.

    Por qué esto va SEPARADO de la cascada, no adentro de cada paso: el
    volumen de un sólido cerrado es una propiedad universal — se puede
    integrar directo de la malla (calcular_volumen_malla, teorema de la
    divergencia) sin necesitar saber Largo/Ancho/Alto, sin necesitar
    encontrar qué cara es "la" cara, sin necesitar la maquinaria de
    emparejamiento de geometria_proyeccion en absoluto. Esa maquinaria
    (agrupar_caras + encontrar_pares_opuestos + OBB) sigue siendo
    necesaria para Largo/Ancho/Área (esos SÍ dependen de identificar
    una cara significativa), pero usarla también para el volumen — como
    hacía la versión anterior de este archivo, "área real × espesor
    real" — era peor en dos sentidos a la vez: una aproximación (asume
    espesor uniforme, un prisma) Y más cara de calcular (toda esa
    maquinaria) que la integral directa, que ya estaba escrita y
    validada para tubos. area_total_m2 de geometria_proyeccion sigue
    existiendo para ÁREA (esa sí necesita identificar una cara), pero
    ya no calcula ningún volumen — el volumen final SIEMPRE sale de
    esta integral universal, sin excepción por paso de la cascada."""
    shape = get_shape(el)  # una sola vez, se reusa para la cascada Y el volumen
    dims = _resolver_dimensiones_por_cascada(el, psets, shape)

    if dims.get("_vol_geom") is None and shape is not None:
        vertices, triangles, _, _ = triangulos_y_normales(shape)
        if triangles:
            dims = {**dims, "_vol_geom": calcular_volumen_malla(vertices, triangles)}

    return dims


def _resolver_dimensiones_por_cascada(el, psets, shape):
    # 0. Fierro
    dims_bar = extraer_dimensiones_fierro(el)
    if dims_bar and dims_bar["Largo"] is not None:
        return dims_bar

    # 0.4. Perfil circular (tubos) — Largo/Diametro salen del perfil
    # tipado (radio exacto, no hay que reconstruirlo), pero área/volumen
    # SÍ se miden de la malla real (calcular_metrado_circular) — no con
    # π×radio²×largo, que sería el volumen de un cilindro matemático
    # ideal, no el del sólido realmente exportado (mismo criterio que
    # el resto de esta cascada: nunca una fórmula por dimensiones si se
    # puede medir la figura real).
    dims_circ = extraer_dimensiones_circulares(el)
    if dims_circ is not None:
        extra = {}
        metrado_circ = calcular_metrado_circular(el)
        if metrado_circ is not None:
            extra = {"_area_geom": metrado_circ["area_m2"], "_vol_geom": metrado_circ["volumen_m3"]}
        return {"Largo": dims_circ["Largo"], "Ancho": None, "Alto": None, "Diametro": dims_circ["Diametro"], **extra}

    # 0.5. Dimensiones explícitas (puertas, ventanas)
    dims_exp = extraer_dimensiones_explicitas(el)
    if dims_exp and dims_exp["Largo"] is not None:
        return dims_exp

    # 1. Paramétrico
    dims_param = extraer_dimensiones_parametricas(el)
    if dims_param and all(v is not None for v in dims_param.values()):
        # Cross-check contra la extensión Z real (ver _dimension_mas_vertical)
        # ANTES de normalizar por categoría — la asignación cruda de
        # extraer_dimensiones_parametricas no siempre acierta cuál de
        # sus 3 valores es realmente "Alto".
        dims_param = reordenar_dims_por_extent_z(shape, dims_param)
        categoria = inferir_categoria(el)
        if categoria:
            return normalizar_ejes_por_categoria(
                dims_param["Largo"], dims_param["Ancho"], dims_param["Alto"],
                ejes=None, categoria=categoria
            )
        return dims_param

    # 2. Qto
    dims_qto = extraer_dimensiones_qto(el)
    if dims_qto and all(v is not None for v in dims_qto.values()):
        return dims_qto

    if shape is None:
        return fallback_dimensiones(el, psets, None)

    # 2.5. Proyección de par de caras opuestas (geometria_proyeccion) —
    # geometría real, más confiable que el OBB del sólido completo (que
    # se infla con cualquier inclinación) y que el fallback de texto de
    # extraer_metrados_revit_completo (ver metrados.py, ahí se decide
    # la prioridad final entre este método y ese texto). Usa su propio
    # shape con vértices soldados (ver geometria_proyeccion.get_shape_soldado),
    # no reusa `shape` de acá arriba — necesita ese setting distinto
    # para que el agrupamiento de caras funcione.
    dims_proy = calcular_dimensiones_por_proyeccion(el)
    if dims_proy is not None:
        # area_geom viaja SIEMPRE que hubo un par válido (regular o no)
        # — es el área real, triangulada, suma de TODAS las sub-figuras
        # encontradas (no Largo×Ancho de una sola). calcular_metrados()
        # la prefiere por sobre su propia fórmula por clase cuando está
        # presente (ver ese comentario para el porqué: Largo×Ancho de
        # un OBB sobreestima cualquier cara que no sea un rectángulo
        # exacto — confirmado con datos reales, un techo trapezoidal
        # daba 18% más área con la fórmula vieja que con el área
        # triangulada real — y para elementos con varias vertientes,
        # ignoraba por completo todas menos la más grande). NO se
        # adjunta _vol_geom acá a propósito — calcular_dimensiones_por_
        # proyeccion ya no calcula volumen (era área×espesor, una
        # aproximación de prisma); el wrapper obtener_dimensiones lo
        # integra directo de la malla completa apenas termine esta
        # cascada, sea cual sea el paso que la resolvió.
        extra = {"_area_geom": dims_proy["area_total_m2"]}
        if dims_proy["Largo"] is not None:
            # No pasa por normalizar_ejes_por_categoria a propósito:
            # geometria_proyeccion YA resuelve Largo/Ancho/Alto según
            # alineación real con el eje Z (ver _dimensiones_de_par),
            # más preciso que las heurísticas de esa función (la rama
            # "wall" confía ciegamente en que el Alto que le pasan ya
            # es la altura, y la rama "floor" reordena por VALOR, no
            # por eje — cualquiera de las dos podría deshacer esta
            # resolución ya correcta).
            return {"Largo": dims_proy["Largo"], "Ancho": dims_proy["Ancho"], "Alto": dims_proy["Alto"], **extra}
        # Encontró un par de caras válido (confirma que el elemento SÍ
        # es tipo "sándwich" — dos caras opuestas con área similar) pero
        # el contorno es demasiado irregular como para que Largo/Ancho
        # signifiquen algo (ver _es_figura_regular) — ej. el express_id
        # 136277 de desenlazado.ifc, una membrana de 196.6 m² reales
        # cuyo rectángulo envolvente mide 526 m². Confirmado con datos
        # reales que NO conviene caer al OBB del sólido completo (paso
        # 3, más abajo) para este caso: para ese mismo elemento da
        # 38.9×26.4=1028 m², un error todavía MAYOR que el rectángulo
        # de una sola cara — así que acá se corta la cascada, sin
        # probar los pasos siguientes. Alto (espesor) sigue siendo
        # confiable (viene de la distancia entre los dos planos del
        # par, no depende de que el contorno sea o no un rectángulo) y
        # se conserva; Largo/Ancho quedan en None literal, no un número
        # que aparente ser correcto — pero _area_geom SÍ tiene la medida
        # real (196.6 m² en este caso), así que el metrado final de área
        # no queda en 0 pese a no tener Largo/Ancho (el volumen tampoco
        # queda en 0: lo agrega el wrapper vía malla completa).
        return {"Largo": None, "Ancho": None, "Alto": dims_proy["Alto"], **extra}

    # 3. OBB con normalización
    obb = extraer_dimensiones_orientadas(el, shape)
    if obb and "ejes" in obb:
        categoria = inferir_categoria(el)
        return normalizar_ejes_por_categoria(
            obb["Largo"], obb["Ancho"], obb["Alto"],
            ejes=obb["ejes"], categoria=categoria
        )

    # 4. Aristas duras
    dims_edges = extraer_dimensiones_por_aristas(el, shape)
    if dims_edges and all(v is not None for v in dims_edges.values()):
        return dims_edges

    # 5. Fallback
    return fallback_dimensiones(el, psets, shape)


# ----------------------------------------------------------------------
# Metrado geométrico a partir de dimensiones (fallback de metrados.py)
# ----------------------------------------------------------------------
def calcular_metrados(dims, el=None):
    """lon/area/vol a partir de Largo/Ancho/Alto. Es el fallback
    "geométrico" que usa metrados.py cuando el IFC no trae el valor via
    Revit — NO calcula weight (eso es exclusivo de metrados.py, solo
    para acero).

    Si dims trae _area_geom (geometria_proyeccion/perfil circular — ver
    obtener_dimensiones pasos 0.4/2.5) ese valor SIEMPRE gana por sobre
    la fórmula por clase de acá abajo: es el área real triangulada
    (suma de todas las sub-figuras encontradas), más precisa que
    Largo×Ancho de un solo OBB — confirmado con datos reales que para
    una cara no-rectangular (trapezoidal, ej. un techo inclinado)
    Largo×Ancho puede sobreestimar ~18%, y para un elemento con varias
    vertientes (ej. un techo a varias aguas) Largo×Ancho de un único
    par ignora por completo el resto de la superficie real.

    _vol_geom, en cambio, viaja en dims para prácticamente CUALQUIER
    elemento con malla (obtener_dimensiones lo integra directo de la
    malla completa al final de la cascada, sin importar qué paso
    resolvió Largo/Ancho/Alto — ver ese docstring) — así que se evalúa
    SIEMPRE, sin exigir que _area_geom también esté presente. Antes acá
    exigía las dos juntas (`and`), lo que en la práctica descartaba
    _vol_geom (el real, integrado) para todo elemento "normal" que
    resuelve por paramétrico/Qto/OBB — esos nunca traen _area_geom, así
    que siempre caían al `largo*ancho*alto` de más abajo pese a tener
    ya calculado el volumen real. area/vol se resuelven ahora cada uno
    por separado."""
    largo = dims.get("Largo") or 0.0
    ancho = dims.get("Ancho") or 0.0
    alto = dims.get("Alto") or 0.0

    area_geom = dims.get("_area_geom")
    vol_geom = dims.get("_vol_geom")

    area_m2 = largo * alto  # valor por defecto (muro)
    if el is not None:
        clase = el.is_a()
        if clase in ("IfcSlab", "IfcRoof", "IfcRamp", "IfcRampFlight"):
            area_m2 = largo * ancho
        elif clase in ("IfcWall", "IfcWallStandardCase", "IfcCurtainWall"):
            area_m2 = largo * alto
        else:
            if alto > 0 and largo > 0 and ancho > 0:
                if alto < min(largo, ancho) * 0.3:
                    area_m2 = largo * ancho
                elif alto > max(largo, ancho) * 2:
                    area_m2 = largo * alto
                else:
                    dims_ordenadas = sorted([largo, ancho, alto])
                    area_m2 = dims_ordenadas[1] * dims_ordenadas[2]

    if area_geom is not None:
        area_m2 = area_geom
    volumen = vol_geom if vol_geom is not None else largo * ancho * alto

    # área_neta_huecos/vol_neta_huecos: True cuando el valor de arriba
    # salió de la malla real (area_geom/vol_geom) — IfcOpenShell ya
    # resuelve los IfcRelVoidsElement (puertas/ventanas empotradas) al
    # triangular el sólido por default, así que esa malla YA viene sin
    # el material de los vanos, confirmado con datos reales: mismo muro
    # con 2 ventanas, malla con vanos resueltos = 1.30 m³ contra 2.04 m³
    # con IfcOpenShell.settings.DISABLE_OPENING_SUBTRACTIONS=True (el
    # sólido completo, sin vanos). Si acá abajo se aplicara TAMBIÉN el
    # descuento de huecos de classify._aplicar_descuento_huecos sobre
    # un valor que ya viene neto, se restaría el hueco dos veces — ver
    # ese módulo, ahora usa estas banderas para no hacerlo. False
    # cuando el valor es la fórmula por clase de acá arriba (Largo×Alto/
    # Largo×Ancho/heurística) o el `largo*ancho*alto` de respaldo — esa
    # fórmula NO conoce los vanos, ahí el descuento posterior sigue
    # siendo necesario.
    return {
        "lon": largo, "area": area_m2, "vol": volumen,
        "_area_neta_huecos": area_geom is not None,
        "_vol_neta_huecos": vol_geom is not None,
    }


def inferir_unidad(dims):
    largo, ancho, alto = dims.get("Largo"), dims.get("Ancho"), dims.get("Alto")
    if largo and ancho and alto:
        return "m3"
    if largo and alto:
        return "m2"
    if largo:
        return "m"
    return "und"


# Si el nombre de una propiedad contiene cualquiera de estas palabras,
# NUNCA se usa como dimensión aunque también contenga una palabra de
# CLAVES_LONGITUD/ÁREA/etc — son propiedades de posición/referencia por
# definición, no medidas. "Coincidir palabra completa en vez de
# substring" NO alcanza para este caso: "ALTURA" ya es una palabra
# completa suelta dentro de "DESFASE DE ALTURA DESDE NIVEL" (confirmado
# con datos reales del proyecto). Lista armada a partir de casos reales
# encontrados (DESFASE DE ALTURA DESDE NIVEL, ALTURA DE EXTREMO
# INICIAL) más variantes previsibles del mismo patrón (ALTURA DE
# ANTEPECHO también es una posición — "sill height" — no la altura del
# elemento). "PROJECTED" es el mismo caso para área: un techo trae
# tanto "PROJECTEDAREA" (área en planta, achicada por la inclinación)
# como "TOTALAREA" (el área real de cobertura) — las dos contienen
# "AREA" como substring, así que sin este descalificador cualquiera de
# las dos podía ganar según el orden de iteración (confirmado con datos
# reales: PROJECTEDAREA=219.59 vs TOTALAREA=236.14 para el mismo techo,
# un 7% de diferencia, nada despreciable).
DESCALIFICADORES_DIMENSION = [
    "DESFASE", "OFFSET", "DESDE", "REFERENCIA", "REFERENCE",
    "INICIAL", "FINAL", "EXTREMO", "NIVEL DE", "ANTEPECHO",
    "ID DE", " ID", "FASE", "SUBPROYECTO", "MARCA", "PROJECTED",
]


def _nombre_descalificado(nombre_upper):
    return any(d in nombre_upper for d in DESCALIFICADORES_DIMENSION)


def _valor_no_negativo(valor):
    """Convierte a float y rechaza negativos — una medida escalar
    (largo/área/volumen/peso) nunca puede ser negativa; si el valor
    encontrado es negativo, la propiedad matcheada casi seguro NO es la
    dimensión que se creyó que era (es una posición/desfase con signo),
    así que se descarta en vez de propagarse como dato inválido."""
    try:
        v = float(valor)
    except (ValueError, TypeError):
        return None
    return v if v >= 0 else None


def extraer_metrados_revit_completo(el, property_prefix=None):
    """Devuelve DOS dicts separados, no uno solo — metrados.py necesita
    distinguir la fuente para decidir prioridad (ver calcular_metrados_final):
    metrados_tipados sale de IfcElementQuantity (typed, sin ambigüedad,
    máxima confianza); metrados_texto sale de adivinar por palabra clave
    contra el nombre de una IfcPropertySingleValue cualquiera (fallback
    de menor confianza, ahora protegido con DESCALIFICADORES_DIMENSION +
    no-negatividad, pero sigue siendo una adivinanza de texto).

    property_prefix (Fase 4, clasificación manual — ver classify.py):
    cuando el proyecto está en modo 'manual', el cliente escribe a mano,
    en cada elemento, las propiedades que a ÉL le importan (identificadas
    por este prefijo de nombre) — separadas de lo que Revit exporta solo
    (Pset_WallCommon, Qto_*, etc, que el usuario ni ve). Si se pasa un
    prefijo, CUALQUIER IfcPropertySingleValue cuyo nombre no empiece con
    él se descarta ACÁ MISMO, antes de entrar a "propiedades" (que
    después alimenta 1:1 ifc_properties/columnas de plantilla, ver
    normalize.py) y antes de competir en el fallback de texto — no solo
    se ignora para el metrado, directamente no se captura como propiedad
    del archivo. property_prefix=None (default) no cambia nada del
    comportamiento de siempre (modo 'norma')."""
    metrados_tipados = {"lon": None, "area": None, "vol": None, "count": None, "weight": None}
    metrados_texto = {"lon": None, "area": None, "vol": None, "count": None, "weight": None}
    propiedades = {}

    # 1. IfcElementQuantity — typed, no ambiguo (IfcQuantityLength no se
    # confunde con una posición); igual se valida no-negatividad acá
    # también por consistencia, aunque en teoría no debería hacer falta.
    for rel in getattr(el, "IsDefinedBy", []):
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        prop_def = rel.RelatingPropertyDefinition
        if not prop_def:
            continue
        if prop_def.is_a("IfcElementQuantity"):
            for q in getattr(prop_def, "Quantities", []):
                if q.is_a("IfcQuantityLength") and q.LengthValue is not None:
                    if metrados_tipados["lon"] is None:
                        v = _valor_no_negativo(q.LengthValue)
                        if v is not None:
                            metrados_tipados["lon"] = v
                elif q.is_a("IfcQuantityArea") and q.AreaValue is not None:
                    if metrados_tipados["area"] is None:
                        v = _valor_no_negativo(q.AreaValue)
                        if v is not None:
                            metrados_tipados["area"] = v
                elif q.is_a("IfcQuantityVolume") and q.VolumeValue is not None:
                    if metrados_tipados["vol"] is None:
                        v = _valor_no_negativo(q.VolumeValue)
                        if v is not None:
                            metrados_tipados["vol"] = v
                elif q.is_a("IfcQuantityCount") and q.CountValue is not None:
                    if metrados_tipados["count"] is None:
                        metrados_tipados["count"] = float(q.CountValue)  # count SÍ puede ser 0
                elif q.is_a("IfcQuantityWeight") and q.WeightValue is not None:
                    if metrados_tipados["weight"] is None:
                        v = _valor_no_negativo(q.WeightValue)
                        if v is not None:
                            metrados_tipados["weight"] = v

    # 2. Propiedades del exportador (fallback de texto — acá vivían los
    # bugs: substring sin descalificar posiciones, y sin validar signo)
    CLAVES_AREA = ["AREA", "ÁREA", "SURFACE", "GROSS AREA", "NET AREA"]
    CLAVES_VOLUMEN = ["VOLUME", "VOLUMEN", "NET VOLUME", "GROSS VOLUME"]
    CLAVES_LONGITUD = ["LENGTH", "LONGITUD", "WIDTH", "ANCHURA", "ALTURA", "HEIGHT", "DEPTH", "PERALTE"]
    CLAVES_PESO = ["WEIGHT", "PESO", "MASS"]
    CLAVES_CONTEO = ["COUNT", "CANTIDAD", "NUMBER"]

    for rel in getattr(el, "IsDefinedBy", []):
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        prop_def = rel.RelatingPropertyDefinition
        if not prop_def or not prop_def.is_a("IfcPropertySet"):
            continue
        for prop in getattr(prop_def, "HasProperties", []):
            if not (prop.is_a("IfcPropertySingleValue") and prop.NominalValue is not None):
                continue
            nombre = getattr(prop, "Name", "").upper().strip()
            if property_prefix and not nombre.startswith(property_prefix.upper()):
                continue  # modo manual: no es una propiedad que el usuario escribió, se descarta del todo
            valor = prop.NominalValue.wrappedValue if hasattr(prop.NominalValue, 'wrappedValue') else prop.NominalValue
            propiedades[nombre] = valor

            if _nombre_descalificado(nombre):
                continue  # posición/referencia/fase/etc — nunca una dimensión, sea cual sea CLAVES_*

            if metrados_texto["area"] is None and any(k in nombre for k in CLAVES_AREA):
                v = _valor_no_negativo(valor)
                if v is not None:
                    metrados_texto["area"] = v
            if metrados_texto["vol"] is None and any(k in nombre for k in CLAVES_VOLUMEN):
                v = _valor_no_negativo(valor)
                if v is not None:
                    metrados_texto["vol"] = v
            if metrados_texto["lon"] is None and any(k in nombre for k in CLAVES_LONGITUD):
                v = _valor_no_negativo(valor)
                if v is not None:
                    metrados_texto["lon"] = v
            if metrados_texto["weight"] is None and any(k in nombre for k in CLAVES_PESO):
                v = _valor_no_negativo(valor)
                if v is not None:
                    metrados_texto["weight"] = v
            if metrados_texto["count"] is None and any(k in nombre for k in CLAVES_CONTEO):
                try:
                    metrados_texto["count"] = float(valor)  # count SÍ puede ser 0
                except (ValueError, TypeError):
                    pass

    return {"metrados_tipados": metrados_tipados, "metrados_texto": metrados_texto, "propiedades": propiedades}


def peso_nominal_kg_por_metro(diametro_metros):
    """Retorna el peso (kg/m) según tabla comercial. Redondea al diámetro más cercano."""
    if diametro_metros is None:
        return None
    diametro_mm = diametro_metros * 1000.0
    comercial = None
    menor_dif = float('inf')
    peso_elegido = None
    for d_com, peso in TABLA_PESOS_ACERO.items():
        dif = abs(diametro_mm - d_com)
        if dif < menor_dif and dif <= 0.5:
            menor_dif = dif
            comercial = d_com
            peso_elegido = peso
    if comercial is not None:
        return peso_elegido
    area = math.pi * (diametro_metros / 2.0) ** 2
    return area * DENSIDAD_ACERO_KG_M3


# ----------------------------------------------------------------------
# Jerarquía espacial
# ----------------------------------------------------------------------
def get_storey_and_space(el, model=None):
    storey = "SIN NIVEL"
    space = "SIN ESPACIO"
    container = None

    if hasattr(el, 'ContainedInStructure'):
        for rel in el.ContainedInStructure:
            if rel.is_a('IfcRelContainedInSpatialStructure'):
                container = rel.RelatingStructure
                break
    if container is None and hasattr(el, 'ReferencedInStructures'):
        for rel in el.ReferencedInStructures:
            if rel.is_a('IfcRelContainedInSpatialStructure'):
                container = rel.RelatingStructure
                break

    if container is None and model is not None:
        try:
            shape = get_shape(el)
            if shape and shape.geometry.verts:
                verts = shape.geometry.verts
                cx = sum(verts[0::3]) / (len(verts) // 3)
                cy = sum(verts[1::3]) / (len(verts) // 3)
                cz = sum(verts[2::3]) / (len(verts) // 3)
                for space_el in model.by_type('IfcSpace'):
                    s_shape = get_shape(space_el)
                    if s_shape and s_shape.geometry.verts:
                        s_verts = s_shape.geometry.verts
                        min_x, max_x = min(s_verts[0::3]), max(s_verts[0::3])
                        min_y, max_y = min(s_verts[1::3]), max(s_verts[1::3])
                        min_z, max_z = min(s_verts[2::3]), max(s_verts[2::3])
                        if min_x <= cx <= max_x and min_y <= cy <= max_y and min_z <= cz <= max_z:
                            space = space_el.Name or space_el.GlobalId
                            if hasattr(space_el, 'Decomposes'):
                                for decomp in space_el.Decomposes:
                                    if decomp.is_a('IfcRelAggregates'):
                                        parent = decomp.RelatingObject
                                        if parent.is_a('IfcBuildingStorey'):
                                            storey = parent.Name or parent.GlobalId
                                            break
                            break
        except Exception as e:
            print(f"⚠ Error buscando espacio para elemento {el.id()}: {e}")

    if space == "SIN ESPACIO" and container is not None:
        while container is not None:
            if container.is_a('IfcBuildingStorey'):
                storey = container.Name or container.GlobalId
            elif container.is_a('IfcSpace'):
                space = container.Name or container.GlobalId
            if hasattr(container, 'Decomposes') and container.Decomposes:
                container = container.Decomposes[0].RelatingObject
            else:
                break
    return storey, space


def get_openings(el):
    openings = []
    if hasattr(el, 'HasOpenings'):
        for rel in el.HasOpenings:
            if rel.is_a('IfcRelVoidsElement'):
                openings.append(rel.RelatedOpeningElement)
    return openings


def extraer_element_id(el):
    """Obtiene el ElementID de Revit desde el atributo Tag del IFC."""
    tag = getattr(el, 'Tag', None)
    if tag and tag.strip():
        return tag.strip()
    name = getattr(el, 'Name', '')
    if not name:
        return None
    match = re.search(r'(\d{6,})', name)
    if match:
        return match.group(1)
    return None
