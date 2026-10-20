"""Service layer cho Chatbot HR — truy hồi RAG + sinh câu trả lời có trích dẫn.

Pipeline hỏi đáp (docs A6.2):

    Câu hỏi
      -> tìm chunk liên quan trong các tài liệu status=ready:
           1) theo embedding (cosine) nếu chunk có vector và ai_service
              tạo được embedding cho câu hỏi; ngưỡng mặc định cấu hình
              CHAT_MIN_SIMILARITY (0.30);
           2) fallback chấm điểm TỪ KHÓA: đếm số từ khóa chung giữa câu
              hỏi và chunk (đã bỏ stopword tiếng Việt), lấy top 3-5;
      -> dưới ngưỡng liên quan: trả câu trả lời mẫu "chưa có thông tin
         trong tài liệu nội bộ", KHÔNG gọi AI, KHÔNG bịa chính sách;
      -> có ngữ cảnh: gọi AI qua ai_service.get_provider() với prompt
         ép chỉ dùng tài liệu + trích dẫn [Tên tài liệu]; nếu AI chưa
         cấu hình/lỗi -> trả TRÍCH ĐOẠN nguyên văn liên quan nhất kèm
         nguồn (vẫn hữu ích, vẫn không bịa);
      -> lưu ChatLog (câu hỏi, trả lời, sources) trong mọi trường hợp.

Điểm liên quan từ khóa được coi là đủ khi: chunk khớp nhất có >= 2 từ
khóa chung, hoặc câu hỏi rất ngắn (<= 3 từ khóa) mà khớp >= 1 — tránh
trường hợp hỏi ngắn nhưng đúng ý bị từ chối oan.
"""
from __future__ import annotations

import json
import math
import re

from flask import current_app

from app.blueprints.kb import services as kb_services
from app.extensions import db
from app.models import ChatLog, KbChunk, KbDocument

TOP_K = 5
DEFAULT_MIN_SIMILARITY = 0.30

NO_INFO_ANSWER = (
    "Mình chưa tìm thấy thông tin này trong tài liệu nội bộ. "
    "Bạn vui lòng liên hệ phòng Nhân sự (HR) để được hỗ trợ thêm nhé."
)

SYSTEM_PROMPT = (
    "Bạn là trợ lý HR nội bộ của công ty. Chỉ trả lời DỰA TRÊN các đoạn "
    "tài liệu được cung cấp dưới đây; tuyệt đối không suy diễn hay bịa "
    "chính sách không có trong tài liệu. Trả lời ngắn gọn, rõ ràng bằng "
    "tiếng Việt và gắn trích dẫn nguồn dạng [Tên tài liệu] cho các ý "
    "chính. Nếu tài liệu không đủ để trả lời, hãy nói rõ điều đó."
)

# Stopword tiếng Việt/tiếng Anh phổ biến — bỏ khi chấm điểm từ khóa để
# các từ nối không làm nhiễu điểm liên quan.
STOPWORDS = {
    "là", "gì", "có", "được", "không", "của", "cho", "và", "các", "những",
    "này", "đó", "thì", "bị", "về", "theo", "với", "để", "ra", "vào",
    "ạ", "ơi", "nhé", "vậy", "sao", "thế", "nào", "bao", "nhiêu", "mấy",
    "khi", "lúc", "ai", "tôi", "mình", "em", "anh", "chị", "bạn", "ở",
    "trong", "ngoài", "trên", "dưới", "đã", "đang", "sẽ", "hay",
    "the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or",
    "what", "how", "many", "much", "when", "can", "i", "we", "you",
}

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def tokenize(text: str) -> set[str]:
    """Tách từ khoá: viết thường, bỏ dấu câu, bỏ stopword và từ < 2 ký tự."""
    words = _TOKEN_RE.findall((text or "").lower())
    return {w for w in words if len(w) >= 2 and w not in STOPWORDS}


# ---------------------------------------------------------------------------
# Truy hồi ngữ cảnh
# ---------------------------------------------------------------------------

def _cosine(a: list[float], b: list[float]) -> float | None:
    if not a or not b or len(a) != len(b):
        return None
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    if norm == 0:
        return None
    return dot / norm


def _context_of(chunk: KbChunk, score: float) -> dict:
    document = chunk.document
    return {
        "chunk_id": chunk.id,
        "document_id": chunk.document_id,
        "document_title": document.title if document else "",
        "page_no": chunk.page_no,
        "text": chunk.chunk_text,
        "score": round(float(score), 4),
    }


def retrieve_contexts(question: str, top_k: int = TOP_K) -> tuple[list[dict], str]:
    """Tìm tối đa `top_k` chunk liên quan nhất. Trả (contexts, search_mode).

    search_mode: "embedding" | "keyword" | "none" (không đủ liên quan).
    """
    chunks = (KbChunk.query
              .join(KbDocument, KbChunk.document_id == KbDocument.id)
              .filter(KbDocument.status == KbDocument.STATUS_READY)
              .all())
    if not chunks:
        return [], "none"

    # 1) Tìm theo embedding (nếu khả dụng và có chunk mang vector)
    question_vector = kb_services.embed_text(question)
    if question_vector:
        scored = []
        for chunk in chunks:
            if chunk.embedding:
                similarity = _cosine(question_vector, list(chunk.embedding))
                if similarity is not None:
                    scored.append((similarity, chunk))
        if scored:
            scored.sort(key=lambda item: item[0], reverse=True)
            try:
                threshold = float(current_app.config.get(
                    "CHAT_MIN_SIMILARITY", DEFAULT_MIN_SIMILARITY))
            except (TypeError, ValueError):
                threshold = DEFAULT_MIN_SIMILARITY
            picked = [(s, c) for s, c in scored if s >= threshold][:top_k]
            if picked:
                return [_context_of(c, s) for s, c in picked], "embedding"
            return [], "none"  # có vector nhưng dưới ngưỡng -> không bịa

    # 2) Fallback: chấm điểm từ khóa (số từ khóa chung)
    question_tokens = tokenize(question)
    if not question_tokens:
        return [], "none"
    scored = []
    for chunk in chunks:
        shared = question_tokens & tokenize(chunk.chunk_text)
        if shared:
            scored.append((len(shared), chunk))
    if not scored:
        return [], "none"
    scored.sort(key=lambda item: (item[0], -item[1].chunk_index), reverse=True)
    best = scored[0][0]
    relevant = best >= 2 or (len(question_tokens) <= 3 and best >= 1)
    if not relevant:
        return [], "none"
    return [_context_of(c, s) for s, c in scored[:top_k]], "keyword"


# ---------------------------------------------------------------------------
# Sinh câu trả lời
# ---------------------------------------------------------------------------

def _ask_ai(question: str, contexts: list[dict]) -> str | None:
    """Gọi AI qua ai_service (provider) với ngữ cảnh; None nếu không gọi được.

    Không phụ thuộc cứng: ai_service chưa cấu hình key / provider lỗi /
    trả nội dung rỗng đều -> None để tầng trên dùng trích đoạn thay thế.
    """
    try:
        from app import ai_service
        provider = ai_service.get_provider()
    except Exception:
        return None
    if provider is None or not getattr(provider, "is_available", False):
        return None

    references = []
    for ctx in contexts:
        page = f", trang {ctx['page_no']}" if ctx.get("page_no") else ""
        references.append(f"[{ctx['document_title']}{page}]\n{ctx['text']}")
    user_prompt = (
        f"Câu hỏi: {question}\n\n"
        "Tài liệu tham khảo:\n" + "\n\n---\n\n".join(references)
    )
    try:
        raw = provider.chat_completion(SYSTEM_PROMPT, user_prompt)
    except Exception:  # AIError và mọi lỗi mạng/provider khác
        current_app.logger.warning("Chatbot: gọi AI thất bại, dùng trích đoạn thay thế.",
                                   exc_info=True)
        return None
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip()
    # Một số provider bị ép trả JSON (response_format) -> bóc trường answer nếu có.
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and parsed.get("answer"):
                return str(parsed["answer"]).strip()
        except (ValueError, TypeError):
            pass
    return text


def _extractive_answer(contexts: list[dict]) -> str:
    """Câu trả lời dự phòng KHÔNG qua AI: trích nguyên văn đoạn liên quan nhất.

    Chỉ trình bày lại nội dung có sẵn trong tài liệu kèm nguồn — không
    diễn giải thêm nên không có nguy cơ bịa chính sách.
    """
    lines = [
        "Dựa trên tài liệu quy chế nội bộ, thông tin liên quan nhất tới câu hỏi của bạn:",
    ]
    for ctx in contexts[:2]:
        excerpt = re.sub(r"\s+", " ", ctx["text"]).strip()
        if len(excerpt) > 600:
            excerpt = excerpt[:600].rstrip() + "…"
        page = f", trang {ctx['page_no']}" if ctx.get("page_no") else ""
        lines.append(f"\n— {excerpt} [{ctx['document_title']}{page}]")
    lines.append(
        "\n(Đây là trích đoạn nguyên văn từ tài liệu — hệ thống AI đang "
        "không khả dụng nên chưa diễn giải được. Cần rõ thêm vui lòng liên hệ HR.)"
    )
    return "\n".join(lines)


def _sources_of(contexts: list[dict]) -> list[dict]:
    """Danh sách trích dẫn duy nhất theo (tài liệu, trang) — format A7."""
    seen: set[tuple] = set()
    sources: list[dict] = []
    for ctx in contexts:
        key = (ctx["document_id"], ctx.get("page_no"))
        if key in seen:
            continue
        seen.add(key)
        sources.append({
            "document_id": ctx["document_id"],
            "title": ctx["document_title"],
            "page_no": ctx.get("page_no"),
            "chunk_id": ctx["chunk_id"],
        })
    return sources


# ---------------------------------------------------------------------------
# Nghiệp vụ chính
# ---------------------------------------------------------------------------

def ask_question(user_id: int, question: str) -> dict:
    """Trả lời 1 câu hỏi + lưu ChatLog. Trả {"answer", "sources"}."""
    contexts, _mode = retrieve_contexts(question)
    if contexts:
        sources = _sources_of(contexts)
        answer = _ask_ai(question, contexts) or _extractive_answer(contexts)
    else:
        sources = []
        answer = NO_INFO_ANSWER

    log = ChatLog(user_id=user_id, question=question,
                  answer=answer, sources=sources)
    db.session.add(log)
    db.session.commit()
    return {"answer": answer, "sources": sources}


def get_history(user_id: int, page: int = 1, limit: int = 20) -> dict:
    """Lịch sử hỏi đáp của chính người dùng (mới nhất trước), phân trang B6."""
    page = max(1, page)
    limit = min(max(1, limit), 100)
    query = (ChatLog.query.filter_by(user_id=user_id)
             .order_by(ChatLog.created_at.desc(), ChatLog.id.desc()))
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "data": [{
            "id": row.id,
            "question": row.question,
            "answer": row.answer,
            "sources": row.sources or [],
            "createdAt": row.created_at.isoformat() if row.created_at else None,
        } for row in rows],
        "meta": {
            "page": page,
            "limit": limit,
            "totalItems": total,
            "totalPages": (total + limit - 1) // limit if total else 0,
        },
    }
