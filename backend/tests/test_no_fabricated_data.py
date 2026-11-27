"""
Kiri never returns generated, random or hard-coded example values in place of real data.

When a real source is missing, the request fails with a clear "not available" error.
These tests pin that rule for every path that used to invent data.
"""
import re
from pathlib import Path
from unittest.mock import AsyncMock, patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.errors import KiriComputationError, KiriDataUnavailableError, KiriExternalAPIError

APP_DIR = Path(__file__).resolve().parents[1] / "app"


@pytest.fixture(scope="module")
def api():
    from app.main import app

    with TestClient(app) as client:
        yield client


class TestSourceScan:
    """A guard against these paths coming back."""

    def test_no_random_number_generators_outside_resampling(self):
        # The only allowed uses are statistical resampling of real data.
        allowed = {
            "services/cibersort.py",          # permutation null for the fit p-value
            "services/mito_coexpression.py",  # thins a scatter plot to 300 real points
            "analyses/expression.py",         # bootstrap interval for the effect size (seeded)
            "analyses/survival.py",           # bootstrap stability of the hazard ratio (seeded)
            "analyses/correlation.py",        # bootstrap stability of the sign of rho (seeded)
            "analyses/de.py",                 # thins the volcano plot to 4,000 real genes (seeded)
            "analyses/signature.py",          # GSEA gene-set permutations and bootstrap of rho (seeded)
            "analyses/across.py",             # picks 60 real points per box to draw (seeded)
        }
        offenders = []
        for path in APP_DIR.rglob("*.py"):
            rel = path.relative_to(APP_DIR).as_posix()
            text = path.read_text(encoding="utf-8")
            if re.search(r"np\.random|default_rng|\brandom\.(random|choice|gauss|uniform|normal)", text):
                if rel not in allowed:
                    offenders.append(rel)
        assert offenders == []

    def test_no_mock_or_synthetic_data_functions(self):
        offenders = []
        for path in APP_DIR.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if re.search(r"def _?(mock|fake|synthetic|simulate)\w*\(", text, re.IGNORECASE):
                offenders.append(path.relative_to(APP_DIR).as_posix())
        assert offenders == []

    def test_no_gpl_survival_library(self):
        for path in APP_DIR.rglob("*.py"):
            assert "sksurv" not in path.read_text(encoding="utf-8"), path


class TestGeo:
    async def test_geo_expression_is_unavailable_not_generated(self):
        from app.services import geo

        with patch.object(geo, "_verify_geo_accession", AsyncMock(return_value={"count": 1})):
            with pytest.raises(KiriDataUnavailableError):
                await geo.fetch_geo_dataset("GSE39582", ["PARL", "MAVS"])

    async def test_perturbation_dataset_load_is_unavailable(self):
        from app.services.differential_public import load_geo_dataset, search_public_datasets

        with pytest.raises(KiriDataUnavailableError):
            await load_geo_dataset("GSE119843", ["PARL"])
        assert (await search_public_datasets(["PARL"]))["datasets"] == []


class TestGdc:
    async def test_gdc_failure_raises_instead_of_generating_expression(self):
        from app.services import gdc

        clinical = [{"case_id": "c1", "submitter_id": "TCGA-AA-0001", "project": {"project_id": "TCGA-COAD"}}]
        with patch.object(gdc, "_fetch_gene_expression_values", AsyncMock(side_effect=RuntimeError("down"))):
            with pytest.raises(KiriExternalAPIError):
                await gdc._build_expression_matrix_v2(["PARL"], {"PARL": "ENSG00000175193"}, ["c1"], clinical)

    async def test_empty_gdc_answer_raises(self):
        from app.services import gdc

        with patch.object(gdc, "_fetch_gene_expression_values", AsyncMock(return_value={})):
            with pytest.raises(KiriExternalAPIError):
                await gdc._build_expression_matrix_v2(["PARL"], {"PARL": "ENSG00000175193"}, ["c1"], [])

    async def test_gene_missing_from_gdc_is_dropped_not_zero_filled(self):
        from app.services import gdc

        clinical = [
            {"case_id": c, "submitter_id": f"TCGA-AA-000{i}", "project": {"project_id": "TCGA-COAD"}}
            for i, c in enumerate(["c1", "c2"])
        ]
        returned = {"ENSG00000175193": {"c1": 12.5, "c2": 7.0}}  # MAVS is absent from the answer
        with patch.object(gdc, "_fetch_gene_expression_values", AsyncMock(return_value=returned)):
            result = await gdc._build_expression_matrix_v2(
                ["PARL", "MAVS"],
                {"PARL": "ENSG00000175193", "MAVS": "ENSG00000088888"},
                ["c1", "c2"],
                clinical,
            )
        assert result["genes"] == ["PARL"]
        assert "MAVS" not in result["values"]
        assert sorted(result["values"]["PARL"]) == [7.0, 12.5]


class TestDrugsAndDocking:
    async def test_ctd_is_unavailable(self):
        from app.services.ctd import fetch_chemical_disease_associations

        with pytest.raises(KiriDataUnavailableError):
            await fetch_chemical_disease_associations("PARL")

    def test_docking_endpoint_returns_501_and_no_result(self, api):
        resp = api.post(
            "/api/v1/docking/run",
            json={"project_id": "p", "receptor_gene": "PARL", "ligand_gene": "MAVS"},
        )
        assert resp.status_code == 501
        body = resp.json()
        assert body["status"] == "error"
        assert "complex_url" not in str(body)

    def test_ctd_endpoint_returns_501(self, api):
        assert api.get("/api/v1/drugs/associations", params={"genes": "PARL"}).status_code == 501

    async def test_pride_is_unavailable(self):
        from app.services.interactomics import load_pride_dataset, search_pride_datasets

        with pytest.raises(KiriDataUnavailableError):
            await load_pride_dataset("PXD000001", ["PARL"])
        assert (await search_pride_datasets(["PARL"]))["datasets"] == []


class TestImmuneDeconvolution:
    async def test_refuses_to_run_without_the_real_signature_matrix(self):
        from app.services.cibersort import run_immune_deconvolution, signature_path

        assert not signature_path().exists()
        with pytest.raises(KiriDataUnavailableError):
            await run_immune_deconvolution({"CD8A": [1.0, 2.0], "MS4A1": [3.0, 4.0]})

    async def test_recovers_known_fractions_with_a_supplied_signature(self, tmp_path, monkeypatch):
        """
        Method check: with a signature matrix installed, mixtures built from known
        fractions are recovered. (The matrix here is generated for the test only;
        it is not LM22 and is never shipped.)
        """
        from app.core.config import settings
        from app.services import cibersort

        rng = np.random.default_rng(7)
        n_genes, n_types = 300, len(cibersort.CELL_TYPES)
        sig = np.exp(rng.normal(5, 1.5, size=(n_genes, n_types)))
        genes = [f"GENE{i}" for i in range(n_genes)]
        sig_dir = tmp_path / "signatures"
        sig_dir.mkdir()
        pd.DataFrame(sig, index=genes, columns=cibersort.CELL_TYPES).to_csv(sig_dir / "LM22.txt", sep="\t")
        monkeypatch.setattr(settings, "KIRI_DATA_DIR", str(tmp_path))

        truth = np.zeros((2, n_types))
        truth[0, [3, 13, 15]] = [0.5, 0.3, 0.2]
        truth[1, [0, 8]] = [0.7, 0.3]
        mixtures = sig @ truth.T  # genes x samples

        for method in ("cibersort", "nnls"):
            result = await cibersort.run_immune_deconvolution(
                {g: mixtures[i].tolist() for i, g in enumerate(genes)},
                sample_ids=["A", "B"],
                method=method,
                permutations=20,
            )
            assert result["failed_samples"] == []
            for s, sample in enumerate(result["samples"]):
                got = np.array([sample["fractions"][ct] for ct in cibersort.CELL_TYPES])
                assert got.sum() == pytest.approx(1.0, abs=1e-4)
                assert np.abs(got - truth[s]).max() < 0.08
            if method == "cibersort":
                assert all(0 < sample["p_value"] <= 1 for sample in result["samples"])
                assert "Kiri implementation" in result["method"]

    async def test_too_few_signature_genes_is_an_error(self, tmp_path, monkeypatch):
        from app.core.config import settings
        from app.services import cibersort

        rng = np.random.default_rng(1)
        genes = [f"GENE{i}" for i in range(200)]
        sig_dir = tmp_path / "signatures"
        sig_dir.mkdir()
        pd.DataFrame(
            np.exp(rng.normal(5, 1, size=(200, len(cibersort.CELL_TYPES)))), index=genes, columns=cibersort.CELL_TYPES
        ).to_csv(sig_dir / "LM22.txt", sep="\t")
        monkeypatch.setattr(settings, "KIRI_DATA_DIR", str(tmp_path))

        with pytest.raises(KiriComputationError):
            await cibersort.run_immune_deconvolution({g: [1.0, 2.0] for g in genes[:20]})
