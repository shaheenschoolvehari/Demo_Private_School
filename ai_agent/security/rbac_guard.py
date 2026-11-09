import re
from typing import Tuple, Optional, Dict, Any
from .dynamic_permissions import check_module_access

# Prompt injection patterns
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior)\s+instructions",
    r"you\s+are\s+now\s+(an?\s+)?admin",
    r"pretend\s+(you\s+are|to\s+be)",
    r"bypass\s+(rbac|security|permissions|access\s+control)",
    r"reveal\s+(your\s+)?(system\s+prompt|instructions|developer\s+mode)",
    r"dump\s+(the\s+)?database",
    r"select\s+\*\s+from",
    r"show\s+me\s+all\s+(passwords|hashes|tokens|secret)",
    r"grant\s+me\s+(admin|all|root)\s+access",
    r"system\s*:\s*override",
    r"<\|im_start\|>",
    r"\[INST\]",
]

# Fine-grained topic-to-module mapping
MODULE_TOPIC_KEYWORDS = {
    # Settings & User Management
    "settings.roles": ["roles", "role management", "permissions", "clone role", "custom role"],
    "settings.users": ["user management", "app users", "create user", "reset password", "lock user"],
    "settings.system": ["system settings", "database backup", "restore backup", "security policies"],
    "settings": ["settings", "school profile", "biometric settings"],
    
    # HRM & Payroll
    "hrm.employees": ["salary", "salaries", "payroll", "employee list", "designation", "hire date", "basic pay"],
    "hrm.departments": ["department", "departments"],
    "hrm": ["hrm", "human resource", "staff management"],
    
    # Expenses
    "expenses.add": ["add expense", "record expense", "payment voucher"],
    "expenses.categories": ["expense category", "expense categories"],
    "expenses": ["expense", "expenses", "petty cash", "expenditure", "utility bill"],
    
    # Fees
    "fees.generate": ["generate fee", "generate slips", "monthly fee slips", "fee generation"],
    "fees.collect": ["collect fee", "fee collection", "receive payment", "challan payment", "family balance", "family fee"],
    "fees.plans": ["fee plan", "fee plans", "fee structure", "tuition fee"],
    "fees.heads": ["fee head", "fee heads"],
    "fees.exam-collection": ["exam fee", "exam collection", "exam fee collection"],
    "fees": ["fee", "fees", "fee slip", "voucher", "defaulter", "balance", "concession", "bank challan"],
    
    # Examination
    "academic.examination.test-marking": ["test marks", "enter marks", "mark entry", "test paper", "test papers"],
    "academic.examination.approvals": ["approve marks", "mark lock", "paper approval", "approvals"],
    "academic.result-card": ["result card", "result cards", "marks sheet", "marksheet"],
    "academic.examination": ["exam", "exams", "examination", "date sheet", "grading"],
    
    # Academic & Classes
    "academic.classes": ["priority setting", "priority", "reorder classes", "classes", "class priority"],
    "academic.sections": ["section", "sections", "reorder sections"],
    "academic.subjects": ["subject", "subjects", "curriculum", "syllabus"],
    "academic.teachers": ["teacher assignment", "class teacher", "incharge", "assign teacher"],
    "academic.promotion": ["promotion", "student promotion"],
    "academic": ["academic", "term", "academic year"],
    
    # Attendance
    "attendance.students": ["student attendance", "mark attendance", "present", "absent", "daily attendance"],
    "attendance.staff": ["staff attendance", "teacher attendance"],
    "attendance": ["attendance", "leave", "holiday", "attendance settings"],
    
    # Students
    "students.admission": ["new admission", "register student", "enroll student"],
    "students.families": ["family", "families", "sibling", "guardian"],
    "students": ["student", "students", "roll number", "b-form", "student profile"],
    
    # Notifications & Reports
    "notifications": ["notification", "notifications", "sms", "alert", "announcement"],
    "reports": ["report", "reports", "export excel", "export pdf"]
}


def detect_prompt_injection(message: str) -> bool:
    """Detects adversarial jailbreak or prompt injection patterns."""
    clean_msg = message.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, clean_msg, re.IGNORECASE):
            return True
    return False


def detect_requested_module(message: str) -> Tuple[str, Optional[str]]:
    """
    Detects which system module/topic the user is asking about.
    Returns: (primary_module, topic_keyword_matched)
    """
    clean_msg = message.lower()

    # Search in order of specificity (sub-modules before general parent modules)
    for mod, keywords in MODULE_TOPIC_KEYWORDS.items():
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw)}\b", clean_msg):
                return mod, kw

    return "general", None


def evaluate_rbac(user_context: Dict[str, Any], message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Deterministic RBAC check before any retrieval or LLM call.
    Returns: (is_allowed, requested_module, refusal_reason)
    """
    # 1. Check for prompt injection
    if detect_prompt_injection(message):
        return False, "security_violation", "Adversarial or prompt injection pattern detected."

    # 2. Check if user is active
    if not user_context.get("is_active"):
        return False, "account_inactive", "Your account is marked inactive or disabled."

    # 3. Super admins (role_level >= 90) have full access to all support queries
    if user_context.get("is_super_admin"):
        req_module, _ = detect_requested_module(message)
        return True, req_module, None

    # 4. Detect topic/module
    req_module, matched_keyword = detect_requested_module(message)

    # General navigation, dashboard, and public queries are always permitted
    if req_module in ("general", "dashboard", "public"):
        return True, req_module, None

    # 5. Deterministic check against user's dynamically allowed modules
    has_permission = check_module_access(user_context, req_module)
    if not has_permission:
        reason = f"Role '{user_context.get('role_name')}' lacks read permission for module '{req_module}' (matched keyword: '{matched_keyword}')."
        return False, req_module, reason

    return True, req_module, None
