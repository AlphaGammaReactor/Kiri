"""
Tests for Drug Discovery Service

Verifies MyChem.info parsing and that failures are reported, never replaced with invented data.
"""
import pytest
from app.core.errors import KiriExternalAPIError
from app.services.drugs import fetch_drug_interactions
from unittest.mock import patch, AsyncMock, MagicMock


class TestFetchDrugInteractions:
    @pytest.mark.anyio
    async def test_network_error_is_reported_not_replaced(self):
        """When MyChem.info fails, Kiri raises. It must never return made-up drugs."""
        with patch("app.services.drugs.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=(None, False))

            with patch("app.services.drugs.httpx.AsyncClient") as mock_client_cls:
                client = AsyncMock()
                client.get = AsyncMock(side_effect=Exception("Network error"))
                client.__aenter__ = AsyncMock(return_value=client)
                client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = client

                with pytest.raises(KiriExternalAPIError):
                    await fetch_drug_interactions("PARL")

    @pytest.mark.anyio
    async def test_no_hits_returns_empty_list(self):
        """A gene with no known drugs gives an empty list, not a 'generic inhibitor'."""
        with patch("app.services.drugs.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=(None, False))
            mock_cache.set = AsyncMock()

            with patch("app.services.drugs.httpx.AsyncClient") as mock_client_cls:
                resp = MagicMock()
                resp.raise_for_status = MagicMock()
                resp.json = MagicMock(return_value={"hits": []})
                client = AsyncMock()
                client.get = AsyncMock(return_value=resp)
                client.__aenter__ = AsyncMock(return_value=client)
                client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = client

                assert await fetch_drug_interactions("UNKNOWNGENE") == []

    @pytest.mark.anyio
    async def test_cache_hit(self):
        """Should return cached data if available."""
        cached_data = [{"drug_name": "Cached Drug", "drug_id": "DB_CACHED"}]
        
        with patch("app.services.drugs.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=(cached_data, True))
            
            results = await fetch_drug_interactions("PARL")
            
        assert results == cached_data
