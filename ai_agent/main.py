import os
import uvicorn
from fastapi import FastAPI, Depends, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

from .config import AGENT_PORT, AGENT_HOST
from .security.jwt_auth import verify_jwt_token
from .graph.workflow import agent_workflow

app = FastAPI(
    title="SMS Role-Aware AI Support Agent",
    version="1.0.0",
    description="LangGraph + Dynamic RBAC + RAG Support Agent for School Management System"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User prompt or question")
    history: Optional[List[Dict[str, str]]] = Field(default=[], description="Previous chat turns")

class ChatResponse(BaseModel):
    response: str
    access_granted: bool
    requested_module: Optional[str] = None
    role_name: str
    user_id: int

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SMS AI Support Agent",
        "framework": "LangChain + LangGraph",
        "rbac_mode": "Dynamic PostgreSQL Resolution"
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    auth_payload: Dict[str, Any] = Depends(verify_jwt_token)
):
    """
    Main chat endpoint:
    1. Cryptographically derives user_id from verified JWT (never trusts user input).
    2. Runs LangGraph state graph.
    3. Returns role-governed response.
    """
    user_id = auth_payload.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID could not be identified from token."
        )

    # Initialize agent state
    initial_state = {
        "user_id": user_id,
        "raw_token": "",
        "user_context": {},
        "user_message": req.message,
        "conversation_history": req.history or [],
        "is_injection_detected": False,
        "requested_module": None,
        "access_granted": False,
        "refusal_reason": None,
        "retrieved_chunks": [],
        "final_response": "",
        "audit_logged": False
    }

    try:
        final_state = agent_workflow.invoke(initial_state)
        
        user_ctx = final_state.get("user_context", {})
        return ChatResponse(
            response=final_state.get("final_response", ""),
            access_granted=final_state.get("access_granted", False),
            requested_module=final_state.get("requested_module"),
            role_name=user_ctx.get("role_name", "Unknown"),
            user_id=user_id
        )
    except Exception as e:
        print(f"[AGENT ERROR] Execution failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent execution encountered an error: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run("ai_agent.main:app", host=AGENT_HOST, port=AGENT_PORT, reload=True)
