import re
from typing import Dict, Any
from .state import AgentState
from ..security.dynamic_permissions import fetch_user_dynamic_permissions
from ..security.rbac_guard import evaluate_rbac, detect_prompt_injection, detect_requested_module
from ..security.audit_logger import log_audit_event
from ..rag.retriever import retrieve_permitted_chunks
from ..tools.registry import detect_db_tool_intent, execute_vetted_db_tool

def context_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 1: Dynamically loads the user's role and effective permissions from PostgreSQL.
    """
    user_id = state.get("user_id")
    user_context = fetch_user_dynamic_permissions(user_id)
    return {"user_context": user_context}


def input_guard_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 2: Detects adversarial jailbreak/injection patterns, requested module, and DB tool intents.
    """
    msg = state.get("user_message", "")
    is_injection = detect_prompt_injection(msg)
    req_mod, _ = detect_requested_module(msg)
    tool_intent = detect_db_tool_intent(msg)

    return {
        "is_injection_detected": is_injection,
        "requested_module": req_mod,
        "tool_intent": tool_intent
    }


def rbac_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 3: Deterministic code-level RBAC enforcement.
    LLM is NOT the security layer. If unauthorized, immediately flags for refusal.
    """
    user_context = state.get("user_context", {})
    msg = state.get("user_message", "")
    tool_intent = state.get("tool_intent")

    if state.get("is_injection_detected"):
        return {
            "access_granted": False,
            "refusal_reason": "Security violation: prompt injection or privilege escalation attempt detected."
        }

    # Tool-specific security gate
    if tool_intent:
        if tool_intent in ("my_classes", "my_notifications", "my_permissions", "academic_session"):
            # Personal support queries: permissible for all active authenticated users
            return {
                "access_granted": True,
                "requested_module": tool_intent,
                "refusal_reason": None
            }
        elif tool_intent == "school_stats":
            role_level = user_context.get("role_level", 0)
            if role_level >= 75:
                return {
                    "access_granted": True,
                    "requested_module": "school_stats",
                    "refusal_reason": None
                }
            else:
                return {
                    "access_granted": False,
                    "requested_module": "school_stats",
                    "refusal_reason": "School-wide operational statistics are restricted to Administrative roles (role_level >= 75)."
                }

    is_allowed, req_module, refusal_reason = evaluate_rbac(user_context, msg)

    return {
        "access_granted": is_allowed,
        "requested_module": req_module,
        "refusal_reason": refusal_reason
    }


def retrieval_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 4: Executes vetted DB tools (if applicable) and retrieves role-filtered RAG knowledge.
    """
    user_context = state.get("user_context", {})
    msg = state.get("user_message", "")
    tool_intent = state.get("tool_intent")

    tool_result = None
    if tool_intent:
        tool_result = execute_vetted_db_tool(tool_intent, user_context, msg)

    chunks = retrieve_permitted_chunks(user_context, msg, top_k=3)

    return {
        "tool_result": tool_result,
        "retrieved_chunks": chunks
    }


def synthesis_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 5: Synthesize a role-tailored support answer using live database data and permitted knowledge chunks.
    """
    user_context = state.get("user_context", {})
    tool_intent = state.get("tool_intent")
    tool_res = state.get("tool_result")
    chunks = state.get("retrieved_chunks", [])
    role_name = user_context.get("role_name", "User")
    full_name = user_context.get("full_name") or user_context.get("username", "there")

    # 1. Synthesize DB Tool Responses
    if tool_intent and tool_res and tool_res.get("status") == "success":
        if tool_intent == "my_classes":
            assigned = tool_res.get("assigned_classes", [])
            incharges = tool_res.get("incharge_classes", [])
            resp = f"Hello {full_name} ({tool_res.get('designation', role_name)}),\n\n"
            resp += f"Here are your live class teaching assignments from the school database:\n\n"
            resp += f"📋 **Total Assigned Classes:** {tool_res.get('total_classes', 0)}\n\n"
            if assigned:
                resp += "**Assigned Classes & Sections:**\n" + "\n".join([f"• {c}" for c in assigned]) + "\n\n"
            if incharges:
                resp += "⭐ **Designated Class Incharge:**\n" + "\n".join([f"• {c} *(Daily attendance & marksheet privileges active)*" for c in incharges]) + "\n"
            else:
                resp += "ℹ️ *You are currently not designated as a Class Incharge for any section.*\n"
            return {"final_response": resp}

        if tool_intent == "my_notifications":
            notifs = tool_res.get("notifications", [])
            resp = f"Hello {full_name},\n\nHere are your latest role-scoped notifications from the system:\n\n"
            if not notifs:
                resp += "✅ You currently have no unread notifications or pending announcements."
            else:
                for idx, n in enumerate(notifs, 1):
                    status_badge = "🔔" if not n.get("is_read") else "✔️"
                    resp += f"**{idx}. {status_badge} {n['title']}**\n"
                    resp += f"{n['message']}\n"
                    if n.get("date"):
                        resp += f"*Received:* {n['date']}\n\n"
            return {"final_response": resp}

        if tool_intent == "my_permissions":
            allowed = tool_res.get("allowed_modules", [])
            resp = f"Hello {full_name},\n\nHere is your active permissions matrix from PostgreSQL:\n\n"
            resp += f"• **Assigned Role:** {tool_res.get('role_name')} (Level {tool_res.get('role_level')})\n"
            resp += f"• **Total Accessible Modules:** {tool_res.get('total_accessible_modules')}\n\n"
            resp += "**Permitted Modules:**\n"
            if tool_res.get("is_super_admin"):
                resp += "• All system modules (Full Administrative & Executive Access)\n"
            else:
                for m in allowed[:15]:
                    resp += f"• `{m}`\n"
                if len(allowed) > 15:
                    resp += f"• ... and {len(allowed) - 15} additional sub-modules.\n"
            return {"final_response": resp}

        if tool_intent == "academic_session":
            terms = tool_res.get("terms", [])
            resp = f"📅 **Active Academic Session:** {tool_res.get('active_year')}\n"
            if tool_res.get("start_date") and tool_res.get("end_date"):
                resp += f"*Session Duration:* {tool_res['start_date']} to {tool_res['end_date']}\n\n"
            if terms:
                resp += "**Configured Terms:**\n"
                for t in terms:
                    date_str = f" ({t['start']} - {t['end']})" if t['start'] else ""
                    resp += f"• **{t['name']}**{date_str}\n"
            return {"final_response": resp}

        if tool_intent == "school_stats":
            resp = f"📊 **School Operational Directory Summary:**\n\n"
            resp += f"• **Active Enrolled Students:** {tool_res.get('active_students', 0):,}\n"
            resp += f"• **Active Teaching & Admin Staff:** {tool_res.get('active_staff', 0):,}\n"
            resp += f"• **Total Academic Classes:** {tool_res.get('total_classes', 0)}\n"
            resp += f"• **Total Active Sections:** {tool_res.get('total_sections', 0)}\n"
            return {"final_response": resp}

    # 2. Synthesize RAG Knowledge Responses
    if not chunks:
        allowed_mods = user_context.get("allowed_modules", [])
        friendly_mods = [m.replace(".", " > ") for m in allowed_mods[:6]]
        response_text = (
            f"Hello {full_name} ({role_name})!\n\n"
            f"I am your AI Support Assistant. I can help you navigate through your accessible modules:\n"
            + ("\n".join([f"• **{m}**" for m in friendly_mods]) if friendly_mods else "• **Dashboard & General Portal**")
            + "\n\nFeel free to ask me how to perform any task, manage records, or configure features within your role!"
        )
        return {"final_response": response_text}

    context_text = "\n\n".join([
        f"### {c['title']} ({c.get('category', 'feature').upper()})\n{c['content']}"
        for c in chunks
    ])

    greeting = f"Hello {full_name} ({role_name}),\n\n"
    response_text = greeting + f"Here is the guidance for your query:\n\n{context_text}\n\n"
    response_text += "If you need step-by-step assistance with another feature, let me know!"

    return {"final_response": response_text}


def output_guard_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 6: Sanitizes output to guarantee no credentials, hashes, or unauthorized data leaks.
    """
    resp = state.get("final_response", "")

    # Sanitize password hashes, bearer tokens, connection strings
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
