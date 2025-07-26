import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pypdf import PdfReader

from .. import schemas, services, database as db
from .auth import get_current_admin, require_roles # Import dependencies from auth router

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# Endpoint upload dokumen untuk admin
@router.post("/upload", response_model=schemas.DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(db.get_db),
):
    """Upload dan proses dokumen PDF untuk RAG"""
    
    # Validasi file
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400, 
            detail="Hanya file PDF yang diperbolehkan"
        )
    
    # Buat nama file yang unik
    file_extension = file.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    
    # Simpan file
    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, unique_filename)
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Proses PDF dengan RAG
        document = await services.process_pdf_document(
            session, file_path, file.filename, admin.id
        )
        
        return document
        
    except Exception as e:
        # Cleanup jika gagal
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal memproses file: {str(e)}"
        )

@router.get("/documents", response_model=list[schemas.DocumentOut])
async def list_documents(
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(db.get_db),
):
    """List semua dokumen yang telah diupload"""
    result = await session.execute(
        select(db.Document).order_by(db.Document.uploaded_at.desc())
    )
    documents = result.scalars().all()
    
    # Add total chunks count
    for doc in documents:
        chunk_count = await session.execute(
            select(func.count(db.DocumentChunk.id))
            .filter(db.DocumentChunk.document_id == doc.id)
        )
        doc.total_chunks = chunk_count.scalar()
    
    return documents

@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: uuid.UUID,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(db.get_db),
):
    """Hapus dokumen dan semua chunk-nya"""
    result = await session.execute(
        select(db.Document).filter_by(id=document_id)
    )
    document = result.scalars().first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Hapus file fisik
    if os.path.exists(document.file_path):
        os.remove(document.file_path)
    
    # Hapus dari database (cascade akan hapus chunks)
    await session.delete(document)
    await session.commit()
    
    return {"message": "Document deleted successfully"}


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
