# PyMasters (Re-Architected)

**Web:** [www.pymasters.net](http://www.pymasters.net)

PyMasters has been completely rebuilt as a modern, high-performance web application. It features a React-based frontend for a premium, interactive user experience, and a FastAPI backend for robust logic and safe code execution.

## Architecture

*   **Frontend**: React (Vite) + Glassmorphism UI + Axios
*   **Backend**: FastAPI + DuckDB + Simulated Sandbox
*   **Deployment**: Docker Compose (Nginx + Python)

## Prerequisites

*   **Node.js** (v18+)
*   **Python** (v3.9+)
*   **Docker** (Optional, for production deployment)

## Fast Start (Local Development)

We have provided a launcher script for Windows:

```bash
.\start_dev.bat
```

This will launch:
1.  **Backend API** at `http://localhost:8000`
2.  **Frontend App** at `http://localhost:5173`

## Manual Start

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Production Deployment ("Make it live")

To run the full stack in production mode (using Docker):

```bash
docker-compose up --build -d
```

The application will be available at `http://localhost:80` (or your domain).

### Stack Details

*   **Auth**: Custom JWT-based auth (Username/Password only).
*   **Database**: DuckDB (Fast, file-based embedded SQL).
*   **AI**: Mock Instructor enabled by default. Connect to a local LLM by mimicking the OpenAI API if needed.
*   **Security**: The code execution playground currently uses a restricted `exec` environment. **For public deployment, users strictly advised to wrap the backend in a secure container environment (gVisor/Firecracker).**

## Legacy Code

The previous Streamlit version has been archived in the `/legacy_streamlit` folder.
