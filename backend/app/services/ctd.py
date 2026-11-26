"""
Kiri — CTD Integration Service

The Comparative Toxicogenomics Database has no integration in Kiri yet.
An earlier version returned hard-coded example associations (and a made-up
acetaminophen row for every unknown gene). That is removed: until a real CTD
query exists, this service reports that the data is unavailable.
"""

from typing import Any

from app.core.errors import KiriDataUnavailableError


async def fetch_chemical_disease_associations(gene_symbol: str) -> list[dict[str, Any]]:
    """Chemical-disease-gene associations from CTD. Not integrated yet."""
    raise KiriDataUnavailableError(
        "ctd",
        f"CTD chemical-disease associations for {gene_symbol.upper()} are not available: "
        "Kiri has no CTD integration yet. No associations were generated.",
    )
