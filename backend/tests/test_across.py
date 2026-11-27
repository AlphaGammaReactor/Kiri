"""Expression across cancers, with the Xena hub replaced by a small stand-in (synthetic test fixture)."""

import numpy as np
from fastapi.testclient import TestClient


class FakeXena:
    def __init__(self):
        rng = np.random.default_rng(1)
        self.samples, study, typ, site, dis, vals = [], [], [], [], [], []
        def add(n, st, t, si, d, mu):
            for _ in range(n):
                self.samples.append(f"S{len(self.samples):05d}")
                study.append(st); typ.append(t); site.append(si); dis.append(d)
                vals.append(np.log2(2 ** rng.normal(mu, 0.5) - 1 + 0.001))  # stored as log2(TPM + 0.001)
        add(80, "TCGA", "Primary Tumor", "Colon", "Colon Adenocarcinoma", 8)
        add(10, "TCGA", "Solid Tissue Normal", "Colon", "Colon Adenocarcinoma", 5)
        add(40, "GTEX", "Normal Tissue", "Colon", "Colon", 5)
        add(60, "TCGA", "Primary Tumor", "Brain", "Brain Lower Grade Glioma", 4)
        add(30, "GTEX", "Normal Tissue", "Brain", "Brain", 4)
        add(50, "TCGA", "Primary Tumor", "Eye", "Uveal Melanoma", 6)
        self.cols = {"_study": study, "_sample_type": typ, "_primary_site": site, "primary disease or tissue": dis}
        self.vals = vals
        self.calls = 0

    def dataset_samples(self, hub, ds, limit):
        return self.samples

    def dataset_field(self, hub, ds):
        return list(self.cols)

    def field_codes(self, hub, ds, fields):
        return [{"name": f, "code": None} for f in fields]

    def dataset_fetch(self, hub, ds, samples, fields):
        return [self.cols[f] for f in fields]

    def dataset_gene_probe_avg(self, hub, ds, samples, genes):
        self.calls += 1
        return [{"gene": genes[0], "scores": [self.vals if genes[0] == "TP53" else [float("nan")] * len(samples)]}]


def test_across_cancers(tmp_path, monkeypatch):
    from app.analyses import across
    from app.kiri import analyses_api
    from tests.test_owndata import _client

    fake = FakeXena()
    monkeypatch.setattr(across, "_xena", lambda: fake)
    monkeypatch.setattr(analyses_api, "_data_dir", lambda: tmp_path / "data")
    cl: TestClient = _client(tmp_path, monkeypatch)
    r = cl.post("/api/v1/kiri/analyses/run", json={"kind": "across", "gene": "tp53"})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    rows = {x["code"]: x for x in res["rows"]}
    assert set(rows) == {"COAD", "LGG", "UVM"}
    assert rows["COAD"]["tumour"]["n"] == 80 and rows["COAD"]["normal"]["n"] == 50 and rows["COAD"]["n_gtex"] == 40
    assert rows["COAD"]["p_adj"] < 1e-10 and abs(rows["COAD"]["tumour"]["median"] - 8) < 0.3  # converted to log2(TPM + 1)
    assert rows["LGG"]["p_adj"] > 0.01 and rows["UVM"]["p"] is None
    assert res["up"] == ["COAD"] and res["rows"][0]["code"] == "COAD"  # sorted by tumour median
    assert len(rows["COAD"]["points_t"]) == 60
    # TCGA normals only
    r2 = cl.post("/api/v1/kiri/analyses/run", json={"kind": "across", "gene": "TP53", "normal": "tcga"}).json()["result"]
    assert {x["code"]: x for x in r2["rows"]}["COAD"]["normal"]["n"] == 10 and {x["code"]: x for x in r2["rows"]}["LGG"]["p"] is None
    assert fake.calls == 1  # the gene was fetched once and then read from the data folder
    rows_api = cl.get(f"/api/v1/kiri/analyses/{r.json()['id']}/rows").json()
    assert len(rows_api["rows"]) == 80 + 10 + 40 + 60 + 30 + 50
    bad = cl.post("/api/v1/kiri/analyses/run", json={"kind": "across", "gene": "NOTAGENE"})
    assert bad.status_code == 409 and bad.json()["error"] == "gene_not_in_cohort"


def test_across_offline(tmp_path, monkeypatch):
    from app.analyses import across
    from app.cohorts.store import CohortUnavailable

    class Down:
        def __getattr__(self, name):
            def fail(*a, **k):
                raise OSError("network unreachable")
            return fail

    monkeypatch.setattr(across, "_xena", lambda: Down())
    try:
        across.run("TP53", tmp_path)
    except CohortUnavailable as e:
        assert e.code == "needs_internet"
    else:
        raise AssertionError("expected needs_internet")
