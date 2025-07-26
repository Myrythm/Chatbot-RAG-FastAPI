# RAG-Enhanced Chatbot with Google Gemini and FastAPI

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-316192?logo=postgresql)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-latest-667eea?logo=postgresql)](https://github.com/pgvector/pgvector)
[![Google Gemini API](https://img.shields.io/badge/Google%20Gemini%20API-latest-f4b400?logo=google)](https://ai.google.dev/gemini-api)
[![Docker](https://img.shields.io/badge/Docker-24.0.5-0db7ed?logo=docker)](https://www.docker.com/)

This project is a robust and interactive AI chatbot implementation using the Google Gemini API, powered by an efficient FastAPI backend, a PostgreSQL database for data storage, and the pgvector extension for similarity search on memory embeddings. The frontend is built with pure HTML, CSS, and JavaScript for a responsive and modern user experience.

## Key Features

- **Interactive AI Chat**: Interact with the Gemini AI model for various questions and tasks.
- **Streaming Responses**: A smooth chat experience with real-time streamed AI responses.
- **Conversation Management**:
  - Create new conversations.
  - View conversation history.
  - Rename conversations.
  - Delete conversations.
- **Conversation Memory**: Utilizes pgvector to store message embeddings and retrieve relevant memories from past conversations, providing better context to the AI.
- **Document Knowledge Base (PDF Upload)**: Upload PDF documents through the admin panel.
- **Automatic Timezone Detection**: Automatically detects and stores the user's timezone for accurate chat history.
- **Admin Panel**: Interface for managing users and uploading knowledge documents (login as `admin` with password `admin123` after setup).
- **Responsive Design**: Clean and modern user interface, optimized for both desktop and mobile devices.
- **Dark/Light Mode**: Toggle between light and dark themes in chatbot section.
- **Containerized with Docker Compose**: Easy setup and deployment using Docker Compose.

## Technologies Used

- **Backend**:
  - **FastAPI**: A modern, fast (high-performance) web framework for building APIs with Python.
  - **SQLAlchemy**: An Object Relational Mapper (ORM) for database interaction.
  - **asyncpg**: An asynchronous PostgreSQL driver.
  - **pgvector**: A PostgreSQL extension for storing and querying vector embeddings.
  - **LangChain**: Framework for building RAG pipelines and LLM applications.
  - **PyPDF**: Lightweight PDF parser used for document ingestion.
  - **Google Generative AI SDK**: For interacting with Gemini models.
  - **python-dotenv**: For managing environment variables.
  - **passlib**: For password hashing.
  - **python-jose**: For JWT authentication.
- **Database**:
  - **PostgreSQL**: A powerful, open-source relational database system.
- **Frontend**:
  - **HTML5, CSS3, JavaScript (Vanilla JS)**: For the user interface.
  - **Bootstrap 5**: For some basic utilities.
- **Deployment**:
  - **Docker & Docker Compose**: For container orchestration.

## Prerequisites

Ensure you have the following installed on your system:

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Engine and Docker Compose)

## Project Structure

```
.
├── .env                  # Environment variables
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile            # Docker image definition for the backend
├── requirements.txt      # Python dependencies
└── src/
    ├── create_admin.py   # Script to create an admin user
    ├── database.py       # SQLAlchemy model definitions and DB connection
    ├── init_db.py        # Script for database initialization/reset
    ├── main.py           # Main FastAPI application
    ├── schemas.py        # Pydantic schemas for data validation
    ├── services.py       # Core business logic (AI interaction, DB)
    ├── routers/          # Modules for API endpoints
    │   ├── admin.py
    │   ├── auth.py
    │   ├── chat.py
    │   └── frontend.py
    └── static/           # Static files (HTML, CSS, JS for frontend)
        ├── admin/
        │   ├── admin.html
        │   ├── admin.js
        │   └── admin.css
        ├── chat/
        │   ├── index.html
        │   ├── script.js
        │   └── style.css
        └── login/
            ├── login.html
            ├── login.js
            └── login.css
    └── uploads/          # Uploaded PDF documents
```

## Setup Guide

Follow these steps to get the project running locally:

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/gemini-chatbot-fastapi.git
cd gemini-chatbot-fastapi
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory of your project and populate it with the following variables:

```dotenv
# Google Gemini API Key
# Get it from Google AI Studio: https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY

# PostgreSQL Database Configuration
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=chatbot_db
DATABASE_URL=postgresql+asyncpg://user:password@db:5432/chatbot_db

# JWT Secret Key (Replace with a strong, random string!)
JWT_SECRET_KEY=supersecretkeyyangkuatdanacak

# Gemini model to use
GEMINI_MODEL=models/gemini-2.5-flash
EMBEDDING_MODEL=models/embedding-001
```

**Important**: Replace `YOUR_GEMINI_API_KEY` with your actual Gemini API key. For `JWT_SECRET_KEY`, it is highly recommended to generate a strong, random string for production environments.

### 3. Build and Run Docker Containers

From the project root directory, run the following command to build the Docker images and start the services:

```bash
docker compose up --build -d
```

This will build the `backend` image and start the `db` (PostgreSQL with pgvector) and `backend` (FastAPI application) containers.

### 4. Initialize the Database

Since this project uses `Base.metadata.create_all` to create tables (instead of migrations like Alembic), you need to run the database initialization script.

**Important**: This step will **delete all existing data** in your database if tables already exist.

```bash
# Ensure the database container is running
docker compose up -d db

# Wait a moment (e.g., 10 seconds) for the database to be ready
# You can add a sleep in your shell script if needed, or run manually

# Run the database initialization script inside the backend container
docker compose run --rm backend python src/init_db.py
```

Upon successful execution, you will see output like `Database tables created.`

### 5. Create an Admin User

To access the admin panel, you need to create an admin user. The following script will create an `admin` user with the password `admin123`.

```bash
docker compose run --rm backend python src/create_admin.py
```

You will see the output `Admin created: admin`.

### 6. Restart the Backend Application

After database initialization and admin user creation, restart the backend service to ensure all changes are properly applied:

```bash
docker compose restart backend
```

## Usage

Once all setup steps are complete, your application will be running in Docker.

- **Admin Panel**: Access at `http://localhost:8000/admin` (Login with `admin` / `admin123`)
- **Chatbot Application**: Access at `http://localhost:8000/chat`

### Using the Admin Panel

1.  Log in as admin and you will be redirected to `http://localhost:8000/admin` in your browser.
2.  You can view and manage users here.
3.  You can provide PDF documents to improve the chatbot’s knowledge through RAG.

### Using the Chatbot

1.  Log in as user and you will be redirected to `http://localhost:8000/chat` in your browser.
2.  You will see an engaging welcome screen. Type your message in the input box at the bottom to start a conversation.
3.  Each new message will start a new conversation if you haven't selected one from the history.
4.  Your conversation history will appear in the left sidebar. You can click on a history item to resume a previous conversation, rename it, or delete it.
