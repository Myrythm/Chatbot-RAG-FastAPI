import os
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from .auth import get_current_user, get_current_admin

router = APIRouter(tags=["Frontend"])

def serve_html(filename, subdir=None):
    # Always serve from the correct subfolder for each page
    base = os.path.join(os.path.dirname(__file__), "..", "static") # Adjust path
    if subdir:
        html_path = os.path.join(base, subdir, filename)
    else:
        html_path = os.path.join(base, filename)
    with open(html_path, encoding="utf-8") as f:
        return f.read()


@router.get("/", response_class=HTMLResponse)
def root():
    return serve_html("login.html", subdir="login")


@router.get("/admin", response_class=HTMLResponse)
def serve_admin(current_admin=Depends(get_current_admin)):
    return serve_html("admin.html", subdir="admin")


@router.get("/chat", response_class=HTMLResponse)
def serve_chat(current_user=Depends(get_current_user)):
    return serve_html("index.html", subdir="chat")
