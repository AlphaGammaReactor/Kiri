"""
Kiri — Application Configuration

Two ways to run:

* Local (default): one person on their own computer. Binds to 127.0.0.1,
  SQLite in the data folder, uploads allowed.
* Server mode (KIRI_SERVER_MODE=true): a hosted test build. The whole site sits
  behind one shared password (KIRI_ACCESS_PASSWORD), uploads of private data
  are off, and the app refuses to start without the password.

No secret has a usable default. Secrets that are not supplied are generated
on first start and kept in the data folder.
"""

import secrets
from pathlib import Path

from pydantic import ConfigDict, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = False

    # Hosted test build (see module docstring)
    KIRI_SERVER_MODE: bool = False
    KIRI_ACCESS_PASSWORD: str = ""
    # Domain-ownership files some services ask for (WeChat, search consoles), served
    # at the site root outside the password gate. "name.txt:content;other.txt:content"
    KIRI_VERIFICATION_FILES: str = ""
    # Days a browser stays signed in to the test build after entering the password
    KIRI_ACCESS_SESSION_DAYS: int = 7
    # Wrong passwords allowed per address before a lockout
    KIRI_ACCESS_MAX_ATTEMPTS: int = 8
    KIRI_ACCESS_LOCKOUT_MINUTES: int = 15
    # Desktop app: the Mac/Windows shell starts the engine with a fresh random
    # token on every launch, and every API call must carry it in X-Kiri-Token.
    # This keeps other programs and web pages on the same computer out.
    KIRI_DESKTOP_TOKEN: str = ""

    # Folder with the built frontend (index.html). Served by the API when present.
    KIRI_STATIC_DIR: str = ""

    # Where Kiri keeps its database, cache, uploads and user-installed reference
    # files (for example signatures/LM22.txt). On Railway this is the volume.
    KIRI_DATA_DIR: str = "./data"

    # CORS — accepts comma-separated string from env, e.g.:
    # CORS_ORIGINS="https://frontend.up.railway.app,http://localhost:5173"
    # Empty by default: the API serves the frontend itself, so no cross-origin
    # access is needed. For frontend development set
    # CORS_ORIGINS="http://localhost:5173".
    CORS_ORIGINS: list[str] = []

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Accept comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Database. Empty means SQLite at <KIRI_DATA_DIR>/kiri.db.
    DATABASE_URL: str = ""

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_database_url(cls, v):
        """Hosts often inject postgresql:// but asyncpg needs postgresql+asyncpg://."""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and "+asyncpg" not in v:
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Redis is optional. Empty means the in-process cache.
    REDIS_URL: str = ""

    # External APIs
    GDC_API_BASE: str = "https://api.gdc.cancer.gov"
    STRING_DB_API_BASE: str = "https://string-db.org/api"
    PUBMED_API_BASE: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    MYGENE_API_BASE: str = "https://mygene.info/v3"
    ALPHAFOLD_API_BASE: str = "https://alphafold.ebi.ac.uk/api"
    BIOGRID_API_BASE: str = "https://webservice.thebiogrid.org"
    BIOGRID_API_KEY: str = ""  # Optional — BioGRID data skipped if empty
    INTACT_API_BASE: str = "https://www.ebi.ac.uk/intact/ws"
    MASSIVE_API_BASE: str = "https://massive.ucsd.edu/ProteoSAFe/proxi/v0.1"
    PROTEOMECENTRAL_API_BASE: str = "https://proteomecentral.proteomexchange.org/cgi/GetDataset"
    GEMINI_API_KEY: str = ""   # Required for Phase 5 AI Discovery

    # Sign-in tokens. Empty means a key is generated and kept in the data folder.
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # If set, creating an account needs this code. Empty means no code is asked.
    INVITE_CODE: str = ""

    # Brute force protection
    LOGIN_MAX_ATTEMPTS: int = 5        # lock after N failures
    LOGIN_LOCKOUT_MINUTES: int = 15    # cooldown period

    # Drug Discovery (Phase 7)
    MYCHEM_API_BASE: str = "https://mychem.info/v1"

    # Compound & Bioactivity Sources
    PUBCHEM_API_BASE: str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
    CHEMBL_API_BASE: str = "https://www.ebi.ac.uk/chembl/api/data"


    @model_validator(mode="after")
    def _finalise(self):
        data_dir = Path(self.KIRI_DATA_DIR).expanduser().resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        self.KIRI_DATA_DIR = str(data_dir)

        if not self.DATABASE_URL:
            self.DATABASE_URL = f"sqlite+aiosqlite:///{(data_dir / 'kiri.db').as_posix()}"

        if not self.JWT_SECRET_KEY:
            self.JWT_SECRET_KEY = _load_or_create_secret(data_dir / "secret.key")
        elif len(self.JWT_SECRET_KEY) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters.")

        if self.KIRI_DESKTOP_TOKEN and len(self.KIRI_DESKTOP_TOKEN) < 32:
            raise ValueError("KIRI_DESKTOP_TOKEN must be at least 32 characters.")
        if self.KIRI_DESKTOP_TOKEN and self.KIRI_SERVER_MODE:
            raise ValueError("Desktop mode and server mode cannot both be on.")

        if self.KIRI_SERVER_MODE:
            # Fail closed: a hosted build must never come up without its password.
            if len(self.KIRI_ACCESS_PASSWORD) < 12:
                raise ValueError(
                    "KIRI_SERVER_MODE is on, so KIRI_ACCESS_PASSWORD must be set to at least 12 characters."
                )
            if self.DEBUG:
                raise ValueError("DEBUG must be off in server mode.")
        return self

    @property
    def desktop_mode(self) -> bool:
        return bool(self.KIRI_DESKTOP_TOKEN)

    @property
    def uploads_enabled(self) -> bool:
        """Private data (uploads, lab records) is only accepted on a person's own computer."""
        return not self.KIRI_SERVER_MODE

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


def _load_or_create_secret(path: Path) -> str:
    """Read the signing key from the data folder, creating it on first start."""
    if path.is_file():
        key = path.read_text(encoding="utf-8").strip()
        if len(key) >= 32:
            return key
    key = secrets.token_urlsafe(48)
    path.write_text(key, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return key


settings = Settings()
