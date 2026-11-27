"""HGNC names: a gene the data keep under an older symbol or an alias is still found."""
import numpy as np

from app.kiri.genes import other_names
from tests.test_analyses import make_cohort


def test_other_names():
    assert "PSARL" in other_names("PARL") and other_names("PSARL")[0] == "PARL"
    assert other_names("NOT_A_GENE_XYZ") == ()
    # never another gene's approved symbol
    from app.kiri.genes import _table
    genes = _table()[0]
    for g in ("TP53", "MAVS", "KRAS"):
        assert all(n.upper() not in genes for n in other_names(g))


def test_cohort_finds_old_symbol():
    c = make_cohort()
    c._genes["PSARL"] = c._genes.pop("G")  # data built with the older symbol
    assert c.has("PARL") and c.stored_name("PARL") == "PSARL"
    assert np.array_equal(c.gene("PARL"), c._genes["PSARL"])
    assert not c.has("TP53")
