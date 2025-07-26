import os
import uuid
import asyncio
from jose import jwt
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain.prompts import ChatPromptTemplate
from langchain.chains import LLMChain
from langchain.text_splitter import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from . import database as db
from .database import async_session
from . import schemas
from .database import Document, DocumentChunk

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

# LangChain configuration
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Initialize LangChain models
llm = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    temperature=0.7
)

summary_llm = ChatGoogleGenerativeAI(
    model=os.getenv("GEMINI_SUMMARY_MODEL", GEMINI_MODEL),
    temperature=0.3
)

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001"
)

# Function to create embeddings
def make_embedding(text: str):
    return embeddings.embed_query(text)


# Text splitter untuk chunking dokumen
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", " ", ""]
)


# RAG Functions
async def process_pdf_document(
    session: AsyncSession, 
    file_path: str, 
    filename: str, 
    uploaded_by: uuid.UUID
) -> db.Document:
    """Proses PDF dan simpan ke database dengan chunking yang proper"""
    
    # Baca PDF
    reader = PdfReader(file_path)
    
    # Buat dokumen record
    document = db.Document(
        filename=filename,
        title=filename.replace('.pdf', ''),
        file_path=file_path,
        file_size=f"{os.path.getsize(file_path)} bytes",
        uploaded_by=uploaded_by
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    
    # Proses setiap halaman
    for page_num, page in enumerate(reader.pages, 1):
        text = page.extract_text()
        if not text.strip():
            continue
            
        # Split text menjadi chunks
        chunks = text_splitter.split_text(text)
        
        # Simpan setiap chunk
        for chunk_idx, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
                
            # Buat embedding
            embedding = make_embedding(chunk)
            
            # Buat chunk record
            chunk_record = db.DocumentChunk(
                document_id=document.id,
                chunk_index=f"page_{page_num}_chunk_{chunk_idx}",
                content=chunk,
                content_embedding=embedding,
                page_number=str(page_num)
            )
            session.add(chunk_record)
    
    await session.commit()
    return document

async def get_relevant_document_chunks(
    session: AsyncSession, 
    query: str, 
    limit: int = 5
) -> list[str]:
    """Ambil chunk dokumen yang relevan berdasarkan query"""
    
    print(f"🔍 RAG DEBUG: Searching for chunks with query: '{query}'")
    
    try:
        query_embedding = make_embedding(query)
        print(f"🔍 RAG DEBUG: Query embedding created, length: {len(query_embedding)}")
        
        # Simplified query - just get all chunks first, then order by distance
        result = await session.execute(
            select(DocumentChunk.content, DocumentChunk.content_embedding)
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(Document.is_active == True)
            .order_by(DocumentChunk.content_embedding.l2_distance(query_embedding))
            .limit(limit)
        )
        
        chunks = [row[0] for row in result.all()]
        print(f"🔍 RAG DEBUG: Found {len(chunks)} chunks")
        if chunks:
            print(f"🔍 RAG DEBUG: First chunk preview: {chunks[0][:100]}...")
        else:
            print("🔍 RAG DEBUG: No chunks found!")
            
        return chunks
        
    except Exception as e:
        print(f"🔍 RAG DEBUG: Error in get_relevant_document_chunks: {e}")
        return []


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

    # Create new conversation if not found
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
    # Return in chronological order
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


# LangChain prompt templates
chat_prompt = ChatPromptTemplate.from_messages([
    ("system", """Kamu adalah asisten AI yang cerdas, ramah, dan sangat membantu. Kamu memiliki kemampuan untuk:

1. Memberikan jawaban yang akurat dan informatif
2. Berkomunikasi dengan sopan dan profesional
3. Menggunakan konteks dari percakapan sebelumnya untuk memberikan respons yang relevan
4. Mengingat informasi penting dari percakapan masa lalu pengguna
5. Memberikan saran yang bermanfaat dan praktis
6. Menjelaskan hal-hal kompleks dengan cara yang mudah dipahami

Gaya komunikasi kamu:
- Ramah tapi tetap profesional
- Jelas dan mudah dipahami
- Responsif terhadap kebutuhan pengguna
- Menggunakan bahasa Indonesia yang baik dan benar
- Memberikan contoh atau analogi jika diperlukan
- Tidak perlu berterimakasih diawal jawaban kamu
- Jika pengguna meminta informasi lebih lanjut, tawarkan untuk mencari informasi lebih lanjut

Jika kamu tidak yakin tentang sesuatu, jujur mengatakannya dan tawarkan untuk mencari informasi lebih lanjut."""),
    ("human", """{memories_text}

Riwayat percakapan saat ini:
{chat_history}

Pesan pengguna: {user_message}

Berikan respons yang membantu, relevan, dan sesuai dengan konteks percakapan di atas.""")
])

summary_prompt = ChatPromptTemplate.from_messages([
    ("system", """Kamu adalah ahli dalam membuat judul yang ringkas dan informatif. Tugas kamu adalah membuat satu judul singkat (maksimal 7 kata) yang paling relevan dan mewakili konteks percakapan.

Panduan:
- Gunakan kata-kata yang spesifik dan deskriptif
- Hindari kata-kata umum seperti "percakapan" atau "chat"
- Fokus pada topik utama yang dibahas
- Gunakan bahasa Indonesia yang baik
- Jangan tambahkan tanda kutip atau format khusus
- Hanya berikan judul saja, tanpa penjelasan tambahan

Contoh judul yang baik:
- "Cara Membuat Website dengan React"
- "Tips Investasi Saham untuk Pemula"
- "Resep Masakan Nusantara"
- "Troubleshooting Laptop Lambat"

Contoh judul yang kurang baik:
- "Percakapan tentang teknologi"
- "Chat dengan asisten"
- "Pertanyaan dan jawaban"""),
    ("human", "Buatkan judul untuk percakapan berikut:\n\n{chat_content}")
])

substantive_prompt = ChatPromptTemplate.from_messages([
    ("system", """Kamu adalah sistem yang mengevaluasi apakah konten percakapan cukup substantif untuk dibuatkan ringkasan yang bermakna.

Kriteria konten SUBSTANTIF (jawab 'YES'):
- Berisi pertanyaan spesifik yang memerlukan penjelasan
- Membahas topik atau konsep tertentu
- Meminta saran, rekomendasi, atau bantuan teknis
- Berisi informasi atau pengetahuan yang bisa diringkas
- Memiliki nilai edukatif atau informatif

Kriteria konten TIDAK SUBSTANTIF (jawab 'NO'):
- Salam atau ucapan sederhana (halo, selamat pagi, dll)
- Ucapan terima kasih tanpa konteks tambahan
- Konfirmasi sederhana (ok, baik, setuju)
- Emoji atau reaksi tanpa teks
- Pesan yang terlalu pendek dan tidak informatif

Instruksi:
- Analisis konten dengan cermat
- Pertimbangkan konteks dan nilai informatif
- Jawab hanya dengan 'YES' atau 'NO'
- Tidak ada penjelasan tambahan"""),
    ("human", "Evaluasi apakah konten berikut substantif untuk dibuatkan ringkasan:\n\n{content}")
])

# Create LangChain chains
chat_chain = LLMChain(llm=llm, prompt=chat_prompt)
summary_chain = LLMChain(llm=summary_llm, prompt=summary_prompt)
substantive_chain = LLMChain(llm=summary_llm, prompt=substantive_prompt)

# Update chat prompt untuk include dokumen
rag_chat_prompt = ChatPromptTemplate.from_messages([
    ("system", """Kamu adalah asisten AI yang cerdas, ramah, dan sangat membantu. Kamu memiliki kemampuan untuk:

1. Memberikan jawaban yang akurat dan informatif berdasarkan pengetahuan umum
2. Menggunakan informasi dari dokumen yang telah diupload untuk memberikan jawaban yang lebih spesifik dan akurat
3. Berkomunikasi dengan sopan dan profesional
4. Menggunakan konteks dari percakapan sebelumnya untuk memberikan respons yang relevan
5. Mengingat informasi penting dari percakapan masa lalu pengguna
6. Memberikan saran yang bermanfaat dan praktis
7. Menjelaskan hal-hal kompleks dengan cara yang mudah dipahami

Gaya komunikasi kamu:
- Ramah tapi tetap profesional
- Jelas dan mudah dipahami
- Responsif terhadap kebutuhan pengguna
- Menggunakan bahasa Indonesia yang baik dan benar
- Memberikan contoh atau analogi jika diperlukan
- Tidak perlu berterimakasih diawal jawaban kamu
- Jika pengguna meminta informasi lebih lanjut, tawarkan untuk mencari informasi lebih lanjut

Jika kamu tidak yakin tentang sesuatu, jujur mengatakannya dan tawarkan untuk mencari informasi lebih lanjut.

Ketika menggunakan informasi dari dokumen, selalu sebutkan sumbernya dengan sopan."""),
    ("human", """{document_context}

{memories_text}

Riwayat percakapan saat ini:
{chat_history}

Pesan pengguna: {user_message}

Berikan respons yang membantu, relevan, dan sesuai dengan konteks percakapan di atas. Jika ada informasi dari dokumen yang relevan, gunakan informasi tersebut untuk memberikan jawaban yang lebih akurat.""")
])

# Create RAG chat chain
rag_chat_chain = LLMChain(llm=llm, prompt=rag_chat_prompt)

async def is_substantive_content(content: str) -> bool:
    """Uses LangChain to determine if the content is substantive enough for a summary."""
    try:
        result = await asyncio.wait_for(
            substantive_chain.arun(content=content), timeout=5
        )
        result = result.strip().upper()
        return result == "YES"
    except Exception as e:
        return False


async def generate_summary(
    session, conversation, user_message_content: str = None
):
    # Use LangChain to check if current message is substantive
    is_current_message_substantive = await is_substantive_content(user_message_content)

    # Case 1: A meaningful summary already exists. Do not update.
    if (
        conversation.summary
        and conversation.summary.strip() != ""
        and conversation.summary.strip().lower() != "new conversation"
    ):
        return conversation.summary

    # Case 2: Conversation is new AND current message is NOT substantive.
    if not is_current_message_substantive and (
        not conversation.summary
        or conversation.summary.strip().lower() == "new conversation"
    ):
        if not conversation.summary or conversation.summary.strip() == "":
            conversation.summary = "New Conversation"
            await session.commit()
        return conversation.summary

    # Case 3: Conversation is new AND current message IS substantive.
    if (
        not conversation.summary
        or conversation.summary.strip().lower() == "new conversation"
    ) and is_current_message_substantive:
        try:
            all_msgs = await get_chat_history(session, conversation.id, limit=100)

            # Use LangChain to check if the entire history is substantive
            chat_lines = " | ".join(
                [f"{msg.sender_role}: {msg.content}" for msg in all_msgs]
            )
            is_history_substantive = await is_substantive_content(chat_lines)

            if not is_history_substantive:
                conversation.summary = "New Conversation"
                await session.commit()
                return conversation.summary

            # Generate summary using LangChain
            new_summary = await asyncio.wait_for(
                summary_chain.arun(chat_content=chat_lines), timeout=10
            )
            new_summary = new_summary.strip().replace("\n", " ")

            if new_summary and new_summary.strip() != "":
                conversation.summary = new_summary
                await session.commit()
                return new_summary
            else:
                if not conversation.summary:
                    conversation.summary = "New Conversation"
                    await session.commit()
                return conversation.summary

        except Exception as e:
            if not conversation.summary:
                conversation.summary = "New Conversation"
                await session.commit()
            return conversation.summary

    # Fallback: If none of the above conditions are met, return the current summary.
    return conversation.summary



async def generate_chat_response(
    session: AsyncSession, chat_request: schemas.ChatRequest
) -> schemas.ChatResponse:
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
    
    # Get relevant document chunks
    document_chunks = await get_relevant_document_chunks(
        session, chat_request.message, limit=3
    )
    
    # Prepare inputs for LangChain
    memories_text = ""
    if memories:
        memories_text = "Ingat percakapan relevan ini dari masa lalu:\n" + "\n".join([f"- {mem}" for mem in memories])
    
    document_context = ""
    if document_chunks:
        document_context = "Informasi relevan dari dokumen:\n" + "\n".join([f"- {chunk}" for chunk in document_chunks])
    
    print(f"🔍 RAG DEBUG: Document context length: {len(document_context)}")
    if document_context:
        print(f"🔍 RAG DEBUG: Document context preview: {document_context[:200]}...")
    else:
        print("🔍 RAG DEBUG: No document context!")
    
    chat_history = "\n".join([f"{msg.sender_role}: {msg.content}" for msg in history])
    
    ai_response = None
    error_msg = None
    
    try:
        # Use LangChain to generate response
        ai_response = await asyncio.wait_for(
            rag_chat_chain.arun(
                document_context=document_context,
                memories_text=memories_text,
                chat_history=chat_history,
                user_message=chat_request.message
            ), timeout=15
        )
    except asyncio.TimeoutError:
        error_msg = "AI response timeout. Please try again."
    except Exception as e:
        error_msg = f"AI error: {str(e)}"
    
    if ai_response:
        await add_message_to_db(session, conversation.id, "assistant", ai_response, chat_request.timezone)
    else:
        ai_response = error_msg or "Unknown error."
    
    summary = await generate_summary(session, conversation, chat_request.message)
    
    # Background embedding task
    asyncio.create_task(
        background_embedding_only(session, user_message, conversation, chat_request)
    )
    
    return schemas.ChatResponse(
        conversation_id=conversation.id, response=ai_response, summary=summary
    )


# Background function for embedding only
async def background_embedding_only(
    _, user_message, conversation, chat_request
):
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
            pass


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
    
    # Get relevant document chunks
    document_chunks = await get_relevant_document_chunks(
        session, chat_request.message, limit=3
    )
    
    # Prepare inputs for LangChain
    memories_text = ""
    if memories:
        memories_text = "Ingat percakapan relevan ini dari masa lalu:\n" + "\n".join([f"- {mem}" for mem in memories])
    
    document_context = ""
    if document_chunks:
        document_context = "Informasi relevan dari dokumen:\n" + "\n".join([f"- {chunk}" for chunk in document_chunks])
    
    print(f"🔍 RAG DEBUG STREAM: Document context length: {len(document_context)}")
    if document_context:
        print(f"🔍 RAG DEBUG STREAM: Document context preview: {document_context[:200]}...")
    else:
        print("🔍 RAG DEBUG STREAM: No document context!")
    
    chat_history = "\n".join([f"{msg.sender_role}: {msg.content}" for msg in history])
    
    ai_response = ""
    
    try:
        # Use LangChain streaming with RAG
        async for chunk in llm.astream(
            rag_chat_prompt.format_messages(
                document_context=document_context,
                memories_text=memories_text,
                chat_history=chat_history,
                user_message=chat_request.message
            )
        ):
            if chunk.content:
                ai_response += chunk.content
                yield chunk.content
            
    except Exception as e:
        yield f"[STREAM ERROR] {str(e)}"

    if ai_response:
        await add_message_to_db(session, conversation.id, "assistant", ai_response, chat_request.timezone)
        await generate_summary(session, conversation, chat_request.message)
    
    asyncio.create_task(
        background_embedding_only(session, user_message, conversation, chat_request)
    )