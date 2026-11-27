"""Gene set score on a synthetic cohort with a known gene–set link."""

import json

import numpy as np
import pandas as pd

from app.analyses import signature
from app.analyses.genesets import GENESETS, listing
from app.cohorts.packs import PackReader
from app.cohorts.store import Cohort

UPR = GENESETS["uprmt_markers"]["genes"]
MITO = GENESETS["mito_content"]["genes"]
PROL = GENESETS["proliferation"]["genes"]


def make(n=300, link=0.6, via_mito=False, seed=3):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        rows.append({"id": f"TCGA-AA-{i:04d}-01A", "case": f"TCGA-AA-{i:04d}", "type": "tumor", "project": "TCGA-COAD",
                     "stage": "II", "age": 60.0, "sex": "female",
                     "os_time": float(rng.exponential(900)), "os_event": int(rng.random() < 0.4)})
    mito = rng.normal(0, 1, n)
    prog = rng.normal(0, 1, n)  # the UPRmt programme
    genes = {}
    driver = mito if via_mito else prog
    genes["PARL"] = 5 + link * driver + rng.normal(0, 1, n)
    for g in UPR:
        genes[g] = 6 + 0.8 * (mito if via_mito else prog) + rng.normal(0, 0.6, n)
    for g in MITO:
        genes[g] = 7 + 0.9 * mito + rng.normal(0, 0.5, n)
    for g in PROL:
        genes[g] = 4 + rng.normal(0, 1, n)
    return Cohort("TEST", ["TCGA-COAD"], pd.DataFrame(rows), "synthetic", "log2(TPM + 1)", "2026-11-27", genes)


def codes(r):
    return {c["check"]: (c["status"], c["code"]) for c in r["checks"]}


def test_finds_link_and_coherent_set():
    r = signature.run(make(), "PARL", "uprmt_markers")
    assert not r.get("error")
    assert r["rho"] > 0.3 and r["p"] < 1e-6
    assert r["members"] == UPR and r["missing"] == []
    assert len(r["heatmap"]["labels"]) == 6 and len(r["heatmap"]["rho"]) == 6
    assert codes(r)["coherence"][0] == "pass"
    assert codes(r)["mito_content"] == ("pass", "sig.mito.holds")
    assert r["groups"]["test"]["p"] < 1e-4 and r["groups"]["rank_biserial"] > 0
    assert set(r["survival"]["curves"]) == {"gene_high_score_high", "gene_high_score_low", "gene_low_score_high", "gene_low_score_low"}
    assert r["enrichment"] is None  # no genome-wide data in a slice
    json.dumps(r, allow_nan=False)


def test_mito_content_explains_link():
    r = signature.run(make(via_mito=True), "PARL", "uprmt_markers")
    assert r["rho"] > 0.2
    assert codes(r)["mito_content"] == ("caution", "sig.mito.explains")


def test_no_link():
    r = signature.run(make(link=0.0), "PARL", "uprmt_markers")
    assert abs(r["rho"]) < 0.15


def test_custom_set_drops_my_gene_and_needs_three():
    c = make()
    r = signature.run(c, "PARL", "custom", ["parl", "ATF5", "HSPD1", "NOPE1"])
    assert r["error"] == "too_few_members" and r["missing"] == ["NOPE1"]
    r = signature.run(c, "PARL", "custom", ["PARL", "ATF5", "HSPD1", "LONP1"])
    assert r["note"] == "self_removed" and r["members"] == ["ATF5", "HSPD1", "LONP1"]


def test_missing_members_reported():
    r = signature.run(make(), "PARL", "uprmt")  # extended set: only the markers exist here
    assert set(r["missing"]) == {"HSPE1", "DNAJA3", "YME1L1", "TRAP1", "ATF4", "DDIT3", "SIRT3"}
    assert codes(r)["data"][0] == "caution"


def test_gsea_finds_planted_set():
    rng = np.random.default_rng(0)
    genes = [f"G{i}" for i in range(2000)]
    ranked = pd.Series(rng.normal(0, 1, 2000), index=genes)
    ranked.iloc[:20] = np.linspace(3, 2, 20)
    out = signature.gsea(ranked, {"top": genes[:20], "rand": genes[1000:1020]}, permutations=300, curve_for="top")
    res = {o["set"]: o for o in out["results"]}
    assert res["top"]["nes"] > 1.5 and res["top"]["p"] < 0.01
    assert res["rand"]["p"] > 0.01
    assert out["curve"]["hits"][:3] == [0, 1, 2] or len(out["curve"]["hits"]) == 20


def test_ranked_by_correlation_on_a_pack(tmp_path):
    c = make(n=120)
    rng = np.random.default_rng(1)
    names = list(c._genes) + [f"N{i}" for i in range(600)]
    mat = np.vstack([c._genes[g] for g in c._genes] + [rng.normal(5, 1, 120) for _ in range(600)]).astype(np.float32)
    d = tmp_path / "TCGA-COAD"
    d.mkdir()
    np.save(d / "expr.npy", mat)
    (d / "genes.json").write_text(json.dumps(names))
    (d / "columns.json").write_text(json.dumps(c.samples["id"].tolist()))
    pc = Cohort("P", ["TCGA-COAD"], c.samples, "synthetic", "log2(TPM + 1)", "downloaded", reader=PackReader([d]))
    r = signature.run(pc, "PARL", "uprmt_markers")
    e = r["enrichment"]
    assert e is not None
    res = {o["set"]: o for o in e["results"]}
    assert res["uprmt_markers"]["nes"] > 1 and e["curve"] is not None


def test_across():
    a, b = make(seed=1), make(link=0.0, seed=2)
    out = signature.across([a, b], "PARL", "uprmt_markers")
    assert out["tested"] == 2 and out["positive"] >= 1


def test_listing():
    items = listing("zh")
    assert any(i["id"] == "uprmt_markers" and i["genes"] == ["ATF5", "HSPD1", "HSPA9", "LONP1", "CLPP"] for i in items)
    assert all(i["cite"] for i in items)
