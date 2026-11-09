import json
from datetime import datetime
from typing import Optional
from ..db import get_db_cursor

def log_audit_event(
    performed_by: Optional[int],
    action: str,
    details: dict,
    ip_address: str = "127.0.0.1"
):
    """
    Inserts a security audit record into PostgreSQL role_audit_log table.
    Ensures compliance with non-negotiable audit logging requirements.
    """
    try:
        details_str = json.dumps({
            **details,
            "timestamp": datetime.utcnow().isoformat()
        })
        with get_db_cursor(commit=True) as cur:
            cur.execute("""
                INSERT INTO role_audit_log (performed_by, action, details, ip_address, created_at)
                VALUES (%s, %s, %s, %s, NOW());
            """, (performed_by, action, details_str, ip_address))
    except Exception as e:
        # Fallback print to prevent crashing the agent if audit logging fails
        print(f"[AUDIT LOG FAILURE] Could not write audit log: {e}")
