"""Routes cho Chatbot HR — tiền tố /api/v1/chat (docs B3.2, FR-10).

    POST /chat/ask        Hỏi đáp: {"question": "..."} ->
                          {"answer", "sources", "mode", "retrieval_mode"}
                          mode = "live_data" (tra dữ liệu thật theo quyền
                          người hỏi qua tool layer — feature-expansion-v3
                          mục 5.1) hoặc "rag" (hỏi đáp tài liệu như cũ;
                          retrieval_mode = hybrid_rerank/hybrid/embedding/
                          keyword/none).
    GET  /chat/history    Lịch sử hỏi đáp của chính mình (phân trang)
    POST /chat/actions/execute
                          Thực thi hành động chatbot đã ĐỀ XUẤT và được
                          người dùng bấm xác nhận ở FE (v5 mục A):
                          {"type", "payload"} -> {"result_text",
                          "leave_request"}. Tầng execute kiểm tra lại
                          toàn bộ quyền + nghiệp vụ qua leave services;
                          lỗi giữ nguyên ApiError của leave.

Mọi vai trò đã đăng nhập đều dùng được (A2); mỗi người chỉ xem được
lịch sử của mình. Giới hạn độ dài câu hỏi ngay ở route để chặn lạm dụng.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.chat import bp, services
from app.errors import ApiError

MAX_QUESTION_CHARS = 2000


@bp.post("/ask")
@require_roles()
def ask():
    user = load_current_user()
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        raise ApiError(400, "VALIDATION_ERROR", "Vui lòng nhập câu hỏi.",
                       [{"field": "question", "message": "Câu hỏi không được để trống."}])
    if len(question) > MAX_QUESTION_CHARS:
        raise ApiError(400, "VALIDATION_ERROR",
                       f"Câu hỏi quá dài (tối đa {MAX_QUESTION_CHARS} ký tự).",
                       [{"field": "question", "message": "Câu hỏi vượt quá độ dài cho phép."}])
    return jsonify(services.ask_question(user=user, question=question))


@bp.post("/actions/execute")
@require_roles()
def execute_action():
    user = load_current_user()
    payload = request.get_json(silent=True) or {}
    action_type = (payload.get("type") or "").strip()
    if not action_type:
        raise ApiError(400, "VALIDATION_ERROR", "Thiếu loại hành động cần thực hiện.",
                       [{"field": "type", "message": "type không được để trống."}])
    return jsonify(services.execute_action(
        user=user, action_type=action_type,
        payload=payload.get("payload") or {}))


@bp.get("/history")
@require_roles()
def history():
    user = load_current_user()
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    return jsonify(services.get_history(user_id=user.id, page=page, limit=limit))
