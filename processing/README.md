# processing/

Módulo de procesamiento de IFC (metrados). Es Python, no Node — no lo
levanta `npm install` ni corre solo con clonar el repo. Necesita un
setup de una sola vez por máquina, el equivalente a `npm install` pero
para Python: crear un entorno virtual (venv) e instalar las
dependencias ahí adentro.

## Setup (una sola vez por máquina)

Desde la raíz del repo:

```bash
python3 -m venv processing/.venv
processing/.venv/bin/pip install -r processing/requirements.txt
```

Eso crea `processing/.venv/` (ignorado por git, igual que `node_modules/`)
con `ifcopenshell` instalado adentro. No hace falta activar el venv ni
correr nada más — el backend Node lo encuentra solo.

No hay una versión de Python "obligatoria" particular: alcanza con el
`python3` que ya tengan instalado (se probó con 3.14, pero cualquier
3.x razonablemente reciente debería andar — `ifcopenshell` se instala
como wheel precompilado, no necesita compilar nada a mano ni instalar
librerías del sistema aparte).

## Cómo lo usa el backend

`backend/src/services/ifc-processing-runner.ts` invoca:

```
processing/.venv/bin/python -m processing.ifc.cli <archivo.ifc> --norma <norma.json> --out <resultado.json>
```

como subprocess, cada vez que llega un `POST /api/projects/:id/ifc-metrados/process`.
Si el venv no existe en esa ruta exacta, el procesamiento falla (el
`ifc_file_id` queda en `status: "error"` con el mensaje del sistema
operativo — "no such file or directory" o similar).

Si alguien quiere el venv en otro lado, se puede apuntar con una
variable de entorno en `backend/.env`:

```
PROCESSING_PYTHON=/ruta/a/otro/python
```

## Uso standalone (sin el backend, para probar el pipeline solo)

```bash
processing/.venv/bin/python -m processing.ifc.cli \
  processing/proceso-metrados-base/archives/desenlazado.ifc \
  --norma processing/proceso-metrados-base/norma_completa.json \
  --out /tmp/resultado.json
```

Corriendo esto desde la raíz del repo. Sin `--out` imprime el JSON a
stdout en vez de escribirlo a un archivo.

## Estructura

- `ifc/` — el módulo real (lo usan tanto el CLI como el backend). Ver
  los comentarios de cabecera de cada archivo (`pipeline.py`,
  `classify.py`, `metrados.py`, `normalize.py`, `extraction.py`) para
  el rol de cada uno.
- `ifc/dev_tools/` — herramientas solo para inspeccionar resultados a
  mano durante desarrollo (exporta a Excel). No lo llama el backend.
- `api/`, `main.py`, `service/` — stub de un servicio FastAPI aparte,
  todavía no en uso (el backend habla con `ifc/` por subprocess, no por
  HTTP). Sin `requirements.txt` propio todavía.
- `proceso-metrados-base/` — código de referencia/prototipo del que
  salió `ifc/`, con sus propios `.ifc` de prueba. No lo usa nada en
  producción, está para consulta mientras se termina de migrar todo a
  `ifc/`.
