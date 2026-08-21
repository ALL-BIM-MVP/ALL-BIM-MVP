# Fix de geometría y metrados — estado real, verificado

Este documento reemplaza al README que se pasó originalmente con la
propuesta de otra IA (`geometria_proyeccion.py` / `fix_extraer_metrados_revit.py`
pegados en el chat). Esos dos archivos **no coincidían exactamente con lo
que terminó integrado acá** — se revisaron, se probaron contra el IFC
real del proyecto (no solo se leyeron), se encontró un bug nuevo no
mencionado en la propuesta original, y se corrigió antes de integrar.
Todo lo de acá abajo es el estado **real, ya en `processing/ifc/`**, no
una propuesta.

## Qué se corrigió (paso 1 de 3 — dimensiones/captura geométrica)

Este cambio es el primero de tres pasos acordados con el usuario:
1. **Corregir la captura actual de dimensiones (largo/ancho/alto).** ← esto es lo de acá.
2. Agregar radio/diámetro para elementos cilíndricos (varillas, tubos) — **en progreso, ver sección "Paso 2" más abajo**.
3. Metrado definitivo por proyección + descuento de huecos, para figuras regulares — pendiente, "la parte más complicada".

### 1. Captura geométrica de vértices (nunca se había arreglado)

`proceso-metrados-base/utils.py` (`calcular_metrados_geometrico` +
`_agrupar_caras`) tenía dos bugs de fondo, y esa función **nunca se
portó** a `processing/ifc/` al armar este módulo (se dejó afuera a
propósito, ver comentario histórico en `extraction.py`) — es decir, el
bug seguía sin arreglarse en el pipeline real que usa Node.

- Nunca activaba `WELD_VERTICES` → ifcopenshell le da a cada triángulo
  su propia copia de cada vértice (confirmado: una caja de 8 esquinas
  reales sale con 24 vértices). Sin soldar, la adyacencia por vértice
  compartido casi nunca conecta triángulos de caras B-rep distintas
  aunque estén físicamente pegadas.
- Agrupamiento `O(n²)` (rescaneaba todos los triángulos en cada paso) —
  inviable para un edificio completo.

**Fix**: `processing/ifc/geometria_proyeccion.py` (nuevo). Suelda
vértices, agrupa triángulos en caras planas por **arista compartida**
(no vértice — evita que dos caras que solo se tocan en una esquina se
fusionen) con Union-Find (`O(n)`), y busca pares de caras con normales
opuestas + área similar ("la misma figura vista desde lados
contrarios"). De cada par: espesor = distancia perpendicular entre los
dos planos (nunca una arista cualquiera), Largo/Ancho = OBB 2D (PCA) de
la cara más grande, proyectada sobre su propio plano.

Integrado en `extraction.obtener_dimensiones()`, como paso 2.5 — entre
Qto (typed, máxima confianza) y el OBB del sólido completo (el fallback
más crudo que había).

### 2. Figuras irregulares — NO tienen un largo/ancho "absoluto"

Confirmado con el elemento real que dio el usuario como ejemplo
(`express_id 136277` en `desenlazado.ifc`, un `IfcSlab` — membrana
asfáltica): el algoritmo SÍ encuentra un par de caras válido (área real
196.6 m² en cada cara, prácticamente idénticas), pero el rectángulo
envolvente (OBB) de esa cara mide 526 m² — un 63% de ese "rectángulo"
no es la figura real (contorno muy irregular, no convexo).

**Cómo se detecta**: se compara el área real (triangulada) de la cara
contra el área de su **hull convexo 2D** (no contra el OBB — un hueco,
como una puerta en un muro, no afecta al hull convexo, así que este
criterio no penaliza muros con vanos, que es justamente lo que hacía
falta). Calibrado con datos reales del proyecto:

| Elemento | fill_ratio (área real / hull convexo) |
|---|---|
| Membrana asfáltica irregular (136277) | **0.39** |
| Muros normales con puertas/ventanas (6 muestras) | 0.66 – 0.89 |

Umbral elegido: `FILL_RATIO_MIN_REGULAR = 0.5` (constante en
`geometria_proyeccion.py`, documentada ahí). **Es un valor calibrado
empíricamente con los datos disponibles, no una constante teórica** —
ninguno de los dos IFC de prueba del repo tiene escaleras (`IfcStair`/
`IfcStairFlight`, el otro caso de figura irregular que mencionó el
usuario) para calibrar ese extremo; puede necesitar ajuste cuando
aparezca un IFC con escaleras reales.

Cuando una figura es irregular, `Largo`/`Ancho` quedan en `None`
explícito (no un número que aparente ser correcto) — pero `Alto`
(espesor) se conserva, porque esa medida es geométricamente
independiente de qué tan irregular sea el contorno.

**Hallazgo importante durante la integración** (no estaba en la
propuesta original): cuando la proyección encuentra un par válido pero
irregular, dejarlo caer al siguiente método de la cascada (OBB del
sólido completo) daba un resultado **todavía peor** — para el mismo
elemento 136277, el OBB del sólido completo dio 38.9×26.4 = 1028 m²,
más del doble de erróneo que el rectángulo de una sola cara. Se
corrigió: cuando se encuentra un par válido-pero-irregular, ahí se
corta la cascada (no se prueban los métodos siguientes) — se prefiere
`Largo=Ancho=None` explícito antes que un número que se ve plausible
pero es peor.

### 1.5. "Alto" no siempre es el eje vertical — dos bugs de fondo, no uno

Encontrado **después** de la primera integración, revisando un
conjunto grande de resultados (no un elemento suelto) — el usuario dio
5 ejemplos reales (`express_id` 42741/42812/42908/83854/84674 en
`Vista3D_ARQUITECTURA.ifc`, todos `IfcWallStandardCase` "WLL_PINTURA_LATEX"
— capas de pintura modeladas como muro aparte, delgadas y verticales)
donde `area`/`volume` salían absurdamente chicos pese a que
`length`/`width` eran razonables (~2-2.8m).

**Causa raíz #1 (en `geometria_proyeccion.py`, ya arreglada en la
primera pasada de este mismo cambio, documentada acá para que quede
completo el porqué)**: la función asumía que "Alto" = espesor del par
de caras SIEMPRE — cierto para una losa (el par top/bottom tiene
normales verticales, el espesor entre ellas SÍ es la altura), pero
falso para un elemento delgado y vertical como estas capas de pintura
(el par frontal/posterior tiene normales HORIZONTALES, así que el
espesor entre ellas es horizontal — la verdadera altura es una de las
dos dimensiones DENTRO de la cara, no el espesor). Fix: de las 3
candidatas (espesor + las 2 dimensiones de la cara), la que esté más
alineada con el eje Z mundial es "Alto" — no se asume una sola de
antemano.

**Causa raíz #2 (bug preexistente, NO introducido por este cambio, en
`extraction.extraer_dimensiones_parametricas` — paso 1 de la cascada,
anterior a `geometria_proyeccion`)**: esta función lee la extrusión
cruda del IFC (`IfcExtrudedAreaSolid` + perfil rectangular) y asigna
`Ancho=profile.XDim, Alto=profile.YDim` a ciegas, sin verificar hacia
dónde apunta cada eje. Para la mayoría de muros esa convención coincide
con la realidad por cómo Revit exporta un muro típico (perfil =
espesor×altura, barrido a lo largo) — pero para estas capas de pintura,
la dirección de extrusión resultó ser la VERTICAL (barrido hacia
arriba), invirtiendo qué campo es cuál. Como este paso corre ANTES que
`geometria_proyeccion` (paso 2.5) y devuelve un resultado "completo",
el fix de la causa #1 nunca llegaba a ejecutarse para estos elementos
— el bug real estaba un paso antes.

Mismo criterio de fix que la causa #1, aplicado acá: `reordenar_dims_por_extent_z()`
(nueva, en `extraction.py`, pública — la reusa también `classify.py`,
ver 1.6 abajo) reordena las 3 dimensiones de `extraer_dimensiones_parametricas`
comparándolas contra la extensión Z real del elemento (bounding box de
la malla ya resuelta en coordenadas mundiales) — la que mejor coincide
con esa extensión pasa a ser "Alto", sin importar qué campo del IFC
crudo la trajo.

Verificado en la salida real (`Vista3D_ARQUITECTURA.ifc`, pipeline completo):

| express_id | area antes | area después | ¿coincide con la propiedad `ÁREA` real de Revit? |
|---|---|---|---|
| 42741 | 0.0023 | **4.9407** | Sí, exacto |
| 42812 | 0.0027 | **7.0474** | Sí (≈ largo×alto = 2.819×2.5) |
| 83854 | 0.0021 | **0.8613** | Sí (≈ largo×alto = 2.148×0.401) |

### 1.6. Descuento de huecos (`_procesar_huecos_descuento`) — el mismo bug, en un segundo lugar, con una vuelta de tuerca conceptual

Encontrado pidiendo revisar `express_id=4117` (que resultó ser un caso
legítimo de geometría degenerada, ver más abajo) — al investigarlo en
conjunto con el resto del dataset aparecieron **16 de 806 elementos**
con `area=0 Y volume=0` simultáneamente, la mayoría con dimensiones
(`length`/`width`/`height`) perfectamente razonables — el `0` no venía
de una dimensión mala, venía de **después**: `_aplicar_descuento_huecos`
restando más área/volumen del que el elemento realmente tiene.

Causa raíz, confirmada con un muro de tarrajeo real (`express_id=6656`,
capa de 1cm, 4 vanos): `extraer_dimensiones_parametricas(opening)`
SIEMPRE devuelve `Largo=profundidad de extrusión del vano` (nunca una
dimensión de su cara — así está escrita esa función, no es casualidad),
y esa profundidad se modela a propósito MÁS GRANDE que el espesor de
cualquier capa individual, para garantizar que el vano atraviese TODAS
las capas de un muro compuesto de una vez (medido: 3.048 m de
profundidad para una puerta de 0.8×2.15 m). El código viejo usaba esa
profundidad tal cual en la fórmula de descuento
(`Largo × Ancho × Alto` del propio vano) — para una capa de 1cm de
tarrajeo, eso da un volumen "a descontar" de **17 m³** de un muro que
en total mide 0.11 m³: sobra de sobra para anular el metrado entero.

Fix, dos partes:
- **Área del vano**: `Ancho × Alto` (el perfil `XDim × YDim`) — el
  producto de esos dos SIEMPRE es el área real de la cara del vano, sin
  importar la orientación (a diferencia de `Largo`, que es
  estructuralmente la profundidad, nunca una dimensión de cara).
- **Volumen a descontar**: `área del vano × espesor del ELEMENTO que
  se está descontando` (`dims["Ancho"]`, ya resuelto por
  `obtener_dimensiones`) — NO el volumen propio del vano. Tiene sentido
  físico: lo que hay que restarle a ESTA capa es cuánto material de
  ESTA capa se pierde por el hueco, no el volumen del hueco completo
  atravesando capas que no son esta.

Verificado en la salida real (`Vista3D_ARQUITECTURA.ifc`, pipeline completo):

| | Antes | Después |
|---|---|---|
| Elementos con `area=0` Y `volume=0` | 16 de 806 | **3 de 806** |
| `express_id=6656` (tarrajeo, 4 vanos) `area` | 0.0 | **5.69** (real: 11.33 bruto − 5.63 de huecos) |
| `express_id=6656` `volume` | 0.0 | **0.057** |

Los 3 casos residuales (`4117`, `4411`, `109865`) se investigaron
aparte — no son bugs de cálculo, son elementos con geometría
genuinamente degenerada en el propio IFC (ver 1.7).

### 1.7. `express_id=4117` — geometría genuinamente degenerada, no un bug de código

Investigado a fondo porque parecía "ilógico" (una capa de ladrillo con
`ALTURA DESCONECTADA=2.3` en sus propiedades, pero `area=0`). Se
verificó la malla YA resuelta por IfcOpenShell (no solo el atributo
crudo): el sólido real de este elemento mide 2.6m × 0.13m × **0.05m**
— la extensión Z real es 5cm, no 2.3m. El parámetro "Altura
Desconectada" de Revit es conocido por no reflejar la altura real de un
muro quer está limitado por niveles/desfases (acá: `RESTRICCIÓN
SUPERIOR: Hasta nivel: NIVEL 02`, con desfases de -0.05/-0.45) — es una
inconsistencia real entre el parámetro exportado y la geometría
exportada **del propio archivo IFC**, no algo que el código de
extracción pueda "corregir" sin inventar un dato que no está en
ninguna geometría real. Con 4 vanos en ese muro (aunque ahora
correctamente descontados, ver 1.6), el área neta de una losa de 5cm
de alto queda en 0 de forma consistente con su geometría real.

### 1.8. `calcular_metrados()` seguía usando Largo×Ancho en vez del área real triangulada

Encontrado revisando dos `IfcRoof` puntuales de `desenlazado.ifc`
(`express_id` 98907 y 99101, coberturas de policarbonato) — dos
problemas relacionados, no uno:

- **El "Ancho" de una cara no-rectangular no corresponde a ninguna
  arista real, y eso es esperado, no un bug de captura.** Se verificó
  con los 4 vértices reales de la cara principal de 98907: es un
  **trapecio** (lados de 11.01/3.26/13.01/3.83 m, ninguno mide el
  3.5263 reportado). El OBB (rectángulo que mejor envuelve la figura,
  vía PCA) siempre da un rectángulo aproximado — coincide con los
  lados reales solo cuando la figura ya es un rectángulo. Para un
  trapecio no hay forma de que "Ancho" sea una arista real.
- **Pero esa aproximación SÍ infla el área calculada — confirmado con
  el mismo elemento**: `Largo×Ancho` (lo que usaba el metrado) da
  46.14 m² para esa cara; el área REAL triangulada de esa misma cara
  (ya calculada por `agrupar_caras`, exacta, no aproximada) es 39.20
  m² — **18% de sobreestimación** por aproximar un trapecio como
  rectángulo.
- **Para el segundo techo (99101, 9 sub-figuras)**, el problema es
  peor: `calcular_metrados()` solo usaba `Largo×Ancho` de la
  sub-figura MÁS GRANDE (85.05 m²), ignorando las otras 8 por
  completo. La suma real de las 9 (`area_total_m2`, ya calculada por
  `geometria_proyeccion`, sin usar hasta ahora) da 179.59 m².

**Fix**: `obtener_dimensiones()` ahora adjunta `_area_geom`/`_vol_geom`
(el área/volumen real triangulado, suma de todas las sub-figuras
encontradas) a los `dims` que devuelve, siempre que `geometria_proyeccion`
haya encontrado al menos un par válido — regular o no. `calcular_metrados()`
usa esos valores en vez de su fórmula por clase cuando están presentes.
Esto también resuelve, como efecto colateral correcto, el caso de la
losa irregular (1.7 más abajo en ese momento, `express_id=136277`): antes
quedaba en `area=0` por no tener Largo/Ancho; ahora reporta su área real
(190.66 m² — antes solo tenía el espesor).

Verificado en la salida real (`desenlazado.ifc`/`Vista3D_ARQUITECTURA.ifc`,
pipeline completo):

| Elemento | area antes | area después |
|---|---|---|
| Techo 98907 (2 aguas + remate) | 46.14 | **85.42** |
| Techo 99101 (9 sub-figuras) | 85.05 | **179.59** |
| Losa irregular 136277 | 0.0 | **190.66** |

0 valores negativos, sin regresión en ninguno de los casos ya
verificados (ventana 106408, muro 4117, tarrajeo con huecos 6656,
capas de pintura) — se corrió de nuevo el pipeline completo de los dos
IFC de prueba.

### 1.9. El emparejamiento pierde área cuando una cara real queda fragmentada — resuelto

La duda pendiente de 1.8 (99101 en 179.59, no confirmado) se resolvió:
el usuario remidió a mano lado por lado y confirmó que el área real es
**~236.17 m²**, no 179.59. Causa encontrada: entre los grupos de caras
que `encontrar_pares_opuestos` dejó SIN emparejar había una cara de
56.4547 m² sin contraparte — pero SÍ había dos grupos más chicos
(41.4596 + 15.0517 = 56.5113, prácticamente la misma área) que juntos
eran su verdadera contraparte, partida en dos por alguna costura/
discontinuidad de la malla. El emparejamiento busca "un grupo contra
otro grupo", nunca "un grupo contra la suma de varios" — por diseño no
podía encontrar esto.

Corrección de rumbo importante señalada por el usuario: para el ÁREA
TOTAL no hace falta la maquinaria de proyección/emparejamiento en
absoluto — es una medida geométrica directa, no depende de "proyectar"
nada. La proyección sigue sirviendo para otra cosa (Largo/Ancho de
referencia, el espesor, decidir si el contorno es regular), pero no
para el total. Fix: sumar TODA la malla triangulada cruda (ambas caras,
arriba y abajo) y dividir entre 2 — asumiendo que es una lámina delgada
donde cara de arriba ≈ cara de abajo, algo que no depende de que el
emparejamiento haya encontrado todos los fragmentos. Esto se usa
**solo como respaldo**, cuando la diferencia contra la suma de pares es
grande (>10%, señal real de que el emparejamiento perdió algo) — para
un elemento grueso (no lámina delgada), o cuando el emparejamiento sí
fue completo, la suma por pares sigue siendo más precisa (excluye el
aporte de las caras laterales/de borde, que la malla cruda completa sí
incluye un poco) — confirmado con el propio techo 98907, donde la suma
por pares (85.42) midió más cerca de la medición manual (85.44) que la
malla cruda ÷ 2 (85.95).

Verificado en la salida real:

| Elemento | area (1.8, aún mal) | area (1.9, corregido) | medición manual del usuario |
|---|---|---|---|
| Techo 98907 | 85.42 | 85.42 (sin cambio — el emparejamiento ya estaba completo) | 85.44 |
| Techo 99101 | 179.59 | **237.23** | 236.17 |

0 valores negativos, sin regresión en ningún caso ya verificado
(ventana 106408, muro 4117, tarrajeo con huecos 6656, capas de
pintura, losa irregular 136277) — se volvió a correr el pipeline
completo de los dos IFC de prueba.

**Bonus, encontrado por el usuario al comparar contra el output viejo
de `proceso-metrados-base`**: Revit ya trae, para estos techos, una
propiedad `TOTALAREA` (236.14 para 99101 — coincide casi exacto con
1.9) y otra `PROJECTEDAREA` (219.59 — el área en planta, NO la real).
Las dos contienen "AREA" como substring, así que sin protección
cualquiera podía ganar el fallback de texto según orden de iteración.
Se agregó `"PROJECTED"` a `DESCALIFICADORES_DIMENSION` — hoy esto no
cambia ningún resultado final (la prioridad geométrica ya llena `area`
antes de llegar al texto), pero blinda el fallback para el día que la
geometría falle en un elemento así.

Verificado en la salida real (`desenlazado.ifc`, pipeline completo):

```json
// express_id 136277, antes de esta corrección: length=38.9, area=1028.29 (5x el área real)
// después:
{
  "express_id": 136277,
  "length": null,
  "width": null,
  "height": 0.0010000000002037268,
  "area": 0.0,
  "volume": 0.0
}
```

`area`/`volume` en 0 (no un número inventado) porque `calcular_metrados()`
sigue usando `Largo × Ancho`/`Alto` — con `Largo=None` eso da 0.
`geometria_proyeccion` ya calcula el área real (196.6 m², vía suma
triangulada, en `area_total_m2`) pero **todavía no está cableada** a
`calcular_metrados()` — eso es exactamente el paso 3 pendiente (metrado
definitivo por geometría), a propósito no resuelto acá.

### 3. `length` ≠ `run_length` en ventanas / metrados negativos

Bug real en `extraction.extraer_metrados_revit_completo`: hacía match
por **substring** de palabras clave (`CLAVES_LONGITUD` etc.) contra
CUALQUIER nombre de propiedad, sin distinguir una dimensión real de una
propiedad de posición/desfase que casualmente contiene la misma
palabra. Confirmado con el propio `output/Vista3D_ARQUITECTURA.json`
del repo:

- Ventana `express_id=106408`: `run_length` tomaba el valor de
  `"ALTURA DE EXTREMO INICIAL"` (2.4, altura de umbral/posición), no su
  longitud real. `length` (2.0, de `OverallWidth`) y `run_length`
  quedaban distintos cuando deberían ser el mismo dato.
- 67 de 806 filas con `run_length` **negativo** (ej. de `"DESFASE DE
  ALTURA DESDE NIVEL"`, un valor de posición con signo).

**Fix**: lista de descalificadores semánticos (`DESFASE`, `OFFSET`,
`REFERENCIA`, `INICIAL`, `FINAL`, `EXTREMO`, `ANTEPECHO`, ...) — si el
nombre de una propiedad contiene cualquiera de estas palabras, nunca se
usa como dimensión, sea cual sea `CLAVES_*`. Más validación universal
de no-negatividad (una medida escalar nunca puede ser negativa).
"Palabra completa en vez de substring" **no alcanza** — `"ALTURA"` ya
es una palabra suelta y completa dentro de `"DESFASE DE ALTURA DESDE
NIVEL"`.

Verificado en el pipeline real, los dos IFC de prueba del repo:

| Archivo | Elementos | Valores negativos |
|---|---|---|
| `Vista3D_ARQUITECTURA.ifc` | 806 | **0** |
| `desenlazado.ifc` | 3753 | **0** |

Verificado también que la ventana citada como ejemplo quedó bien:
`length == run_length == 1.9999999999999991` (antes: `2.0` vs `2.4`,
distintos).

⚠️ **Bug encontrado en el archivo que se pasó originalmente, corregido
acá**: la propuesta pegada en el chat tenía `CLAVES_AREA = ["AREA",
"ÃREA", ...]` — el carácter con tilde estaba corrupto (`Ã` en vez de
`Á`, un byte de diferencia, típico de un problema de encoding al
copiar/pegar). Con ese error, la extracción de área por texto **nunca
matcheaba una propiedad `"ÁREA"` real** — probado contra el archivo
real: de 1495 elementos con una propiedad `ÁREA` válida, solo 34
la capturaban con el bug, 1461 con el encoding corregido. La versión
que quedó integrada en el repo usa el carácter correcto desde el
inicio (nunca se copió el archivo con el bug).

### 4. Prioridad Revit vs. geometría — reordenada

Antes: `lon`/`area`/`vol` usaban **cualquier** valor de Revit (tipado
`IfcElementQuantity` O de texto adivinado) antes que la geometría, sin
distinguir la fuente. Esto significa que, aunque se arregle
`geometria_proyeccion`, su resultado quedaba enmascarado por completo
en cualquier elemento donde el fallback de texto encontrara *algo* —
incluso un valor mal etiquetado (como el bug de la ventana de arriba).
Confirmado ejecutando el código: para esa ventana específica, ni el fix
de negativos ni el orden viejo alcanzaban para que la geometría se
llegara a usar.

**Fix**: `extraer_metrados_revit_completo` ahora devuelve dos dicts
separados (`metrados_tipados`, de `IfcElementQuantity` — sin ambigüedad
de nombre; `metrados_texto`, adivinado por palabra clave). Nueva
prioridad en `metrados.calcular_metrados_final`, de más a menos
confiable:

1. `metrados_tipados` (IfcElementQuantity)
2. Geometría real (`obtener_dimensiones`, incluye la proyección de caras)
3. `metrados_texto` (Revit adivinado por nombre — último recurso)

### 1.10. Una partida quedaba con unidad pero sin elementos propios cuando toda su clasificación se iba a un sub-nivel

No es un bug de dimensiones — es del árbol de partidas
(`normalize.py`) — pero se encontró en la misma ronda de revisión así
que queda documentado acá. Ejemplo real: la norma define `OE.3.4.3`
("PISOS DE CONCRETO") como partida (`tipo=partida`, `unidad=m2`), pero
NINGÚN elemento de `desenlazado.ifc` está clasificado ahí exactamente —
todos están más profundo (`OE.3.4.3.2`, `OE.3.4.3.3`, códigos que la
norma no define, resueltos como sub-nivel). `_registrar_ancestros_norma`
le ponía `unit='m2'` a `OE.3.4.3` solo por ser `tipo=partida` en la
norma, sin chequear si terminaba teniendo algún elemento propio — daba
una partida "fantasma" con unidad pero 0 elementos, mientras toda su
masa real vivía en sus hijos.

Fix: pasada final en `normalizar()` — cualquier partida que quedó con
`unit` pero sin ningún elemento en `metrado_elements` con ese código
exacto se degrada a carpeta (`unit=None`). No se pierde información:
la unidad ya había quedado heredada en el hijo (`classify.py` ya hereda
`unidad_norma` del ancestro cuando no hay match exacto, desde antes de
este cambio).

Verificado en la salida real (`desenlazado.ifc`, pipeline completo):

```json
// OE.3.4.3, antes: {"unit": "m2"} con 0 elementos propios
// OE.3.4.3, después:
{"code": "OE.3.4.3", "parent_code": "OE.3.4", "unit": null, ...}
// sus hijos (OE.3.4.3.2, OE.3.4.3.3) siguen con unit="m2" y sus elementos, sin cambios
```

17 partidas se degradaron en `desenlazado.ifc`, 9 en
`Vista3D_ARQUITECTURA.ifc` — 0 valores negativos, sin regresión en
ningún caso ya verificado (se corrió de nuevo el pipeline completo de
los dos IFC).

⚠️ Caso NO verificado empíricamente (no apareció en ninguno de los dos
IFC de prueba): una partida con elementos clasificados EXACTAMENTE en
su propio código, Y ADEMÁS con otros elementos en un sub-nivel más
profundo. Con el fix actual, esa partida NO se degrada (tiene al menos
un elemento propio) y sus hijos de sub-nivel quedan como nodos
separados — no se colapsan hacia el padre. El usuario mencionó una
alternativa distinta para ese caso (fusionar los hijos en el padre,
tomando la unidad prevaleciente) — no se implementó porque no hay
datos reales para validarlo, queda anotado en "Ideas anotadas" más
abajo si hace falta retomarlo.

## Paso 2 — radio/diámetro para elementos cilíndricos (en progreso)

### 2.1. Tubos (`IfcFlowSegment` con perfil circular)

Confirmado con datos reales (`Vista3D_SANITARIAS.ifc`, IFC2X3 — ojo,
en IFC2X3 no existe `IfcPipeSegment`/`IfcPipeFitting`, esos tipos
recién aparecen en IFC4; acá las tuberías son `IfcFlowSegment`
genéricos, 294 en total): los 294 usan consistentemente
`IfcExtrudedAreaSolid` con perfil `IfcCircleProfileDef` — el radio
viene **exacto y tipado** en el IFC (`profile.Radius`), no hay que
reconstruirlo de una malla como el resto de los métodos de la cascada.

Nuevo: `extraction.extraer_dimensiones_circulares()` — nueva prioridad
más alta que todo lo demás (paso "0.4", antes que paramétrico/Qto/
proyección/OBB), matchea `IfcCircleProfileDef` (también cubre
`IfcCircleHollowProfileDef`, subtipo con pared — `Radius` ahí es el
radio EXTERIOR en los dos casos). Devuelve
`{"Largo": profundidad de extrusión, "Diametro": 2×radio}` —
`Ancho`/`Alto` quedan `None` a propósito: una sección circular no
tiene un ancho/alto distinto del diámetro, reportar el mismo número
dos veces con nombres que no le corresponden sería confuso, no más
completo (mismo criterio que ya se sigue con figuras irregulares).

Nuevo campo en el contrato de `metrado_elements`: `"diameter"` (`null`
para todo lo que no sea circular).

Verificado en la salida real (`Vista3D_SANITARIAS.ifc`, pipeline
completo): 185 de 349 elementos con `diameter` (21mm y 26.5mm, valores
nominales de PVC plausibles), `width`/`height` correctamente `null`
para esos mismos elementos. 0 valores negativos. Sin regresión en los
otros dos IFC de prueba (ninguno tiene perfiles circulares, así que
este paso nuevo simplemente no se activa para ellos — se volvió a
correr el pipeline completo de los tres archivos).

### 2.1.1. `area`/`volume` quedaban en 0 para los tubos — corregido, y NO con una fórmula

Primer intento: usar `π×radio²×largo` (volumen del cilindro ideal). El
usuario lo rechazó, y con razón — es exactamente el mismo error que ya
se venía evitando para todo lo demás en este documento (una fórmula
por dimensiones, no una medición real de la figura). `π×r²×h` mide un
cilindro matemático perfecto, no el sólido que ifcopenshell realmente
triangula (un polígono de N lados aproximando el círculo).

Fix real: `geometria_proyeccion.calcular_metrado_circular()` — nuevo,
triangula el tubo (igual que cualquier otra figura del módulo) y mide:
- `volumen_m3` -> `calcular_volumen_malla()` (nueva, general — teorema
  de la divergencia sobre la malla cerrada, funciona para CUALQUIER
  sólido, no solo cilindros). Verificado contra un tramo real: da
  **0.97% menos** que `π×r²×largo` — exactamente la diferencia
  esperada entre el polígono real (100 triángulos) y el círculo ideal.
- `area_m2` -> suma de TODA la superficie triangulada (todas las
  caras). Incluye las dos tapas circulares de los extremos, no solo la
  superficie lateral — simplificación a propósito, ver más abajo.

Estos dos valores se cablean como `_area_geom`/`_vol_geom` — el mismo
mecanismo que ya existía para losas/techos (ver 1.8), reusado tal cual,
no una ruta nueva.

Verificado en la salida real (`Vista3D_SANITARIAS.ifc`, pipeline
completo): los 185 elementos con `diameter` ahora tienen `volume` real
(no `0`) — ej. `express_id=59006`: `volume=1.7229e-05 m³` (antes `0`).
0 valores negativos, sin regresión en los otros dos IFC de prueba.

⚠️ **Punto abierto, no resuelto**: `area` es la superficie triangulada
COMPLETA (lateral + las 2 tapas de los extremos), no solo la lateral.
Para partidas de pintura/aislamiento probablemente se quiera solo la
lateral (las tapas de un tramo interno de tubería no son superficie
expuesta, son puntos de unión con el siguiente tramo/accesorio) — no
se separó todavía porque hace falta confirmar con el usuario si de
verdad hace falta ese detalle antes de sumarle la complejidad de
identificar cuáles caras de la malla son las tapas.

### 2.2. Accesorios de tubería (codos, uniones) — fuera de alcance de 2.1

`IfcFlowFitting` (209 en `Vista3D_SANITARIAS.ifc`, ej. "PPF_CODO_PVC10")
usa `IfcMappedItem` (geometría instanciada/compartida), no un perfil
circular simple — no le aplica el mismo mecanismo. No se tocó: estos
accesorios normalmente se miden por unidad (`und`), donde `quantity=1`
ya alcanza, no necesitan diámetro para su metrado.

### Pendiente dentro del paso 2

- **Varillas de acero (`IfcReinforcingBar`)**: ya tienen su propio
  camino (paso "0. Fierro", `NominalDiameter` typed, prioridad más
  alta que todo) — el usuario confirmó que este caso "ya existe" y no
  hace falta tocarlo. `weight` para acero sigue viniendo de ahí
  (`peso_nominal_kg_por_metro`), sin relación con este cambio.
- **"El diámetro siempre toma el mayor"** (pedido explícito del
  usuario) — todavía no aplica en ningún caso real encontrado, porque
  el único caso confirmado hasta ahora (tubos con `IfcCircleProfileDef`)
  tiene un radio único y exacto, sin ambigüedad entre varios candidatos
  que haya que resolver eligiendo el mayor. Si aparece un elemento
  circular SIN perfil tipado (ej. reconstruido de una malla o de un
  `IfcArbitraryClosedProfileDef` poligonal aproximando un círculo, con
  dos ejes que no miden exactamente igual), ahí sí habría que aplicar
  esa regla — queda pendiente para cuando aparezca un caso real así.

## Qué NO se tocó en este cambio (queda para el paso 3)

- **`area` de tubos separada en lateral vs. total** — ver 2.1.1, punto
  abierto, no resuelto.
- **Metrado definitivo por geometría con descuento de huecos** (para
  una pared: largo×alto − huecos = área, y eso debería coincidir con
  el metrado de Revit) — paso 3, "la parte más complicada" según el
  propio usuario, no empezado. `area_total_m2`/`volumen_total_m3` que ya
  calcula `geometria_proyeccion` (la suma real triangulada, más exacta
  que Largo×Ancho para elementos con varias vertientes o fragmentos)
  quedan calculados pero **sin usar todavía** en `calcular_metrados()` —
  es lo primero que hay que cablear cuando se aborde el paso 3.
- El peso (`weight`) no se tocó — ya estaba bien acotado (solo
  `IfcReinforcingBar`).
- `proceso-metrados-base/` no se tocó ni se borró — sigue como
  referencia histórica, no lo usa nada del pipeline activo.

## Verificación (todo ejecutado contra los IFC reales del repo, no solo leído)

- `Vista3D_ARQUITECTURA.ifc` (806 elementos) y `desenlazado.ifc` (3753
  elementos): pipeline completo corrido de punta a punta, **0 valores
  negativos** en los dos.
- `express_id 136277` (`desenlazado.ifc`, la losa irregular que dio el
  usuario como caso de prueba): confirmado que ya NO reporta un
  largo/ancho inventado (antes 1028 m² de área, ahora `None`/`0`
  explícito, con el espesor real de 1mm conservado).
- `express_id 106408` (`Vista3D_ARQUITECTURA.ifc`, la ventana del
  ejemplo original): `length == run_length` ahora, ambos con el valor
  correcto (2.0 m, `OverallWidth` real).
- Muros con puertas/ventanas (6 muestras, `desenlazado.ifc`): siguen
  devolviendo Largo/Ancho normalmente (`regular=True`) pese a tener
  huecos — confirma que el criterio de irregularidad no penaliza
  huecos legítimos, solo contornos exteriores no convexos.
- Sin excepciones/crashes en 36 elementos de prueba de 8 tipos IFC
  distintos (muros, losas, techos, ventanas, puertas, escaleras,
  columnas, vigas) durante el desarrollo del algoritmo.

### 1.11. Largo/Ancho de losas/techos con varias vertientes venía de UNA sola cara inclinada, no del contorno real en planta

Para el techo 98907 (2 aguas), `Largo/Ancho` salían de la cara de
referencia (una sola vertiente, un trapecio inclinado: 13.086×3.526) —
técnicamente correcto para ESA cara puntual, pero no lo que se espera
ver en una tabla de metrados: el usuario esperaba 13.012×6.104 (el
rectángulo del techo visto desde arriba, combinando las dos aguas —
coincide con `PROJECTEDAREA` de Revit, 79.43 m² ≈ 13.012×6.104).

Fix: cuando el par principal es tipo losa/techo (`Alto` salió del
espesor, no de la cara — ver 1.8), `Largo/Ancho` se recalculan
proyectando TODO el elemento (todos sus vértices, todas las vertientes
juntas) sobre el plano horizontal, no solo la cara de referencia.

Esto exige un segundo criterio de regularidad, no solo el de 1.7
(`_es_figura_regular`, área real vs. hull de UNA cara — detecta
material "en zigzag"/con concavidades). El nuevo (`FILL_RATIO_MIN_PLANTA`)
compara el hull convexo EN PLANTA de todo el elemento contra su propio
rectángulo envolvente — detecta si el CONTORNO exterior es o no un
rectángulo. Son complementarios: la losa irregular 136277 pasa el
segundo criterio (0.96, contorno exterior casi rectangular) pero falla
el primero (0.39, el material real no lo llena — confirmado que por
esto NO alcanza con uno solo, hacen falta los dos para pisos/techos).

Calibrado con 2 casos reales: techo 98907 (2 aguas, contorno limpio) =
0.9998 en el criterio nuevo; techo 99101 (vertientes de tamaño muy
distinto, el usuario mismo dijo "no podemos definir un lado") = 0.8052.
Umbral elegido: 0.9.

Verificado, pipeline completo, los tres casos ya conocidos:

| Elemento | Largo/Ancho antes | Largo/Ancho después |
|---|---|---|
| Techo 98907 | 13.086 × 3.526 (una sola cara) | **13.013 × 6.105** (planta, coincide con el usuario) |
| Techo 99101 | 20.708 × 4.107 (una sola cara, engañoso) | **None / None** (confirmado sin lado definible) |
| Losa irregular 136277 | None / None | None / None (sin cambio) |

0 valores negativos, sin ninguna regresión en elementos tipo muro
(ventana 106408, muro 4117, tarrajeo 6656, capas de pintura) — esta
lógica solo se activa para pares tipo losa/techo, nunca para muros.

### 1.12. El volumen se medía de TRES formas distintas según el elemento — unificado a una sola integral de malla

Encontrado al revisar cómo se calculaba `volume` en general (no un
elemento puntual): coexistían tres caminos distintos para el mismo
metrado, sin ninguna razón real para que fueran diferentes —

1. **La mayoría de los elementos "normales"** (resueltos por
   paramétrico/Qto/OBB — la mayor parte de los muros, por ejemplo)
   usaban `Largo×Ancho×Alto` — el volumen de una caja rectangular
   ideal, no el del sólido real. Confirmado con datos reales que esto
   IGNORA por completo cualquier boolean-cut del sólido (puertas/
   ventanas empotradas modeladas como `IfcOpeningElement`): el muro
   2045 de `desenlazado.ifc` (2 ventanas) da 2.04 m³ por esta fórmula
   contra 1.30 m³ de su malla real ya resuelta por IfcOpenShell — un
   57% de más.
2. **Elementos que llegaban a `geometria_proyeccion`** (pisos/techos,
   muros con emparejamiento de caras) usaban `área real × espesor` —
   mejor que (1) porque el área sí es real, pero sigue siendo una
   aproximación de prisma (asume espesor uniforme en toda la
   superficie).
3. **Solo los tubos** (perfil circular, ver 2.1.1) usaban la integral
   directa de la malla (`calcular_volumen_malla`, teorema de la
   divergencia) — exacta para cualquier sólido cerrado, sin importar
   su forma, y más barata de calcular que (1) o (2) (no necesita saber
   Largo/Ancho/Alto ni encontrar qué cara es "la" cara).

No hay ninguna razón para que un muro se mida distinto de un tubo: el
volumen de un sólido cerrado es una propiedad universal, se integra
igual sea cual sea la forma. **Fix**: `obtener_dimensiones()` ahora
adjunta `_vol_geom` SIEMPRE que haya una malla disponible (vía
`calcular_volumen_malla` sobre el shape ya obtenido, calculado una
sola vez, reusado tanto para resolver Largo/Ancho/Alto como para el
volumen) — sin importar qué paso de la cascada de prioridad terminó
resolviendo las dimensiones. `geometria_proyeccion.calcular_dimensiones_por_proyeccion`
ya NO calcula ningún volumen (se le sacó `volumen_total_m3`/
`espesor_promedio`, código muerto ahora) — sigue calculando área
(`area_total_m2`, esa sí depende de identificar una cara real) pero el
volumen final siempre sale de la integral universal.

**Efecto colateral que este cambio expuso — descuento de huecos
duplicado.** `classify._aplicar_descuento_huecos` restaba el área/
volumen de los vanos (puertas/ventanas) de CUALQUIER metrado
geométrico, sin importar su origen — necesario cuando el volumen salía
de `Largo×Ancho×Alto` (esa fórmula no sabe nada de vanos), pero
**incorrecto** ahora que el volumen sale de la malla real: IfcOpenShell
ya resuelve los `IfcRelVoidsElement` al triangular el sólido por
default (confirmado explícitamente: mismo muro 2045, malla con vanos
resueltos = 1.30 m³ contra 2.04 m³ con
`settings.DISABLE_OPENING_SUBTRACTIONS=True`, el sólido completo sin
vanos) — restar el vano de nuevo sobre un valor que ya viene sin él es
descontarlo dos veces. Confirmado con datos reales, tarrajeo 6656 (4
vanos): volumen de malla ya neto = 0.05694 m³; con el descuento
aplicado igual (el bug) bajaba a 0.00059 m³ — un 99% de más
descontado, prácticamente anulado.

Fix: `calcular_metrados()`/`calcular_metrados_final()` ahora marcan
cada campo con `_area_neta_huecos`/`_vol_neta_huecos` (True cuando el
valor salió de `_area_geom`/`_vol_geom`, la malla real). El descuento
de huecos solo resta de un campo cuando esa bandera es False (la
fórmula por clase, que sí necesita el descuento porque no conoce los
vanos). El área sigue descontándose como antes en la inmensa mayoría
de los casos (casi ningún elemento trae `_area_geom` — solo tubos y
los que llegan a `geometria_proyeccion`), no se tocó ese
comportamiento salvo para esos dos casos puntuales.

Verificado, pipeline completo, los tres IFC de prueba (4908 elementos
en total, 0 valores negativos):

| Elemento | vol antes (fórmula/aprox.) | vol después (malla, sin doble descuento) |
|---|---|---|
| Muro 2045 (2 ventanas) | 0.7404 (con doble descuento) | **1.2994** |
| Muro 2081 (4 ventanas) | 1.4889 | **1.8334** |
| Muro 2104 (1 ventana) | 1.2298 | **1.8048** |
| Tarrajeo 6656 (4 vanos) | 0.00059 (casi anulado) | **0.05694** |
| Muro 4117 (sliver degenerado, ver 1.7) | 0.0 | **0.0169** (área se mantiene en 0, sigue siendo correcta — ver 1.7) |
| Techo 98907 / Losa 136277 / tubos | sin cambio (ya usaban malla o integral directa) | sin cambio |

`area` de estos mismos elementos no cambió en ningún caso (sigue
saliendo de la fórmula por clase + descuento de huecos, exactamente
como antes) — solo `volume` cambió, y solo para elementos que SÍ
tenían vanos asociados o que antes usaban la fórmula de caja/prisma.

## Ideas anotadas, NO implementadas todavía

**Colapsar sub-niveles hacia el padre cuando el padre YA tiene
elementos propios.** Ver 1.10 — caso simétrico al que sí se arregló:
si una partida definida en la norma tiene elementos clasificados
exactamente en su propio código Y ADEMÁS otros elementos en un
sub-nivel más profundo, la idea del usuario es fusionar esos hijos de
vuelta en el padre (en vez de dejarlos como nodos separados), tomando
la unidad prevaleciente entre lo que hubieran sido los hijos
(`obtener_unidad_por_mayoria`, ya existe y se usa para otro caso). No
implementado — no apareció ningún caso real en los dos IFC de prueba
para validarlo con datos, como se hizo con todo lo demás.

**Usar `Longitud`/`Anchura` de Revit (Pset "Cotas") para desambiguar
cuál candidato geométrico es el largo real.** Propuesta del usuario: en
vez de que geometría y el texto de Revit compitan (uno gana, el otro se
descarta, como funciona hoy la prioridad), usarlos juntos — la
geometría da 2-3 dimensiones candidatas reales del objeto (de la cara
emparejada, o del OBB), y si UNA de esas coincide de cerca con el
`Longitud` que Revit ya trae para ese elemento puntual, esa es la que
se toma como "Largo" (en vez de elegir por "la más grande" o "la más
vertical", que es como funciona hoy y que se sabe que falla para
objetos que se miden por una convención de fabricación, no por su
forma — ej. un enchape/zócalo de ancho fijo). Mismo mecanismo que ya
existe en `reordenar_dims_por_extent_z` (comparar candidatos contra un
valor de referencia confiable), aplicado con `Longitud`/`Anchura` de
Revit como referencia en vez de la extensión Z de la malla. Pendiente
de: margen de tolerancia a calibrar, y qué hacer cuando hay ambigüedad
(dos candidatos igual de cerca — ej. un elemento casi cuadrado) o
cuando el elemento no trae esas propiedades.

## Limitación conocida, dicha explícitamente (no oculta)

Ningún IFC de prueba del repo tiene elementos `IfcStair`/
`IfcStairFlight` — el caso de figura irregular que el usuario mencionó
primero (escaleras) no se pudo validar empíricamente, solo por
construcción del algoritmo (muchas caras chicas de peldaños, ninguna
domina — debería caer a `None` igual que la losa irregular, pero no hay
forma de confirmarlo sin un IFC real que tenga escaleras).
