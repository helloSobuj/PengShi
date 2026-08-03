"""Pre-cache the RAG embedding model at Docker build time.

Run in the build stage (after `uv sync`):
    RAG_DISABLED=true uv run -- python src/rag/_docker_precache.py

If sentence-transformers is not installed this exits 0 so the image still builds
for minimal agent deploys that don't need RAG.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add src root to path if run standalone
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    from rag import RAG_MODEL  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - import failure handled
    RAG_MODEL = "BAAI/bge-m3"

try:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
except Exception as exc:  # pragma: no cover - graceful path
    print(
        f"[rag-precache] sentence-transformers not installed ({exc}); skipping model download."
    )
    sys.exit(0)


def main() -> int:
    print(f"[rag-precache] Loading model: {RAG_MODEL}")
    model = SentenceTransformer(RAG_MODEL)
    # Force a warm-up embed so ONNX graphs and tokenizer vocab are materialized
    # into the HuggingFace cache — otherwise the first runtime call still pays
    # some compile cost.
    vectors = model.encode(["hello world", "你好世界"], normalize_embeddings=True)
    print(
        f"[rag-precache] Done. Embedding dim={vectors.shape[1]}. "
        "Cache location: HF_HOME=/app/.cache/huggingface"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
