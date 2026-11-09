import sys
from ai_agent.graph.workflow import agent_workflow

def run_agent_test(user_id: int, message: str, test_title: str):
    print(f"\n=======================================================")
    print(f"TEST: {test_title}")
    print(f"User ID: {user_id} | Prompt: '{message}'")
    print(f"-------------------------------------------------------")

    initial_state = {
        "user_id": user_id,
        "raw_token": "",
        "user_context": {},
        "user_message": message,
        "conversation_history": [],
        "is_injection_detected": False,
        "requested_module": None,
        "tool_intent": None,
        "tool_result": None,
        "access_granted": False,
        "refusal_reason": None,
        "retrieved_chunks": [],
        "final_response": "",
        "audit_logged": False
    }

    result = agent_workflow.invoke(initial_state)

    print(f"Role: {result['user_context'].get('role_name')} (Level: {result['user_context'].get('role_level')})")
    print(f"Tool Intent: {result.get('tool_intent')}")
    print(f"Access Granted: {result.get('access_granted')}")
    print(f"Final Agent Response:\n{result.get('final_response')}")
    return result

def main():
    print(">>> VERIFYING LIVE DATABASE ACCESS & ROLE-SCOPED ACCURACY <<<")

    # 1. Test Teacher (User 8) - Live teaching class & incharge assignment from DB
    res_classes = run_agent_test(
        user_id=8,
        message="Which classes am I teaching and am I a class incharge?",
        test_title="1. Teacher Live Class & Section Assignment Query"
    )
    assert res_classes["access_granted"] == True
    assert "Class 8 - Section B" in res_classes["final_response"], "Must accurately identify Class 8 - Section B from teacher_class_assignment!"
    assert "Class Incharge" in res_classes["final_response"], "Must identify class incharge status!"

    # 2. Test Teacher (User 8) - Role-scoped notifications from DB
    res_notifs = run_agent_test(
        user_id=8,
        message="What do my notifications mean and what are my recent alerts?",
        test_title="2. Teacher Live Role-Scoped Notifications Query"
    )
    assert res_notifs["access_granted"] == True
    assert "notifications" in res_notifs["final_response"].lower()

    # 3. Test Teacher (User 8) - Dynamic permissions matrix from DB
    res_perms = run_agent_test(
        user_id=8,
        message="Which pages can I access and what are my permissions?",
        test_title="3. Teacher Live Permissions Matrix Query"
    )
    assert res_perms["access_granted"] == True
    assert "Teacher" in res_perms["final_response"]
    assert "academic.examination" in res_perms["final_response"]

    # 4. Test Active Academic Session from DB
    res_session = run_agent_test(
        user_id=8,
        message="What is the current academic session and terms?",
        test_title="4. Live Active Academic Session Query"
    )
    assert res_session["access_granted"] == True
    assert "2026-2027" in res_session["final_response"], "Must return live active academic year 2026-2027!"

    # 5. Test Restricted School-Wide Directory Stats for Teacher (User 8) -> Expect Refused
    res_stats_teacher = run_agent_test(
        user_id=8,
        message="How many students are there in the whole school?",
        test_title="5. Teacher queries Restricted School-wide Stats (Expected: REFUSED)"
    )
    assert res_stats_teacher["access_granted"] == False, "Teacher cannot access school-wide stats!"
    assert "Access Restricted" in res_stats_teacher["final_response"]

    # 6. Test Admin (User 1) - School-Wide Directory Stats from DB -> Expect Granted with Live Counts
    res_stats_admin = run_agent_test(
        user_id=1,
        message="How many students are enrolled and what are the school overview stats?",
        test_title="6. Administrator queries Live School Directory Stats"
    )
    assert res_stats_admin["access_granted"] == True
    assert "Active Enrolled Students" in res_stats_admin["final_response"]
    assert "Active Teaching & Admin Staff" in res_stats_admin["final_response"]

    print("\n==================================================================")
    print(">>> ALL LIVE DATABASE ACCESS & TOOL ACCURACY TESTS PASSED 100%! <<<")
    print("==================================================================\n")

if __name__ == "__main__":
    main()
