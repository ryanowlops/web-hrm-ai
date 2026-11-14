"""GET /kb/documents/<id>/content — HR/Admin đọc toàn văn quy chế.

Nhân sự phải xem được quy chế, không chỉ hỏi chatbot: trước đây panel KB
chỉ liệt kê tên tài liệu + trạng thái, không có chỗ nào đọc được nội dung
gốc (không endpoint, không nút xem). Endpoint này trả toàn văn: ưu tiên
file gốc trên đĩa, lùi về nối chunk trong DB khi file đã mất.

- HR/Admin: 200 + toàn văn theo đúng thứ tự chunk.
- Employee/Manager: 403 (chỉ hỏi qua chatbot, không đọc file gốc).
- Sai id: 404.
"""
import io

from app.models import KbChunk, KbDocument
from tests.conftest import auth_headers, login, make_user


def _make_users(session):
    hr = make_user(session, "hr@hrm.local", "Hr@12345", "hr")
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    employee = make_user(session, "nv@hrm.local", "Employee@123", "employee")
    manager = make_user(session, "ql@hrm.local", "Manager@123", "manager")
    return hr, admin, employee, manager


def _make_doc(session, uploaded_by, chunks=None, file_url=None):
    doc = KbDocument(
        title="Quy chế nhân sự 2026",
        file_url=file_url,
        uploaded_by=uploaded_by,
        status=KbDocument.STATUS_READY,
    )
    session.add(doc)
    session.commit()
    for i, text in enumerate(chunks or []):
        session.add(KbChunk(
            document_id=doc.id,
            chunk_text=text,
            chunk_index=i,
            page_no=None,
            embedding=None,
        ))
    session.commit()
    return doc


def test_hr_reads_content_from_chunks_in_order(client, session):
    """HR đọc toàn văn: các chunk nối theo chunk_index, đúng thứ tự."""
    hr, _, _, _ = _make_users(session)
    doc = _make_doc(session, hr.id, chunks=[
        "Chương 1. Giờ làm việc: 08:00–17:00.",
        "Chương 2. Nghỉ phép: 12 ngày phép năm.",
    ])
    token = login(client, "hr@hrm.local", "Hr@12345")

    resp = client.get(f"/api/v1/kb/documents/{doc.id}/content",
                      headers=auth_headers(token))

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["title"] == "Quy chế nhân sự 2026"
    assert body["source"] == "chunks"
    assert body["truncated"] is False
    assert body["content"] == (
        "Chương 1. Giờ làm việc: 08:00–17:00.\n\n"
        "Chương 2. Nghỉ phép: 12 ngày phép năm."
    )


def test_admin_reads_content(client, session):
    """Admin đọc được toàn văn như HR."""
    hr, admin, _, _ = _make_users(session)
    doc = _make_doc(session, hr.id, chunks=["Điều 1. Nội dung quy chế."])
    token = login(client, "admin@hrm.local", "Admin@123")

    resp = client.get(f"/api/v1/kb/documents/{doc.id}/content",
                      headers=auth_headers(token))

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["content"] == "Điều 1. Nội dung quy chế."


def test_employee_and_manager_forbidden(client, session):
    """Nhân viên + quản lý KHÔNG được đọc file gốc — chỉ hỏi qua chatbot."""
    hr, _, employee, manager = _make_users(session)
    doc = _make_doc(session, hr.id, chunks=["Điều 1. Nội dung quy chế."])

    for email, password in (("nv@hrm.local", "Employee@123"),
                            ("ql@hrm.local", "Manager@123")):
        token = login(client, email, password)
        resp = client.get(f"/api/v1/kb/documents/{doc.id}/content",
                          headers=auth_headers(token))
        assert resp.status_code == 403, (email, resp.get_json())


def test_missing_document_404(client, session):
    """Sai id -> 404, không 500."""
    hr, _, _, _ = _make_users(session)
    token = login(client, "hr@hrm.local", "Hr@12345")

    resp = client.get("/api/v1/kb/documents/9999/content",
                      headers=auth_headers(token))

    assert resp.status_code == 404, resp.get_json()


def test_missing_file_falls_back_to_chunks(client, session):
    """File gốc mất (Render restart/dọn tay) -> vẫn đọc được từ chunk DB."""
    hr, _, _, _ = _make_users(session)
    doc = _make_doc(session, hr.id, file_url="kb/khong-ton-tai.txt",
                    chunks=["Chương 1. Giờ làm việc.", "Chương 2. Nghỉ phép."])
    token = login(client, "hr@hrm.local", "Hr@12345")

    resp = client.get(f"/api/v1/kb/documents/{doc.id}/content",
                      headers=auth_headers(token))

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["source"] == "chunks"
    assert "Chương 1" in body["content"] and "Chương 2" in body["content"]


def test_content_from_uploaded_file(client, app, session, tmp_path, monkeypatch):
    """Upload thật 1 file TXT -> Xem đọc đúng từng ký tự file gốc."""
    monkeypatch.setitem(app.config, "UPLOAD_FOLDER", str(tmp_path))
    hr, _, _, _ = _make_users(session)
    token = login(client, "hr@hrm.local", "Hr@12345")

    text = "Chương 1. Giờ làm việc: 08:00–17:00.\nChương 2. Nghỉ phép: 12 ngày."
    resp = client.post(
        "/api/v1/kb/documents",
        data={"title": "Quy chế test",
              "file": (io.BytesIO(text.encode("utf-8")), "quy-che-test.txt")},
        content_type="multipart/form-data",
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.get_json()
    doc_id = resp.get_json()["id"]

    resp = client.get(f"/api/v1/kb/documents/{doc_id}/content",
                      headers=auth_headers(token))

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["source"] == "file"
    assert body["content"] == text
