"""Guard test — timestamp bảng tin phải là ISO 8601 UTC có hậu tố Z.

Bug 2026-11-15: bài mới đăng hiện "7 giờ trước". created_at lưu UTC naive
(TimestampMixin.utcnow + cột DateTime không múi giờ); _iso cũ trả
isoformat() trần không múi giờ nên trình duyệt hiểu nhầm thành giờ địa
phương (+07) -> lệch đúng 7 giờ. Sửa: _iso gắn Z (coi naive là UTC).
Riêng check_in_at của chấm công lưu wall-clock +07 (không phải UTC) nên
activity phải đổi về UTC trước khi gắn Z — gắn Z trực tiếp sẽ lệch 7 giờ
về tương lai.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from app.models import Attendance, Employee
from app.models.feed import FeedComment, FeedPost
from tests.conftest import (auth_headers, login, make_department,
                            make_employee, make_user)


def test_feed_timestamps_have_utc_designator(client, session):
    dept = make_department(session, name="Kỹ thuật")
    emp = make_employee(session, code="NV9001", full_name="Nhan Vien 01",
                        email="nv9001@hrm.local", department_id=dept.id)
    hr = make_user(session, email="hr@hrm.local", password="Hr@12345",
                   role="hr", employee=emp)
    post = FeedPost(author_id=hr.id, content="Bai test gio")
    session.add(post)
    session.flush()
    session.add(FeedComment(post_id=post.id, author_id=hr.id,
                            content="Binh luan test gio"))
    # Chấm công hôm nay (giờ VN), check_in_at lưu wall-clock +07 như production.
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    checkin_at = datetime(today.year, today.month, today.day, 13, 48, 0)
    session.add(Attendance(employee_id=emp.id, work_date=today,
                           check_in_at=checkin_at,
                           status=Attendance.STATUS_PRESENT))
    session.commit()

    token = login(client, "hr@hrm.local", "Hr@12345")
    headers = auth_headers(token)

    resp = client.get("/api/v1/feed/posts", headers=headers)
    assert resp.status_code == 200, resp.get_json()
    mine = [p for p in resp.get_json()["data"] if p["id"] == post.id]
    assert len(mine) == 1
    assert mine[0]["created_at"].endswith("Z"), mine[0]["created_at"]
    assert mine[0]["comments_preview"][0]["created_at"].endswith("Z")

    resp = client.get("/api/v1/feed/activity", headers=headers)
    assert resp.status_code == 200, resp.get_json()
    ats = [it["at"] for it in resp.get_json()["data"] if it.get("at")]
    assert ats, "activity trống — seed không tạo được sự kiện"
    for at in ats:
        assert at.endswith("Z"), at
    checkin = [it for it in resp.get_json()["data"]
               if it["type"] == "attendance"]
    assert checkin, "thiếu sự kiện chấm công trong activity"
    # 13:48 giờ VN = 06:48 UTC.
    expected = checkin_at.replace(tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")) \
        .astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert checkin[0]["at"] == expected, checkin[0]["at"]
