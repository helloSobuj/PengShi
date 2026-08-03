"""Simple token-agnostic text chunker with window overlap."""

from __future__ import annotations

from typing import Iterable

from . import RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE


def _split_sentences(text: str) -> list[str]:
    """Very lightweight sentence splitter. Handles CJK well via unicode punct."""
    # Preserve punctuation with the preceding segment.
    import re

    segments = re.split(r"(?<=[.!?。！？;；])\s+|(?<=[\n])+", text)
    return [s.strip() for s in segments if s.strip()]


def chunk_text(
    text: str,
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[str]:
    """Split text into chunks of at most `chunk_size` chars with overlap.

    Preserves whole-sentence boundaries when possible.
    """
    if not text:
        return []
    size = chunk_size or RAG_CHUNK_SIZE
    overlap = chunk_overlap or RAG_CHUNK_OVERLAP
    if overlap >= size:
        overlap = max(0, size // 4)

    sentences = _split_sentences(text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for s in sentences:
        s_len = len(s) + 1  # space/newline padding
        if current and current_len + s_len > size:
            chunk_text_val = " ".join(current).strip()
            if chunk_text_val:
                chunks.append(chunk_text_val)
            # Carry over tail for overlap window
            tail: list[str] = []
            tail_len = 0
            for cs in reversed(current):
                if tail_len + len(cs) + 1 <= overlap:
                    tail.insert(0, cs)
                    tail_len += len(cs) + 1
                else:
                    break
            current = tail
            current_len = tail_len
        current.append(s)
        current_len += s_len

    remainder = " ".join(current).strip()
    if remainder:
        chunks.append(remainder)

    # Merge last chunk if too small
    if len(chunks) >= 2 and len(chunks[-1]) < size // 3:
        merged = chunks[-2] + " " + chunks[-1]
        chunks = chunks[:-2]
        if len(merged) <= size:
            chunks.append(merged)
        else:
            # Re-split the merged oversized chunk by half
            mid = len(merged) // 2
            chunks.append(merged[:mid].strip())
            chunks.append(merged[mid:].strip())

    return [c for c in chunks if c]


def iter_chunks(text: str) -> Iterable[str]:
    return iter(chunk_text(text))
