from fastapi import FastAPI

from api.routes.ifc import router as ifc_router


app = FastAPI(
    title="BIM Processing API",
    version="1.0.0",
)

app.include_router(ifc_router)

@app.get("/internal/health")
def health_check():
    return {
        "status": "ok",
        "service": "bim-processing",
    }