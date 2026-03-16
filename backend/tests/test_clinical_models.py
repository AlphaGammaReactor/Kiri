"""
Tests for Clinical Pydantic Models

Verifies request/response model validation and serialization.
"""
import pytest
from app.models.clinical import (
    SurvivalRequest,
    CoxRequest,
    RSFRequest,
    SynergyRequest,
    SurvivalCurveResult,
    AtRiskTable,
    SurvivalResult,
    HazardRatioResult,
    CoxResult,
    FeatureImportance,
    RSFResult,
    SynergyResult,
    CutpointMethod,
)


class TestSurvivalRequest:
    def test_valid_request(self):
        req = SurvivalRequest(genes=["PARL"])
        assert req.genes == ["PARL"]
        assert req.project_ids == ["TCGA-COAD", "TCGA-READ"]
        assert req.cutpoint_method == CutpointMethod.MAXSTAT

    def test_custom_cutpoint(self):
        req = SurvivalRequest(
            genes=["MAVS"],
            cutpoint_method=CutpointMethod.CUSTOM,
            custom_cutpoint=5.0,
        )
        assert req.custom_cutpoint == 5.0

    def test_empty_genes_rejected(self):
        with pytest.raises(Exception):
            SurvivalRequest(genes=[])


class TestCoxRequest:
    def test_defaults(self):
        req = CoxRequest(genes=["PARL", "MAVS"])
        assert req.covariates == ["stage", "msi"]

    def test_custom_covariates(self):
        req = CoxRequest(genes=["TP53"], covariates=["stage"])
        assert req.covariates == ["stage"]


class TestRSFRequest:
    def test_defaults(self):
        req = RSFRequest(genes=["PARL"])
        assert req.n_estimators == 100
        assert req.max_depth == 5

    def test_bounds(self):
        with pytest.raises(Exception):
            RSFRequest(genes=["PARL"], n_estimators=5)  # Below ge=10


class TestSynergyRequest:
    def test_defaults(self):
        req = SynergyRequest()
        assert req.gene_a == "PARL"
        assert req.gene_b == "MAVS"
        assert req.cutpoint_method == CutpointMethod.MEDIAN


class TestResponseModels:
    def test_survival_curve_result(self):
        curve = SurvivalCurveResult(
            group_name="High PARL",
            n_samples=50,
            median_survival=365.0,
            time=[0, 100, 200, 300],
            survival=[1.0, 0.9, 0.7, 0.5],
            ci_lower=[1.0, 0.85, 0.6, 0.4],
            ci_upper=[1.0, 0.95, 0.8, 0.6],
        )
        assert curve.group_name == "High PARL"
        assert len(curve.time) == 4

    def test_at_risk_table(self):
        table = AtRiskTable(
            time_points=[0, 250, 500, 750, 1000],
            groups={"High": [50, 40, 30, 20, 10], "Low": [45, 35, 25, 15, 5]}
        )
        assert len(table.groups) == 2

    def test_survival_result_serialization(self):
        result = SurvivalResult(
            curves=[
                SurvivalCurveResult(
                    group_name="High", n_samples=30, median_survival=500.0,
                    time=[0, 100], survival=[1.0, 0.8],
                    ci_lower=[1.0, 0.7], ci_upper=[1.0, 0.9],
                ),
            ],
            p_value=0.03,
            cutpoint_value=12.5,
            cutpoint_method="maxstat",
            at_risk_table=AtRiskTable(time_points=[0, 100], groups={"High": [30, 25]}),
        )
        d = result.model_dump(mode="json")
        assert d["p_value"] == 0.03
        assert len(d["curves"]) == 1

    def test_cox_result(self):
        result = CoxResult(
            hazard_ratios=[
                HazardRatioResult(variable="PARL", hr=1.5, ci_lower=1.1, ci_upper=2.0, p_value=0.01, significant=True),
            ],
            concordance_index=0.72,
            n_samples=100,
            n_events=35,
        )
        assert result.concordance_index == 0.72

    def test_rsf_result(self):
        result = RSFResult(
            feature_importances=[
                FeatureImportance(feature="PARL", importance=0.15),
                FeatureImportance(feature="MAVS", importance=0.08),
            ],
            concordance_index=0.68,
            n_samples=80,
            n_estimators=100,
        )
        assert len(result.feature_importances) == 2

    def test_synergy_result(self):
        result = SynergyResult(
            gene_a="PARL",
            gene_b="MAVS",
            interaction_p_value=0.04,
            combined_hr=1.35,
            synergy_type="synergistic",
            curves=[],
            at_risk_table=AtRiskTable(time_points=[], groups={}),
            concordance_index=0.65,
            n_samples=90,
        )
        assert result.synergy_type == "synergistic"
