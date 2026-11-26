from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.core.database import get_db
from app.core.errors import KiriDataUnavailableError

logger = logging.getLogger("kiri.docking")

router = APIRouter()

# --- Schemas ---
class DockingRequest(BaseModel):
    project_id: str
    receptor_gene: str
    ligand_gene: str
    algorithm: str = "cluspro"  # Default: cluspro
    
class DockingResponse(BaseModel):
    job_id: str
    status: str
    message: str

# --- Endpoints ---

@router.post("/run")
async def run_docking(
    payload: DockingRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a new protein-protein docking job.
    """
    # Kiri has no docking engine. An earlier version posted to an HDOCK URL that
    # does not exist and then returned a simulated "completed" result with a link
    # to a file that was never made. Nothing is computed here until a real engine
    # is integrated.
    raise KiriDataUnavailableError(
        "docking",
        f"Protein docking for {payload.receptor_gene} and {payload.ligand_gene} is not available: "
        "Kiri has no docking engine yet. No result was generated.",
    )
