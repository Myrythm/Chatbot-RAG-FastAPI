import dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .routers import auth, admin, chat, frontend # Import routers

dotenv.load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="src/static"), name="static")

# Include routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(frontend.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}