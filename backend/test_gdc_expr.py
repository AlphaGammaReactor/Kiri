import asyncio
from app.services.gdc import fetch_expression, fetch_clinical

async def main():
    res = await fetch_expression(["PARL", "MAVS"], ["TCGA-COAD", "TCGA-READ"])
    print(f"Expression samples: {res['sample_count']}")
    
    clin = await fetch_clinical(["TCGA-COAD", "TCGA-READ"])
    print(f"Clinical records: {clin['total']}")

if __name__ == "__main__":
    asyncio.run(main())
