# geometria_proyeccion.py
#
# Captura de Largo/Ancho/Alto por geometría real, para reemplazar al
# OBB del sólido completo (que se infla con cualquier inclinación —
# ver bug de techos) y al viejo calcular_metrados_geometrico/
# _agrupar_caras de proceso-metrados-base/utils.py, que nunca se portó
# a este módulo (dos bugs de fondo, ninguno corregido: nunca soldaba
# vértices — ifcopenshell le da a cada triángulo su propia copia de
# cada vértice sin WELD_VERTICES=True, confirmado 24 vértices para una
# caja de 8 esquinas reales — y el agrupamiento era O(n²), inviable
# para un edificio completo).
#
# Idea (confirmada con el usuario): para una figura "regular" (sus dos
# caras opuestas son aprox. la misma figura vista desde lados
# contrarios — el caso de un muro o una losa), se detecta ESE PAR de
# caras por geometría real, no por una tabla de clases IFC hardcodeada.
# De ahí sale:
#   - Alto/espesor = distancia perpendicular ENTRE los dos planos del
#     par (nunca una arista cualquiera — funciona igual en una
#     cobertura inclinada que en un muro vertical).
#   - Largo/Ancho = OBB 2D (PCA) de la cara más grande del par,
#     proyectada sobre SU PROPIO plano.
#
# Generaliza a TODOS los tipos de elemento posibles (no a una lista de
# 5-7 clases IFC) porque el criterio de aplicabilidad es geométrico:
# existe un par de caras de área similar y normales opuestas. Esto deja
# afuera por construcción a las figuras sin "un lado" (escaleras: muchas
# caras chicas de peldaños, ninguna domina) sin necesitar una regla
# aparte para ellas — encontrar_pares_opuestos() simplemente no
# encuentra nada y el elemento cae a None.
#
# Un caso adicional que si necesita regla aparte (confirmado con
# geometría real del proyecto, ver es_figura_regular): un elemento
# puede tener un par válido — área similar, normales opuestas — pero
# con un contorno tan irregular (forma en L, en cruz, múltiples alas)
# que "Largo × Ancho" de un rectángulo no significa nada. Ejemplo real:
# una membrana asfáltica (IfcSlab) de 196.6 m² reales cuyo rectángulo
# envolvente (OBB) mide 526 m² — un 63% del "rectángulo" no es la
# figura. El área/espesor de esa membrana SÍ son confiables (salen de
# geometría triangulada real), pero Largo/Ancho no representan nada
# físico ahí, y no hay que devolverlos como si lo fueran.
from __future__ import annotations

import math
from typing import Optional

import ifcopenshell
import ifcopenshell.geom


# ---------------------------------------------------------------------------
# Geometría base (con vértices soldados)
# ---------------------------------------------------------------------------

def get_shape_soldado(el):
    """Igual que extraction.get_shape(), pero con WELD_VERTICES=True —
    es el único cambio de settings que hace falta para que la
    adyacencia por arista/vértice funcione entre triángulos que vienen
    de caras B-rep distintas pero están físicamente pegadas."""
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)
    try:
        shape = ifcopenshell.geom.create_shape(settings, el)
        if shape and shape.geometry.verts and shape.geometry.faces:
            return shape
    except Exception:
        pass
    return None


def triangulos_y_normales(shape):
    verts = shape.geometry.verts
    faces = shape.geometry.faces
    n_verts = len(verts) // 3
    vertices = [verts[i * 3:(i + 1) * 3] for i in range(n_verts)]
    triangles = [tuple(faces[i * 3:(i + 1) * 3]) for i in range(len(faces) // 3)]

    normals, areas = [], []
    for tri in triangles:
        p0, p1, p2 = vertices[tri[0]], vertices[tri[1]], vertices[tri[2]]
        v1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
        v2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
        nx = v1[1] * v2[2] - v1[2] * v2[1]
        ny = v1[2] * v2[0] - v1[0] * v2[2]
        nz = v1[0] * v2[1] - v1[1] * v2[0]
        norm = math.sqrt(nx * nx + ny * ny + nz * nz)
        areas.append(0.5 * norm)
        normals.append((nx / norm, ny / norm, nz / norm) if norm > 1e-12 else (0.0, 0.0, 0.0))
    return vertices, triangles, normals, areas


def calcular_volumen_malla(vertices, triangles):
    """Volumen REAL del sólido, integrando directamente la malla
    triangulada (teorema de la divergencia: suma de los volúmenes con
    signo de los tetraedros que forma cada triángulo con el origen) —
    no una fórmula por dimensiones (ni Largo×Ancho×Alto, ni π×radio²×largo).
    Funciona para CUALQUIER sólido cerrado, no solo cilindros — mide el
    sólido tal como lo triangula ifcopenshell (un polígono de N lados
    aproximando un círculo, no el círculo matemático ideal), que es lo
    que realmente ocupa espacio, no una idealización.

    Requiere una malla cerrada y con normales hacia afuera consistentes
    — lo mismo que ya asume el resto de este módulo (get_shape_soldado
    con WELD_VERTICES=True)."""
    vol6 = 0.0
    for a, b, c in triangles:
        p0, p1, p2 = vertices[a], vertices[b], vertices[c]
        cross_x = p1[1] * p2[2] - p1[2] * p2[1]
        cross_y = p1[2] * p2[0] - p1[0] * p2[2]
        cross_z = p1[0] * p2[1] - p1[1] * p2[0]
        vol6 += p0[0] * cross_x + p0[1] * cross_y + p0[2] * cross_z
    return abs(vol6) / 6.0


# ---------------------------------------------------------------------------
# Agrupamiento de caras: adyacencia por ARISTA + Union-Find (O(n), no O(n²))
# ---------------------------------------------------------------------------

class _UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def agrupar_caras(vertices, triangles, normals, areas, angulo_max_grados: float = 5.0):
    """Fusiona triángulos en caras planas reales. Dos triángulos se
    fusionan si comparten una ARISTA (2 vértices, no 1 — evita el falso
    positivo de dos caras distintas que solo se tocan en una esquina) y
    sus normales difieren menos de `angulo_max_grados` (tolerancia para
    ruido de triangulación en superficies "casi" planas).

    Construye la adyacencia UNA vez (diccionario arista->triángulos,
    O(n)) y usa Union-Find para fusionar — nunca vuelve a escanear
    todos los triángulos por cada paso, a diferencia de un BFS que
    re-escanea todo el elemento en cada paso (inviable para un edificio
    completo: medido 0.09s para UN elemento de 964 triángulos con ese
    enfoque)."""
    n = len(triangles)
    edge_to_tris: dict = {}
    for idx, tri in enumerate(triangles):
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            key = (a, b) if a < b else (b, a)
            edge_to_tris.setdefault(key, []).append(idx)

    uf = _UnionFind(n)
    cos_thresh = math.cos(math.radians(angulo_max_grados))
    for tris in edge_to_tris.values():
        if len(tris) != 2:
            continue  # arista de borde (1 triángulo) o no-manifold (>2): no fusiona
        i, j = tris
        dot = (normals[i][0] * normals[j][0] + normals[i][1] * normals[j][1]
               + normals[i][2] * normals[j][2])
        if dot > cos_thresh:
            uf.union(i, j)

    grupos: dict = {}
    for idx in range(n):
        raiz = uf.find(idx)
        g = grupos.setdefault(raiz, {"area": 0.0, "normal_acc": [0.0, 0.0, 0.0], "triangulos": []})
        w = areas[idx]
        g["area"] += w
        g["normal_acc"][0] += normals[idx][0] * w
        g["normal_acc"][1] += normals[idx][1] * w
        g["normal_acc"][2] += normals[idx][2] * w
        g["triangulos"].append(idx)

    resultado = []
    for g in grupos.values():
        if g["area"] < 1e-6:
            continue
        nx, ny, nz = g["normal_acc"]
        norm = math.sqrt(nx * nx + ny * ny + nz * nz)
        normal = (nx / norm, ny / norm, nz / norm) if norm > 1e-12 else (0.0, 0.0, 0.0)
        resultado.append({"area": g["area"], "normal": normal, "triangulos": g["triangulos"]})
    return resultado


# ---------------------------------------------------------------------------
# Detección del par (o pares) de caras opuestas
# ---------------------------------------------------------------------------

def encontrar_pares_opuestos(grupos, tolerancia_area: float = 0.15, area_min_absoluta: float = 0.5):
    """Busca TODOS los pares de caras con normales OPUESTAS y ÁREA
    SIMILAR (no solo el mejor) — necesario para elementos con varias
    "vertientes"/figuras regulares distintas dentro del mismo sólido
    (ej. un techo a varias aguas: cada vertiente es su propio par
    largo/ancho/espesor, ninguna vertiente sola domina la superficie
    total del techo) — y también para el caso, menos obvio, de un muro
    con una puerta/ventana: el hueco puede partir la cara frontal en
    varios fragmentos coplanares desconectados entre sí (ej. el dintel
    arriba de la puerta + los dos lados), cada uno con su propio par
    contra la cara trasera.

    area_min_absoluta filtra pares chicos que son ruido geométrico
    (retornos/derrames alrededor de una abertura) sin depender de que
    sean un % grande del total — un valor absoluto en m² tiene sentido
    físico (una vertiente real no mide menos de ~0.5 m²), a diferencia
    de un % que penaliza injustamente a elementos con muchos fragmentos
    chicos."""
    usados = set()
    pares = []
    candidatos = sorted(grupos, key=lambda g: -g["area"])
    for i, g1 in enumerate(candidatos):
        if i in usados:
            continue
        mejor_j, mejor_dot = None, 2.0
        for j, g2 in enumerate(candidatos[i + 1:], start=i + 1):
            if j in usados:
                continue
            dot = (g1["normal"][0] * g2["normal"][0] + g1["normal"][1] * g2["normal"][1]
                   + g1["normal"][2] * g2["normal"][2])
            if dot > -0.95:
                continue
            area_min, area_max = sorted([g1["area"], g2["area"]])
            if area_max <= 0 or area_min < area_max * (1 - tolerancia_area):
                continue
            if area_min < area_min_absoluta:
                continue
            if dot < mejor_dot:  # más opuestas = mejor candidato para este g1
                mejor_dot, mejor_j = dot, j
        if mejor_j is not None:
            usados.add(i)
            usados.add(mejor_j)
            g2 = candidatos[mejor_j]
            pares.append((g1, g2, (g1["area"] + g2["area"]) / 2))
    return pares


def _puntos_de_cara(vertices, triangulos_idx, triangles):
    idxs = set()
    for t in triangulos_idx:
        idxs.update(triangles[t])
    return [vertices[i] for i in idxs]


def _base_ortonormal(normal):
    """Devuelve dos vectores unitarios perpendiculares entre sí y a
    `normal`, para proyectar puntos 3D sobre el plano de esa normal."""
    ref = (1.0, 0.0, 0.0) if abs(normal[0]) < 0.9 else (0.0, 1.0, 0.0)
    ux = (
        ref[1] * normal[2] - ref[2] * normal[1],
        ref[2] * normal[0] - ref[0] * normal[2],
        ref[0] * normal[1] - ref[1] * normal[0],
    )
    norm = math.sqrt(sum(c * c for c in ux))
    ux = tuple(c / norm for c in ux)
    uy = (
        normal[1] * ux[2] - normal[2] * ux[1],
        normal[2] * ux[0] - normal[0] * ux[2],
        normal[0] * ux[1] - normal[1] * ux[0],
    )
    return ux, uy


def _proyectar_2d(puntos_3d, normal):
    ux, uy = _base_ortonormal(normal)
    return [(p[0] * ux[0] + p[1] * ux[1] + p[2] * ux[2],
              p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]) for p in puntos_3d]


def _obb_2d(pts2d):
    """OBB 2D vía PCA (suficiente para figuras aprox. rectangulares).
    Para contornos muy irregulares el propio OBB deja de ser
    representativo — ver es_figura_regular(), que detecta justo ese
    caso comparando esta área contra la del hull convexo real.

    Devuelve también (cos_t, sin_t): la dirección del primer eje del
    OBB, EXPRESADA EN EL PLANO 2D de la cara (no un ángulo suelto) —
    _dimensiones_de_par la necesita para saber si ese eje apunta más
    "hacia arriba" (vertical, world Z) que el otro, y así decidir cuál
    de los dos es candidato a "Alto" real (ver ese comentario para el
    porqué: el espesor del par NO siempre es la dimensión vertical)."""
    n = len(pts2d)
    mx = sum(p[0] for p in pts2d) / n
    my = sum(p[1] for p in pts2d) / n
    sxx = syy = sxy = 0.0
    for x, y in pts2d:
        dx, dy = x - mx, y - my
        sxx += dx * dx
        syy += dy * dy
        sxy += dx * dy
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy) if (abs(sxx - syy) > 1e-12 or abs(sxy) > 1e-12) else 0.0
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    proj_u = [x * cos_t + y * sin_t for x, y in pts2d]
    proj_v = [-x * sin_t + y * cos_t for x, y in pts2d]
    return max(proj_u) - min(proj_u), max(proj_v) - min(proj_v), cos_t, sin_t


def _hull_convexo_2d(pts2d):
    """Monotone chain (Andrew) — O(n log n). Se usa para
    es_figura_regular(), no para Largo/Ancho (eso sigue siendo el OBB,
    más estable para el caso común de un rectángulo con ruido)."""
    pts = sorted(set(pts2d))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _area_poligono(hull):
    n = len(hull)
    if n < 3:
        return 0.0
    area2 = 0.0
    for i in range(n):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % n]
        area2 += x1 * y2 - x2 * y1
    return abs(area2) / 2.0


# Umbral calibrado con geometría real del proyecto (no un valor teórico):
# muros normales con puertas/ventanas (huecos legítimos, contorno
# exterior sigue siendo un rectángulo) midieron entre 0.66 y 0.89 acá;
# una losa realmente irregular (forma no convexa, varias "alas") midió
# 0.39. Un hueco NO baja este número (el hull convexo ignora
# concavidades/huecos interiores, solo le importa el contorno exterior)
# — por eso este criterio no penaliza muros con vanos, que es
# justamente lo que se necesitaba: separar "tiene huecos" (normal, no
# descalifica) de "el contorno mismo es irregular" (sí descalifica).
# Puede necesitar reajuste con más casos reales (ninguno de los dos IFC
# de prueba tiene escaleras para calibrar ese extremo).
FILL_RATIO_MIN_REGULAR = 0.5


def _es_figura_regular(area_real, pts2d, normal) -> bool:
    hull = _hull_convexo_2d(pts2d)
    area_hull = _area_poligono(hull)
    if area_hull <= 1e-9:
        return False
    return (area_real / area_hull) >= FILL_RATIO_MIN_REGULAR


def _dimensiones_de_par(vertices, triangles, g1, g2):
    """Espesor + Largo/Ancho/Alto (OBB 2D sobre la cara más grande del
    par) de UN par de caras opuestas, más si el contorno de esa cara es
    lo bastante convexo/rectangular como para que Largo/Ancho
    signifiquen algo ("regular").

    OJO — por qué "Alto" NO es simplemente el espesor: el espesor es
    la distancia perpendicular ENTRE los dos planos del par, pero esa
    dirección no siempre es "vertical". Para una losa/techo (normales
    del par ~verticales, mirando arriba/abajo) el espesor SÍ es la
    dimensión vertical — coincide con "Alto". Para un muro NORMAL
    (normales del par ~horizontales, mirando al frente/atrás) el
    espesor es horizontal (el grosor del muro) y la altura real del
    muro es una de las dos dimensiones DENTRO de la cara — ahí el
    espesor tiene que ir a "Ancho", no a "Alto".

    Confirmado con datos reales que asumir siempre "espesor=Alto" rompe
    elementos delgados y verticales (ej. una membrana fina puesta de
    pie, no acostada): daba area=largo×espesor (casi cero) en vez de
    largo×altura real. Fix: de las 3 candidatas (espesor + las 2
    dimensiones de la cara), la que esté más alineada con el eje Z
    mundial es "Alto" — mismo criterio que ya usa el resto del pipeline
    para otros métodos (ver normalizar_ejes_por_categoria, rama
    genérica) — las otras dos, ordenadas por magnitud, son Largo/Ancho."""
    pts1 = _puntos_de_cara(vertices, g1["triangulos"], triangles)
    pts2 = _puntos_de_cara(vertices, g2["triangulos"], triangles)

    def centroide(pts):
        n = len(pts)
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)

    c1, c2 = centroide(pts1), centroide(pts2)
    dvec = (c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2])
    n1 = g1["normal"]
    espesor = abs(dvec[0] * n1[0] + dvec[1] * n1[1] + dvec[2] * n1[2])

    if g1["area"] >= g2["area"]:
        cara_ref, pts_ref = g1, pts1
    else:
        cara_ref, pts_ref = g2, pts2
    normal_ref = cara_ref["normal"]

    pts2d = _proyectar_2d(pts_ref, normal_ref)
    ux, uy = _base_ortonormal(normal_ref)
    dim_a, dim_b, cos_t, sin_t = _obb_2d(pts2d)
    # Direcciones 3D reales de los dos ejes del OBB (ux/uy rotados por
    # el ángulo theta que ya encontró _obb_2d) — hace falta el eje Z de
    # cada una para decidir cuál va a "Alto".
    eje_a = (cos_t * ux[0] + sin_t * uy[0], cos_t * ux[1] + sin_t * uy[1], cos_t * ux[2] + sin_t * uy[2])
    eje_b = (-sin_t * ux[0] + cos_t * uy[0], -sin_t * ux[1] + cos_t * uy[1], -sin_t * ux[2] + cos_t * uy[2])

    candidatos = [
        (espesor, abs(normal_ref[2])),
        (dim_a, abs(eje_a[2])),
        (dim_b, abs(eje_b[2])),
    ]
    idx_alto = max(range(3), key=lambda i: candidatos[i][1])
    alto = candidatos[idx_alto][0]
    restantes = sorted((candidatos[i][0] for i in range(3) if i != idx_alto), reverse=True)
    largo, ancho = restantes[0], restantes[1]

    area_real = (g1["area"] + g2["area"]) / 2
    regular = _es_figura_regular(cara_ref["area"], pts2d, normal_ref)

    return {
        "Largo": largo if regular else None,
        "Ancho": ancho if regular else None,
        "Alto": alto,
        "area_real": area_real,
        "regular": regular,
        # True cuando "Alto" salió del espesor (par tipo losa/techo,
        # normales ~verticales) — se lo usa en
        # calcular_dimensiones_por_proyeccion para decidir si conviene
        # recalcular Largo/Ancho por proyección en PLANTA (ver ese
        # comentario) en vez de quedarse con el de esta sola cara.
        "alto_es_espesor": idx_alto == 0,
    }


# Umbral separado del de _es_figura_regular (0.5) — mide algo distinto.
# _es_figura_regular compara el ÁREA REAL de UNA cara contra su propio
# hull convexo (detecta material "en zigzag"/con concavidades, ej. una
# membrana que serpentea en vez de cubrir una superficie sólida).
# FILL_RATIO_MIN_PLANTA compara el hull convexo EN PLANTA (de todo el
# elemento, todas las vertientes juntas) contra su propio rectángulo
# envolvente (detecta si el CONTORNO exterior en planta es o no un
# rectángulo — un techo a 2 aguas simple sí lo es, uno con alas de
# distinto tamaño no). Son complementarios, no intercambiables:
# confirmado con datos reales que una losa ya sabida irregular
# (zigzag, 0.39 en el primer criterio) da 0.96 en este segundo criterio
# — el contorno exterior SÍ es casi rectangular, pero el material real
# no lo llena. Por eso para pisos/techos se exigen los DOS a la vez.
# Calibrado con 2 casos reales: un techo de 2 aguas simple dio 0.9998
# (debe pasar), uno con vertientes de tamaño desigual dio 0.8052 (debe
# fallar) — el corte en 0.9 separa los dos con margen para ambos lados.
FILL_RATIO_MIN_PLANTA = 0.9


def _dimensiones_en_planta(vertices):
    """Largo/Ancho/fill_ratio proyectando TODO el elemento (todos sus
    vértices, no solo los de una cara) sobre el plano horizontal
    (XY, se descarta Z) — la vista "en planta" de toda la figura junta,
    no de una sola vertiente. Necesario para elementos con varias caras
    inclinadas (ej. un techo a 2 aguas): el Largo/Ancho de UNA sola cara
    (su propio plano, inclinado) no es lo que se espera ver en una
    tabla de metrados — ahí se espera el contorno del techo visto desde
    arriba, que junta todas las vertientes a la vez."""
    pts2d = [(v[0], v[1]) for v in vertices]
    n = len(pts2d)
    mx = sum(p[0] for p in pts2d) / n
    my = sum(p[1] for p in pts2d) / n
    sxx = syy = sxy = 0.0
    for x, y in pts2d:
        dx, dy = x - mx, y - my
        sxx += dx * dx
        syy += dy * dy
        sxy += dx * dy
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy) if (abs(sxx - syy) > 1e-12 or abs(sxy) > 1e-12) else 0.0
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    proj_u = [x * cos_t + y * sin_t for x, y in pts2d]
    proj_v = [-x * sin_t + y * cos_t for x, y in pts2d]
    dim_a, dim_b = max(proj_u) - min(proj_u), max(proj_v) - min(proj_v)
    area_obb = dim_a * dim_b
    hull = _hull_convexo_2d(pts2d)
    area_hull = _area_poligono(hull)
    fill_ratio = (area_hull / area_obb) if area_obb > 1e-9 else 0.0
    return max(dim_a, dim_b), min(dim_a, dim_b), fill_ratio


def calcular_dimensiones_por_proyeccion(el, angulo_max_grados: float = 5.0) -> Optional[dict]:
    """Punto de entrada. Devuelve None si el elemento no tiene NINGÚN
    par de caras opuestas válido (figura demasiado irregular como para
    tener siquiera un par — el caso de las escaleras). Si tiene uno o
    más pares:

      Largo/Ancho/Alto -> los del par de MAYOR área (el más
        representativo si el elemento tiene varias vertientes/
        fragmentos). Largo/Ancho quedan en None (no Alto) si ESE par
        puntual resultó no-regular (contorno no rectangular) — ver
        _es_figura_regular. El llamador (obtener_dimensiones) debe
        tratar Largo=None como "este método no dio un valor usable",
        igual que cualquier otro paso de la cascada de prioridad.
      area_total_m2 -> área real (triangulada, no Largo×Ancho) del
        elemento entero — normalmente la SUMA de todos los pares
        encontrados (más exacta que la de un solo par cuando hay varias
        vertientes, ej. techo a 4 aguas, o varios fragmentos coplanares
        separados por un hueco, ej. muro con puerta); si el
        emparejamiento dejó afuera una porción grande de la malla (una
        cara física fragmentada que nunca se pudo emparejar), cae a la
        malla cruda completa ÷ 2 en su lugar — ver el comentario más
        abajo, junto a area_cruda_mitad. Se usa en
        extraction.calcular_metrados() (ver obtener_dimensiones, paso
        2.5) para el área final del elemento. NO devuelve un volumen:
        el volumen ya no se aproxima como área×espesor acá (asume
        espesor uniforme, un prisma) — obtener_dimensiones lo integra
        directo de la malla completa (calcular_volumen_malla, teorema
        de la divergencia), exacto para cualquier sólido cerrado sea
        cual sea su forma, sin necesitar este emparejamiento de caras
        en absoluto."""
    shape = get_shape_soldado(el)
    if shape is None:
        return None
    vertices, triangles, normals, areas = triangulos_y_normales(shape)
    if not triangles:
        return None

    grupos = agrupar_caras(vertices, triangles, normals, areas, angulo_max_grados)
    pares = encontrar_pares_opuestos(grupos)
    if not pares:
        return None

    subfiguras = [_dimensiones_de_par(vertices, triangles, g1, g2) for g1, g2, _ in pares]
    principal = max(subfiguras, key=lambda s: s["area_real"])
    suma_pares = sum(s["area_real"] for s in subfiguras)

    # El emparejamiento puede PERDER área real: si una cara física queda
    # fragmentada en dos o más grupos por una costura/discontinuidad de
    # la malla, encontrar_pares_opuestos nunca la encuentra (empareja
    # "un grupo contra otro grupo", nunca "un grupo contra la suma de
    # varios"). Confirmado con datos reales: un techo con 37 grupos de
    # caras solo logró emparejar 18 — una cara de 56.45 m² se perdió
    # por completo porque su contraparte real estaba partida en dos
    # fragmentos (41.46 + 15.05 = 56.51, la misma cara). area_cruda_mitad
    # (TODA la malla triangulada dividida 2, asumiendo lámina delgada
    # donde cara de arriba ≈ cara de abajo) es un respaldo simple que no
    # depende de que el emparejamiento haya sido perfecto — no hace
    # falta "proyección" para esto, es solo sumar toda la malla.
    #
    # Se usa SOLO cuando la diferencia es grande (evidencia real de que
    # el emparejamiento perdió algo) — para una figura gruesa (no
    # lámina delgada) o cuando el emparejamiento ya fue completo, la
    # suma por pares es MÁS precisa (excluye el aporte de las caras
    # laterales/de borde, que area_cruda_mitad sí incluye un poco).
    # Confirmado con los dos casos reales que motivaron esto: para un
    # techo donde el emparejamiento SÍ fue completo, suma_pares (85.42)
    # midió más cerca de la medición manual (85.44) que area_cruda_mitad
    # (85.95) — por eso no se usa siempre, solo como respaldo.
    area_cruda_mitad = sum(areas) / 2
    if suma_pares > 0 and area_cruda_mitad > suma_pares * 1.1:
        area_total = area_cruda_mitad
    else:
        area_total = suma_pares

    largo, ancho, regular = principal["Largo"], principal["Ancho"], principal["regular"]

    # Para losas/techos (Alto salió del espesor — normales del par
    # verticales), Largo/Ancho de la cara de referencia son los de UNA
    # sola vertiente inclinada — no lo que se espera ver para el
    # elemento entero (ej. un techo a 2 aguas: cada agua es su propio
    # trapecio, pero lo útil es el rectángulo del techo visto desde
    # arriba, combinando las dos). Se recalcula por proyección en
    # planta de TODO el elemento, y se exige que TAMBIÉN ese contorno
    # sea razonablemente rectangular (FILL_RATIO_MIN_PLANTA) además de
    # lo que ya exigía _es_figura_regular — los dos criterios miden
    # cosas distintas (ver comentario de FILL_RATIO_MIN_PLANTA), hace
    # falta que pasen los dos.
    if principal["alto_es_espesor"]:
        largo_planta, ancho_planta, fill_planta = _dimensiones_en_planta(vertices)
        regular = regular and fill_planta >= FILL_RATIO_MIN_PLANTA
        largo = largo_planta if regular else None
        ancho = ancho_planta if regular else None

    return {
        "Largo": largo,
        "Ancho": ancho,
        "Alto": principal["Alto"],
        "regular": regular,
        "area_total_m2": area_total,
        "n_subfiguras": len(subfiguras),
        "subfiguras": subfiguras,
    }


def calcular_metrado_circular(el) -> Optional[dict]:
    """Área/volumen REAL para un elemento de perfil circular (tubos) —
    igual criterio que el resto del módulo: se mide la malla triangulada
    real, no una fórmula por dimensiones (π×radio²×largo da el volumen
    de un cilindro matemático IDEAL, no el del sólido realmente
    exportado — ifcopenshell tesela el círculo como un polígono de N
    lados, con menos volumen que el círculo perfecto; confirmado con
    datos reales: ~1% menos para un tramo de tubería real).

    volumen_m3 -> calcular_volumen_malla(), exacto para CUALQUIER sólido
      cerrado, sea cual sea su forma real.
    area_m2 -> superficie triangulada COMPLETA (todas las caras, incluye
      las dos tapas circulares de los extremos, no solo la superficie
      lateral) — simplificación a propósito, ver nota en el README."""
    shape = get_shape_soldado(el)
    if shape is None:
        return None
    vertices, triangles, normals, areas = triangulos_y_normales(shape)
    if not triangles:
        return None
    return {
        "area_m2": sum(areas),
        "volumen_m3": calcular_volumen_malla(vertices, triangles),
    }
