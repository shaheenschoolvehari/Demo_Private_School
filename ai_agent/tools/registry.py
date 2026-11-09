import re
from typing import Dict, Any, Optional
from .db_support_tools import (
    get_user_accessible_modules,
    explain_access_restriction,
    get_role_notifications,
    get_teacher_teaching_assignments,
    get_active_academic_session,
    get_school_overview_stats
)

DB_TOOL_INTENT_PATTERNS = {
    "my_classes": [
        r"which\s+class(es)?\s+(am\s+i|i\s+am)\s+(teaching|assigned)",
        r"my\s+class(es)?",
        r"what\s+class(es)?\s+(am\s+i|do\s+i)\s+teach",
        r"am\s+i\s+(a\s+)?(class\s+teacher|incharge)",
        r"my\s+assigned\s+sections",
        r"which\s+section(s)?\s+do\s+i\s+teach"
    ],
    "my_notifications": [
        r"what\s+do\s+my\s+notifications\s+mean",
        r"(show|get|view|check)\s+(my\s+)?(recent\s+)?notifications",
        r"any\s+(new\s+)?alerts",
        r"my\s+alerts",
        r"unread\s+notifications"
    ],
    "my_permissions": [
        r"which\s+pages\s+can\s+i\s+access",
        r"what\s+can\s+i\s+(do|access)",
        r"my\s+permissions",
        r"what\s+are\s+my\s+permissions",
        r"what\s+modules\s+can\s+i\s+see"
    ],
    "academic_session": [
        r"(current|active)\s+academic\s+(year|session)",
        r"which\s+term\s+are\s+we\s+in",
        r"academic\s+calendar\s+dates",
        r"term\s+dates"
    ],
    "school_stats": [
        r"how\s+many\s+students\s+(are\s+there|enrolled)",
        r"total\s+students\s+and\s+(staff|teachers)",
        r"school\s+(overview|directory)\s+stats",
        r"enrollment\s+numbers"
    ]
}


def detect_db_tool_intent(message: str) -> Optional[str]:
    """Detects if user is asking for a live database-backed information query."""
    clean_msg = message.lower()
    for intent, patterns in DB_TOOL_INTENT_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, clean_msg):
                return intent
    return None


def execute_vetted_db_tool(intent: str, user_context: Dict[str, Any], query_text: str = "") -> Optional[Dict[str, Any]]:
    """
    Executes a vetted, parameterized, read-only DB tool matching the user's intent.
    Never executes raw SQL from LLM. All tools are deterministic and role-scoped.
    """
    if intent == "my_classes":
        return get_teacher_teaching_assignments(user_context)

    if intent == "my_notifications":
        return get_role_notifications(user_context, limit=5)

    if intent == "my_permissions":
        return get_user_accessible_modules(user_context)

    if intent == "academic_session":
        return get_active_academic_session(user_context)

    if intent == "school_stats":
        return get_school_overview_stats(user_context)

    return None

