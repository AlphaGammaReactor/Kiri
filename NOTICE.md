# Third-party software and data

Kiri is closed source for now (see `LICENSE`). It is built on software and
public data that carry their own licences. This file lists what matters for
distributing Kiri. The full dependency list is in `backend/uv.lock` and
`frontend/package-lock.json`.

## No GPL code

Kiri does not include or link GPL-licensed code. `scikit-survival` (GPL-3.0),
which an earlier version used for random survival forests, was removed, and the
feature with it. A test (`backend/tests/test_no_fabricated_data.py`) fails if it
comes back.

## Weak-copyleft dependencies (allowed, with conditions)

| Package | Licence | What Kiri must do |
|---|---|---|
| svglib | LGPL-3.0-or-later | Ship it unmodified as a separate, replaceable library, and include its licence text with any installer. |
| pycairo (pulled in by svglib) | LGPL-2.1-only or MPL-1.1 | Same as above. |
| orjson, certifi and two small helpers | MPL-2.0 | Used unmodified. Include the licence text with any installer. |

Everything else in the lockfiles is under a permissive licence (MIT, BSD,
Apache-2.0, PSF, ISC or similar).

**Before the first installer ships:** generate the full licence bundle from the
two lockfiles and include it in the installer. That is not done yet.

## Data that Kiri cannot ship

| Data | Why | What Kiri does instead |
|---|---|---|
| LM22 signature matrix (CIBERSORT) | Stanford licence forbids redistribution | The user downloads it and places it at `<data folder>/signatures/LM22.txt`. Without it immune deconvolution refuses to run. |

## Public data services Kiri queries

GDC / TCGA (NCI), NCBI E-utilities, STRING, UniProt, AlphaFold DB, MyGene.info,
MyChem.info, PubChem, ChEMBL, IntAct, BioGRID, QuickGO, KEGG. Each has its own
terms of use and citation policy. KEGG in particular restricts non-academic
use; this must be reviewed before Kiri is sold.
