import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pypdf import PdfReader

from .. import schemas, services, database as db
from .auth import get_current_admin, require_roles # Import dependencies from auth router

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# Endpoint upload dokumen untuk admin
@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(db.get_db),
):
    # Simpan file ke folder uploads
    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads") # Adjust path
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Proses PDF: ekstrak teks, split per halaman, buat embedding, simpan ke MemoryEmbedding
    if file.filename.lower().endswith(".pdf"):
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                # Simpan ke MemoryEmbedding sebagai "dokumen" milik admin
                embedding = services.make_embedding(text)
                mem = db.MemoryEmbedding(
                    message_id=None,
                    conversation_id=None,
                    user_id=str(admin.id),
                    content_embedding=embedding,
                    created_at=None,
                )
                session.add(mem)
        await session.commit()
        return {
            "filename": file.filename,
            "status": "uploaded & indexed",
            "pages": len(reader.pages),
        }
    else:
        return {
            "filename": file.filename,
            "status": "uploaded (non-pdf, tidak di-index)",
        }


@router.get(
    "/users",
    response_model=list[schemas.UserOut],
    status_code=status.HTTP_200_OK,
)
async def admin_list_users(
    session: AsyncSession = Depends(db.get_db), admin=Depends(require_roles("admin"))
):
    result = await session.execute(select(db.User))
    users = result.scalars().all()
    return users


@router.put(
    "/users/{user_id}",
    response_model=schemas.UserOut,
    status_code=status.HTTP_200_OK,
)
async def admin_update_user(
    user_id: uuid.UUID,
    payload: schemas.UserUpdate,
    session: AsyncSession = Depends(db.get_db),
    admin=Depends(require_roles("admin")),
):
    result = await session.execute(select(db.User).filter_by(id=user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.username:
        user.username = payload.username
    if payload.password:
        user.password_hash = db.User.get_password_hash(payload.password)
    if payload.role:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(db.get_db),
    admin=Depends(require_roles("admin")),
):
    result = await session.execute(select(db.User).filter_by(id=user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await session.delete(user)
    await session.commit()
    return
