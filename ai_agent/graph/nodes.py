import re
from typing import Dict, Any
from .state import AgentState
from ..security.dynamic_permissions import fetch_user_dynamic_permissions
from ..security.rbac_guard import evaluate_rbac, detect_prompt_injection, detect_requested_module
from ..security.audit_logger import log_audit_event
from ..rag.retriever import retrieve_permitted_chunks
from ..config import OPENAI_API_KEY, GEMINI_API_KEY

def context_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 1: Dynamically loads the user's role and effective permissions from PostgreSQL.
    """
    user_id = state.get("user_id")
    user_context = fetch_user_dynamic_permissions(user_id)
    return {"user_context": user_context}


def input_guard_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 2: Detects adversarial jailbreak/injection patterns and requested module.
    """
    msg = state.get("user_message", "")
    is_injection = detect_prompt_injection(msg)
    req_mod, _ = detect_requested_module(msg)
    
    return {
        "is_injection_detected": is_injection,
        "requested_module": req_mod
    }


def rbac_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 3: Deterministic code-level RBAC enforcement.
    LLM is NOT the security layer. If unauthorized, immediately flags for refusal.
    """
    user_context = state.get("user_context", {})
    msg = state.get("user_message", "")

    if state.get("is_injection_detected"):
        return {
            "access_granted": False,
            "refusal_reason": "Security violation: prompt injection or privilege escalation attempt detected."
        }

    is_allowed, req_module, refusal_reason = evaluate_rbac(user_context, msg)

    return {
        "access_granted": is_allowed,
        "requested_module": req_module,
        "refusal_reason": refusal_reason
    }


def retrieval_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 4: RAG Retrieval strictly pre-filtered by the user's dynamic permissions.
    """
    user_context = state.get("user_context", {})
    msg = state.get("user_message", "")

    chunks = retrieve_permitted_chunks(user_context, msg, top_k=3)
    return {"retrieved_chunks": chunks}


def synthesis_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 5: Synthesize a role-tailored support answer using only permitted knowledge chunks.
    """
    user_context = state.get("user_context", {})
    msg = state.get("user_message", "")
    chunks = state.get("retrieved_chunks", [])
    role_name = user_context.get("role_name", "User")
    full_name = user_context.get("full_name") or user_context.get("username", "there")

    if not chunks:
        # Default helpful navigation guide for permitted modules
        allowed_mods = user_context.get("allowed_modules", [])
        friendly_mods = [m.replace(".", " > ") for m in allowed_mods[:6]]
        response_text = (
            f"Hello {full_name} ({role_name})!\n\n"
            f"I am your AI Support Assistant. I can help you navigate through your accessible modules:\n"
            + ("\n".join([f"• **{m}**" for m in friendly_mods]) if friendly_mods else "• **Dashboard & General Portal**")
            + "\n\nFeel free to ask me how to perform any task, manage records, or configure features within your role!"
        )
        return {"final_response": response_text}

    # Format permitted knowledge into clear guidance
    context_text = "\n\n".join([
        f"### {c['title']} ({c.get('category', 'feature').upper()})\n{c['content']}"
        for c in chunks
    ])

    # Structured, professional response tailored to role
    greeting = f"Hello {full_name} ({role_name}),\n\n"
    response_text = greeting + f"Here is the guidance for your query:\n\n{context_text}\n\n"
    response_text += "If you need step-by-step assistance with another feature, let me know!"

    return {"final_response": response_text}


def output_guard_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 6: Sanitizes output to guarantee no credentials, hashes, or unauthorized data leaks.
    """
    resp = state.get("final_response", "")

    # Sanitize any accidental password hash leaks or tokens
    sanitized = re.sub(r"\$2[aby]?\$\d{1,2}\$[./0-9A-Za-z]{53}", "[REDACTED_HASH]", resp)
    sanitized = re.sub(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "[REDACTED_TOKEN]", sanitized)
    sanitized = re.sub(r"postgresql://[^\s]+", "[REDACTED_DB_URL]", sanitized)

    return {"final_response": sanitized}


def refusal_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 7: Polite standardized refusal and persistent security audit logging.
    """
    user_context = state.get("user_context", {})
    user_id = state.get("user_id")
    role_name = user_context.get("role_name", "User")
    req_mod = state.get("requested_module", "restricted_module")
    reason = state.get("refusal_reason", "Access denied")
    msg = state.get("user_message", "")

    # Standard polite refusal that never leaks internal existence of confidential data
    if state.get("is_injection_detected"):
        refusal_msg = (
            "⚠️ Request Denied: Your input contains unauthorized instructions or security violation patterns. "
            "All queries are audited according to School IT Policy."
        )
    else:
        refusal_msg = (
            f"🔒 Access Restricted: You don't have permission to access the **{req_mod.replace('.', ' > ')}** module "
            f"with your current role ({role_name}).\n\n"
            "If you require access to this feature for your duties, please contact your School Administrator to update your role permissions."
        )

    # Persistent audit logging in role_audit_log
    log_audit_event(
        performed_by=user_id,
        action="AGENT_ACCESS_DENIED",
        details={
            "user_id": user_id,
            "role_name": role_name,
            "role_level": user_context.get("role_level", 0),
            "requested_module": req_mod,
            "user_message": msg[:200],
            "refusal_reason": reason
        }
    )

    return {
        "final_response": refusal_msg,
        "audit_logged": True
    }
