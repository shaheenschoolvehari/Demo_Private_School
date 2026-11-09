from typing import TypedDict, List, Dict, Any, Optional

class AgentState(TypedDict):
    # Verified user credentials
    user_id: int
    raw_token: str
    user_context: Dict[str, Any]
    
    # User query and conversation context
    user_message: str
    conversation_history: List[Dict[str, str]]
    
    # Security & RBAC Guard evaluation
    is_injection_detected: bool
    requested_module: Optional[str]
    access_granted: bool
    refusal_reason: Optional[str]
    
    # Retrieved role-permitted context
    retrieved_chunks: List[Dict[str, Any]]

    # Live Database Tool execution
    tool_intent: Optional[str]
    tool_result: Optional[Dict[str, Any]]
    
    # Final output
    final_response: str
    audit_logged: bool

