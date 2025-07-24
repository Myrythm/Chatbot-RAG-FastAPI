import os
import dotenv
import uuid
from datetime import datetime
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID as pgUUID
from pgvector.sqlalchemy import Vector

dotenv.load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


# --- Model User ---
class User(Base):
    __tablename__ = "users"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # 'user' or 'admin'
    is_active = Column(Boolean, default=True)

    def verify_password(self, password: str) -> bool:
        return pwd_context.verify(password, self.password_hash)

    @staticmethod
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)


# --- Model Conversation ---
class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    summary = Column(Text, nullable=True)
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )


# --- Model Message ---
class Message(Base):
    __tablename__ = "messages"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(
        pgUUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    sender_role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    timezone = Column(String, nullable=True) # New timezone column
    conversation = relationship("Conversation", back_populates="messages")


# --- Model MemoryEmbedding ---
class MemoryEmbedding(Base):
    __tablename__ = "memory_embeddings"
    id = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(pgUUID(as_uuid=True), ForeignKey("messages.id"), nullable=False)
    conversation_id = Column(
        pgUUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    user_id = Column(String, nullable=False)
    content_embedding = Column(Vector(768), nullable=False)  # Gemini embedding size
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


async def get_db():
    async with async_session() as session:
        yield session
