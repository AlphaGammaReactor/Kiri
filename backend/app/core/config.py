"""
Kiri — Application Configuration

Reads environment variables with sensible defaults for local development.
"""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
    ]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://kiri:kiri@localhost:5432/kiri"

    # Redis (optional — graceful fallback if not configured)
    REDIS_URL: str = "redis://localhost:6379/0"

    # External APIs
    GDC_API_BASE: str = "https://api.gdc.cancer.gov"
    STRING_DB_API_BASE: str = "https://string-db.org/api"
    PUBMED_API_BASE: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    MYGENE_API_BASE: str = "https://mygene.info/v3"
    ALPHAFOLD_API_BASE: str = "https://alphafold.ebi.ac.uk/api"
    BIOGRID_API_BASE: str = "https://webservice.thebiogrid.org"
    BIOGRID_API_KEY: str = ""  # Optional — BioGRID data skipped if empty
    GEMINI_API_KEY: str = ""   # Required for Phase 5 AI Discovery

    # Drug Discovery (Phase 7)
    MYCHEM_API_BASE: str = "https://mychem.info/v1"
    CTD_API_BASE: str = "http://ctdbase.org/tools"

    # Compound & Bioactivity Sources
    PUBCHEM_API_BASE: str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
    CHEMBL_API_BASE: str = "https://www.ebi.ac.uk/chembl/api/data"


settings = Settings()
