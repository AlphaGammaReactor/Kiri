"""
Tests for Drug Discovery Service

Verifies mock fallback and MyChem.info parsing.
"""
import pytest
from app.services.drugs import _mock_drug_interactions, fetch_drug_interactions
from unittest.mock import patch, AsyncMock, MagicMock


class TestMockDrugInteractions:
    def test_known_gene(self):
        results = _mock_drug_interactions("PARL")
        assert len(results) >= 1
        assert results[0]["drug_name"] == "Rhomboid Inhibitor X"

    def test_known_gene_egfr(self):
        results = _mock_drug_interactions("EGFR")
        assert len(results) == 2
        assert any(d["drug_name"] == "Erlotinib" for d in results)

    def test_unknown_gene(self):
        results = _mock_drug_interactions("UNKNOWNGENE")
        assert len(results) == 1
        assert "Generic Inhibitor" in results[0]["drug_name"]

    def test_case_insensitive(self):
        results = _mock_drug_interactions("parl")
        assert len(results) >= 1


class TestFetchDrugInteractions:
    @pytest.mark.anyio
    async def test_fallback_on_network_error(self):
        """Should fall back to mock data when MyChem.info fails."""
        with patch("app.services.drugs.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=(None, False))
            
            with patch("app.services.drugs.httpx.AsyncClient") as mock_client_cls:
                client = AsyncMock()
                client.get = AsyncMock(side_effect=Exception("Network error"))
                client.__aenter__ = AsyncMock(return_value=client)
                client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = client
                
                results = await fetch_drug_interactions("PARL")
                
            assert len(results) >= 1
            assert results[0]["source"] == "Synthetic List"

    @pytest.mark.anyio
    async def test_cache_hit(self):
        """Should return cached data if available."""
        cached_data = [{"drug_name": "Cached Drug", "drug_id": "DB_CACHED"}]
        
        with patch("app.services.drugs.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=(cached_data, True))
            
            results = await fetch_drug_interactions("PARL")
            
        assert results == cached_data
