"""seed_demo cho Interviews — KHÔNG seed dữ liệu.

Phiên phỏng vấn thử do chính người dùng/khách tạo khi dùng tính năng;
không có dữ liệu mẫu nào cần nạp sẵn (khác các module nghiệp vụ).
Hàm tồn tại để giữ đúng khuôn blueprint (parent seed.py gọi thống
nhất) và idempotent theo định nghĩa: gọi bao nhiêu lần cũng không
thay đổi DB.
"""


def seed_demo():
    return None
