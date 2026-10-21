"""Routes cho Documents (hồ sơ điện tử + giấy xác nhận) — /api/v1/documents.

Phân quyền (hợp đồng feature-expansion-v3 mục 2):
- Đọc danh sách/tải xuống: mọi vai trò đã đăng nhập, scope dữ liệu ép ở
  service (employee = mình; manager = phòng mình; hr/admin = tất cả).
- Upload: employee (chỉ cho mình) + hr/admin (cho bất kỳ ai).
- Xoá: hr/admin hoặc chính chủ hồ sơ.
- /expiring và quyết định cấp giấy xác nhận: hr/admin.
Mọi lỗi trả định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

import io

from flask import Response, jsonify, request, send_file

from app.blueprints.auth.guards import require_roles
from app.blueprints.documents import bp
from app.blueprints.documents import schemas, services
from app.blueprints.documents.services import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")
UPLOAD_ROLES = ("admin", "hr", "employee")


def _error(api_error):
    return jsonify({
        "error": {
            "code": api_error.code,
            "message": api_error.message,
            "details": api_error.details,
        }
    }), api_error.status


def _validation_error(errors):
    return _error(
        ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors)
    )


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
                       [{"field": "body", "message": "Body phải là JSON."}])
    return data


# ---------------------------------------------------------------------------
# Tài liệu nhân viên
# ---------------------------------------------------------------------------

@bp.route("", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_documents():
    try:
        user = services.current_user()
        items, meta = services.list_documents(request.args, user)
        return jsonify({
            "data": [schemas.document_to_dict(d) for d in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("", methods=["POST"], strict_slashes=False)
@require_roles(*UPLOAD_ROLES)
def create_document():
    try:
        user = services.current_user()
        doc = services.create_document(
            user, request.form, request.files.get("file")
        )
        return jsonify({"data": schemas.document_to_dict(doc)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/expiring", methods=["GET"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def list_expiring():
    try:
        user = services.current_user()
        items, meta = services.list_expiring(request.args, user)
        return jsonify({
            "data": [schemas.document_to_dict(d) for d in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:doc_id>/download", methods=["GET"])
@require_roles(*READ_ROLES)
def download_document(doc_id):
    try:
        user = services.current_user()
        doc, abs_path = services.get_document_for_download(doc_id, user)
        return send_file(
            abs_path,
            as_attachment=True,
            download_name=doc.original_filename,
        )
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:doc_id>", methods=["DELETE"])
@require_roles(*READ_ROLES)
def delete_document(doc_id):
    try:
        user = services.current_user()
        services.delete_document(doc_id, user)
        return jsonify({"data": {"id": doc_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Giấy xác nhận
# ---------------------------------------------------------------------------

@bp.route("/certificates", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_certificates():
    try:
        user = services.current_user()
        items, meta = services.list_certificates(request.args, user)
        return jsonify({
            "data": [schemas.certificate_to_dict(r) for r in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/certificates", methods=["POST"], strict_slashes=False)
@require_roles(*READ_ROLES)
def create_certificate():
    try:
        cleaned, errors = schemas.validate_certificate_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        req = services.create_certificate(user, cleaned)
        return jsonify({"data": schemas.certificate_to_dict(req)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/certificates/<int:req_id>/decision", methods=["POST"])
@require_roles(*WRITE_ROLES)
def decide_certificate(req_id):
    try:
        cleaned, errors = schemas.validate_decision_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        req = services.decide_certificate(req_id, user, cleaned)
        return jsonify({"data": schemas.certificate_to_dict(req)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/certificates/<int:req_id>/download", methods=["GET"])
@require_roles(*READ_ROLES)
def download_certificate(req_id):
    try:
        user = services.current_user()
        req = services.get_certificate_for_download(req_id, user)
        payload = req.issued_content.encode("utf-8")
        filename = f"giay-xac-nhan-{req.id}.txt"
        return send_file(
            io.BytesIO(payload),
            as_attachment=True,
            download_name=filename,
            mimetype="text/plain; charset=utf-8",
        )
    except ApiError as exc:
        return _error(exc)
