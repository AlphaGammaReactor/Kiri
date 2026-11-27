"""Survival and expression analyses on a synthetic cohort with known effects."""

import numpy as np
import pandas as pd
import pytest

from app.analyses import correlation, expression, survival
from app.cohorts.store import Cohort


def make_cohort(n=300, n_normal=40, hr=2.0, shift=1.0, seed=1):
    rng = np.random.default_rng(seed)
    rows, gene = [], []
    for i in range(n):
        x = rng.normal(5, 1)
        rate = 0.02 * (hr if x > 5 else 1.0)
        t = rng.exponential(1 / rate) * 30.4375
        cens = rng.uniform(0, 120) * 30.4375
        rows.append({"id": f"TCGA-AA-{i:04d}-01A", "case": f"TCGA-AA-{i:04d}", "type": "tumor", "project": "TCGA-COAD",
                     "stage": ["I", "II", "III", "IV"][i % 4], "age": float(rng.integers(30, 85)), "sex": "female",
                     "os_time": float(min(t, cens)), "os_event": int(t <= cens)})
        gene.append(x + (0.8 if i % 4 == 3 else 0))
    for i in range(n_normal):
        rows.append({"id": f"TCGA-AA-{i:04d}-11A", "case": f"TCGA-AA-{i:04d}", "type": "normal", "project": "TCGA-COAD",
                     "stage": "", "age": None, "sex": "", "os_time": None, "os_event": None})
        gene.append(rng.normal(5 - shift, 1))
    s = pd.DataFrame(rows)
    return Cohort("TEST", ["TCGA-COAD"], s, "synthetic", "log2(TPM + 1)", "2026-11-26", {"G": np.array(gene)})


def codes(res):
    return {c["check"]: (c["status"], c["code"]) for c in res["checks"]}


def test_tumour_vs_normal_finds_shift():
    r = expression.tumour_vs_normal(make_cohort(), "G")
    assert r["test"]["name"] == "wilcoxon_rank_sum"
    assert r["test"]["p"] < 1e-6
    assert r["effect"]["median_diff"] > 0.5
    assert r["groups"][0]["n"] == 300 and r["groups"][1]["n"] == 40
    assert codes(r)["assumptions"] == ("caution", "assume.someMatched")


def test_paired():
    r = expression.tumour_vs_normal(make_cohort(), "G", paired=True)
    assert r["paired"] and r["test"]["name"] == "wilcoxon_signed_rank"
    assert r["pairs"]["n"] == 40


def test_too_few_normal():
    r = expression.tumour_vs_normal(make_cohort(n_normal=2), "G")
    assert r["error"] == "too_few_normal"


def test_by_stage():
    r = expression.by_stage(make_cohort(), "G")
    assert [g["key"] for g in r["groups"]] == ["I", "II", "III", "IV"]
    assert r["test"]["p"] < 0.001
    assert len(r["pairwise"]) == 6
    assert all(p["p_adj"] >= p["p"] for p in r["pairwise"])


@pytest.mark.parametrize("cut", ["median", "quartile", "optimal"])
def test_survival_detects_hazard(cut):
    r = survival.run(make_cohort(), "G", cut=cut, adjust=["age", "stage"])
    assert r["cox"]["hr"] > 1.3
    assert r["logrank"]["p"] < 0.05
    assert r["groups"]["high"]["n"] + r["groups"]["low"]["n"] <= 300
    assert len(r["at_risk"]["ticks"]) == len(r["at_risk"]["high"])
    assert r["cox_adjusted"]["covariates"] == ["high", "age", "stage_n"]
    if cut == "optimal":
        assert r["p_report"] >= r["cut_info"]["p_min"]
        assert codes(r)["multiple"][1] == "multiple.optimalAdjusted"


def test_survival_null_is_not_significant_and_flags_instability():
    r = survival.run(make_cohort(hr=1.0, seed=3), "G")
    assert 0.6 < r["cox"]["hr"] < 1.6
    assert codes(r)["effect"][1] == "effect.hrIncludes1"


def test_results_are_json_safe():
    import json
    json.dumps(survival.run(make_cohort(), "G"), allow_nan=False)
    json.dumps(expression.tumour_vs_normal(make_cohort(), "G"), allow_nan=False)
    json.dumps(expression.by_stage(make_cohort(), "G"), allow_nan=False)


def test_correlation_finds_link_and_flags_strength():
    c = make_cohort()
    rng = np.random.default_rng(3)
    g = c.gene("G")
    c._genes["H"] = -0.6 * g + rng.normal(0, 0.5, len(g))  # negative link
    c._genes["N"] = rng.normal(0, 1, len(g))  # no link
    res = correlation.run(c, "G", "H")
    assert res["rho"] < -0.5 and res["p"] < 1e-6 and res["n"] == 300  # tumours only, one per patient
    assert res["rho_ci"][0] < res["rho"] < res["rho_ci"][1]
    assert codes(res)["effect"] == ("pass", "effect.rho.strong") and len(res["points"]) == 300
    null = correlation.run(c, "G", "N")
    assert null["p"] > 0.01 and codes(null)["effect"][1] in ("effect.rho.negligible", "effect.rho.weak")
    assert correlation.run(c, "G", "G")["error"] == "same_gene"
    from app.analyses.tables import rows_for

    t = rows_for(c, "correlation", {"gene": "G", "gene2": "H"})
    assert len(t["rows"]) == 300


def test_api_runs_and_stores_in_the_kiri_file(tmp_path, monkeypatch):
    import gzip
    import json as js

    from fastapi.testclient import TestClient

    from app.cohorts import store
    from app.kiri import api as kapi
    from app.kiri.fileformat import Workspace
    from app.main import app

    c = make_cohort()
    sl = {"name": "TEST", "projects": ["TCGA-COAD"], "built": "2026-11-26", "source": "synthetic", "units": "log2(TPM + 1)",
          "samples": c.samples.astype(object).where(c.samples.notna(), None).to_dict("records"),
          "genes": {"G": [float(x) for x in c.gene("G")]}}
    with gzip.open(tmp_path / "TEST.slice.json.gz", "wt") as f:
        js.dump(sl, f)
    monkeypatch.setattr(store, "SAMPLES_DIR", tmp_path)
    store.load_slice.cache_clear()
    monkeypatch.setattr(kapi, "_ws", Workspace(tmp_path / "data", "test"))

    cl = TestClient(app)
    r = cl.post("/api/v1/kiri/new", json={"path": str(tmp_path / "p.kiri"), "name": "P", "cancers": ["COAD"]})
    assert r.status_code == 200, r.text
    assert cl.get("/api/v1/kiri/cohort").json()["sample_slice"] == "TEST"
    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "g"})
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["saved"] and rec["params"]["gene"] == "G"
    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "G", "cut": "quartile", "replace": rec["id"]})
    assert r.json()["id"] == rec["id"]
    lst = cl.get("/api/v1/kiri/analyses").json()
    assert len(lst) == 1 and lst[0]["params"]["cut"] == "quartile"
    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "expression_tn", "gene": "NOPE"})
    assert r.status_code == 409 and r.json()["error"] in ("gene_not_in_cohort", "needs_download")
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#fff"/><text x="5" y="20">生存 KM</text></svg>'
    r = cl.post("/api/v1/kiri/notebook", json={"kind": "figure", "body": {"analysis_id": rec["id"], "title": "Figure 1", "svg": svg,
                                                                           "caption": "Figure 1. 测试", "checks": rec["result"]["checks"]}})
    assert r.status_code == 200 and r.json()["count"] == 1
    cl.post("/api/v1/kiri/notebook", json={"kind": "text", "body": {"text": "Ask about MSI 下周"}})
    notes = cl.get("/api/v1/kiri/notebook").json()
    assert len(notes) == 2 and notes[0]["changed_since"] is False
    nid = notes[1]["id"]
    assert cl.patch(f"/api/v1/kiri/notebook/{nid}", json={"pinned": True}).status_code == 200
    for fmt in ("pdf", "html", "docx"):
        r = cl.post("/api/v1/kiri/notebook/export", json={"path": str(tmp_path / f"report.{fmt}"), "format": fmt, "title": "PARL 报告"})
        assert r.status_code == 200, r.text
        assert r.json()["entries"] == 2
    assert (tmp_path / "report.pdf").read_bytes()[:4] == b"%PDF"
    assert "生存 KM" in (tmp_path / "report.html").read_text()
    import docx

    d = docx.Document(str(tmp_path / "report.docx"))
    assert len(d.inline_shapes) == 1 and any("测试" in p.text for p in d.paragraphs)
    assert cl.delete(f"/api/v1/kiri/notebook/{nid}").status_code == 200
    # Rows behind the analysis, re-check without saving, summary and figure PDF
    rows = cl.get(f"/api/v1/kiri/analyses/{rec['id']}/rows").json()
    assert rows["columns"][:5] == ["sample", "patient", "project", "expression", "group"] and len(rows["rows"]) > 100
    before = cl.get(f"/api/v1/kiri/analyses/{rec['id']}").json()["updated_at"]
    chk = cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "G", "cut": "quartile", "check_only": True}).json()
    assert chk["saved"] is False and chk["result"]["logrank"]["p"] == cl.get(f"/api/v1/kiri/analyses/{rec['id']}").json()["result"]["logrank"]["p"]
    assert cl.get(f"/api/v1/kiri/analyses/{rec['id']}").json()["updated_at"] == before
    assert cl.get("/api/v1/kiri/analyses").json()[0]["headline"]["worst"] in ("pass", "caution", "problem")
    r = cl.post("/api/v1/kiri/summary/export", json={"path": str(tmp_path / "s.pdf"), "format": "pdf", "title": "P", "intro": ["Targets: G"],
                                                      "items": [{"title": "Survival · G", "summary": "HR 2", "analysis_id": rec["id"], "checks": []}]})
    assert r.status_code == 200, r.text
    assert (tmp_path / "s.pdf").read_bytes()[:4] == b"%PDF"
    r = cl.post("/api/v1/kiri/summary/export", json={"path": str(tmp_path / "s.html"), "format": "html", "title": "P",
                                                      "items": [{"title": "Survival · G", "analysis_id": rec["id"]}]})
    assert "生存 KM" in (tmp_path / "s.html").read_text()  # the notebook figure for that analysis
    big = '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="400" viewBox="0 0 520 400"><text x="5" y="20" font-size="10">KM 生存</text></svg>'
    r = cl.post("/api/v1/kiri/summary/export", json={"path": str(tmp_path / "one.pdf"), "format": "pdf", "title": "PARL", "one_page": True,
                                                      "byline": "27 Nov 2026 · TEST · Kiri", "footer": "Methods in the notebook.",
                                                      "items": [{"title": f"P{i}", "summary": "Higher in tumour.", "svg": big,
                                                                 "checks": [{"status": "caution"}]} for i in range(6)]})
    assert r.status_code == 200 and r.json()["entries"] == 4, r.text
    raw = (tmp_path / "one.pdf").read_bytes()
    assert raw.count(b"/Type /Page\n") + raw.count(b"/Type /Page ") + raw.count(b"/Type /Page/") >= 1
    assert b"/MediaBox [ 0 0 842 595 ]" in raw and raw.count(b"/MediaBox") == 1  # one A4 landscape page
    from app.kiri.report import _min_font

    assert 'font-size="14.00"' in _min_font('<text font-size="10">', 14) and 'font-size="16.00"' in _min_font('<text font-size="16">', 7)
    r = cl.post("/api/v1/kiri/export/pdf", json={"path": str(tmp_path / "fig.pdf"), "svg": svg})
    assert r.status_code == 200, r.text
    assert (tmp_path / "fig.pdf").read_bytes()[:4] == b"%PDF"
    # Re-running the analysis marks the figure entry as changed since
    cl.post("/api/v1/kiri/analyses/run", json={"kind": "survival", "gene": "G", "cut": "median", "replace": rec["id"]})
    assert cl.get("/api/v1/kiri/notebook").json()[0]["changed_since"] is True
    cl.post("/api/v1/kiri/close")
    con = __import__("sqlite3").connect(tmp_path / "p.kiri")
    assert con.execute("SELECT COUNT(*) FROM analyses").fetchone()[0] == 1
    store.load_slice.cache_clear()


def test_sample_projects_open_and_run(tmp_path, monkeypatch):
    """Both bundled sample projects open and their targets are in the bundled data."""
    from fastapi.testclient import TestClient

    from app.core.config import settings
    from app.kiri import api as kapi
    from app.kiri.fileformat import Workspace
    from app.main import app

    monkeypatch.setattr(settings, "KIRI_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(kapi, "_ws", Workspace(tmp_path / "data", "test"))
    cl = TestClient(app)
    items = cl.get("/api/v1/kiri/samples?language=zh").json()["items"]
    assert {i["id"] for i in items} == {"parl-mavs", "tp53-brca"} and items[1]["name"] == "TP53 与乳腺癌"
    for s in items:
        r = cl.post(f"/api/v1/kiri/sample?language=en&id={s['id']}")
        assert r.status_code == 200, r.text
        for g in r.json()["project"]["targets"]:
            run = cl.post("/api/v1/kiri/analyses/run", json={"kind": "expression_stage", "gene": g})
            assert run.status_code == 200 and not run.json()["result"].get("error"), run.text
    r = cl.post("/api/v1/kiri/sample?language=en&id=parl-mavs")
    run = cl.post("/api/v1/kiri/analyses/run", json={"kind": "correlation", "gene": "PARL", "gene2": "MAVS"})
    assert run.status_code == 200 and run.json()["params"]["gene2"] == "MAVS" and run.json()["result"]["rho"] < 0, run.text
    assert cl.post("/api/v1/kiri/analyses/run", json={"kind": "correlation", "gene": "PARL"}).json()["error"] == "needs_second_gene"
    assert cl.post("/api/v1/kiri/sample?id=nope").status_code == 404
