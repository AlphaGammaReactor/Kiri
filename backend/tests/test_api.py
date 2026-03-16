"""
Kiri — API Endpoint Integration Tests

Tests the actual running backend (Docker). Covers:
- Health check
- Trust Layer (gene validation, PMID validation)
- Project CRUD 
- Clinical endpoints (structure only — actual computation needs TCGA data)
"""

import uuid
import pytest
import httpx


# ══════════════════════════════
#  Health & Infrastructure
# ══════════════════════════════


@pytest.mark.asyncio
async def test_health_check(client: httpx.AsyncClient):
    """Backend health endpoint returns ok."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "kiri-backend"
    assert "cache" in data


@pytest.mark.asyncio
async def test_openapi_docs(client: httpx.AsyncClient):
    """OpenAPI schema is served."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert "paths" in schema
    assert "info" in schema


# ══════════════════════════════
#  Trust Layer — Gene Validation
# ══════════════════════════════


@pytest.mark.asyncio
async def test_validate_known_gene(client: httpx.AsyncClient):
    """PARL should validate as a known HGNC gene."""
    resp = await client.get("/v1/validation/gene/PARL")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["data"]["valid"] is True
    assert data["data"]["symbol"] == "PARL"


@pytest.mark.asyncio
async def test_validate_unknown_gene(client: httpx.AsyncClient):
    """Nonsense symbol should fail validation."""
    resp = await client.get("/v1/validation/gene/FAKEGENE999")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    # Should return valid=False for unknown gene
    assert data["data"]["valid"] is False


@pytest.mark.asyncio
async def test_validate_gene_batch(client: httpx.AsyncClient):
    """Batch gene validation with mix of valid/invalid symbols."""
    resp = await client.post("/v1/validation/genes", json={
        "symbols": ["PARL", "MAVS", "NOTREAL"]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    result = data["data"]
    assert "PARL" in result.get("valid_genes", [])
    assert "MAVS" in result.get("valid_genes", [])


# ══════════════════════════════
#  Trust Layer — PMID Validation
# ══════════════════════════════


@pytest.mark.asyncio
async def test_validate_real_pmid(client: httpx.AsyncClient):
    """A known PubMed ID should validate (PMID 33116068 = PARL paper)."""
    resp = await client.get("/v1/validation/pmid/33116068")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["data"]["valid"] is True


@pytest.mark.asyncio
async def test_validate_fake_pmid(client: httpx.AsyncClient):
    """A fake PMID should fail validation (anti-hallucination gate)."""
    resp = await client.get("/v1/validation/pmid/99999999999")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["data"]["valid"] is False


# ══════════════════════════════
#  Project CRUD
# ══════════════════════════════


@pytest.mark.asyncio
async def test_create_project(client: httpx.AsyncClient):
    """Create a new project and get a UUID back."""
    resp = await client.post("/v1/projects", json={
        "name": f"Test Project {uuid.uuid4().hex[:8]}",
        "description": "Pytest integration test project",
        "cancer_type": "COAD",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    project = data["data"]
    assert "id" in project
    assert project["name"].startswith("Test Project")
    assert project["cancer_type"] == "COAD"
    assert project["proteins"] == []
    assert project["data_sources"] == []


@pytest.mark.asyncio
async def test_list_projects(client: httpx.AsyncClient):
    """List projects should return an array."""
    resp = await client.get("/v1/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_project_lifecycle(client: httpx.AsyncClient):
    """Full lifecycle: create → get → update → delete."""
    # Create
    create_resp = await client.post("/v1/projects", json={
        "name": "Lifecycle Test",
        "description": "Will be deleted",
        "cancer_type": "READ",
    })
    assert create_resp.status_code == 200
    project_id = create_resp.json()["data"]["id"]

    # Get
    get_resp = await client.get(f"/v1/projects/{project_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["name"] == "Lifecycle Test"

    # Update
    patch_resp = await client.patch(f"/v1/projects/{project_id}", json={
        "name": "Lifecycle Test Updated",
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["name"] == "Lifecycle Test Updated"

    # Delete (soft)
    del_resp = await client.delete(f"/v1/projects/{project_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["deleted"] is True

    # Verify not in list
    list_resp = await client.get("/v1/projects")
    project_ids = [p["id"] for p in list_resp.json()["data"]]
    assert project_id not in project_ids


@pytest.mark.asyncio
async def test_get_nonexistent_project(client: httpx.AsyncClient):
    """Getting a non-existent project returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/v1/projects/{fake_id}")
    assert resp.status_code == 404


# ══════════════════════════════
#  Data Source Recommendations
# ══════════════════════════════


@pytest.mark.asyncio
async def test_recommendations(client: httpx.AsyncClient):
    """Recommendations endpoint returns data for a cancer type."""
    resp = await client.get("/v1/projects/recommendations", params={"cancer_type": "COAD"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"


# ══════════════════════════════
#  Response Envelope Contract
# ══════════════════════════════


@pytest.mark.asyncio
async def test_response_envelope_structure(client: httpx.AsyncClient):
    """Every API response must have the Trust Layer envelope."""
    resp = await client.get("/v1/projects")
    data = resp.json()
    # Required fields in the response envelope
    assert "status" in data
    assert "data" in data
    assert "provenance" in data
    assert "warnings" in data
    assert "errors" in data


# ══════════════════════════════
#  Clinical Endpoints (Structure)
# ══════════════════════════════


@pytest.mark.asyncio
async def test_clinical_survival_endpoint_exists(client: httpx.AsyncClient):
    """Survival endpoint accepts POST (may fail on data but shouldn't 404)."""
    resp = await client.post("/v1/clinical/survival", json={
        "genes": ["PARL"],
        "project_ids": ["TCGA-COAD"],
        "cutpoint_method": "median",
    })
    # Might be 500 if GDC is down, but should NOT be 404 or 405
    assert resp.status_code != 404
    assert resp.status_code != 405


@pytest.mark.asyncio
async def test_clinical_cox_endpoint_exists(client: httpx.AsyncClient):
    """Cox endpoint accepts POST."""
    resp = await client.post("/v1/clinical/cox", json={
        "genes": ["PARL", "MAVS"],
        "covariates": ["stage"],
        "project_ids": ["TCGA-COAD"],
    })
    assert resp.status_code != 404
    assert resp.status_code != 405


# ══════════════════════════════
#  Drug Discovery Endpoints
# ══════════════════════════════


@pytest.mark.asyncio
async def test_drug_interactions_endpoint(client: httpx.AsyncClient):
    """Drug interactions endpoint accepts gene query."""
    resp = await client.get("/v1/drugs/interactions", params={"genes": "PARL"})
    assert resp.status_code != 404
    assert resp.status_code != 405


@pytest.mark.asyncio
async def test_drug_ranking_endpoint(client: httpx.AsyncClient):
    """Drug target ranking endpoint accepts gene query."""
    resp = await client.get("/v1/drugs/ranking", params={"genes": "PARL,MAVS"})
    assert resp.status_code != 404
    assert resp.status_code != 405


# ══════════════════════════════
#  Interaction Lab Endpoints
# ══════════════════════════════


@pytest.mark.asyncio
async def test_ppi_endpoint(client: httpx.AsyncClient):
    """PPI network endpoint accepts gene query."""
    resp = await client.get("/v1/interaction/ppi", params={"genes": "PARL,MAVS", "confidence": 0.4})
    assert resp.status_code != 404
    assert resp.status_code != 405


# ══════════════════════════════
#  PDM Vault Endpoints
# ══════════════════════════════


@pytest.mark.asyncio
async def test_pdm_assays_endpoint_exists(client: httpx.AsyncClient):
    """PDM assays endpoint accepts GET."""
    fake_project_id = str(uuid.uuid4())
    resp = await client.get("/v1/pdm/assays", params={"project_id": fake_project_id})
    assert resp.status_code != 404
    assert resp.status_code != 405

@pytest.mark.asyncio
async def test_pdm_images_endpoint_exists(client: httpx.AsyncClient):
    """PDM images endpoint accepts GET."""
    fake_project_id = str(uuid.uuid4())
    resp = await client.get("/v1/pdm/images", params={"project_id": fake_project_id})
    assert resp.status_code != 404
    assert resp.status_code != 405

@pytest.mark.asyncio
async def test_pdm_animals_endpoint_exists(client: httpx.AsyncClient):
    """PDM animal experiments endpoint accepts GET."""
    fake_project_id = str(uuid.uuid4())
    resp = await client.get("/v1/pdm/animal-models", params={"project_id": fake_project_id})
    assert resp.status_code != 404
    assert resp.status_code != 405


# ══════════════════════════════
#  Protein Docking Endpoints
# ══════════════════════════════

@pytest.mark.asyncio
async def test_protein_docking_endpoint_exists(client: httpx.AsyncClient):
    """Protein docking submission endpoint accepts POST."""
    fake_project_id = str(uuid.uuid4())
    resp = await client.post("/v1/docking/run", json={
        "project_id": fake_project_id,
        "receptor_gene": "PARL",
        "ligand_gene": "MAVS",
        "algorithm": "cluspro"
    })
    
    # We expect 200 or 401 depending on current_user mock, but NOT 404 or 405
    assert resp.status_code != 404
    assert resp.status_code != 405
