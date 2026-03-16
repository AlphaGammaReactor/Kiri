import asyncio
from app.services.survival import run_kaplan_meier
from app.models.clinical import CutpointMethod

async def main():
    res = await run_kaplan_meier("PARL", ["TCGA-COAD"])
    df_samples = sum(c.n_samples for c in res.curves)
    print(f"PARL TCGA-COAD survival samples: {df_samples}")

if __name__ == "__main__":
    asyncio.run(main())
