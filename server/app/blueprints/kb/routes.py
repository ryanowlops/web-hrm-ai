"""Routes cho Knowledge Base — tiền tố /api/v1/kb (docs B3.2).

    POST   /kb/documents            HR/Admin tải tài liệu quy chế (PDF/TXT)
    GET    /kb/documents            HR/Admin xem danh sách tài liệu đã nạp
    POST   /kb/documents/<id>/reindex  HR/Admin lập chỉ mục lại 1 tài liệu
                                       (đọc file gốc -> chunk + embed lại;
                                       mất file gốc -> bổ sung embedding thiếu)
    POST   /kb/embed-missing        HR/Admin tạo embedding cho mọi chunk
                                    trong KB chưa có embedding
    DELETE /kb/documents/<id>       HR/Admin xoá tài liệu + toàn bộ chunk

Theo FR-10/A2: tài liệu quy chế do HR quản lý — nhân viên chỉ dùng
chatbot (blueprint chat) chứ không duyệt/tải tài liệu gốc. Lỗi theo
định dạng chuẩn B3.4 qua ApiError.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.kb import bp, services

HR_ROLES = ("admin", "hr")


@bp.post("/documents")
@require_roles(*HR_ROLES)
def upload_document():
    """Upload tài liệu (multipart/form-data: file, title?) -> 201 + tài liệu."""
    user = load_current_user()
    document = services.create_document(
        file_storage=request.files.get("file"),
        title=request.form.get("title"),
        uploaded_by=user.id,
    )
    return jsonify(services.serialize_document(document)), 201


@bp.get("/documents")
@require_roles(*HR_ROLES)
def get_documents():
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    return jsonify(services.list_documents(page=page, limit=limit))


@bp.post("/documents/<int:document_id>/reindex")
@require_roles(*HR_ROLES)
def reindex_document(document_id: int):
    """Lập chỉ mục lại 1 tài liệu -> tài liệu (serialize) + số chunk đã embed."""
    return jsonify(services.reindex_document(document_id))


@bp.post("/embed-missing")
@require_roles(*HR_ROLES)
def embed_missing():
    """Tạo embedding cho mọi chunk chưa có -> {total, embedded, failed}."""
    return jsonify(services.embed_missing_chunks())


@bp.delete("/documents/<int:document_id>")
@require_roles(*HR_ROLES)
def remove_document(document_id: int):
    services.delete_document(document_id)
    return jsonify({"message": "Đã xoá tài liệu và toàn bộ đoạn trích liên quan."})
