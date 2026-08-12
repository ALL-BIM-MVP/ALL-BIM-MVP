from fastapi import APIRouter

from services.ifc_service import process_ifc


router = APIRouter(
    prefix="/internal/ifc",
    tags=["IFC"],
)


@router.post("/process")
def process_ifc_file(payload: dict):
    return process_ifc(payload)