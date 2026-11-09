from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import (
    context_node,
    input_guard_node,
    rbac_node,
    retrieval_node,
    synthesis_node,
    output_guard_node,
    refusal_node
)

def rbac_router(state: AgentState) -> str:
    """Routing condition based on deterministic RBAC check."""
    if state.get("access_granted"):
        return "retrieval"
    return "refusal"

def create_agent_graph():
    """
    Constructs and compiles the role-aware LangGraph workflow.
    """
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("context", context_node)
    graph.add_node("input_guard", input_guard_node)
    graph.add_node("rbac", rbac_node)
    graph.add_node("retrieval", retrieval_node)
    graph.add_node("synthesis", synthesis_node)
    graph.add_node("output_guard", output_guard_node)
    graph.add_node("refusal", refusal_node)

    # Set entry point
    graph.set_entry_point("context")

    # Linear edges
    graph.add_edge("context", "input_guard")
    graph.add_edge("input_guard", "rbac")

    # Conditional branching based on RBAC decision
    graph.add_conditional_edges(
        "rbac",
        rbac_router,
        {
            "retrieval": "retrieval",
            "refusal": "refusal"
        }
    )

    # Retrieval to synthesis to output guard
    graph.add_edge("retrieval", "synthesis")
    graph.add_edge("synthesis", "output_guard")
    graph.add_edge("output_guard", END)
    graph.add_edge("refusal", END)

    return graph.compile()

# Global compiled graph instance
agent_workflow = create_agent_graph()

