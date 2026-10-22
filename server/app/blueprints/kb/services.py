"""Service layer cho Knowledge Base — pipeline tài liệu của chatbot RAG.

Luồng xử lý (docs A5.5, A6.2):

    Upload (PDF/TXT, <= MAX_KB_SIZE_MB, mặc định 10MB ở tầng service;
    Flask còn chặn sớm bằng MAX_CONTENT_LENGTH)
      -> kiểm tra định dạng bằng đuôi file + magic bytes (%PDF-)
      -> trích text (pypdf cho PDF, giải mã UTF-8 cho TXT)
      -> chia chunk 500-1000 ký tự, overlap 100 ký tự, ưu tiên cắt ở
         ranh giới câu/đoạn, ghi kèm số trang (page_no)
      -> embedding: nếu app.ai_service có hàm embedding thì gọi BATCH để
         lấy vector cho mọi chunk (nội dung đem embed = tiêu đề tài liệu +
         nội dung chunk); KHÔNG có -> lưu embedding = None và đánh dấu
         tài liệu dùng tìm kiếm từ khóa (chatbot tự fallback, xem
         blueprints/chat/services.py). Không phụ thuộc cứng vào AI:
         lỗi embedding không làm hỏng việc nạp tài liệu.
      -> lập chỉ mục lại (reindex): đọc lại file gốc đã lưu -> trích/chunk/
         embed lại từ đầu; mất file gốc thì chỉ bổ sung embedding còn thiếu.
         Toàn bộ chunk thiếu embedding trong KB cũng bổ sung được qua
         embed_missing_chunks() (endpoint POST /kb/embed-missing).

Trạng thái tài liệu (KbDocument.status): processing -> ready | failed.
Việc trích/chunk chạy đồng bộ trong request vì giới hạn đồ án (tài liệu
quy chế thường ngắn); khi chuyển production có thể đẩy sang worker nền
mà không đổi API.
"""
from __future__ import annotations

import os
import re
import uuid

from flask import current_app

from app.errors import ApiError
from app.extensions import db
from app.models import KbChunk, KbDocument

# --- Hằng số pipeline (A6.2) -------------------------------------------------
CHUNK_MAX_CHARS = 1000      # chunk tối đa 1000 ký tự
CHUNK_MIN_CHARS = 500       # khi cắt, ưu tiên ranh giới sau ít nhất 500 ký tự
CHUNK_OVERLAP_CHARS = 100   # overlap giữa 2 chunk liên tiếp
ALLOWED_EXTENSIONS = (".pdf", ".txt")
PDF_MAGIC = b"%PDF-"


# ---------------------------------------------------------------------------
# AI embedding (tùy chọn — không phụ thuộc cứng)
# ---------------------------------------------------------------------------

def _embedding_function():
    """Trả về hàm tạo embedding của app.ai_service nếu module có hỗ trợ.

    ai_service theo A6.3 chuẩn hoá chat qua provider (get_provider) và
    phân tích CV (analyze_cv); hàm embedding là phần mở rộng — nếu sau
    này ai_service bổ sung một trong các tên dưới đây, KB tự động dùng
    mà không cần sửa code. Không có -> trả None (chế độ từ khóa).
    """
    try:
        from app import ai_service
    except Exception:  # ai_service chưa tồn tại / import lỗi -> chế độ từ khóa
        return None
    for name in ("get_embedding", "embed_text", "embed", "create_embedding"):
        fn = getattr(ai_service, name, None)
        if callable(fn):
            return fn
    return None


def embed_text(text: str):
    """Tạo vector embedding cho 1 đoạn text; None nếu không khả dụng/lỗi."""
    fn = _embedding_function()
    if fn is None:
        return None
    try:
        vector = fn(text)
    except Exception:  # lỗi AI không được làm hỏng pipeline tài liệu
        current_app.logger.warning("Tạo embedding thất bại, chunk sẽ dùng tìm kiếm từ khóa.",
                                   exc_info=True)
        return None
    if not vector:
        return None
    try:
        return [float(x) for x in vector]
    except (TypeError, ValueError):
        return None


def _embeddings_function():
    """Trả về hàm tạo embedding BATCH (embed_texts) của app.ai_service nếu có."""
    try:
        from app import ai_service
    except Exception:
        return None
    fn = getattr(ai_service, "embed_texts", None)
    return fn if callable(fn) else None


def embed_texts(texts):
    """Tạo embedding BATCH cho nhiều đoạn; list kết quả cùng thứ tự đầu vào.

    Mỗi phần tử là list[float] hoặc None (đoạn đó lỗi/không tạo được).
    Ưu tiên hàm batch của ai_service (1 request cho nhiều chunk); không có
    hàm batch thì gọi lẻ embed_text từng đoạn. KHÔNG bao giờ raise — đúng
    thiết kế cũ: lỗi embedding không được làm hỏng pipeline tài liệu.
    """
    texts = list(texts or [])
    if not texts:
        return []
    fn = _embeddings_function()
    if fn is not None:
        try:
            vectors = fn(texts)
            if vectors is not None and len(vectors) == len(texts):
                result = []
                for vector in vectors:
                    if not vector:
                        result.append(None)
                        continue
                    try:
                        result.append([float(x) for x in vector])
                    except (TypeError, ValueError):
                        result.append(None)
                return result
        except Exception:  # lỗi batch -> thử gọi lẻ từng đoạn trước khi bỏ cuộc
            current_app.logger.warning(
                "Tạo embedding batch thất bại, chuyển sang gọi lẻ từng đoạn.",
                exc_info=True)
    return [embed_text(text) for text in texts]


def embedding_available() -> bool:
    """True nếu hệ thống đang tạo được embedding (chat sẽ tìm theo vector).

    ai_service luôn có sẵn hàm embed_text (móc chuẩn) nhưng khi chưa cấu
    hình AI_API_KEY hàm đó raise AIUnavailableError — vì vậy phải kiểm tra
    thêm provider có sẵn sàng không, tránh báo "có embedding" oan.
    """
    if _embedding_function() is None:
        return False
    try:
        from app import ai_service
        provider = ai_service.get_provider()
        return bool(getattr(provider, "is_available", False))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Trích xuất text & chia chunk
# ---------------------------------------------------------------------------

def extract_pages(data: bytes, filename: str) -> list[tuple[int | None, str]]:
    """Trích text từ file, trả danh sách (số trang, text) — TXT tính là 1 trang.

    Raise ApiError: 400 sai định dạng/magic bytes, 422 file hợp lệ nhưng
    không trích được text (ví dụ PDF scan chỉ có ảnh — v1.0 không có OCR).
    """
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ApiError(400, "UNSUPPORTED_FILE_TYPE",
                       "Chỉ hỗ trợ tài liệu PDF hoặc TXT.",
                       [{"field": "file",
                         "message": f"Định dạng {ext or '(không rõ)'} không được hỗ trợ."}])
    if ext == ".pdf":
        if not data.startswith(PDF_MAGIC):
            raise ApiError(400, "INVALID_FILE",
                           "Tệp không đúng định dạng PDF.")
        return _extract_pdf_pages(data)
    # .txt — thử UTF-8, lùi về UTF-8 bỏ qua ký tự lỗi để tài liệu cũ vẫn nạp được
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="ignore")
    return [(None, text)]


def _extract_pdf_pages(data: bytes) -> list[tuple[int | None, str]]:
    try:
        from pypdf import PdfReader
    except ImportError:  # lùi về PyPDF2 nếu môi trường chỉ có bản cũ
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ImportError as exc:
            raise ApiError(503, "PDF_PARSER_UNAVAILABLE",
                           "Server chưa cài thư viện đọc PDF (pypdf).") from exc
    import io

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = []
        # Trần 300 trang: tài liệu nội bộ HR hiếm khi dài hơn; chặn PDF bất
        # thường giữ CPU không giới hạn (kiểm toán bảo mật 23/10).
        for index, page in enumerate(reader.pages[:300], start=1):
            pages.append((index, page.extract_text() or ""))
    except Exception as exc:
        raise ApiError(422, "TEXT_EXTRACT_FAILED",
                       "Không đọc được nội dung PDF (tệp có thể bị hỏng hoặc có mật khẩu).") from exc
    return pages


def split_chunks(text: str, max_chars: int = CHUNK_MAX_CHARS,
                 min_chars: int = CHUNK_MIN_CHARS,
                 overlap: int = CHUNK_OVERLAP_CHARS) -> list[str]:
    """Chia text thành các chunk <= max_chars, overlap `overlap` ký tự.

    Ưu tiên cắt ở cuối câu (. ) hoặc hết đoạn (\\n) trong vùng [min_chars,
    max_chars] để chunk không bị đứt giữa câu — quan trọng cho chất lượng
    truy hồi của chatbot.
    """
    text = re.sub(r"[ \t]+", " ", (text or "").replace("\r\n", "\n")).strip()
    if not text:
        return []
    chunks: list[str] = []
    start, length = 0, len(text)
    while start < length:
        end = min(start + max_chars, length)
        if end < length:
            window = text[start + min_chars:end]
            cut = max(window.rfind("\n"), window.rfind(". "))
            if cut > 0:
                end = start + min_chars + cut + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        next_start = end - overlap
        if next_start <= start:  # đảm bảo luôn tiến lên, tránh lặp vô hạn
            next_start = end
        start = next_start
    return chunks


# ---------------------------------------------------------------------------
# CRUD tài liệu
# ---------------------------------------------------------------------------

def _max_upload_bytes() -> int:
    mb = current_app.config.get("MAX_KB_SIZE_MB", 10)
    try:
        mb = int(mb)
    except (TypeError, ValueError):
        mb = 10
    return mb * 1024 * 1024


def _save_original_file(data: bytes, ext: str) -> str | None:
    """Lưu file gốc với tên do hệ thống sinh (B8); trả path tương đối."""
    upload_root = current_app.config.get("UPLOAD_FOLDER") or "uploads"
    folder = os.path.join(upload_root, "kb")
    try:
        os.makedirs(folder, exist_ok=True)
        name = f"{uuid.uuid4().hex}{ext}"
        with open(os.path.join(folder, name), "wb") as fh:
            fh.write(data)
        return os.path.join("kb", name)
    except OSError:
        current_app.logger.warning("Không lưu được file KB gốc.", exc_info=True)
        return None


def _remove_original_file(relative_path: str | None) -> None:
    """Xoá file gốc đã lưu khi xử lý tài liệu thất bại (tránh rác trên đĩa)."""
    if not relative_path:
        return
    upload_root = current_app.config.get("UPLOAD_FOLDER") or "uploads"
    try:
        os.remove(os.path.join(upload_root, relative_path))
    except OSError:
        pass


def create_document(file_storage, title: str | None, uploaded_by: int) -> KbDocument:
    """Nạp 1 tài liệu: lưu bản ghi + file gốc, trích text, chunk, embedding."""
    if file_storage is None or not (file_storage.filename or "").strip():
        raise ApiError(400, "FILE_REQUIRED", "Vui lòng chọn tệp tài liệu để tải lên.",
                       [{"field": "file", "message": "Thiếu tệp tài liệu."}])
    filename = file_storage.filename
    ext = os.path.splitext(filename)[1].lower()

    data = file_storage.read()
    if len(data) > _max_upload_bytes():
        raise ApiError(413, "FILE_TOO_LARGE",
                       f"Tài liệu vượt quá giới hạn {current_app.config.get('MAX_KB_SIZE_MB', 10)}MB.")
    if not data:
        raise ApiError(400, "EMPTY_FILE", "Tệp tài liệu rỗng.")

    document = KbDocument(
        title=(title or os.path.splitext(os.path.basename(filename))[0]).strip()[:255],
        file_url=_save_original_file(data, ext),
        uploaded_by=uploaded_by,
        status=KbDocument.STATUS_PROCESSING,
    )
    db.session.add(document)
    db.session.commit()

    try:
        pages = extract_pages(data, filename)
        pieces: list[tuple[int, int | None, str]] = []  # (chunk_index, page_no, text)
        index = 0
        for page_no, page_text in pages:
            for piece in split_chunks(page_text):
                pieces.append((index, page_no, piece))
                index += 1
        if not pieces:
            raise ApiError(422, "TEXT_EXTRACT_FAILED",
                           "Không trích xuất được nội dung chữ từ tài liệu. "
                           "Nếu đây là PDF scan (chỉ có ảnh), vui lòng dùng bản PDF có text hoặc tệp TXT.")
        # Embedding BATCH cho mọi chunk trong 1 lần gọi. Nội dung đem embed
        # kèm tiêu đề tài liệu để vector mang ngữ cảnh nguồn; chunk_text lưu
        # DB giữ nguyên bản để hiển thị/trích dẫn.
        vectors = embed_texts([f"{document.title}\n{piece}" for _, _, piece in pieces])
        chunks = [KbChunk(
            document_id=document.id,
            chunk_text=piece,
            chunk_index=chunk_index,
            page_no=page_no,
            embedding=vectors[i] if i < len(vectors) else None,
        ) for i, (chunk_index, page_no, piece) in enumerate(pieces)]
        db.session.add_all(chunks)
        document.status = KbDocument.STATUS_READY
        db.session.commit()
    except ApiError:
        db.session.rollback()
        document.status = KbDocument.STATUS_FAILED
        db.session.commit()
        _remove_original_file(document.file_url)
        raise
    except Exception as exc:  # lỗi bất ngờ -> đánh dấu failed, không để rác processing
        db.session.rollback()
        document.status = KbDocument.STATUS_FAILED
        db.session.commit()
        _remove_original_file(document.file_url)
        raise ApiError(422, "TEXT_EXTRACT_FAILED",
                       "Xử lý tài liệu thất bại, vui lòng kiểm tra lại tệp.") from exc
    return document


def serialize_document(document: KbDocument, chunks_count: int | None = None) -> dict:
    if chunks_count is None:
        chunks_count = (db.session.query(KbChunk)
                        .filter_by(document_id=document.id).count())
    # Kiểm tra phía Python: cột JSON lưu None thành JSON null (không phải
    # SQL NULL) nên isnot(None) ở SQL báo "có embedding" oan.
    has_embedding = any(
        row[0] for row in db.session.query(KbChunk.embedding)
        .filter(KbChunk.document_id == document.id).all())
    return {
        "id": document.id,
        "title": document.title,
        "fileUrl": document.file_url,
        "uploadedBy": document.uploaded_by,
        "status": document.status,
        "chunksCount": chunks_count,
        "searchMode": "embedding" if has_embedding else "keyword",
        "createdAt": document.created_at.isoformat() if document.created_at else None,
        "updatedAt": document.updated_at.isoformat() if document.updated_at else None,
    }


def list_documents(page: int = 1, limit: int = 20):
    """Danh sách tài liệu phân trang (mới nhất trước) + meta theo B6."""
    page = max(1, page)
    limit = min(max(1, limit), 100)
    query = KbDocument.query.order_by(KbDocument.created_at.desc(), KbDocument.id.desc())
    total = query.count()
    documents = query.offset((page - 1) * limit).limit(limit).all()
    counts = {}
    if documents:
        rows = (db.session.query(KbChunk.document_id, db.func.count(KbChunk.id))
                .filter(KbChunk.document_id.in_([d.id for d in documents]))
                .group_by(KbChunk.document_id).all())
        counts = dict(rows)
    return {
        "data": [serialize_document(d, counts.get(d.id, 0)) for d in documents],
        "meta": {
            "page": page,
            "limit": limit,
            "totalItems": total,
            "totalPages": (total + limit - 1) // limit if total else 0,
        },
    }


# ---------------------------------------------------------------------------
# Lập chỉ mục lại & bổ sung embedding
# ---------------------------------------------------------------------------

_EMBED_BATCH_SIZE = 64  # số chunk tối đa trong 1 lần gọi embed batch


def _embed_missing(chunks: list[KbChunk], titles: dict[int, str]) -> tuple[int, int]:
    """Tạo embedding cho các chunk đang thiếu trong danh sách (theo batch).

    Nội dung đem embed = tiêu đề tài liệu + nội dung chunk (nhất quán với
    lúc nạp mới). Trả (số thành công, số thất bại). Caller tự commit.
    """
    missing = [c for c in chunks if not c.embedding]
    embedded = failed = 0
    for start in range(0, len(missing), _EMBED_BATCH_SIZE):
        batch = missing[start:start + _EMBED_BATCH_SIZE]
        vectors = embed_texts(
            [f"{titles.get(c.document_id, '')}\n{c.chunk_text}" for c in batch])
        for chunk, vector in zip(batch, vectors):
            if vector:
                chunk.embedding = vector
                embedded += 1
            else:
                failed += 1
    return embedded, failed


def embed_missing_chunks() -> dict:
    """Tạo embedding cho MỌI chunk trong KB chưa có embedding.

    Dùng khi: vừa bổ sung AI_API_KEY/model embedding cho hệ thống đã có
    sẵn tài liệu nạp ở chế độ từ khóa. Trả {total, embedded, failed}.
    """
    # LƯU Ý: cột JSON của SQLAlchemy lưu None thành JSON null chứ không
    # phải SQL NULL -> lọc bằng embedding.is_(None) ở SQL sẽ sót chunk.
    # KB quy mô đồ án nhỏ nên lọc phía Python cho đúng cả SQLite/Postgres.
    chunks = [c for c in KbChunk.query.all() if not c.embedding]
    if not chunks:
        return {"total": 0, "embedded": 0, "failed": 0}
    titles = {d.id: d.title for d in KbDocument.query.all()}
    embedded = failed = 0
    for start in range(0, len(chunks), _EMBED_BATCH_SIZE):
        batch = chunks[start:start + _EMBED_BATCH_SIZE]
        ok, bad = _embed_missing(batch, titles)
        embedded += ok
        failed += bad
        db.session.commit()  # commit theo đợt — lỗi giữa chừng không mất hết
    return {"total": len(chunks), "embedded": embedded, "failed": failed}


def reindex_document(document_id: int) -> dict:
    """Lập chỉ mục lại 1 tài liệu (đổi model embedding / sửa pipeline...).

    Hệ thống CÓ giữ file gốc trên server (cột file_url, thư mục uploads/kb)
    nên cách chính là làm lại từ đầu: đọc file gốc -> trích text -> chia
    chunk -> embed batch, thay toàn bộ chunk cũ. Nếu file gốc không còn
    (bị dọn tay), lùi về chỉ bổ sung embedding cho các chunk đang thiếu —
    nội dung chunk cũ vẫn nguyên vẹn để chatbot dùng được.
    """
    document = db.session.get(KbDocument, document_id)
    if document is None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.")

    data = None
    if document.file_url:
        upload_root = current_app.config.get("UPLOAD_FOLDER") or "uploads"
        try:
            with open(os.path.join(upload_root, document.file_url), "rb") as fh:
                data = fh.read()
        except OSError:
            data = None  # file gốc đã mất -> dùng đường lùi bên dưới

    rebuilt = False
    embedded = failed = 0
    if data:
        pages = extract_pages(data, os.path.basename(document.file_url or ""))
        pieces: list[tuple[int, int | None, str]] = []
        index = 0
        for page_no, page_text in pages:
            for piece in split_chunks(page_text):
                pieces.append((index, page_no, piece))
                index += 1
        if pieces:
            vectors = embed_texts(
                [f"{document.title}\n{piece}" for _, _, piece in pieces])
            KbChunk.query.filter_by(document_id=document.id).delete(
                synchronize_session=False)
            db.session.add_all([KbChunk(
                document_id=document.id,
                chunk_text=piece,
                chunk_index=chunk_index,
                page_no=page_no,
                embedding=vectors[i] if i < len(vectors) else None,
            ) for i, (chunk_index, page_no, piece) in enumerate(pieces)])
            document.status = KbDocument.STATUS_READY
            db.session.commit()
            rebuilt = True
            embedded = sum(1 for v in vectors if v)
            failed = len(vectors) - embedded

    if not rebuilt:
        chunks = KbChunk.query.filter_by(document_id=document.id).all()
        embedded, failed = _embed_missing(chunks, {document.id: document.title})
        db.session.commit()

    result = serialize_document(document)
    result["rebuilt"] = rebuilt
    result["embeddedChunks"] = embedded
    result["failedChunks"] = failed
    return result


def delete_document(document_id: int) -> None:
    """Xoá tài liệu + toàn bộ chunk (cascade) + file gốc (best-effort)."""
    document = db.session.get(KbDocument, document_id)
    if document is None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.")
    file_url = document.file_url
    db.session.delete(document)  # chunks xoá theo cascade delete-orphan
    db.session.commit()
    if file_url:
        upload_root = current_app.config.get("UPLOAD_FOLDER") or "uploads"
        try:
            os.remove(os.path.join(upload_root, file_url))
        except OSError:
            pass  # file đã bị dọn tay / không tồn tại — không coi là lỗi
