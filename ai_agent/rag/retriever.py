import re
from typing import List, Dict, Any
from .knowledge_catalog import KNOWLEDGE_CHUNKS
from ..security.dynamic_permissions import check_module_access

def tokenize(text: str) -> List[str]:
    """Tokenize and normalize text for lexical matching."""
    return [w for w in re.findall(r"\w+", text.lower()) if len(w) > 2]

def score_chunk(query_tokens: List[str], chunk: Dict[str, Any]) -> float:
    """Calculates match score between user query tokens and chunk metadata."""
    if not query_tokens:
        return 0.0

    score = 0.0
    title_text = chunk.get("title", "").lower()
    keywords = [k.lower() for k in chunk.get("keywords", [])]
    content_text = chunk.get("content", "").lower()

    for token in query_tokens:
        # High weight if matched in keywords
        if any(token in kw for kw in keywords):
            score += 4.0
        # High weight if in title
        if token in title_text:
            score += 3.0
        # Normal weight if in body content
        if token in content_text:
            score += 1.0

    return score


def retrieve_permitted_chunks(
    user_context: Dict[str, Any],
    query: str,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    RAG Pre-filtering:
    Strictly filters out any chunk that the user does not have dynamic permission to view.
    Then performs relevance ranking on the permitted candidate set.
    """
    # 1. Filter chunks by dynamic permissions
    permitted_candidates: List[Dict[str, Any]] = []

    for chunk in KNOWLEDGE_CHUNKS:
        req_module = chunk.get("required_module", "general")
        min_level = chunk.get("min_role_level", 0)

        # Check dynamic module permission
        if not check_module_access(user_context, req_module):
            continue

        # Check role level threshold (unless super admin)
        if not user_context.get("is_super_admin") and user_context.get("role_level", 0) < min_level:
            continue

        permitted_candidates.append(chunk)

    if not permitted_candidates:
        return []

    # 2. Score and rank permitted candidates against query
    query_tokens = tokenize(query)
    scored = []
    for chunk in permitted_candidates:
        s = score_chunk(query_tokens, chunk)
        scored.append((s, chunk))

    # Sort descending by score
    scored.sort(key=lambda x: x[0], reverse=True)

    # Pick top_k (or top items with positive score, fallback to general if 0)
    top_results = [item[1] for item in scored[:top_k] if item[0] > 0]

    # If no positive matches, include general overview if available
    if not top_results and permitted_candidates:
        top_results = [permitted_candidates[0]]

    return top_results

