from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt

from .. import schemas, services, database as db

router = APIRouter(prefix="/auth", tags=["Auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# Dependency: get current user
async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(db.get_db)
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, services.SECRET_KEY, algorithms=[services.ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await services.get_user_by_username(session, username)
    if user is None:
        raise credentials_exception
    return user


# General RBAC dependency
def require_roles(*roles):
    async def _require_roles(current_user=Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: requires role(s): {', '.join(roles)}",
            )
        return current_user

    return _require_roles


# Tetap sediakan get_current_admin untuk kompatibilitas lama
async def get_current_admin(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


@router.post("/register", response_model=schemas.UserOut)
async def register_user(
    user: schemas.UserCreate,
    session: AsyncSession = Depends(db.get_db),
    admin=Depends(get_current_admin),
):
    from ..database import User

    if await services.get_user_by_username(session, user.username):
        raise HTTPException(status_code=400, detail="Username already registered")
    user_obj = User(
        username=user.username,
        password_hash=User.get_password_hash(user.password),
        role=user.role or "user",
    )
    session.add(user_obj)
    await session.commit()
    await session.refresh(user_obj)
    return user_obj


@router.post("/login", response_model=schemas.Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(db.get_db),
):
    user = await services.authenticate_user(
        session, form_data.username, form_data.password
    )
    if not user:
        raise HTTPException(
            status_code=401, detail="Incorrect username or password"
        )
    access_token = services.create_access_token(
        data={"sub": user.username, "role": user.role}
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}


@router.get("/me", response_model=schemas.UserOut)
async def get_me(current_user=Depends(get_current_user)):
    return current_user
