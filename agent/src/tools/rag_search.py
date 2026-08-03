"""RAG search tool for the voice assistant.

Falls back to "RAG unavailable" plain-text replies when RAG_DISABLED or heavy
imports are missing. Never surfaces tool call internals; the assistant reads
the returned snippet lines and verbalizes a concise answer.
"""

from __future__ import annotations

from livekit.agents import RunContext, function_tool

from rag import RAG_TOP_K, is_rag_available
from rag.store import search as rag_search_store


@function_tool
async def rag_search(context: RunContext, query: str) -> str:
    """Search the user's personal knowledge base for relevant notes, PDFs, and web pages.

    Use this tool when the user asks for information you think may be stored
    in documents they have uploaded.

    Args:
        query: A short natural-language query about what to find.
    """
    query_clean = (query or "").strip()
    if not query_clean:
        return "Search query was empty."

    if not is_rag_available(quiet=False):
        return (
            "The knowledge base is not available right now. "
            "It requires ChromaDB and sentence-transformers to be installed with RAG_DISABLED unset."
        )

    try:
        results = rag_search_store(query_clean, top_k=RAG_TOP_K)
    except Exception as exc:  # noqa: BLE001
        return f"Knowledge base search encountered an error: {exc}"

    if not results:
        return "No matching documents were found in the knowledge base."

    header = f"Found {len(results)} relevant passage(s) in the knowledge base:\n"
    lines = []
    for i, r in enumerate(results, 1):
        snippet = r.text.replace("\n", " ").strip()
        if len(snippet) > 260:
            snippet = snippet[:257].rstrip() + "..."
        lines.append(
            f"[{i}] {r.title} (source: {r.source}) — {snippet}"
        )
    return header + "\n".join(lines)


__all__ = ["rag_search"]
