"""Guard test — quy tắc do anh đặt 2026-11-14: AI chỉ ĐỌC dữ liệu, CẤM XOÁ.

Quét source của mọi blueprint AI (chat / people_ai / ai): nếu xuất hiện bất
kỳ lệnh xoá DB nào (session.delete / query.delete / DELETE FROM) thì fail.
AI tra cứu qua tool layer; mọi thao tác xoá vẫn phải đi qua API nghiệp vụ
có phân quyền riêng, không bao giờ qua AI.
"""
import pathlib
import re

_BANNED = re.compile(
    r"session\.delete\s*\(|\.query\.delete\s*\(|DELETE\s+FROM",
    re.IGNORECASE,
)


def test_ai_blueprints_never_delete_from_db():
    root = pathlib.Path(__file__).resolve().parents[1] / "app" / "blueprints"
    offenders = []
    for pkg in ("chat", "people_ai", "ai"):
        d = root / pkg
        if not d.exists():
            continue
        for path in d.rglob("*.py"):
            if _BANNED.search(path.read_text(encoding="utf-8")):
                offenders.append(str(path))
    assert not offenders, f"AI không được xoá dữ liệu DB: {offenders}"
