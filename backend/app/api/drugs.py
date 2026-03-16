"""
Kiri — Drug Discovery API Router

Endpoints for DrugBank (via MyChem), PubChem, ChEMBL, and CTD data.
"""

import logging

from fastapi import APIRouter, Query, HTTPException

from app.core.responses import success_response
from app.services.drugs import fetch_drug_interactions
from app.services.ctd import fetch_chemical_disease_associations
from app.services.targets import rank_targets
from app.services.pubchem import search_compounds, get_compounds_for_gene, get_compound_description
from app.services.chembl import get_bioactivities, get_bioactivities_multi

logger = logging.getLogger("kiri.api.drugs")
router = APIRouter(prefix="/drugs", tags=["Drugs"])


@router.get("/pubchem/{cid}/description")
async def get_pubchem_description(cid: int):
    """Get pharmacological description for a PubChem compound by CID."""
    result = await get_compound_description(cid)
    return success_response(
        data=result,
        source="PubChem (NIH/NCBI)",
        method="compound_description",
        sample_count=len(result.get("descriptions", [])),
    )


@router.get("/interactions")
async def get_interactions(genes: str = Query(..., description="Comma-separated gene symbols")):
    """Get drug-gene interactions for a list of genes."""
    gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
    if not gene_list:
        raise HTTPException(status_code=400, detail="No genes provided.")
        
    results = {}
    for gene in gene_list:
        results[gene] = await fetch_drug_interactions(gene)
        
    # Note: Returning success with empty interactions if no data
    return success_response(
        data={"interactions": results},
        source="MyChem.info",
        method="fetch_drug_interactions",
        sample_count=sum(len(v) for v in results.values()),
    )

@router.get("/associations")
async def get_associations(genes: str = Query(..., description="Comma-separated gene symbols")):
    """Get chemical-disease-gene associations from CTD for a list of genes."""
    gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
    if not gene_list:
        raise HTTPException(status_code=400, detail="No genes provided.")
        
    results = {}
    for gene in gene_list:
        results[gene] = await fetch_chemical_disease_associations(gene)
        
    return success_response(
        data={"associations": results},
        source="CTD (Mock)",
        method="fetch_chemical_disease_associations",
        sample_count=sum(len(v) for v in results.values()),
    )

@router.get("/ranking")
async def get_ranking(genes: str = Query(..., description="Comma-separated gene symbols")):
    """Rank targets among the provided genes based on druggability and evidence."""
    gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
    if not gene_list:
        raise HTTPException(status_code=400, detail="No genes provided.")
        
    rankings = await rank_targets(gene_list)
        
    return success_response(
        data={"rankings": rankings},
        source="Aggregated (MyChem.info, CTD, ChEMBL)",
        method="rank_targets",
        sample_count=len(rankings),
    )


@router.get("/pubchem")
async def get_pubchem_compounds(
    query: str = Query(None, description="Compound name or SMILES"),
    genes: str = Query(None, description="Comma-separated gene symbols"),
):
    """Search PubChem for compounds by name/SMILES or by gene target."""
    if not query and not genes:
        raise HTTPException(status_code=400, detail="Provide 'query' or 'genes' parameter.")

    if genes:
        gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
        all_compounds = {}
        for gene in gene_list:
            all_compounds[gene] = await get_compounds_for_gene(gene)
        return success_response(
            data={"compounds": all_compounds},
            source="PubChem (NIH/NCBI)",
            method="gene_compound_search",
            sample_count=sum(len(v) for v in all_compounds.values()),
        )
    else:
        compounds = await search_compounds(query)
        return success_response(
            data={"compounds": compounds},
            source="PubChem (NIH/NCBI)",
            method="compound_name_search",
            sample_count=len(compounds),
        )


@router.get("/chembl")
async def get_chembl_bioactivities(
    genes: str = Query(..., description="Comma-separated gene symbols"),
):
    """Get ChEMBL bioactivity data (IC50, Ki, Kd) for gene targets."""
    gene_list = [g.strip().upper() for g in genes.split(",") if g.strip()]
    if not gene_list:
        raise HTTPException(status_code=400, detail="No genes provided.")

    results = await get_bioactivities_multi(gene_list)

    return success_response(
        data={"bioactivities": results},
        source="ChEMBL (EMBL-EBI)",
        method="bioactivity_search",
        sample_count=sum(r.get("total_count", 0) for r in results.values()),
    )
