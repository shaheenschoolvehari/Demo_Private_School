from typing import List, Dict, Any

KNOWLEDGE_CHUNKS: List[Dict[str, Any]] = [
    # GENERAL / PUBLIC / NAVIGATION
    {
        "id": "nav-general-overview",
        "title": "System Navigation & Dashboard Overview",
        "required_module": "general",
        "min_role_level": 10,
        "category": "navigation",
        "keywords": ["dashboard", "home", "sidebar", "navigation", "menu", "quick stats", "search"],
        "content": (
            "The School Management System features a responsive sidebar navigation tailored to your role permissions. "
            "The main dashboard provides role-specific KPI cards, charts, and recent activity widgets. "
            "Super Admins and Principals see overall school metrics (total revenue, enrollment, attendance rate). "
            "Teachers see their assigned classes, daily timetable, and attendance markers. "
            "Accountants see fee collection trends and pending vouchers. "
            "Students see their attendance, fee dues, and examination result cards."
        )
    },
    {
        "id": "faq-role-permissions",
        "title": "Understanding Role Permissions & Access Rights",
        "required_module": "general",
        "min_role_level": 10,
        "category": "faq",
        "keywords": ["access denied", "permissions", "role", "cannot see", "module", "forbidden", "why"],
        "content": (
            "Each user in the system is assigned a role (e.g., Administrator, Principal, Coordinator, Teacher, Accountant, Student). "
            "Additionally, the Administrator can assign dynamic custom permissions to any role or individual user. "
            "If a menu item or feature is hidden or says 'Access Denied', your role or account currently lacks the required "
            "read/write permission for that module. To request access, please contact your School Administrator."
        )
    },

    # ACADEMIC MODULE
    {
        "id": "academic-priority-setting",
        "title": "Class and Section Priority Setting Workflow",
        "required_module": "academic.classes",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["priority setting", "drag drop", "reorder classes", "reorder sections", "academic priority", "sequence"],
        "content": (
            "To set the display order of classes and sections throughout the system:\n"
            "1. Navigate to 'Academic' -> 'Priority Setting' (/academic/priority).\n"
            "2. The interactive drag-and-drop hierarchy panel shows all classes ordered from lowest (e.g., Reception, Nursery, KG) to highest (e.g., Class 10).\n"
            "3. Drag classes up or down using the handle icon to change their school-wide display sequence.\n"
            "4. Expand any class card to view and reorder its associated sections (e.g., Section A, Section B, Section C).\n"
            "5. Click 'Save Priority Order'. Once saved, this exact order is automatically applied across Attendance, Examinations, Marks Sheets, Student Admission, and Reports."
        )
    },
    {
        "id": "academic-classes-sections",
        "title": "Managing Classes and Sections",
        "required_module": "academic.classes",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["classes", "sections", "create class", "add section", "class incharge", "teacher assignment"],
        "content": (
            "Classes and Sections represent the core academic hierarchy:\n"
            "- Add a Class: Navigate to Academic -> Classes (/academic/classes). Click 'Add Class', enter class name, numerical grade, and optional tuition fee plan.\n"
            "- Add Sections: Open a Class detail view, click 'Add Section', and specify section name (e.g., Rose, Tulip, Green) and maximum student capacity.\n"
            "- Assign Class Teacher (Incharge): Under Class/Section details, assign a designated teacher as 'Class Incharge' to grant them direct daily attendance and marks entry rights for that section."
        )
    },
    {
        "id": "academic-subjects-curriculum",
        "title": "Managing Subjects and Teacher Subject Assignment",
        "required_module": "academic.subjects",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["subjects", "curriculum", "assign subject", "subject teacher", "syllabus"],
        "content": (
            "To configure subjects and allocate them to teachers:\n"
            "1. Navigate to Academic -> Subjects (/academic/subjects).\n"
            "2. Define subjects with subject code, credit hours, and marks breakdown (Theory vs. Practical).\n"
            "3. Use 'Assign Subjects to Class' to map required subjects per class.\n"
            "4. Allocate specific teachers to class subjects so that the assigned teacher can create test papers and enter exam marks."
        )
    },

    # EXAMINATION MODULE
    {
        "id": "exams-test-marking-approvals",
        "title": "Examination: Test Papers, Marks Entry and Approval Workflow",
        "required_module": "academic.examination.test-marking",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["test paper", "enter marks", "exam marks", "test marks", "lock marks", "test papers"],
        "content": (
            "The examination module supports continuous assessment and term exams:\n"
            "1. Create Test Paper: Go to 'Exams' -> 'Test Papers' (/exams/test-papers). Specify Subject, Class, Max Marks, Passing Marks, and Date.\n"
            "2. Mark Entry: Teachers enter marks obtained for each student. Input validation prevents entering marks higher than maximum.\n"
            "3. Mark Locking: Once entry is complete, the teacher locks the marksheet to prevent accidental changes.\n"
            "4. Approval: The Principal or Academic Coordinator reviews locked marksheets under 'Approvals' and officially approves them for Result Card generation."
        )
    },
    {
        "id": "academic-result-cards",
        "title": "Generating and Viewing Examination Result Cards",
        "required_module": "academic.result-card",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["result card", "result cards", "marks sheet", "marksheet", "student result"],
        "content": (
            "To generate student result cards:\n"
            "1. Navigate to 'Academic' -> 'Result Cards' (/academic/result-card).\n"
            "2. Select Academic Year, Term Exam, Class, and Section.\n"
            "3. Click 'Generate Result Cards'. The system aggregates student marks across all subjects, computes percentage, grade, position, and remarks.\n"
            "4. Bulk print or download individual PDF result cards for parent-teacher meetings."
        )
    },

    # STUDENTS MODULE
    {
        "id": "students-admission-workflow",
        "title": "New Student Admission Workflow",
        "required_module": "students.admission",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["new admission", "register student", "enroll student", "b-form", "family", "sibling"],
        "content": (
            "To admit a new student into the school:\n"
            "1. Navigate to 'Students' -> 'New Admission' (/students/admission).\n"
            "2. Enter student biographical data: First Name, Last Name, Date of Birth, Gender, B-Form/CNIC number, and Religion.\n"
            "3. Select Admission Date, Target Class, and Section.\n"
            "4. Family Linking: Choose whether to link the student to an existing Family Account (by CNIC or Father Name) or create a new Family ID. Linking siblings automatically enables family fee consolidation!\n"
            "5. Upload Student Photo and supporting birth certificates.\n"
            "6. Submit to generate the official Admission Number and initial fee voucher."
        )
    },
    {
        "id": "students-management-profile",
        "title": "Student Directory, Profile Editing & Status",
        "required_module": "students.details",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["student list", "student profile", "student status", "struck off", "transferred", "edit student"],
        "content": (
            "Under 'Students' -> 'All Students' (/students):\n"
            "- Filter students by Class, Section, Gender, or Enrollment Status (Active, Inactive, Transferred, Struck-Off).\n"
            "- Click on any student row to view their comprehensive 360 profile: Academic history, Fee ledger & dues, Attendance percentage, and Emergency contacts.\n"
            "- Edit Profile: Update contact numbers, address, or medical notes.\n"
            "- Status Update: Marking a student as 'Transferred' or 'Graduated' freezes future automatic fee slip generation."
        )
    },

    # ATTENDANCE MODULE
    {
        "id": "attendance-student-marking",
        "title": "Marking Daily Student Attendance",
        "required_module": "attendance.students",
        "min_role_level": 50,
        "category": "workflow",
        "keywords": ["student attendance", "mark attendance", "present", "absent", "leave", "late", "daily attendance"],
        "content": (
            "To record daily student attendance:\n"
            "1. Navigate to 'Attendance' -> 'Student Attendance' (/attendance/students).\n"
            "2. Select Date, Class, and Section. The system automatically loads the enrolled students in order of the configured priority sequence.\n"
            "3. By default, all students are marked 'Present'. Click on any badge to toggle to 'Absent', 'Leave', or 'Late'.\n"
            "4. Click 'Save Attendance'.\n"
            "5. If SMS alerts are enabled in settings, parents of absent students receive immediate notification upon submission."
        )
    },
    {
        "id": "attendance-staff-tracking",
        "title": "Staff & Teacher Attendance Tracking",
        "required_module": "attendance.staff",
        "min_role_level": 65,
        "category": "workflow",
        "keywords": ["staff attendance", "teacher attendance", "biometric", "employee attendance", "holidays"],
        "content": (
            "Under 'Attendance' -> 'Staff Attendance' (/attendance/staff):\n"
            "- View and mark daily attendance for all administrative and teaching employees.\n"
            "- Supports Biometric Sync integration from registered fingerprint/face recognition devices.\n"
            "- Attendance Settings (/attendance/settings) allows administrators to configure weekly offs (e.g., Sunday), gazetted holidays, and school timing grace periods."
        )
    },

    # FEES & FINANCE MODULE
    {
        "id": "fees-plans-heads-config",
        "title": "Configuring Fee Heads and Fee Plans",
        "required_module": "fees.plans",
        "min_role_level": 30,
        "category": "workflow",
        "keywords": ["fee heads", "fee plans", "tuition fee", "admission fee", "fee structure"],
        "content": (
            "To configure school fee structures:\n"
            "1. Fee Heads (/fee-heads): Define recurring and one-time heads (e.g., Tuition Fee, Computer Lab Fee, Library Dues, Admission Fee).\n"
            "2. Fee Plans (/fee-plans): Create standard billing packages assigned to classes (e.g., 'Primary Standard Plan' = 2,500 Tuition + 200 Lab).\n"
            "3. Concessions & Discounts: Special fee discounts or sibling relief can be configured per student or family ledger."
        )
    },
    {
        "id": "fees-slip-generation",
        "title": "Monthly Fee Slips Generation Workflow",
        "required_module": "fees.generate",
        "min_role_level": 30,
        "category": "workflow",
        "keywords": ["generate fee", "generate slips", "monthly fee slips", "fee generation"],
        "content": (
            "To generate monthly fee slips:\n"
            "1. Navigate to 'Fees' -> 'Generate Slips' (/fee-slips).\n"
            "2. Select the Academic Year, Billing Month, and target Classes.\n"
            "3. Click 'Generate Monthly Slips'.\n"
            "4. The system calculates individual student fee plans, carries over past arrears, applies approved concessions, and produces printable 3-part bank vouchers."
        )
    },
    {
        "id": "fees-slip-collection",
        "title": "Fee Voucher Payment Collection and Receipting",
        "required_module": "fees.collect",
        "min_role_level": 30,
        "category": "workflow",
        "keywords": ["collect fee", "fee collection", "receive payment", "challan payment", "family balance", "family fee"],
        "content": (
            "To collect fee payments:\n"
            "1. Navigate to 'Fees' -> 'Collect Fee' (/fees/collect or /fee-slips).\n"
            "2. Search student by Admission Number, Roll No, or Family ID.\n"
            "3. Enter amount received, payment mode (Cash, Bank Transfer, EasyPaisa/JazzCash), and receipt reference.\n"
            "4. Click 'Receive Payment'. The system records the ledger transaction, updates the family balance, and generates an official printed receipt."
        )
    },

    # HRM & PAYROLL MODULE
    {
        "id": "hrm-employee-management",
        "title": "HRM: Employee Registration and Department Management",
        "required_module": "hrm.employees",
        "min_role_level": 65,
        "category": "workflow",
        "keywords": ["salary", "salaries", "payroll", "employee list", "designation", "basic pay"],
        "content": (
            "Under 'HRM' (/hrm):\n"
            "- Register Employees: Click 'Add Employee', input full name, CNIC, phone, designation (e.g., Senior Teacher, Accountant, Guard), joining date, and basic salary.\n"
            "- Link User Account: You can optionally link the employee record to an 'app_users' login so the teacher or staff can sign in to the portal.\n"
            "- Departments: Configure organizational units (Science, English, Primary Wing, Administration) for staff grouping."
        )
    },

    # SETTINGS & RBAC MODULE
    {
        "id": "settings-roles-permissions",
        "title": "Role-Based Access Control (RBAC) & Dynamic Permissions Management",
        "required_module": "settings.roles",
        "min_role_level": 90,
        "category": "workflow",
        "keywords": ["roles", "permissions", "rbac", "clone role", "custom role", "assign permission", "dynamic roles"],
        "content": (
            "Managing user roles and permissions (/settings/roles):\n"
            "- The system includes standard roles (Administrator, Principal, Coordinator, Teacher, Accountant, Student) and allows creating custom roles.\n"
            "- Dynamic Permissions: Administrators can open any role's permission matrix and dynamically toggle Read, Write, and Delete access for any module (Academic, Attendance, Fees, HRM, Expenses, Settings).\n"
            "- Changes take effect immediately in real-time across the application and in the AI Support Agent.\n"
            "- Role Cloning: Duplicate an existing role with all its permission settings to quickly create departmental variants."
        )
    },
    {
        "id": "settings-system-backup",
        "title": "System Settings, Automated Backups and Database Maintenance",
        "required_module": "settings.system",
        "min_role_level": 90,
        "category": "workflow",
        "keywords": ["system settings", "backup", "database backup", "restore", "security policies", "maintenance"],
        "content": (
            "System configuration (/settings/system):\n"
            "- General Profile: Update school name, address, contact numbers, and official logo.\n"
            "- Security Policies: Configure max login attempts before 15-minute lockout, minimum password length, and session timeout.\n"
            "- Database Backups: Trigger on-demand PostgreSQL database dumps or review automated daily snapshots stored in /server/backups."
        )
    },

    # NOTIFICATIONS MODULE
    {
        "id": "notifications-system-alerts",
        "title": "Role-Aware Notifications and System Announcements",
        "required_module": "notifications",
        "min_role_level": 10,
        "category": "workflow",
        "keywords": ["notifications", "alerts", "sms", "announcement", "notice board", "unread"],
        "content": (
            "Notifications are scoped strictly by role:\n"
            "- Administrators & Principals receive alerts for new admissions, locked marksheets pending approval, and fee deficit thresholds.\n"
            "- Teachers receive notifications for timetable updates, substitution alerts, and approved leave requests.\n"
            "- Accountants receive alerts for pending fee reconciliations and approved expense vouchers.\n"
            "- Students receive reminders for upcoming term exams, pending fee slips, and published result cards."
        )
    }
]
