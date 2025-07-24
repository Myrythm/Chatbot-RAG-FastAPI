import os
import uuid
import asyncio
import google.generativeai as genai
from jose import jwt
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from . import database as db
from . import schemas

# JWT config
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def authenticate_user(session: AsyncSession, username: str, password: str):
    result = await session.execute(select(db.User).filter_by(username=username))
    user = result.scalars().first()
    if user and user.verify_password(password):
        return user
    return None


async def get_user_by_username(session: AsyncSession, username: str):
    result = await session.execute(select(db.User).filter_by(username=username))
    return result.scalars().first()

# Konfigurasi Gemini API
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Ambil nama model dari environment variables
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_SUMMARY_MODEL = os.getenv("GEMINI_SUMMARY_MODEL", GEMINI_MODEL)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/embedding-001")


# Fungsi untuk membuat embedding
def make_embedding(text: str):
    return genai.embed_content(model=EMBEDDING_MODEL, content=text)["embedding"]


async def get_or_create_conversation(
    session: AsyncSession, user_id: str, conversation_id: uuid.UUID | None
) -> db.Conversation:
    if conversation_id:
        result = await session.execute(
            select(db.Conversation).filter_by(id=conversation_id, user_id=user_id)
        )
        conversation = result.scalars().first()
        if conversation:
            return conversation

    # Jika tidak ada atau tidak ditemukan, buat baru
    new_conversation = db.Conversation(user_id=user_id)
    session.add(new_conversation)
    await session.commit()
    await session.refresh(new_conversation)
    return new_conversation


async def add_message_to_db(
    session: AsyncSession, conversation_id: uuid.UUID, role: str, content: str, timezone: str | None = None
) -> db.Message:
    new_message = db.Message(
        conversation_id=conversation_id, sender_role=role, content=content, timezone=timezone
    )
    session.add(new_message)
    await session.commit()
    await session.refresh(new_message)
    return new_message


async def get_chat_history(
    session: AsyncSession, conversation_id: uuid.UUID, limit: int = 10
):
    result = await session.execute(
        select(db.Message)
        .filter_by(conversation_id=conversation_id)
        .order_by(db.Message.created_at.desc())
        .limit(limit)
    )
    # Return dalam urutan kronologis
    return list(reversed(result.scalars().all()))


async def get_relevant_memories(
    session: AsyncSession, user_id: str, conversation_id: uuid.UUID, query: str, limit: int = 3
):
    query_embedding = make_embedding(query)
    result = await session.execute(
        select(db.Message.content)
        .join(db.MemoryEmbedding, db.Message.id == db.MemoryEmbedding.message_id)
        .filter(db.MemoryEmbedding.user_id == user_id, db.MemoryEmbedding.conversation_id == conversation_id)
        .order_by(db.MemoryEmbedding.content_embedding.l2_distance(query_embedding))
        .limit(limit)
    )
    return [row[0] for row in result.all()]


# --- UTILITAS PROMPT DAN SUMMARY ---
def build_prompt(memories, history):
    prompt_parts = ["Kamu adalah asisten yang membantu dan ramah."]
    if memories:
        prompt_parts.append("\nIngat percakapan relevan ini dari masa lalu:")
        for mem in memories:
            prompt_parts.append(f"- {mem}")
    prompt_parts.append("\nIni adalah riwayat percakapan saat ini:")
    chat_history_for_prompt = [f"{msg.sender_role}: {msg.content}" for msg in history]
    prompt_parts.extend(chat_history_for_prompt)
    return "\n".join(prompt_parts)


async def is_substantive_content(content: str, model_name: str) -> bool:
    """Uses Gemini to determine if the content is substantive enough for a summary."""
    prompt = (
        "Given the following chat message(s), determine if the content is substantive enough to generate a meaningful conversation summary. "
        "Respond with 'YES' if it is substantive, and 'NO' if it is a greeting, a simple acknowledgment, or a non-substantive response. "
        "Your response must be either 'YES' or 'NO'.\n\nMessages: "
        + content
    )
    try:
        model = genai.GenerativeModel(model_name)
        response = await asyncio.wait_for(model.generate_content_async(prompt), timeout=5)
        result = response.text.strip().upper()
        print(f"[DEBUG SUBSTANTIVE] Content: '{content}', Gemini response: '{result}'")
        return result == "YES"
    except Exception as e:
        print(f"[DEBUG SUBSTANTIVE ERROR] Failed to check substantive content: {e}")
        return False # Default to non-substantive on error


async def generate_summary(
    session, conversation, summary_model_name, user_message_content: str = None
):
    print(f"[DEBUG SUMMARY] User message: '{user_message_content}'")
    print(f"[DEBUG SUMMARY] Initial conversation summary: '{conversation.summary}'")

    # Remove hardcoded lists
    # common_greetings = [...]
    # non_substantive_responses = [...]

    # Use Gemini to check if current message is substantive
    is_current_message_substantive = await is_substantive_content(user_message_content, summary_model_name)
    print(f"[DEBUG SUMMARY] Is current message substantive? {is_current_message_substantive}")

    # Case 1: A meaningful summary already exists. Do not update.
    if (
        conversation.summary
        and conversation.summary.strip() != ""
        and conversation.summary.strip().lower() != "new conversation"
    ):
        print("[DEBUG SUMMARY] Case 1: Meaningful summary exists. Returning existing.")
        return conversation.summary

    # Case 2: Conversation is new (no summary or "New Conversation") AND current message is NOT substantive.
    # Set/keep "New Conversation" as summary.
    if not is_current_message_substantive and (
        not conversation.summary
        or conversation.summary.strip().lower() == "new conversation"
    ):
        print("[DEBUG SUMMARY] Case 2: Not substantive and new/default summary. Setting to 'New Conversation'.")
        if (
            not conversation.summary or conversation.summary.strip() == ""
        ):  # Only commit if it was truly empty
            conversation.summary = "New Conversation"
            await session.commit()
            print("[DEBUG SUMMARY] Committed 'New Conversation'.")
        return conversation.summary

    # Case 3: Conversation is new (no summary or "New Conversation") AND current message IS substantive.
    # This is when we want to generate the first meaningful summary.
    if (
        not conversation.summary
        or conversation.summary.strip().lower() == "new conversation"
    ) and is_current_message_substantive:
        print("[DEBUG SUMMARY] Case 3: Substantive and new/default summary. Generating new summary.")
        try:
            all_msgs = await get_chat_history(session, conversation.id, limit=100)

            # Use Gemini to check if the entire history is substantive
            chat_lines = " | ".join(
                [f"{msg.sender_role}: {msg.content}" for msg in all_msgs]
            )
            is_history_substantive = await is_substantive_content(chat_lines, summary_model_name)

            if not is_history_substantive:
                print("[DEBUG SUMMARY] History not yet substantive. Keeping 'New Conversation'.")
                conversation.summary = "New Conversation"
                await session.commit()
                return conversation.summary

            summary_model = genai.GenerativeModel(summary_model_name)

            chat_lines = " | ".join(
                [f"{msg.sender_role}: {msg.content}" for msg in all_msgs]
            )
            summary_prompt = (
                "Buatkan satu judul singkat (maksimal 7 kata) yang paling relevan dan mewakili konteks percakapan berikut, tanpa teks tambahan atau daftar pilihan. Hanya berikan judulnya saja: "
                + chat_lines
            )
            summary_resp = await summary_model.generate_content_async(summary_prompt)
            new_summary = summary_resp.text.strip().replace("\n", " ")
            print(f"[DEBUG SUMMARY] Generated new summary: {new_summary}")

            if new_summary and new_summary.strip() != "":
                conversation.summary = new_summary
                await session.commit()
                print("[DEBUG SUMMARY] Committed new summary.")
                return new_summary
            else:
                # If generated summary is empty, keep "New Conversation" or existing if any
                print("[DEBUG SUMMARY] Generated summary was empty. Keeping 'New Conversation'.")
                if not conversation.summary:
                    conversation.summary = "New Conversation"
                    await session.commit()
                    print("[DEBUG SUMMARY] Committed 'New Conversation' due to empty generated summary.")
                return conversation.summary

        except Exception as e:
            print("[DEBUG SUMMARY] [Summary Error]", e)
            if not conversation.summary:
                conversation.summary = "New Conversation"
                await session.commit()
                print("[DEBUG SUMMARY] Committed 'New Conversation' due to error.")
            return conversation.summary

    # Fallback: If none of the above conditions are met, return the current summary.
    print("[DEBUG SUMMARY] Fallback: Returning current summary.")
    return conversation.summary



async def generate_chat_response(
    session: AsyncSession, chat_request: schemas.ChatRequest
) -> schemas.ChatResponse:
    print(f"[DEBUG CHAT] generate_chat_response called for user: {chat_request.user_id}, message: {chat_request.message}")
    conversation = await get_or_create_conversation(
        session, chat_request.user_id, chat_request.conversation_id
    )
    user_message = await add_message_to_db(
        session, conversation.id, "user", chat_request.message, chat_request.timezone
    )
    history = await get_chat_history(session, conversation.id, limit=20)
    memories = await get_relevant_memories(
        session, chat_request.user_id, conversation.id, chat_request.message, limit=1
    )
    prompt = build_prompt(memories, history)
    ai_response = None
    error_msg = None
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = await asyncio.wait_for(
            model.generate_content_async(prompt), timeout=15
        )
        ai_response = response.text
    except asyncio.TimeoutError:
        error_msg = "AI response timeout. Please try again."
    except Exception as e:
        error_msg = f"AI error: {str(e)}"
    if ai_response:
        await add_message_to_db(session, conversation.id, "assistant", ai_response, chat_request.timezone)
    else:
        ai_response = error_msg or "Unknown error."
    summary = await generate_summary(
        session, conversation, GEMINI_SUMMARY_MODEL, chat_request.message
    )
    asyncio.create_task(
        background_embedding_only(session, user_message, conversation, chat_request)
    )
    return schemas.ChatResponse(
        conversation_id=conversation.id, response=ai_response, summary=summary
    )


# Fungsi background hanya untuk embedding
async def background_embedding_only(
    session_unused, user_message, conversation, chat_request
):
    from .database import async_session

    async with async_session() as session:
        try:
            embedding = make_embedding(chat_request.message)
            new_memory = db.MemoryEmbedding(
                message_id=user_message.id,
                conversation_id=conversation.id,
                user_id=chat_request.user_id,
                content_embedding=embedding,
            )
            session.add(new_memory)
            await session.commit()
        except Exception as e:
            print("[Embedding Error]", e)


async def stream_chat_response(
    session: AsyncSession, chat_request: schemas.ChatRequest
):
    conversation = await get_or_create_conversation(
        session, chat_request.user_id, chat_request.conversation_id
    )
    user_message = await add_message_to_db(
        session, conversation.id, "user", chat_request.message, chat_request.timezone
    )
    history = await get_chat_history(session, conversation.id, limit=3)
    memories = await get_relevant_memories(
        session, chat_request.user_id, conversation.id, chat_request.message, limit=1
    )
    prompt = build_prompt(memories, history)
    model = genai.GenerativeModel(GEMINI_MODEL)
    stream = model.generate_content(prompt, stream=True)
    ai_response = ""

    try:
        for chunk in stream:
            # ✨ FIX: Wrap the text access in its own try/except block.
            # This will safely ignore the final empty chunk that causes the error.
            try:
                text_part = chunk.text
                ai_response += text_part
                yield text_part
            except (ValueError, IndexError):
                # This chunk has no text part, so we just ignore it and continue.
                pass
            
            await asyncio.sleep(0) # Keep yielding control
            
    except Exception as e:
        # This will now catch other, more serious stream-level errors.
        yield f"[STREAM ERROR] {str(e)}"

    if ai_response:
        await add_message_to_db(session, conversation.id, "assistant", ai_response, chat_request.timezone)
        await generate_summary(
            session, conversation, GEMINI_SUMMARY_MODEL, chat_request.message
        )
    
    asyncio.create_task(
        background_embedding_only(session, user_message, conversation, chat_request)
    )