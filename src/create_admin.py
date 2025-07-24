# save as create_admin.py di folder src/
import asyncio
from database import async_session, User


async def create_admin():
    async with async_session() as session:
        username = "admin"
        password = "admin123"  # Ganti dengan password kuat!
        user = await session.execute(
            User.__table__.select().where(User.username == username)
        )
        if user.first():
            print("Admin already exists")
            return
        admin = User(
            username=username,
            password_hash=User.get_password_hash(password),
            role="admin",
        )
        session.add(admin)
        await session.commit()
        print("Admin created:", username)


if __name__ == "__main__":
    asyncio.run(create_admin())
