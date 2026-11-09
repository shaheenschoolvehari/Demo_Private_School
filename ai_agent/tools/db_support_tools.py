from typing import Dict, Any, List, Optional
from ..db import get_db_cursor
from ..security.dynamic_permissions import check_module_access

def get_user_accessible_modules(user_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Live DB Tool: Returns user's exact accessible modules and read/write/delete capabilities.
    Permitted to all active users.
    """
    is_super = user_context.get("is_super_admin", False)
    role_name = user_context.get("role_name", "User")
    role_level = user_context.get("role_level", 0)
    effective_perms = user_context.get("effective_permissions", {})
    allowed_mods = user_context.get("allowed_modules", [])

    return {
        "status": "success",
        "role_name": role_name,
        "role_level": role_level,
        "is_super_admin": is_super,
        "total_accessible_modules": len(allowed_mods) if not is_super else "Full System (All Modules)",
        "allowed_modules": allowed_mods if not is_super else ["all_system_modules"],
        "permissions_breakdown": effective_perms if not is_super else "Unrestricted Administrative Access"
    }


def explain_access_restriction(user_context: Dict[str, Any], requested_module: str) -> Dict[str, Any]:
    """
    Live DB Tool: Explains why a user lacks permission for a specific module
    by inspecting live role_permissions and user_direct_permissions.
    """
    user_id = user_context.get("user_id")
    role_id = user_context.get("role_id")
    role_name = user_context.get("role_name", "User")

    with get_db_cursor() as cur:
        # Check base role permission
        cur.execute("""
            SELECT module_name, can_read, can_write, can_delete 
            FROM role_permissions 
            WHERE role_id = %s AND (module_name = %s OR module_name LIKE %s)
            LIMIT 5;
        """, (role_id, requested_module, f"{requested_module}.%"))
        role_rows = cur.fetchall()

        # Check direct user override
        cur.execute("""
            SELECT module_name, can_read, can_write, can_delete 
            FROM user_direct_permissions 
            WHERE user_id = %s AND (module_name = %s OR module_name LIKE %s)
            LIMIT 5;
        """, (user_id, requested_module, f"{requested_module}.%"))
        direct_rows = cur.fetchall()

    return {
        "requested_module": requested_module,
        "role_name": role_name,
        "role_permissions_state": [
            {"module": r[0], "read": r[1], "write": r[2], "delete": r[3]} for r in role_rows
        ],
        "user_direct_override": [
            {"module": r[0], "read": r[1], "write": r[2], "delete": r[3]} for r in direct_rows
        ],
        "recommendation": f"Contact the School Administrator to grant 'can_read' on '{requested_module}' in Settings > Roles."
    }


def get_role_notifications(user_context: Dict[str, Any], limit: int = 5) -> Dict[str, Any]:
    """
    Live DB Tool: Retrieves notifications strictly scoped to the user's role and user_id.
    Prevents cross-role notification data leakage.
    """
    user_id = user_context.get("user_id")
    role_name = (user_context.get("role_name") or "").lower()
    role_level = user_context.get("role_level", 0)

    # Map application role to notification role tags in DB
    target_roles = []
    if role_level >= 90:
        target_roles = ["admin", "principal", "vice_principal"]
    elif "coordinator" in role_name:
        target_roles = ["coordinator", "staff"]
    elif "teacher" in role_name or role_level >= 50:
        target_roles = ["staff", "teacher"]
    elif "accountant" in role_name or role_level == 30:
        target_roles = ["staff", "accountant"]
    elif "student" in role_name or role_level == 10:
        target_roles = ["student"]
    else:
        target_roles = ["staff"]

    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, title, message, type, is_read, created_at
            FROM notifications
            WHERE (user_id = %s OR LOWER(role) = ANY(%s))
            ORDER BY created_at DESC
            LIMIT %s;
        """, (user_id, target_roles, limit))

        rows = cur.fetchall()

    notifications_list = []
    for r in rows:
        notifications_list.append({
            "id": r[0],
            "title": r[1],
            "message": r[2],
            "type": r[3],
            "is_read": r[4],
            "date": r[5].strftime("%Y-%m-%d %H:%M") if r[5] else None
        })

    return {
        "status": "success",
        "total_retrieved": len(notifications_list),
        "target_roles": target_roles,
        "notifications": notifications_list
    }


def get_teacher_teaching_assignments(user_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Live DB Tool: Returns teacher's assigned classes, sections, and incharge roles.
    Only available for employees/teachers (or super admins).
    """
    user_id = user_context.get("user_id")

    with get_db_cursor() as cur:
        # First check if user is an employee
        cur.execute("""
            SELECT employee_id, first_name, last_name, designation
            FROM employees
            WHERE app_user_id = %s
            LIMIT 1;
        """, (user_id,))
        emp_row = cur.fetchone()

        if not emp_row:
            return {
                "status": "not_an_employee",
                "message": "No linked employee record found for your user account."
            }

        emp_id, f_name, l_name, designation = emp_row

        cur.execute("""
            SELECT 
                c.class_name, 
                sec.section_name, 
                tca.is_class_teacher, 
                tca.academic_year
            FROM teacher_class_assignment tca
            JOIN classes c ON tca.class_id = c.class_id
            JOIN sections sec ON tca.section_id = sec.section_id
            WHERE tca.employee_id = %s
            ORDER BY c.class_name, sec.section_name;
        """, (emp_id,))
        class_rows = cur.fetchall()

    assignments = []
    incharge_of = []
    for r in class_rows:
        cls_name, sec_name, is_incharge, yr = r
        desc = f"{cls_name} - Section {sec_name}"
        assignments.append(desc)
        if is_incharge:
            incharge_of.append(desc)

    return {
        "status": "success",
        "employee_name": f"{f_name} {l_name}",
        "designation": designation,
        "total_classes": len(assignments),
        "assigned_classes": assignments,
        "incharge_classes": incharge_of
    }


def get_active_academic_session(user_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Live DB Tool: Returns current active academic year and terms.
    Permitted to all active users.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, year_name, start_date, end_date, is_active
            FROM academic_years
            WHERE is_active = true
            LIMIT 1;
        """)
        yr_row = cur.fetchone()

        if not yr_row:
            return {"status": "no_active_session", "message": "No academic year is marked active."}

        yr_id, yr_name, s_date, e_date, _ = yr_row

        cur.execute("""
            SELECT term_name, start_date, end_date
            FROM academic_terms
            WHERE academic_year_id = %s
            ORDER BY id ASC;
        """, (yr_id,))
        term_rows = cur.fetchall()

    terms = [{"name": t[0], "start": str(t[1]) if t[1] else "", "end": str(t[2]) if t[2] else ""} for t in term_rows]

    return {
        "status": "success",
        "active_year": yr_name,
        "start_date": str(s_date) if s_date else "",
        "end_date": str(e_date) if e_date else "",
        "terms": terms
    }


def get_school_overview_stats(user_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Live DB Tool: High-level enrollment & operational counts.
    STRICTLY RESTRICTED: Requires role_level >= 75 (Coordinator, Principal, Administrator).
    Never exposes salaries, balances, or passwords.
    """
    role_level = user_context.get("role_level", 0)
    if role_level < 75:
        return {
            "status": "restricted",
            "message": "School-wide operational statistics are restricted to Coordinators and Administrators."
        }

    with get_db_cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM students WHERE status = 'Active' OR status IS NULL;")
        total_students = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM employees WHERE status = 'Active' OR status IS NULL;")
        total_employees = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM classes;")
        total_classes = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM sections;")
        total_sections = cur.fetchone()[0]

    return {
        "status": "success",
        "active_students": total_students,
        "active_staff": total_employees,
        "total_classes": total_classes,
        "total_sections": total_sections
    }

