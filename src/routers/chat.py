import uuid
import time
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from .. import schemas, services, database as db

router = APIRouter(tags=["Chat & Conversations"])


# Chat endpoint
@router.post("/chat", response_model=schemas.ChatResponse)
async def chat(
    chat_request: schemas.ChatRequest, session: AsyncSession = Depends(db.get_db)
):
    return await services.generate_chat_response(session, chat_request)


@router.post("/chat/stream")
async def chat_stream(
    chat_request: schemas.ChatRequest, session: AsyncSession = Depends(db.get_db)
):
    # Dapatkan atau buat percakapan di sini untuk mendapatkan ID-nya
    conversation = await services.get_or_create_conversation(
        session, chat_request.user_id, chat_request.conversation_id
    )

    # Perbarui chat_request dengan conversation.id yang pasti ada
    chat_request.conversation_id = conversation.id

    generator = services.stream_chat_response(session, chat_request)

    # Tambahkan header X-Conversation-Id
    return StreamingResponse(
        generator,
        media_type="text/plain",
        headers={"X-Conversation-Id": str(conversation.id)},
    )


# CRUD Conversation endpoints
@router.get("/conversations", response_model=list[schemas.ConversationOut])
async def list_conversations(
    user_id: str,
    skip: int = 0,
    limit: int = 20,
    session: AsyncSession = Depends(db.get_db),
):
    start_time = time.time()
    result = await session.execute(
        select(db.Conversation).filter_by(user_id=user_id).offset(skip).limit(limit)
    )
    conversations = result.scalars().all()
    logging.info(f"/conversations executed in {time.time() - start_time:.3f}s")
    return conversations


@router.post("/conversations", response_model=schemas.ConversationOut)
async def create_conversation_endpoint(
    payload: schemas.ConversationCreateRequest,
    session: AsyncSession = Depends(db.get_db),
):
    conversation = await services.get_or_create_conversation(session, payload.user_id, None)
    return conversation


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID, session: AsyncSession = Depends(db.get_db)
):
    start_time = time.time()
    result = await session.execute(
        select(db.Conversation)
        .options(selectinload(db.Conversation.messages))
        .filter_by(id=conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Get all messages for this conversation (sudah eager loaded)
    messages = getattr(conversation, "messages", [])
    logging.info(
        f"/conversations/{{conversation_id}} executed in {time.time() - start_time:.3f}s"
    )
    return {
        "id": conversation.id,
        "user_id": conversation.user_id,
        "summary": conversation.summary,
        "created_at": conversation.created_at,
        "messages": messages,
    }


# FUNGSI YANG DIPERBAIKI UNTUK FITUR RENAME
@router.put("/conversations/{conversation_id}", response_model=schemas.ConversationOut)
async def update_conversation(
    conversation_id: uuid.UUID,
    payload: schemas.ConversationUpdate,  # Menggunakan skema untuk membaca JSON body
    session: AsyncSession = Depends(db.get_db),
):
    result = await session.execute(
        select(db.Conversation).filter_by(id=conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Mengambil data dari payload
    conversation.summary = payload.summary

    await session.commit()
    await session.refresh(conversation)
    return conversation


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: uuid.UUID, session: AsyncSession = Depends(db.get_db)
):
    # Hapus memory_embeddings terkait
    await session.execute(
        db.MemoryEmbedding.__table__.delete().where(
            db.MemoryEmbedding.conversation_id == conversation_id
        )
    )
    # Hapus messages terkait
    await session.execute(
        db.Message.__table__.delete().where(
            db.Message.conversation_id == conversation_id
        )
    )
    # Hapus conversation
    result = await session.execute(
        select(db.Conversation).filter_by(id=conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await session.delete(conversation)
    await session.commit()
    return {"ok": True}


@router.post("/conversations/{conversation_id}/summary")
async def generate_conversation_summary(
    conversation_id: uuid.UUID, session: AsyncSession = Depends(db.get_db)
):
    result = await session.execute(
        select(db.Conversation).filter_by(id=conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    summary = await services.generate_summary(
        session, conversation
    )
    return {"summary": summary}


@router.get("/health")
def health_check():
    return {"status": "ok"}
