"""
Kiri — Data Source Hydration Service

Fetches and caches external API data for project data sources.
Called when a data source is attached (wizard or settings).
Data is stored in ProjectDataSource.cached_data so pages can
read it without hitting external APIs on every visit.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, ProjectDataSource
from app.services.drugs import fetch_drug_interactions
from app.services.pubchem import get_compounds_for_gene
from app.services.chembl import get_bioactivities_multi
from app.services.targets import rank_targets

logger = logging.getLogger("kiri.hydration")

# Source types that need hydration (download from external APIs)
HYDRATABLE_SOURCES = {"drugbank", "pubchem", "chembl"}


async def hydrate_source(
    source: ProjectDataSource,
    project: Project,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Hydrate a data source by fetching data from external APIs.
    
    Updates the source status through: connecting → downloading → loaded/error
    Returns the cached data dict.
    """
    gene_symbols = [p.gene_symbol for p in project.proteins]
    
    if not gene_symbols:
        source.status = "loaded"
        source.cached_data = {"warning": "no_proteins", "data": {}}
        source.last_fetched_at = datetime.now(timezone.utc)
        await db.flush()
        return source.cached_data

    # Phase 1: Connecting
    source.status = "connecting"
    await db.flush()

    try:
        # Phase 2: Downloading
        source.status = "downloading"
        await db.flush()

        cached = await _fetch_for_source_type(source.source_type, gene_symbols)

        # Phase 3: Loaded
        source.status = "loaded"
        source.cached_data = cached
        source.last_fetched_at = datetime.now(timezone.utc)
        source.sample_count = cached.get("total_count", 0)
        await db.flush()

        logger.info(
            f"Hydrated {source.source_type} source {source.id} "
            f"for project {project.id} ({len(gene_symbols)} genes)"
        )
        return cached

    except Exception as e:
        logger.error(f"Hydration failed for {source.source_type}: {e}")
        source.status = "error"
        source.cached_data = {"error": str(e)}
        await db.flush()
        raise


async def _fetch_for_source_type(
    source_type: str,
    gene_symbols: list[str],
) -> dict[str, Any]:
    """Route to the correct fetcher based on source type."""

    if source_type == "drugbank":
        return await _hydrate_drugbank(gene_symbols)
    elif source_type == "pubchem":
        return await _hydrate_pubchem(gene_symbols)
    elif source_type == "chembl":
        return await _hydrate_chembl(gene_symbols)
    else:
        # Non-hydratable sources (tcga, geo, string, etc.)
        return {"status": "passthrough", "source_type": source_type}


async def _hydrate_drugbank(genes: list[str]) -> dict[str, Any]:
    """Fetch drug interactions + target ranking for all project genes."""
    interactions: dict[str, Any] = {}
    total_count = 0

    for gene in genes:
        results = await fetch_drug_interactions(gene)
        interactions[gene] = results
        total_count += len(results)

    # Also fetch target rankings
    rankings = await rank_targets(genes)

    return {
        "source_type": "drugbank",
        "interactions": interactions,
        "rankings": rankings,
        "total_count": total_count,
        "gene_count": len(genes),
    }


async def _hydrate_pubchem(genes: list[str]) -> dict[str, Any]:
    """Fetch PubChem compound data for all project genes."""
    compounds: dict[str, Any] = {}
    total_count = 0

    for gene in genes:
        try:
            results = await get_compounds_for_gene(gene)
            compounds[gene] = results
            total_count += len(results)
        except Exception as e:
            logger.warning(f"PubChem fetch failed for {gene}: {e}")
            compounds[gene] = []

    return {
        "source_type": "pubchem",
        "compounds": compounds,
        "total_count": total_count,
        "gene_count": len(genes),
    }


async def _hydrate_chembl(genes: list[str]) -> dict[str, Any]:
    """Fetch ChEMBL bioactivity data for all project genes."""
    try:
        bioactivities = await get_bioactivities_multi(genes)
    except Exception as e:
        logger.warning(f"ChEMBL fetch failed: {e}")
        bioactivities = {}

    total_count = sum(
        r.get("total_count", 0) for r in bioactivities.values()
    )

    return {
        "source_type": "chembl",
        "bioactivities": bioactivities,
        "total_count": total_count,
        "gene_count": len(genes),
    }
