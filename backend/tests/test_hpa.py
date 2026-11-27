import json

import pandas as pd

from app.analyses import hpa


def _setup(tmp_path, monkeypatch):
    pd.DataFrame({"gene": ["MAVS", "MAVS"], "cancer": ["Colon AC", "Breast cancer"], "log2fc": [0.8, -0.1], "padj": [0.001, 0.4]}).to_csv(
        tmp_path / "hpa_cptac.tsv.gz", sep="\t", index=False)
    pd.DataFrame({"gene": ["MAVS"], "reliability": ["Supported"], "location": ["Mitochondria;Peroxisomes"],
                  "rna_top": ["skeletal muscle:40.2;heart muscle:30.1"], "ihc_high": ["colon;rectum"]}).to_csv(tmp_path / "hpa_gene.tsv.gz", sep="\t", index=False)
    (tmp_path / "hpa_release.json").write_text(json.dumps({"version": "26.0", "licence": "CC BY 4.0"}))
    monkeypatch.setattr(hpa, "DIR", tmp_path)
    for f in (hpa._cptac, hpa._genes, hpa.release):
        f.cache_clear()


def test_profile_matches_project_cancer(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    p = hpa.profile("MAVS", ["TCGA-COAD", "TCGA-READ"])
    assert p["cptac"]["cancer"] == "colon adenocarcinoma" and p["cptac"]["studied"]
    assert p["location"] == ["Mitochondria", "Peroxisomes"]
    assert p["rna_top"][0] == {"tissue": "skeletal muscle", "ntpm": 40.2}
    assert p["source"]["version"] == "26.0"


def test_unknown_gene_and_missing_tables(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    assert hpa.profile("NOTAGENE", ["TCGA-COAD"]) is None
    assert hpa.profile("MAVS", ["TCGA-SKCM"])["cptac"]["studied"] is False
    monkeypatch.setattr(hpa, "DIR", tmp_path / "none")
    for f in (hpa._cptac, hpa._genes, hpa.release):
        f.cache_clear()
    assert hpa.profile("MAVS", ["TCGA-COAD"]) is None
