import asyncio
from database import engine, Base


async def init_models():
    async with engine.begin() as conn:
        # Aktifkan ekstensi pgvector
        await conn.run_sync(
            lambda sync_conn: sync_conn.execute(
                text("CREATE EXTENSION IF NOT EXISTS vector")
            )
        )

        # Hapus semua tabel (untuk development)
        # await conn.run_sync(Base.metadata.drop_all)

        # Buat semua tabel
        print("Tabel yang akan dibuat:", list(Base.metadata.tables.keys()))
        await conn.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    # Tambahkan import text
    from sqlalchemy import text

    asyncio.run(init_models())
    print("Database tables created.")
