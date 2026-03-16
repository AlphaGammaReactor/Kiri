"""
Kiri — AI Discovery LLM Service

Literature mining via Google Gemini (optional) with PubMed-only fallback.
If GEMINI_API_KEY is not configured, falls back to PubMed keyword search.
"""

from typing import List, Dict, Any, Optional
import json
import logging
import httpx
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger("kiri.discovery")


class AIMiningResult(BaseModel):
    claims: List[Dict[str, Any]]
    summary: str
    novelty_score: float


class DiscoveryLLMService:
    """Wraps Gemini for literature mining. Falls back to PubMed search if no API key."""

    def __init__(self):
        self._client = None
        self._has_gemini = False

        if settings.GEMINI_API_KEY:
            try:
                from google import genai
                self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
                self._has_gemini = True
                logger.info("Gemini client initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini client: {e}. Using PubMed fallback.")
        else:
            logger.info("GEMINI_API_KEY not set. AI Discovery will use PubMed-only fallback.")

    async def mine_literature(self, query: str, context: Optional[str] = None) -> AIMiningResult:
        """
        Mine literature based on a query.
        Uses Gemini if available, otherwise falls back to PubMed keyword search.
        """
        if self._has_gemini and self._client:
            return await self._mine_with_gemini(query, context)
        return await self._mine_with_pubmed(query)

    async def _mine_with_gemini(self, query: str, context: Optional[str] = None) -> AIMiningResult:
        """Use Gemini to mine literature and return structured claims."""
        from google.genai import types

        logger.info(f"Running Gemini literature mining for query: {query}")

        prompt = f"""
You are an expert bioinformatics research assistant. 
The user is querying regarding the following biological context: {query}
Additional context: {context or 'None'}

Your task is to synthesize findings from scientific literature. 
CRITICAL RULE: For every single claim you make, you MUST provide a valid PubMed ID (PMID) that supports it. Do not hallucinate PMIDs. If you don't know a PMID for a claim, do not include the claim.

Return your response strictly as a JSON object matching this schema:
{{
    "summary": "A 2-3 sentence high-level summary of the findings.",
    "novelty_score": 0.85,
    "claims": [
        {{
            "text": "The specific claim extracted from literature.",
            "pmids": ["12345678"],
            "confidence": 0.9
        }}
    ]
}}
"""
        try:
            response = self._client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )

            result_dict = json.loads(response.text)
            return AIMiningResult(**result_dict)

        except Exception as e:
            logger.error(f"Gemini API error, falling back to PubMed: {e}")
            return await self._mine_with_pubmed(query)

    async def _mine_with_pubmed(self, query: str) -> AIMiningResult:
        """
        PubMed-only fallback: search for articles and build claims from titles/abstracts.
        """
        logger.info(f"Running PubMed-only literature search for: {query}")

        base = settings.PUBMED_API_BASE
        claims: List[Dict[str, Any]] = []

        try:
            # 1. ESearch: find PMIDs
            async with httpx.AsyncClient(timeout=15.0) as client:
                search_resp = await client.get(f"{base}/esearch.fcgi", params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": 10,
                    "retmode": "json",
                    "sort": "relevance",
                })
                search_resp.raise_for_status()
                search_data = search_resp.json()

            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            if not id_list:
                return AIMiningResult(
                    claims=[],
                    summary=f"No PubMed articles found for '{query}'.",
                    novelty_score=0.0,
                )

            # 2. ESummary: get article details
            async with httpx.AsyncClient(timeout=15.0) as client:
                summary_resp = await client.get(f"{base}/esummary.fcgi", params={
                    "db": "pubmed",
                    "id": ",".join(id_list),
                    "retmode": "json",
                })
                summary_resp.raise_for_status()
                summary_data = summary_resp.json()

            results = summary_data.get("result", {})
            for pmid in id_list:
                article = results.get(pmid, {})
                title = article.get("title", "")
                if title:
                    claims.append({
                        "text": title,
                        "pmids": [pmid],
                        "confidence": 0.7,
                    })

            return AIMiningResult(
                claims=claims,
                summary=f"Found {len(claims)} PubMed articles for '{query}'. Results are based on keyword search (no AI synthesis — set GEMINI_API_KEY for full analysis).",
                novelty_score=0.3,
            )

        except Exception as e:
            logger.error(f"PubMed search failed: {e}")
            return AIMiningResult(
                claims=[],
                summary=f"PubMed search failed: {e}",
                novelty_score=0.0,
            )


# Lazy-init: safe even without Gemini API key
discovery_llm = DiscoveryLLMService()
