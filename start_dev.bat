@echo off
echo Starting PyMasters Development Environment...

start "PyMasters Backend" cmd /k "cd backend && set DB_PATH=pymasters.db && set JWT_SECRET=local-dev-secret-not-for-prod && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001"
timeout /t 3
start "PyMasters Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Services started!
echo Frontend: http://localhost:5173 (check terminal for actual port)
echo Backend:  http://localhost:8001
echo.
echo Press any key to exit this launcher (services will keep running).
pause
