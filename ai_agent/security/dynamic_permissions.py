from typing import Dict, Any, List, Set
from ..db import get_db_cursor

def fetch_user_dynamic_permissions(user_id: int) -> Dict[str, Any]:
    """
    Dynamically loads the live role and effective permissions for a user from PostgreSQL.
    Evaluates:
      1. Live user status & active state in app_users
      2. Live role data from app_roles (role_level, dashboard_access, is_custom)
      3. Live base role permissions from role_permissions
      4. Live user direct overrides from user_direct_permissions
    NEVER relies on hardcoded role names or static assumptions.
    """
    with get_db_cursor() as cur:
        # 1. Fetch user and live role metadata
        cur.execute("""
            SELECT 
                u.id, u.username, u.full_name, u.email, u.is_active, u.role_id,
                COALESCE(r.role_name, 'Unknown') AS role_name,
                COALESCE(r.role_level, 0) AS role_level,
                COALESCE(r.dashboard_access, 'student') AS dashboard_access,
                COALESCE(r.is_custom, false) AS is_custom
            FROM app_users u
            LEFT JOIN app_roles r ON u.role_id = r.id
            WHERE u.id = %s
            LIMIT 1;
        """, (user_id,))
        
        user_row = cur.fetchone()
        if not user_row:
            return {
                "user_id": user_id,
                "is_active": False,
                "role_level": 0,
                "is_super_admin": False,
                "allowed_modules": [],
                "effective_permissions": {}
            }
            
        u_id, username, full_name, email, is_active, role_id, role_name, role_level, dash_access, is_custom = user_row
        
        if not is_active:
            return {
                "user_id": user_id,
                "username": username,
                "full_name": full_name,
                "is_active": False,
                "role_level": role_level,
                "is_super_admin": False,
                "allowed_modules": [],
                "effective_permissions": {}
            }

        effective_perms: Dict[str, Dict[str, bool]] = {}

        # 2. Fetch role_permissions for user's role_id
        if role_id:
            cur.execute("""
                SELECT module_name, can_read, can_write, can_delete
                FROM role_permissions
                WHERE role_id = %s;
            """, (role_id,))
            for r in cur.fetchall():
                mod, cr, cw, cd = r
                if mod:
                    effective_perms[mod.strip()] = {
                        "can_read": bool(cr),
                        "can_write": bool(cw),
                        "can_delete": bool(cd)
                    }

        # 3. Fetch user_direct_permissions (overrides role_permissions)
        try:
            cur.execute("""
                SELECT module_name, can_read, can_write, can_delete
                FROM user_direct_permissions
                WHERE user_id = %s;
            """, (user_id,))
            for r in cur.fetchall():
                mod, cr, cw, cd = r
                if mod:
                    effective_perms[mod.strip()] = {
                        "can_read": bool(cr),
                        "can_write": bool(cw),
                        "can_delete": bool(cd)
                    }
        except Exception:
            pass

        # Calculate readable modules
        allowed_read_modules: Set[str] = set()
        for mod, perms in effective_perms.items():
            if perms.get("can_read"):
                allowed_read_modules.add(mod)

        # Super admin check: role_level >= 90 (Administrator, Principal, Vice Principal)
        is_super_admin = (role_level >= 90)

        return {
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "email": email,
            "is_active": is_active,
            "role_id": role_id,
            "role_name": role_name,
            "role_level": role_level,
            "dashboard_access": dash_access,
            "is_custom": is_custom,
            "is_super_admin": is_super_admin,
            "effective_permissions": effective_perms,
            "allowed_modules": list(allowed_read_modules)
        }


def check_module_access(user_context: Dict[str, Any], required_module: str) -> bool:
    """
    Deterministic permission verification:
    - Super admins (role_level >= 90) have full system access.
    - Public / general / dashboard is permitted to all active users.
    - Exact match in allowed_modules -> True.
    - If parent module is in allowed_modules (e.g. 'fees' granted -> 'fees.generate' allowed) -> True.
    - Specific sub-modules do NOT automatically grant other sub-modules or root modules.
    """
    if not user_context or not user_context.get("is_active"):
        return False

    if user_context.get("is_super_admin"):
        return True

    if not required_module or required_module in ("public", "general", "dashboard"):
        return True

    allowed_modules = set(user_context.get("allowed_modules", []))

    # 1. Exact match
    if required_module in allowed_modules:
        return True

    # 2. Check if a parent module is granted
    parts = required_module.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[:i])
        if parent in allowed_modules:
            return True

    return False
