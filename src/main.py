import dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os

from .routers import auth, admin, chat, frontend # Import routers

dotenv.load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="src/static"), name="static")

# Include routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(frontend.router)

# Custom handler to show themed UI for unauthorized access

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    # Serve custom HTML for 401/403 when browser requests HTML
    if exc.status_code in {401, 403} and "text/html" in request.headers.get("accept", ""):
        error_page_path = os.path.join(os.path.dirname(__file__), "static", "error", "401.html")
        try:
            with open(error_page_path, encoding="utf-8") as f:
                return HTMLResponse(f.read(), status_code=exc.status_code)
        except FileNotFoundError:
            # Fallback JSON if template missing
            pass
    # Fallback to default JSON response
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.get("/health")
def health_check():
    return {"status": "ok"}