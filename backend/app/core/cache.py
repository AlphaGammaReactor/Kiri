"""
Kiri — Caching Layer

Redis-based caching with graceful fallback to in-memory cache.
Each external API source has its own TTL policy.
Cache keys include version hashes to detect upstream data changes.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("kiri.cache")

# TTL policies per data source (in seconds)
CACHE_TTL = {
    "gdc": 86400,        # 24 hours
    "geo": 86400,        # 24 hours
    "string-db": 604800, # 7 days
    "pubmed": 604800,    # 7 days
    "alphafold": 2592000,# 30 days
    "mygene": 604800,    # 7 days
    "drugbank": 604800,  # 7 days
    "ctd": 604800,       # 7 days
    "drugs_mychem": 604800,    # 7 days
    "pubchem_search": 604800,  # 7 days
    "pubchem_desc": 604800,    # 7 days
    "pubchem_gene": 604800,    # 7 days
    "chembl_target": 604800,   # 7 days
    "chembl_activity": 604800, # 7 days
    "target_ranking_v2": 86400, # 24 hours
    "enrichment": 86400, # 24 hours
    "quickgo": 2592000,  # 30 days
    "kegg": 604800,      # 7 days
    "default": 3600,     # 1 hour
}


def _make_key(prefix: str, params: dict) -> str:
    """Generate a deterministic cache key from prefix + sorted params."""
    param_str = json.dumps(params, sort_keys=True, default=str)
    param_hash = hashlib.sha256(param_str.encode()).hexdigest()[:16]
    return f"kiri:{prefix}:{param_hash}"


class InMemoryCache:
    """
    Simple in-memory cache fallback when Redis is not available.
    NOT suitable for production — use Redis.
    """

    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}

    async def get(self, key: str) -> Any | None:
        if key in self._store:
            value, expires_at = self._store[key]
            if datetime.now(timezone.utc).timestamp() < expires_at:
                return value
            del self._store[key]
        return None

    async def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        expires_at = datetime.now(timezone.utc).timestamp() + ttl
        self._store[key] = (value, expires_at)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def clear(self) -> None:
        self._store.clear()


class CacheService:
    """
    Cache service with Redis backend and in-memory fallback.
    Provides source-aware TTL and provenance-compatible metadata.
    """

    def __init__(self):
        self._backend: InMemoryCache | None = None
        self._redis = None
        self._using_redis = False
        # Monitoring: hit/miss counters
        self._hits: int = 0
        self._misses: int = 0
        self._source_hits: dict[str, int] = {}
        self._source_misses: dict[str, int] = {}

    async def initialize(self, redis_url: str | None = None) -> None:
        """Try to connect to Redis; fall back to in-memory if unavailable."""
        if redis_url:
            try:
                import redis.asyncio as aioredis

                self._redis = aioredis.from_url(redis_url, decode_responses=True)
                await self._redis.ping()
                self._using_redis = True
                logger.info("Cache: Connected to Redis")
                return
            except Exception as e:
                logger.warning(f"Cache: Redis unavailable ({e}), falling back to in-memory")

        self._backend = InMemoryCache()
        self._using_redis = False
        logger.info("Cache: Using in-memory fallback (dev mode)")

    async def get(self, source: str, params: dict) -> tuple[Any | None, bool]:
        """
        Get cached value. Returns (value, cache_hit).

        Args:
            source: Data source identifier (e.g., 'gdc', 'string-db')
            params: Query parameters used to generate the cache key

        Returns:
            Tuple of (cached_value_or_None, was_cache_hit)
        """
        key = _make_key(source, params)

        try:
            if self._using_redis and self._redis:
                raw = await self._redis.get(key)
                if raw:
                    self._hits += 1
                    self._source_hits[source] = self._source_hits.get(source, 0) + 1
                    return json.loads(raw), True
            elif self._backend:
                value = await self._backend.get(key)
                if value is not None:
                    self._hits += 1
                    self._source_hits[source] = self._source_hits.get(source, 0) + 1
                    return value, True
        except Exception as e:
            logger.warning(f"Cache get error: {e}")

        self._misses += 1
        self._source_misses[source] = self._source_misses.get(source, 0) + 1
        return None, False

    async def set(self, source: str, params: dict, value: Any) -> None:
        """
        Store a value in cache with source-appropriate TTL.

        Args:
            source: Data source identifier (determines TTL)
            params: Query parameters used to generate the cache key
            value: The data to cache
        """
        key = _make_key(source, params)
        ttl = CACHE_TTL.get(source, CACHE_TTL["default"])

        try:
            if self._using_redis and self._redis:
                await self._redis.setex(key, ttl, json.dumps(value, default=str))
            elif self._backend:
                await self._backend.set(key, value, ttl)
        except Exception as e:
            logger.warning(f"Cache set error: {e}")

    @property
    def is_redis(self) -> bool:
        return self._using_redis

    def stats(self) -> dict:
        """Return cache hit/miss statistics."""
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0.0
        # Per-source breakdown
        sources = sorted(set(list(self._source_hits.keys()) + list(self._source_misses.keys())))
        per_source = {}
        for s in sources:
            h = self._source_hits.get(s, 0)
            m = self._source_misses.get(s, 0)
            t = h + m
            per_source[s] = {
                "hits": h,
                "misses": m,
                "hit_rate": round(h / t * 100, 1) if t > 0 else 0.0,
            }
        return {
            "backend": "redis" if self._using_redis else "in-memory",
            "total_hits": self._hits,
            "total_misses": self._misses,
            "total_requests": total,
            "hit_rate_pct": round(hit_rate, 1),
            "per_source": per_source,
        }


# Singleton instance
cache = CacheService()
