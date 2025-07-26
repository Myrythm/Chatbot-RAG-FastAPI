from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# User schemas
class UserBase(BaseModel):
    username: str
    role: Optional[str] = "user"


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(UserBase):
    id: uuid.UUID
    is_active: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_id: Optional[uuid.UUID] = None
    timezone: Optional[str] = None


class ConversationCreateRequest(BaseModel):
    user_id: str
    summary: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    response: str
    summary: Optional[str] = None


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_role: str
    content: str
    created_at: datetime
    timezone: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: uuid.UUID
    user_id: str
    summary: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: uuid.UUID
    user_id: str
    summary: Optional[str]
    created_at: datetime
    messages: List[MessageOut]

    class Config:
        from_attributes = True


#  RENAME
class ConversationUpdate(BaseModel):
    summary: str


# Document schemas
class DocumentBase(BaseModel):
    filename: str
    title: Optional[str] = None
    file_size: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentOut(DocumentBase):
    id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_at: datetime
    is_active: bool
    total_chunks: Optional[int] = 0

    class Config:
        from_attributes = True

class DocumentChunkOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: str
    content: str
    page_number: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
