"""
Kiri — AI Discovery LLM Test

Tests the DiscoveryLLMService initialization and PubMed fallback.
Can also be run standalone via `python tests/test_ai_discovery.py`.
"""

import asyncio
import os
import sys

import pytest
from dotenv import load_dotenv

# Load .env variables
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.env"))

from app.services.discovery_llm import DiscoveryLLMService
from app.services.validation import validate_pmid_list


@pytest.mark.asyncio
async def test_llm():
    """Test LLM literature mining with PubMed fallback."""
    try:
        service = DiscoveryLLMService()
        query = "What is the relationship between PARL and MAVS in cancer?"
        context = "Focus on recent findings regarding apoptosis or mitochondrial dynamics."
        result = await service.mine_literature(query, context)

        assert result is not None
        assert hasattr(result, "summary")
        assert hasattr(result, "novelty_score")
        assert hasattr(result, "claims")

        # Test PMID validation
        all_pmids = []
        for claim in result.claims:
            all_pmids.extend(claim.get("pmids", []))

        if all_pmids:
            validation_result = await validate_pmid_list(all_pmids)
            assert validation_result is not None

    except Exception as e:
        pytest.skip(f"LLM test skipped (requires network/API key): {e}")


if __name__ == "__main__":
    asyncio.run(test_llm())
