"""
Tests for Discovery LLM Service

Verifies safe initialization without API key and PubMed fallback functionality.
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestDiscoveryLLMServiceInit:
    """Verify the service initializes safely without a Gemini API key."""

    def test_init_without_api_key(self):
        """Service should init without crash even if GEMINI_API_KEY is empty."""
        with patch("app.services.discovery_llm.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
            
            from app.services.discovery_llm import DiscoveryLLMService
            service = DiscoveryLLMService()
            
            assert service._has_gemini is False
            assert service._client is None

    def test_init_with_invalid_api_key(self):
        """Service should gracefully handle an invalid Gemini API key."""
        with patch("app.services.discovery_llm.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "invalid-key"
            mock_settings.PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
            
            from app.services.discovery_llm import DiscoveryLLMService
            # This should not raise even if genai.Client fails
            service = DiscoveryLLMService()
            # It may or may not have gemini depending on whether the library validates key at init


class TestPubMedFallback:
    """Verify PubMed-only fallback works correctly."""

    @pytest.mark.anyio
    async def test_pubmed_fallback_returns_results(self):
        """When no Gemini key, mine_literature should use PubMed search."""
        with patch("app.core.config.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
            
            from app.services.discovery_llm import DiscoveryLLMService
            service = DiscoveryLLMService()
            
            # Mock httpx to avoid real network calls
            mock_search_response = MagicMock()
            mock_search_response.json.return_value = {
                "esearchresult": {
                    "idlist": ["12345678", "87654321"]
                }
            }
            mock_search_response.raise_for_status = MagicMock()

            mock_summary_response = MagicMock()
            mock_summary_response.json.return_value = {
                "result": {
                    "12345678": {"title": "PARL cleaves MAVS in mitochondria"},
                    "87654321": {"title": "Mitochondrial dynamics in CRC"},
                }
            }
            mock_summary_response.raise_for_status = MagicMock()
            
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=[mock_search_response, mock_summary_response])
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            
            with patch("app.services.discovery_llm.httpx.AsyncClient", return_value=mock_client):
                result = await service._mine_with_pubmed("PARL MAVS cancer")
            
            assert len(result.claims) == 2
            assert result.claims[0]["pmids"] == ["12345678"]
            assert "PARL" in result.claims[0]["text"]
            assert result.novelty_score == 0.3  # PubMed fallback novelty

    @pytest.mark.anyio
    async def test_pubmed_fallback_handles_empty_results(self):
        """PubMed search with no results should return empty claims."""
        with patch("app.core.config.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            mock_settings.PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
            
            from app.services.discovery_llm import DiscoveryLLMService
            service = DiscoveryLLMService()
            
            mock_response = MagicMock()
            mock_response.json.return_value = {"esearchresult": {"idlist": []}}
            mock_response.raise_for_status = MagicMock()
            
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            
            with patch("app.services.discovery_llm.httpx.AsyncClient", return_value=mock_client):
                result = await service._mine_with_pubmed("nonexistent_gene_xyz")
            
            assert len(result.claims) == 0
            assert result.novelty_score == 0.0
