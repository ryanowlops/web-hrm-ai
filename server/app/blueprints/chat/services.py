"""Service layer cho Chatbot HR — truy hồi RAG + sinh câu trả lời có trích dẫn.

Pipeline hỏi đáp (docs A6.2 + docs/rag-upgrade.md — RAG nâng cấp):

    Câu hỏi
      -> truy hồi LAI (hybrid) trên các tài liệu status=ready:
           1) phía vector: embed câu hỏi, tính cosine với chunk có
              embedding, lấy tối đa CANDIDATE_LIMIT (20) ứng viên;
           2) phía từ khóa: đếm số từ khóa chung giữa câu hỏi và chunk
              (đã bỏ stopword tiếng Việt), lấy 20 ứng viên;
           3) hợp nhất: chuẩn hoá min-max từng phía rồi cộng có trọng số
              (0.7 vector + 0.3 từ khóa; chunk chỉ có ở 1 phía thì phía
              còn lại tính 0);
           4) RERANK bằng LLM (khi provider khả dụng): LLM sắp lại thứ tự
              ứng viên theo mức liên quan; lỗi/sai định dạng -> giữ thứ
              tự điểm lai. Lấy TOP_K (5) đoạn cuối cùng.
         Chế độ (mode) trả về cùng kết quả: "hybrid_rerank" | "hybrid" |
         "embedding" (chỉ phía vector có ứng viên) | "keyword" (không có
         embedding — hành vi cũ). Ngưỡng liên quan phía vector cấu hình
         CHAT_MIN_SIMILARITY (mặc định 0.30).
      -> dưới ngưỡng liên quan ở CẢ hai phía: trả câu trả lời mẫu "chưa
         có thông tin trong tài liệu nội bộ", KHÔNG gọi AI, KHÔNG bịa;
      -> có ngữ cảnh: gọi AI qua ai_service.get_provider() với prompt
         ép chỉ dùng tài liệu + trích dẫn [Tên tài liệu, trang X]; nếu AI
         chưa cấu hình/lỗi -> trả TRÍCH ĐOẠN nguyên văn liên quan nhất
         kèm nguồn (vẫn hữu ích, vẫn không bịa);
      -> lưu ChatLog (câu hỏi, trả lời, sources) trong mọi trường hợp.

Điểm liên quan từ khóa được coi là đủ khi: chunk khớp nhất có >= 2 từ
khóa chung, hoặc câu hỏi rất ngắn (<= 3 từ khóa) mà khớp >= 1 — tránh
trường hợp hỏi ngắn nhưng đúng ý bị từ chối oan.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata

from flask import current_app

from app.blueprints.kb import services as kb_services
from app.extensions import db
from app.models import ChatLog, KbChunk, KbDocument

TOP_K = 5
CANDIDATE_LIMIT = 20        # ứng viên tối đa mỗi phía (vector / từ khóa)
VECTOR_WEIGHT = 0.7         # trọng số phía vector trong điểm lai
KEYWORD_WEIGHT = 0.3        # trọng số phía từ khóa trong điểm lai
RERANK_EXCERPT_CHARS = 300  # độ dài trích đoạn tối đa gửi cho LLM rerank
DEFAULT_MIN_SIMILARITY = 0.30

NO_INFO_ANSWER = (
    "Mình chưa tìm thấy thông tin này trong tài liệu nội bộ. "
    "Bạn vui lòng liên hệ phòng Nhân sự (HR) để được hỗ trợ thêm nhé."
)

SYSTEM_PROMPT = (
    "Bạn là trợ lý HR nội bộ của công ty. Chỉ trả lời DỰA TRÊN các đoạn "
    "tài liệu được cung cấp dưới đây; tuyệt đối không suy diễn hay bịa "
    "chính sách không có trong tài liệu. Trả lời ngắn gọn, rõ ràng bằng "
    "tiếng Việt và gắn trích dẫn nguồn dạng [Tên tài liệu, trang X] cho "
    "các ý chính (chỉ ghi số trang khi tài liệu có ghi trang). Nếu tài "
    "liệu không đủ để trả lời, hãy nói rõ điều đó."
)

RERANK_SYSTEM_PROMPT = (
    "Bạn là bộ xếp hạng lại (rerank) mức liên quan của các đoạn tài liệu "
    "nội bộ so với câu hỏi. Chỉ trả về JSON dạng {\"order\": [danh sách số "
    "thứ tự của các đoạn, xếp theo mức liên quan giảm dần]} — không thêm "
    "bất kỳ giải thích nào."
)

# Stopword tiếng Việt/tiếng Anh phổ biến — bỏ khi chấm điểm từ khóa để
# các từ nối không làm nhiễu điểm liên quan.
STOPWORDS = {
    "là", "gì", "có", "được", "không", "của", "cho", "và", "các", "những",
    "này", "đó", "thì", "bị", "về", "theo", "với", "để", "ra", "vào",
    "ạ", "ơi", "nhé", "vậy", "sao", "thế", "nào", "bao", "nhiêu", "mấy",
    "khi", "lúc", "ai", "tôi", "mình", "em", "anh", "chị", "bạn", "ở",
    "trong", "ngoài", "trên", "dưới", "đã", "đang", "sẽ", "hay", "tại", "bởi", "nơi",
    "the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or",
    "what", "how", "many", "much", "when", "can", "i", "we", "you",
}

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def _fold_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt (kể cả đ -> d) để khớp từ khóa bất kể tài liệu
    hoặc câu hỏi có gõ dấu hay không."""
    lowered = (text or "").lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


_STOPWORDS_FOLDED = {_fold_accents(w) for w in STOPWORDS}


def tokenize(text: str) -> set[str]:
    """Tách từ khoá: viết thường, bỏ dấu tiếng Việt + dấu câu, bỏ
    stopword và từ < 2 ký tự."""
    words = _TOKEN_RE.findall(_fold_accents(text or ""))
    return {w for w in words if len(w) >= 2 and w not in _STOPWORDS_FOLDED}


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


def _minmax_normalize(scores: dict) -> dict:
    """Chuẩn hoá điểm về [0, 1] theo min-max; mọi điểm bằng nhau -> đều 1.0."""
    if not scores:
        return {}
    low, high = min(scores.values()), max(scores.values())
    if high <= low:
        return {key: 1.0 for key in scores}
    span = high - low
    return {key: (value - low) / span for key, value in scores.items()}


def _parse_rerank_order(raw, count: int) -> list[int] | None:
    """Parse thứ tự rerank từ phản hồi LLM — an toàn tuyệt đối.

    Chấp nhận {"order": [..]}, {"ranking": [..]}... (bất kỳ khóa nào có giá
    trị list) hoặc mảng trần [..]; LLM trả text lẫn JSON thì vớt mảng số
    nguyên đầu tiên. Chỉ giữ chỉ số hợp lệ, không trùng; rỗng/sai -> None.
    """
    if not raw or not isinstance(raw, str):
        return None
    candidate = None
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            candidate = parsed
        elif isinstance(parsed, dict):
            for value in parsed.values():
                if isinstance(value, list):
                    candidate = value
                    break
    except (ValueError, TypeError):
        candidate = None
    if candidate is None:
        match = re.search(r"\[[\d\s,]+\]", raw)
        if not match:
            return None
        try:
            candidate = json.loads(match.group(0))
        except ValueError:
            return None
    order: list[int] = []
    seen: set[int] = set()
    for item in candidate:
        try:
            idx = int(item)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < count and idx not in seen:
            seen.add(idx)
            order.append(idx)
    return order or None


def _rerank_with_llm(question: str, contexts: list[dict]) -> list[dict] | None:
    """Nhờ LLM xếp hạng lại danh sách ứng viên theo mức liên quan.

    None nếu không xếp được (AI chưa cấu hình / provider lỗi / JSON sai) —
    tầng trên giữ nguyên thứ tự điểm lai. Rerank là lớp tăng chất lượng,
    không bao giờ là điểm nghẽn làm hỏng câu trả lời.
    """
    if len(contexts) < 2:
        return None
    try:
        from app import ai_service
        provider = ai_service.get_provider()
    except Exception:
        return None
    if provider is None or not getattr(provider, "is_available", False):
        return None
    lines = []
    for i, ctx in enumerate(contexts):
        excerpt = re.sub(r"\s+", " ", ctx["text"]).strip()[:RERANK_EXCERPT_CHARS]
        lines.append(f"[{i}] ({ctx['document_title']}) {excerpt}")
    user_prompt = f"Câu hỏi: {question}\n\nCác đoạn tài liệu ứng viên:\n" + "\n".join(lines)
    try:
        raw = provider.chat_completion(RERANK_SYSTEM_PROMPT, user_prompt)
    except Exception:  # AIError và mọi lỗi mạng/provider khác
        current_app.logger.warning(
            "Chatbot: rerank bằng AI thất bại, giữ thứ tự điểm lai.", exc_info=True)
        return None
    order = _parse_rerank_order(raw, len(contexts))
    if not order:
        return None
    picked = [contexts[i] for i in order]
    picked_ids = {id(contexts[i]) for i in order}
    picked.extend(ctx for ctx in contexts if id(ctx) not in picked_ids)
    return picked


def retrieve_contexts(question: str, top_k: int = TOP_K) -> tuple[list[dict], str]:
    """Tìm tối đa `top_k` chunk liên quan nhất. Trả (contexts, search_mode).

    search_mode: "hybrid_rerank" | "hybrid" | "embedding" | "keyword" |
    "none" (không đủ liên quan ở cả hai phía).
    """
    chunks = (KbChunk.query
              .join(KbDocument, KbChunk.document_id == KbDocument.id)
              .filter(KbDocument.status == KbDocument.STATUS_READY)
              .all())
    if not chunks:
        return [], "none"
    by_id = {chunk.id: chunk for chunk in chunks}
    question_tokens = tokenize(question)

    # 1) Phía vector: cosine giữa embedding câu hỏi và chunk có vector
    vector_scores: dict[int, float] = {}
    question_vector = kb_services.embed_text(question)
    if question_vector:
        for chunk in chunks:
            if chunk.embedding:
                similarity = _cosine(question_vector, list(chunk.embedding))
                if similarity is not None:
                    vector_scores[chunk.id] = similarity

    # 2) Phía từ khóa: số từ khóa chung (giữ nguyên cách chấm cũ)
    keyword_scores: dict[int, int] = {}
    if question_tokens:
        for chunk in chunks:
            shared = len(question_tokens & tokenize(chunk.chunk_text))
            if shared:
                keyword_scores[chunk.id] = shared

    if not vector_scores and not keyword_scores:
        return [], "none"

    # 3) Cổng liên quan — ít nhất 1 phía phải đủ mạnh, nếu không: không bịa
    try:
        threshold = float(current_app.config.get(
            "CHAT_MIN_SIMILARITY", DEFAULT_MIN_SIMILARITY))
    except (TypeError, ValueError):
        threshold = DEFAULT_MIN_SIMILARITY
    vector_relevant = (bool(vector_scores)
                       and max(vector_scores.values()) >= threshold)
    best_keyword = max(keyword_scores.values()) if keyword_scores else 0
    keyword_relevant = (best_keyword >= 2
                        or (0 < len(question_tokens) <= 3 and best_keyword >= 1))
    if not vector_relevant and not keyword_relevant:
        return [], "none"

    # 4) Ứng viên mỗi phía -> hợp nhất, tính điểm lai có trọng số
    vector_top = sorted(vector_scores, key=lambda cid: vector_scores[cid],
                        reverse=True)[:CANDIDATE_LIMIT]
    keyword_top = sorted(
        keyword_scores,
        key=lambda cid: (keyword_scores[cid], -by_id[cid].chunk_index),
        reverse=True)[:CANDIDATE_LIMIT]
    candidate_ids = set(vector_top) | set(keyword_top)
    norm_vector = _minmax_normalize(vector_scores)
    norm_keyword = _minmax_normalize(keyword_scores)
    hybrid = {
        cid: VECTOR_WEIGHT * norm_vector.get(cid, 0.0)
        + KEYWORD_WEIGHT * norm_keyword.get(cid, 0.0)
        for cid in candidate_ids
    }
    ordered_ids = sorted(candidate_ids, key=lambda cid: hybrid[cid], reverse=True)
    contexts = [_context_of(by_id[cid], hybrid[cid]) for cid in ordered_ids]

    if vector_scores and keyword_scores:
        mode = "hybrid"
    elif vector_scores:
        mode = "embedding"
    else:
        mode = "keyword"

    # 5) Rerank bằng LLM trên toàn bộ ứng viên (chỉ đổi mode hiển thị khi
    #    đang ở chế độ lai; các chế độ còn lại giữ tên như cũ)
    reranked = _rerank_with_llm(question, contexts)
    if reranked is not None:
        contexts = reranked
        if mode == "hybrid":
            mode = "hybrid_rerank"
    return contexts[:top_k], mode


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
            "score": ctx.get("score"),
        })
    return sources


# ---------------------------------------------------------------------------
# Nghiệp vụ chính
# ---------------------------------------------------------------------------

def ask_question(user_id: int, question: str) -> dict:
    """Trả lời 1 câu hỏi + lưu ChatLog. Trả {"answer", "sources", "mode"}.

    "mode" là chế độ truy hồi đã dùng (hybrid_rerank/hybrid/embedding/
    keyword/none) — chỉ trả về trong response cho frontend hiển thị nhãn;
    ChatLog không có cột riêng cho mode nên không lưu (sources đã kèm
    điểm liên quan của từng trích dẫn).
    """
    contexts, mode = retrieve_contexts(question)
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
    return {"answer": answer, "sources": sources, "mode": mode}


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
