"""
Build the Open Targets summary bundled with Kiri: for each TCGA cancer, how strongly every gene is linked to
that disease (overall association score and its evidence types: genetics, somatic mutations, literature, ...).

Source: Open Targets Platform GraphQL API. Licence: CC0 1.0 (platform-docs.opentargets.org/licence).
Known drugs are left out on purpose (ChEMBL, CC BY-SA). Run by CI. Usage: python build_opentargets.py <out_dir>
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

import pandas as pd

API = "https://api.platform.opentargets.org/api/v4/graphql"
# TCGA code -> disease name searched in Open Targets (the id found is printed and stored).
DISEASES = {
    "COADREAD": "colorectal adenocarcinoma", "BRCA": "breast carcinoma", "LUAD": "lung adenocarcinoma",
    "LUSC": "squamous cell lung carcinoma", "SKCM": "cutaneous melanoma", "GBM": "glioblastoma multiforme",
    "LGG": "low grade glioma", "OV": "ovarian serous adenocarcinoma", "PAAD": "pancreatic adenocarcinoma",
    "STAD": "gastric adenocarcinoma", "ESCA": "esophageal carcinoma", "LIHC": "hepatocellular carcinoma",
    "KIRC": "clear cell renal carcinoma", "KIRP": "papillary renal cell carcinoma", "PRAD": "prostate adenocarcinoma",
    "UCEC": "endometrial carcinoma", "HNSC": "head and neck squamous cell carcinoma", "BLCA": "bladder carcinoma",
    "LAML": "acute myeloid leukemia", "THCA": "thyroid carcinoma", "CESC": "cervical squamous cell carcinoma",
    "SARC": "sarcoma", "DLBC": "diffuse large B-cell lymphoma", "MESO": "mesothelioma", "UVM": "uveal melanoma",
    "ACC": "adrenocortical carcinoma", "PCPG": "pheochromocytoma", "TGCT": "testicular germ cell tumor",
    "THYM": "thymoma", "CHOL": "cholangiocarcinoma", "KICH": "chromophobe renal cell carcinoma",
    "UCS": "uterine carcinosarcoma",
}
MIN_SCORE = 0.02


def gql(query: str, variables: dict) -> dict:
    body = json.dumps({"query": query, "variables": variables}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json", "User-Agent": "kiri-ci"})
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read())
            if out.get("errors"):
                raise RuntimeError(out["errors"])
            return out["data"]
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt, e)
            time.sleep(3 * (attempt + 1))
    raise SystemExit("Open Targets API failed")


SEARCH = "query($q:String!){search(queryString:$q, entityNames:[\"disease\"], page:{index:0,size:3}){hits{id name}}}"
ASSOC = """query($id:String!,$i:Int!){disease(efoId:$id){id name associatedTargets(page:{index:$i,size:500}){count
  rows{score target{approvedSymbol} datatypeScores{id score}}}}}"""


def main(out: str) -> None:
    meta = gql("{meta{dataVersion{year month}}}", {})["meta"]
    version = f"{meta['dataVersion']['year']}.{meta['dataVersion']['month']}"
    rows, ids = [], {}
    for code, name in DISEASES.items():
        hits = gql(SEARCH, {"q": name})["search"]["hits"]
        if not hits:
            print(code, "no disease found for", name)
            continue
        did, dname = hits[0]["id"], hits[0]["name"]
        ids[code] = {"id": did, "name": dname}
        n = 0
        for i in range(60):
            d = gql(ASSOC, {"id": did, "i": i})["disease"]["associatedTargets"]
            page = d["rows"]
            for r in page:
                if r["score"] < MIN_SCORE:
                    break
                row = {"cancer": code, "gene": r["target"]["approvedSymbol"], "score": round(r["score"], 3)}
                row.update({x["id"]: round(x["score"], 3) for x in r["datatypeScores"]})
                rows.append(row); n += 1
            if not page or page[-1]["score"] < MIN_SCORE or (i + 1) * 500 >= d["count"]:
                break
        print(f"{code}: {dname} ({did}) {n} genes with score >= {MIN_SCORE}")
    df = pd.DataFrame(rows).fillna(0)
    o = Path(out)
    df = df.sort_values(["cancer", "score", "gene"], ascending=[True, False, True]).reset_index(drop=True)  # same file every run
    df.to_csv(o / "opentargets_cancer.tsv.gz", sep="\t", index=False, compression={"method": "gzip", "mtime": 0})
    (o / "opentargets_release.json").write_text(json.dumps({"release": f"Open Targets Platform {version}", "licence": "CC0 1.0",
                                                            "diseases": ids, "min_score": MIN_SCORE}, indent=1))
    print("columns:", list(df.columns), "rows:", len(df))
    print(df[df.gene.isin(["KRAS", "APC", "PARL", "MAVS", "TP53"]) & (df.cancer == "COADREAD")].to_string())


if __name__ == "__main__":
    main(sys.argv[1])
