"""Mutation status: parsing the hub's calls, unknown for unsequenced tumours, survival and expression by it."""
import gzip

import numpy as np
import pytest

from app.analyses import expression, survival
from app.analyses.tables import rows_for
from app.cohorts import mutations
from app.cohorts.store import CohortUnavailable
from tests.test_analyses import make_cohort


def with_mutations(partial=False):
    c = make_cohort()
    tum = c.samples[c.samples["type"] == "tumor"]
    expr = c.gene("G")[tum.index]
    ids = tum["id"].tolist()
    # Sequenced: all but the last 20 tumours. Mutated: the higher-expressing ones (so both analyses see an effect).
    profiled = [s[:15] for s in ids[:-20]]
    mut = [s[:15] for s, x in zip(ids[:-20], expr[:-20]) if x > 5.5]
    c.mutations = {"profiled": profiled, "genes": {"G": mut}, **({"partial": True} if partial else {})}
    return c, len(mut), len(profiled)


def test_parse_keeps_protein_changing(tmp_path):
    f = tmp_path / "m.tsv.gz"
    with gzip.open(f, "wt") as h:
        h.write("sample\tgene\tchrom\tstart\tend\tref\talt\tAmino_Acid_Change\teffect\tcallers\tdna_vaf\n")
        h.write("TCGA-AA-0001-01A\tTP53\tchr17\t1\t1\tC\tT\tp.R175H\tmissense_variant\tx\t0.4\n")
        h.write("TCGA-AA-0002-01A\tTP53\tchr17\t1\t1\tC\tT\tp.R175=\tsynonymous_variant\tx\t0.4\n")
        h.write("TCGA-AA-0003-01A\tKRAS\tchr12\t1\t1\tC\tT\t\tframeshift_variant;splice_region_variant\tx\t0.4\n")
    d = mutations.parse(f)
    assert d["profiled"] == ["TCGA-AA-0001-01A", "TCGA-AA-0002-01A", "TCGA-AA-0003-01A"]
    assert d["genes"] == {"KRAS": ["TCGA-AA-0003-01A"], "TP53": ["TCGA-AA-0001-01A"]}
    st = mutations.status(d, ["TCGA-AA-0001-01A", "TCGA-AA-0002-01B", "TCGA-AA-0009-01A"], "TP53")
    assert st[0] == 1 and st[1] == 0 and np.isnan(st[2])


def test_survival_by_mutation():
    c, n_mut, n_prof = with_mutations()
    r = survival.run(c, "G", cut="mutation")
    assert "error" not in r, r
    assert r["groups"]["high"]["n"] + r["groups"]["low"]["n"] <= n_prof
    assert r["counts"]["no_expression"] == 20  # never sequenced: left out, not counted as wild-type
    assert r["cox"]["hr"] > 1.2
    assert r["stability"]["cutpoints"] == []
    assert next(x for x in r["checks"] if x["check"] == "data")["code"] == "data.patientsMut"
    rows = rows_for(c, "survival", {"gene": "G", "cut": "mutation"})
    assert rows["columns"][3] == "mutated" and {x[4] for x in rows["rows"]} == {"mutated", "not_mutated"}


def test_expression_by_mutation():
    c, n_mut, _ = with_mutations()
    r = expression.by_mutation(c, "G", "G")
    assert r["kind"] == "expression_mut" and r["groups"][0]["key"] == "mutated"
    assert r["groups"][0]["n"] == n_mut and r["test"]["p"] < 1e-6
    rows = rows_for(c, "expression_mut", {"gene": "G", "gene2": "G"})
    assert len(rows["rows"]) == sum(g["n"] for g in r["groups"])


def test_partial_slice_refuses_rare_genes():
    c, _, _ = with_mutations(partial=True)
    assert c.has_mutation("G") and not c.has_mutation("RARE")
    with pytest.raises(CohortUnavailable) as e:
        c.mutation("RARE")
    assert e.value.code == "gene_not_in_cohort"
    c.mutations = None
    with pytest.raises(CohortUnavailable) as e:
        c.mutation("G")
    assert e.value.code == "no_mutation_data"
