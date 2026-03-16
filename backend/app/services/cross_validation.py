"""
Kiri — Cross-Validation Service

Bridges dry-lab (Atlas: TCGA/GEO expression, enrichment) and wet-lab
(PDM: assays, imaging, animal models) data by gene symbol alignment.

Key functions:
- variable_sync:  Lists all gene symbols used across both dry and wet lab sources
- overlay_data:   Gathers all wet-lab evidence for a specific gene, organized by type
- concordance:    Computes a structured concordance summary per gene
"""

import logging
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pdm import Assay, LabImage, AnimalExperiment
from app.models.project import ProjectProtein

logger = logging.getLogger("kiri.cross_validation")


async def variable_sync(project_id: str, db: AsyncSession) -> dict:
    """
    Scan all PDM records and project proteins to build a unified gene→evidence map.

    Returns:
      {
        "genes": [
          {
            "gene_symbol": "PARL",
            "dry_lab": true,  // gene is in project proteins (Atlas sources)
            "wet_lab": { "assays": 2, "images": 1, "animal_models": 0 },
            "total_evidence": 3
          },
          ...
        ],
        "summary": { "total_genes": N, "dry_only": X, "wet_only": Y, "both": Z }
      }
    """
    pid = uuid.UUID(project_id)

    # Fetch project proteins (dry-lab genes)
    protein_stmt = select(ProjectProtein.gene_symbol).where(
        ProjectProtein.project_id == pid
    )
    protein_res = await db.execute(protein_stmt)
    dry_genes = set(r[0] for r in protein_res.fetchall() if r[0])

    # Count wet-lab records per gene
    assay_stmt = (
        select(Assay.gene_symbol, func.count(Assay.id))
        .where(Assay.project_id == pid, Assay.gene_symbol != "")
        .group_by(Assay.gene_symbol)
    )
    assay_res = await db.execute(assay_stmt)
    assay_counts = dict(assay_res.fetchall())

    image_stmt = (
        select(LabImage.gene_symbol, func.count(LabImage.id))
        .where(LabImage.project_id == pid, LabImage.gene_symbol != "")
        .group_by(LabImage.gene_symbol)
    )
    image_res = await db.execute(image_stmt)
    image_counts = dict(image_res.fetchall())

    animal_stmt = (
        select(AnimalExperiment.gene_symbol, func.count(AnimalExperiment.id))
        .where(AnimalExperiment.project_id == pid, AnimalExperiment.gene_symbol != "")
        .group_by(AnimalExperiment.gene_symbol)
    )
    animal_res = await db.execute(animal_stmt)
    animal_counts = dict(animal_res.fetchall())

    # Merge all gene symbols
    wet_genes = set(assay_counts.keys()) | set(image_counts.keys()) | set(animal_counts.keys())
    all_genes = sorted(dry_genes | wet_genes)

    genes = []
    dry_only = wet_only = both = 0

    for gene in all_genes:
        in_dry = gene in dry_genes
        assays = assay_counts.get(gene, 0)
        images = image_counts.get(gene, 0)
        animals = animal_counts.get(gene, 0)
        total = assays + images + animals
        in_wet = total > 0

        if in_dry and in_wet:
            both += 1
        elif in_dry:
            dry_only += 1
        else:
            wet_only += 1

        genes.append({
            "gene_symbol": gene,
            "dry_lab": in_dry,
            "wet_lab": {"assays": assays, "images": images, "animal_models": animals},
            "total_evidence": total,
        })

    return {
        "genes": genes,
        "summary": {
            "total_genes": len(all_genes),
            "dry_only": dry_only,
            "wet_only": wet_only,
            "both": both,
        },
    }


async def overlay_data(project_id: str, gene_symbol: str, db: AsyncSession) -> dict:
    """
    Gather all wet-lab evidence for a specific gene in a project.
    Used to overlay alongside dry-lab data from Atlas.

    Returns:
      {
        "gene_symbol": "PARL",
        "assays":  [{ id, assay_type, title, conditions, results, ... }],
        "images":  [{ id, image_type, title, tags, metadata_json, ... }],
        "animal_models": [{ id, model_type, title, groups, measurements, ... }],
        "evidence_count": N,
        "evidence_types": ["assay", "image", ...]
      }
    """
    pid = uuid.UUID(project_id)
    gene = gene_symbol.upper().strip()

    # Fetch assays
    assay_stmt = (
        select(Assay)
        .where(Assay.project_id == pid, Assay.gene_symbol == gene)
        .order_by(Assay.created_at.desc())
    )
    assay_res = await db.execute(assay_stmt)
    assays = [_row_dict(r) for r in assay_res.scalars().all()]

    # Fetch images
    image_stmt = (
        select(LabImage)
        .where(LabImage.project_id == pid, LabImage.gene_symbol == gene)
        .order_by(LabImage.created_at.desc())
    )
    image_res = await db.execute(image_stmt)
    images = [_row_dict(r) for r in image_res.scalars().all()]

    # Fetch animal experiments
    animal_stmt = (
        select(AnimalExperiment)
        .where(AnimalExperiment.project_id == pid, AnimalExperiment.gene_symbol == gene)
        .order_by(AnimalExperiment.created_at.desc())
    )
    animal_res = await db.execute(animal_stmt)
    animals = [_row_dict(r) for r in animal_res.scalars().all()]

    evidence_types = []
    if assays:
        evidence_types.append("assay")
    if images:
        evidence_types.append("image")
    if animals:
        evidence_types.append("animal_model")

    return {
        "gene_symbol": gene,
        "assays": assays,
        "images": images,
        "animal_models": animals,
        "evidence_count": len(assays) + len(images) + len(animals),
        "evidence_types": evidence_types,
    }


async def concordance_report(project_id: str, db: AsyncSession) -> dict:
    """
    Build a concordance report for the project: for each gene
    that has BOTH dry-lab and wet-lab data, produce a summary.

    Returns:
      {
        "genes": [
          {
            "gene_symbol": "PARL",
            "dry_lab_sources": ["TCGA-COAD", "GSE39582"],
            "wet_lab_evidence": { "assays": 2, "images": 1, "animal_models": 1 },
            "concordance_level": "strong"  // "strong" | "partial" | "dry_only" | "wet_only"
          }
        ],
        "overall": { "strong": N, "partial": N, "dry_only": N, "wet_only": N }
      }
    """
    sync = await variable_sync(project_id, db)

    genes_report = []
    levels = {"strong": 0, "partial": 0, "dry_only": 0, "wet_only": 0}

    for gene_info in sync["genes"]:
        wet_lab = gene_info["wet_lab"]
        wet_types = sum(1 for v in [wet_lab["assays"], wet_lab["images"], wet_lab["animal_models"]] if v > 0)
        has_wet = wet_types > 0
        has_dry = gene_info["dry_lab"]

        if has_dry and has_wet and wet_types >= 2:
            level = "strong"
        elif has_dry and has_wet:
            level = "partial"
        elif has_dry:
            level = "dry_only"
        else:
            level = "wet_only"

        levels[level] += 1

        genes_report.append({
            "gene_symbol": gene_info["gene_symbol"],
            "dry_lab": has_dry,
            "wet_lab_evidence": wet_lab,
            "wet_lab_types": wet_types,
            "concordance_level": level,
        })

    # Sort: strong first, then partial, then wet_only, then dry_only
    order = {"strong": 0, "partial": 1, "wet_only": 2, "dry_only": 3}
    genes_report.sort(key=lambda g: (order.get(g["concordance_level"], 4), g["gene_symbol"]))

    return {
        "genes": genes_report,
        "overall": levels,
    }


def _row_dict(row) -> dict:
    """Convert an ORM row to a JSON-serializable dict."""
    import uuid as _uuid
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, _uuid.UUID):
            val = str(val)
        d[col.name] = val
    return d
