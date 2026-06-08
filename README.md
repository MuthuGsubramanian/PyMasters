# PyMasters (Re-Architected)

**Web:** [www.pymasters.net](http://www.pymasters.net)

PyMasters has been completely rebuilt as a modern, high-performance web application. It features a React-based frontend for a premium, interactive user experience, and a FastAPI backend for robust logic and safe code execution.

## Architecture

*   **Frontend**: React 19 (Vite) + Tailwind CSS 4 + Axios
*   **Backend**: FastAPI + SQLite (Litestream-replicated in prod) + sandboxed code execution
*   **AI tutor (Vaathiyaar)**: Ollama Cloud (`https://ollama.com`) via `OLLAMA_API_KEY`
*   **Deployment**: Docker / Google Cloud Run (Nginx + Uvicorn under supervisord)

## Prerequisites

*   **Node.js** (v18+)
*   **Python** (v3.11+)
*   An **Ollama Cloud** API key for AI features (the rest of the app runs without it)
*   **Docker** (Optional, for production deployment)

## Fast Start (Local Development)

We have provided a launcher script for Windows:

```bash
.\start_dev.bat
```

This will launch:
1.  **Backend API** at `http://localhost:8001`
2.  **Frontend App** at `http://localhost:5173`

## Manual Start

### Backend

```bash
cd backend
cp .env.example .env          # then fill in OLLAMA_API_KEY for AI features
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

The SQLite database (`backend/pymasters.db`) is created and seeded automatically
on first start. API docs are served at `http://localhost:8001/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev                   # serves http://localhost:5173, proxies API to :8001
```

## Production Deployment ("Make it live")

To run the full stack in production mode (using Docker):

```bash
docker-compose up --build -d
```

The application will be available at `http://localhost:80` (or your domain).

### Stack Details

*   **Auth**: Custom JWT-based auth (HS256) with session revocation via token versioning.
*   **Database**: SQLite, replicated to Google Cloud Storage with Litestream in production.
*   **AI**: Vaathiyaar tutor backed by Ollama Cloud. Set `OLLAMA_API_KEY` to enable.
*   **Security**: Student code runs in an isolated subprocess with import/resource restrictions and a wall-clock timeout. For high-trust public deployment, additionally wrap the backend in a sandboxed container runtime (gVisor/Firecracker).
