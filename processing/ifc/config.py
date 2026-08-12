# config.py
#
# Constantes del pipeline de procesamiento IFC. Puerto de
# proceso-metrados-base/config.py, sin las rutas de archivos de salida
# (acá el pipeline devuelve un dict en memoria, no escribe a disco por
# su cuenta — eso lo decide quien lo llama: cli.py o el runner de Node).

DENSIDAD_ACERO_KG_M3 = 7850.0

ESPECIALIDADES_ACTIVAS = {2, 3, 4}
CLAVE_SIN_ESPECIALIDAD = "08 SIN ESPECIALIDAD"
CLAVE_FUERA_DE_NORMA = "_FUERA_DE_NORMA"
CLAVE_INCOMPLETOS = "_INCOMPLETOS"

CLASES_HORIZONTALES = {"IfcSlab", "IfcRoof", "IfcRamp", "IfcRampFlight"}
PALABRAS_HORIZONTALES = ["CIELORRASO", "PISO", "CONTRAPISO", "SOLADO", "PAVIMENTO", "VEREDA", "FALSOPISO"]
