@echo off
echo ========================================================
echo Starting School Management System AI Support Agent...
echo Framework: LangChain + LangGraph + Dynamic PostgreSQL RBAC
echo ========================================================

IF EXIST "venv\Scripts\python.exe" (
    venv\Scripts\python.exe -m uvicorn ai_agent.main:app --host 127.0.0.1 --port 8000 --reload
) ELSE (
    python -m uvicorn ai_agent.main:app --host 127.0.0.1 --port 8000 --reload
)
