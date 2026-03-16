import asyncio
from app.services.gdc import _query_gdc_cases

async def main():
    coad = await _query_gdc_cases(["TCGA-COAD"])
    read = await _query_gdc_cases(["TCGA-READ"])
    both = await _query_gdc_cases(["TCGA-COAD", "TCGA-READ"])
    print(f"COAD: {len(coad)}")
    print(f"READ: {len(read)}")
    print(f"BOTH: {len(both)}")

if __name__ == "__main__":
    asyncio.run(main())
