"""
Tests for Error Classes and Error Handling

Verifies the KiriComputationError, KiriExternalAPIError, and KiriValidationError
constructors and attribute access.
"""
import pytest
from app.core.errors import KiriComputationError, KiriExternalAPIError, KiriValidationError


class TestKiriComputationError:
    """Verify the (source, message) constructor arg order is correct."""

    def test_constructor_positional(self):
        err = KiriComputationError("survival", "Insufficient samples (n < 10).")
        assert err.source == "survival"
        assert err.message == "Insufficient samples (n < 10)."
        assert str(err) == "Insufficient samples (n < 10)."

    def test_constructor_with_warnings(self):
        err = KiriComputationError("cox", "Convergence failed", warnings=["penalizer too low"])
        assert err.source == "cox"
        assert err.message == "Convergence failed"
        assert err.warnings == ["penalizer too low"]

    def test_default_warnings_empty(self):
        err = KiriComputationError("rsf", "Training failed")
        assert err.warnings == []


class TestKiriExternalAPIError:
    def test_constructor(self):
        err = KiriExternalAPIError("GDC", "Timeout")
        assert err.service == "GDC"
        assert err.message == "Timeout"
        assert "GDC" in str(err)

    def test_is_exception(self):
        err = KiriExternalAPIError("PubMed", "404")
        assert isinstance(err, Exception)


class TestKiriValidationError:
    def test_constructor(self):
        err = KiriValidationError("Invalid gene", source="hgnc")
        assert err.message == "Invalid gene"
        assert err.source == "hgnc"

    def test_default_source(self):
        err = KiriValidationError("Bad input")
        assert err.source == "kiri"
