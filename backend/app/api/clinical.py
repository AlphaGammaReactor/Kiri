"""
Kiri Clinical — API Router

Endpoints for Survival Analysis, Cox Regression, RSF, and Synergy.
All endpoints catch domain exceptions and return structured error responses.
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.responses import success_response, error_response
from app.core.errors import KiriComputationError, KiriExternalAPIError
from app.models.clinical import (
    SurvivalRequest,
    CoxRequest,
    RSFRequest,
    SynergyRequest,
)
from app.services.survival import run_kaplan_meier
from app.services.cox import run_cox_regression
from app.services.rsf import run_random_survival_forest
from app.services.synergy import run_synergy_analysis

logger = logging.getLogger("kiri.clinical")

clinical_router = APIRouter(prefix="/clinical", tags=["Clinical"])


@clinical_router.post("/survival")
async def api_survival(body: SurvivalRequest):
    """Run Kaplan-Meier survival analysis."""
    try:
        result = await run_kaplan_meier(
            gene=body.genes[0],
            project_ids=body.project_ids,
            cutpoint_method=body.cutpoint_method,
            custom_cutpoint=body.custom_cutpoint,
            stage_filter=body.stage_filter,
            msi_filter=body.msi_filter,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            source="+" .join(body.project_ids) + " (GDC)",
            method=f"Kaplan-Meier + log-rank ({body.cutpoint_method.value} cutpoint)",
            sample_count=sum(c.n_samples for c in result.curves),
        )
    except (KiriComputationError, KiriExternalAPIError):
        raise  # Let the global handler deal with these
    except Exception as e:
        logger.exception(f"Survival analysis failed: {e}")
        return error_response(
            errors=[f"Survival analysis failed: {str(e)}"],
            source="clinical-survival",
        )


@clinical_router.post("/cox")
async def api_cox(body: CoxRequest):
    """Run multivariate Cox Proportional Hazards regression."""
    try:
        result = await run_cox_regression(
            genes=body.genes,
            covariates=body.covariates,
            project_ids=body.project_ids,
            stage_filter=body.stage_filter,
            msi_filter=body.msi_filter,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            source="+" .join(body.project_ids) + " (GDC)",
            method=f"Cox PH (penalized, {len(body.genes)} genes + {len(body.covariates)} covariates)",
            sample_count=result.n_samples,
        )
    except (KiriComputationError, KiriExternalAPIError):
        raise
    except Exception as e:
        logger.exception(f"Cox regression failed: {e}")
        return error_response(
            errors=[f"Cox regression failed: {str(e)}"],
            source="clinical-cox",
        )


@clinical_router.post("/rsf")
async def api_rsf(body: RSFRequest):
    """Run Random Survival Forest feature importance."""
    try:
        result = await run_random_survival_forest(
            genes=body.genes,
            project_ids=body.project_ids,
            n_estimators=body.n_estimators,
            max_depth=body.max_depth,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            source="+" .join(body.project_ids) + " (GDC)",
            method=f"RSF (n_estimators={body.n_estimators})",
            sample_count=result.n_samples,
        )
    except (KiriComputationError, KiriExternalAPIError):
        raise
    except Exception as e:
        logger.exception(f"RSF failed: {e}")
        return error_response(
            errors=[f"RSF analysis failed: {str(e)}"],
            source="clinical-rsf",
        )


@clinical_router.post("/synergy")
async def api_synergy(body: SynergyRequest):
    """Compute PARL x MAVS synergy interaction."""
    try:
        result = await run_synergy_analysis(
            gene_a=body.gene_a,
            gene_b=body.gene_b,
            project_ids=body.project_ids,
            cutpoint_method=body.cutpoint_method,
        )
        return success_response(
            data=result.model_dump(mode="json"),
            source="+" .join(body.project_ids) + " (GDC)",
            method=f"Cox Interaction Term + 4-way KM ({body.gene_a} × {body.gene_b})",
            sample_count=result.n_samples,
        )
    except (KiriComputationError, KiriExternalAPIError):
        raise
    except Exception as e:
        logger.exception(f"Synergy analysis failed: {e}")
        return error_response(
            errors=[f"Synergy analysis failed: {str(e)}"],
            source="clinical-synergy",
        )
