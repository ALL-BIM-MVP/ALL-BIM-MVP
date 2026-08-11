-- ============================================================
-- 1) POBLAR metrado_partida_totals (al terminar de procesar el IFC)
-- ============================================================
-- Paso A: sub_total y element_count de las partidas HOJA (las que
-- tienen filas propias en metrado_elements). La columna de metrado
-- que se suma depende de la unidad de la partida (m/m2/m3/kg/und) -
-- en la app esto ya se sabe porque metrado_partidas.unit lo dice, asi
-- que el backend arma el SUM(...) correcto por partida en un solo
-- pase (aqui se muestra generico via COALESCE, valido si cada partida
-- solo llena UNA de las columnas segun su unidad).

INSERT INTO metrado_partida_totals (partida_id, element_count, sub_total, total)
SELECT
    me.partida_id,
    COUNT(*)                                   AS element_count,
    SUM(COALESCE(me.length, 0) + 0)             AS sub_total_placeholder -- ver nota
FROM metrado_elements me
GROUP BY me.partida_id
ON CONFLICT (partida_id) DO UPDATE
    SET element_count = EXCLUDED.element_count,
        updated_at = NOW();

-- Nota real (recomendado hacerlo en la app, no en SQL puro): por cada
-- partida se sabe su `unit`, y esa unidad ya determina que columna de
-- metrado_elements sumar (length/area/volume/weight/quantity). Ejemplo
-- resuelto en la aplicacion:
--
--   UPDATE metrado_partida_totals t
--   SET sub_total = sub.total
--   FROM (
--       SELECT me.partida_id,
--              SUM(CASE p.unit
--                    WHEN 'm'   THEN me.length
--                    WHEN 'm2'  THEN me.area
--                    WHEN 'm3'  THEN me.volume
--                    WHEN 'kg'  THEN me.weight
--                    ELSE me.quantity
--                  END) AS total
--       FROM metrado_elements me
--       JOIN metrado_partidas p ON p.partida_id = me.partida_id
--       GROUP BY me.partida_id
--   ) sub
--   WHERE t.partida_id = sub.partida_id;

-- Paso B: propagar hacia arriba (bottom-up). OJO: esto NO se puede
-- resolver con un solo UPDATE de una pasada si el arbol tiene mas de
-- 2 niveles (la norma llega hasta 5): un UPDATE es de conjunto, no
-- procesa fila por fila en el orden del ORDER BY, asi que un padre
-- podria leer el total de un hijo ANTES de que ese hijo se haya
-- actualizado. Hay que procesar nivel por nivel, de la profundidad
-- maxima hacia la raiz (0). Ejemplo correcto en PL/pgSQL:

DO $$
DECLARE
    max_prof INT;
    d INT;
BEGIN
    SELECT MAX(profundidad) INTO max_prof FROM (
        WITH RECURSIVE arbol AS (
            SELECT partida_id, parent_id, 0 AS profundidad
            FROM metrado_partidas WHERE parent_id IS NULL
            UNION ALL
            SELECT p.partida_id, p.parent_id, a.profundidad + 1
            FROM metrado_partidas p JOIN arbol a ON p.parent_id = a.partida_id
        ) SELECT * FROM arbol
    ) t;

    FOR d IN REVERSE max_prof..0 LOOP
        WITH RECURSIVE arbol AS (
            SELECT partida_id, parent_id, 0 AS profundidad
            FROM metrado_partidas WHERE parent_id IS NULL
            UNION ALL
            SELECT p.partida_id, p.parent_id, a.profundidad + 1
            FROM metrado_partidas p JOIN arbol a ON p.parent_id = a.partida_id
        )
        UPDATE metrado_partida_totals t
        SET total = COALESCE(t.sub_total, 0) + COALESCE((
            SELECT SUM(hijo_t.total)
            FROM metrado_partidas h
            JOIN metrado_partida_totals hijo_t ON hijo_t.partida_id = h.partida_id
            WHERE h.parent_id = t.partida_id
        ), 0)
        FROM arbol a
        WHERE a.partida_id = t.partida_id AND a.profundidad = d;
    END LOOP;
END $$;

-- Recomendado en la practica: hacer este mismo recorrido bottom-up en
-- el backend (recorrer el arbol ya cargado en memoria, sumar hijos
-- antes que padres) justo despues de insertar metrado_elements. Es mas
-- simple de leer/mantener que el bloque PL/pgSQL de arriba y evita
-- depender de una feature especifica de Postgres para algo que es, en
-- esencia, un recorrido de arbol.


-- ============================================================
-- 2) GET /ifc-files/{id}/partidas  — arbol liviano (primera carga)
-- ============================================================
-- Una sola lectura, sin agregar sobre metrado_elements. Esto es lo
-- que hace rapida la "primera vez" a pesar de tener miles de
-- elementos de fondo.

SELECT
    p.partida_id,
    p.parent_id,
    p.code,
    p.description,
    p.unit,
    p.sort_order,
    COALESCE(t.element_count, 0) AS element_count,
    t.sub_total,
    t.total
FROM metrado_partidas p
LEFT JOIN metrado_partida_totals t ON t.partida_id = p.partida_id
WHERE p.ifc_file_id = :ifc_file_id
ORDER BY p.sort_order;

-- El backend arma el arbol (parent_id -> hijos) en memoria a partir de
-- esta lista plana antes de responder el JSON.


-- ============================================================
-- 3) GET /ifc-files/{id}/partidas/{partida_id}/elements — lazy load
-- ============================================================
-- Se pide SOLO cuando el usuario expande esa partida. Agrupa
-- level_name -> space_name -> tag -> elementos, tal como el Excel,
-- mas el nivel nuevo de tag.
--
-- Elementos que comparten tag: se listan agrupados; si un tag solo
-- tiene 1 elemento no tiene sentido mostrar una fila de grupo extra
-- (el backend puede colapsar ese caso y mostrar el elemento directo -
-- ver nota al final).

SELECT
    e.level_name,
    e.space_name,
    e.tag,
    e.element_id,
    e.express_id,
    e.name,
    me.length, me.width, me.height, me.quantity,
    me.area, me.volume, me.weight
FROM metrado_elements me
JOIN ifc_elements e ON e.element_id = me.element_id
WHERE me.partida_id = :partida_id
ORDER BY e.level_name, e.space_name, e.tag, e.element_id;

-- El backend agrupa este resultado plano en el arbol
-- level_name > space_name > tag > [elementos], y calcula ahi mismo el
-- "Sub Total" de la partida sumando la columna de metrado que
-- corresponda a p.unit (mismo criterio del paso 1).


-- ============================================================
-- 4) Valor de una columna de propiedad IFC PARA UN GRUPO (por tag)
--    — resolucion "por mayoria" con mode()
-- ============================================================
-- Cuando la fila es un GRUPO (varios elementos con el mismo tag) y la
-- plantilla pide una columna de propiedad IFC, se muestra el valor mas
-- frecuente entre los elementos de ese grupo. Si todos los elementos
-- del tag comparten el mismo valor (caso tipico: son instancias del
-- mismo tipo/catalogo), mode() devuelve ese valor sin ambigüedad; si
-- difieren, devuelve el mas comun sin que el backend tenga que decidir
-- caso por caso.

SELECT
    e.tag,
    mode() WITHIN GROUP (ORDER BY pv.value) AS valor_representativo,
    COUNT(DISTINCT pv.value) AS valores_distintos_en_el_grupo  -- 1 = todos iguales
FROM metrado_elements me
JOIN ifc_elements e ON e.element_id = me.element_id
JOIN ifc_properties p
    ON p.ifc_file_id = e.ifc_file_id
   AND p.property_set = :property_set_name
   AND p.property_name = :property_name
LEFT JOIN ifc_element_property_values epv
    ON epv.element_id = e.element_id AND epv.property_id = p.property_id
LEFT JOIN ifc_property_values pv
    ON pv.value_id = epv.value_id AND pv.property_id = epv.property_id
WHERE me.partida_id = :partida_id
GROUP BY e.tag;

-- valores_distintos_en_el_grupo > 1 es la señal que el frontend puede
-- usar para marcar la celda con un indicador visual ("valores mixtos")
-- en vez de mostrar el numero como si fuera exacto.
--
-- Para la fila de un ELEMENTO individual (dentro de un tag ya
-- expandido, o cuando el tag no se repite) no hace falta mode(): se
-- resuelve con el JOIN directo de la seccion 3.1 del documento
-- anterior (un solo valor por element_id, sin agregacion).