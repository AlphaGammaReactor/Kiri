import asyncio
from app.services.gdc import fetch_clinical, fetch_expression
from app.services.survival import _build_survival_df

async def main():
    clinical_data = await fetch_clinical(["TCGA-COAD"])
    expr_data = await fetch_expression(["PARL"], ["TCGA-COAD"], "tpm")
    
    df = _build_survival_df(clinical_data, expr_data, "PARL")
    print(f"Total clinical records (COAD): {clinical_data['total']}")
    print(f"Total expression samples (COAD): {expr_data['sample_count']}")
    print(f"Valid survival matching cases (COAD): {len(df)}")

if __name__ == "__main__":
    asyncio.run(main())
