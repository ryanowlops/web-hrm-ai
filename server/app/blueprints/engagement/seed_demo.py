"""Seed demo cho module Engagement — IDEMPOTENT, không tự commit.

Parent (server/seed.py) gọi seed_demo() trong transaction chung:
- 6 kudo trong tháng hiện tại giữa các nhân viên NV0001–NV0004, đủ 5 loại
  huy hiệu, lời nhắn tiếng Việt tự nhiên. Khóa chống trùng: (người tặng,
  người nhận, lời nhắn).
- 1 khảo sát active "Khảo sát mức độ gắn kết — Quý 4/2026" (1 eNPS,
  2 scale, 1 single, 1 text) + 4 response ẨN DANH mẫu (eNPS 9, 8, 6, 10)
  + participation cho hr@ và employee@ (manager@ chưa trả lời — demo cả
  hai trạng thái). Khóa chống trùng: tiêu đề khảo sát / cặp participation.
"""

from app.extensions import db
from app.models import Employee, User
from app.models.engagement import (
    Kudo,
    Survey,
    SurveyParticipation,
    SurveyResponse,
)

SURVEY_TITLE = "Khảo sát mức độ gắn kết — Quý 4/2026"

SURVEY_QUESTIONS = [
    {
        "id": "q_enps",
        "type": "enps",
        "text": "Bạn sẵn lòng giới thiệu công ty là nơi làm việc tốt cho bạn bè ở mức nào?",
    },
    {
        "id": "q_scale_env",
        "type": "scale",
        "text": "Bạn hài lòng với môi trường và văn hoá làm việc hiện tại ở mức nào?",
    },
    {
        "id": "q_scale_growth",
        "type": "scale",
        "text": "Bạn thấy cơ hội học hỏi và phát triển bản thân tại công ty ở mức nào?",
    },
    {
        "id": "q_shift",
        "type": "single",
        "text": "Khung giờ làm việc bạn mong muốn nhất?",
        "options": ["Ca hành chính (08:00–17:00)", "Linh hoạt theo dự án", "Làm từ xa một phần"],
    },
    {
        "id": "q_text",
        "type": "text",
        "text": "Bạn muốn công ty cải thiện điều gì nhất trong quý tới?",
    },
]

# (email người tặng, mã NV người nhận, badge, lời nhắn)
KUDOS = [
    (
        "manager@hrm.local",
        "NV0003",
        "teamwork",
        "Cảm ơn Lan đã hỗ trợ phòng Kinh doanh chốt số liệu cuối tháng rất kịp thời!",
    ),
    (
        "hr@hrm.local",
        "NV0001",
        "leadership",
        "Anh Minh dẫn dắt đội Kinh doanh vượt chỉ tiêu quý này, rất đáng ghi nhận.",
    ),
    (
        "employee@hrm.local",
        "NV0002",
        "thanks",
        "Em cảm ơn chị Hà đã hướng dẫn em hoàn tất thủ tục hội nhập nhanh gọn.",
    ),
    (
        "manager@hrm.local",
        "NV0004",
        "dedication",
        "Hùng ở lại hỗ trợ kiểm thử bản phát hành cuối tuần, tinh thần rất tốt.",
    ),
    (
        "hr@hrm.local",
        "NV0003",
        "innovation",
        "Ý tưởng tự động hoá bảng tổng hợp chấm công của Lan giúp HR tiết kiệm nhiều giờ mỗi tháng.",
    ),
    (
        "employee@hrm.local",
        "NV0001",
        "teamwork",
        "Cảm ơn anh Minh đã dành thời gian kèm cặp em trong dự án đầu tiên.",
    ),
]

# 4 response ẩn danh mẫu — eNPS lần lượt 9, 8, 6, 10.
SAMPLE_RESPONSES = [
    {
        "q_enps": 9,
        "q_scale_env": 5,
        "q_scale_growth": 4,
        "q_shift": "Ca hành chính (08:00–17:00)",
        "q_text": "Mong công ty tổ chức thêm hoạt động gắn kết giữa các phòng ban.",
    },
    {
        "q_enps": 8,
        "q_scale_env": 4,
        "q_scale_growth": 4,
        "q_shift": "Linh hoạt theo dự án",
        "q_text": "",
    },
    {
        "q_enps": 6,
        "q_scale_env": 3,
        "q_scale_growth": 3,
        "q_shift": "Làm từ xa một phần",
        "q_text": "Cần cải thiện tốc độ duyệt đơn từ và thông báo kết quả sớm hơn.",
    },
    {
        "q_enps": 10,
        "q_scale_env": 5,
        "q_scale_growth": 5,
        "q_shift": "Ca hành chính (08:00–17:00)",
        "q_text": "Mọi thứ đang rất tốt, cảm ơn đội ngũ HR.",
    },
]


def _user_by_email(email):
    return User.query.filter_by(email=email).first()


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def _seed_kudos():
    for from_email, to_code, badge, message in KUDOS:
        giver = _user_by_email(from_email)
        receiver = _employee_by_code(to_code)
        if giver is None or receiver is None:
            continue
        exists = (
            Kudo.query.filter_by(
                from_user_id=giver.id,
                to_employee_id=receiver.id,
                message=message,
            ).first()
            is not None
        )
        if exists:
            continue
        db.session.add(
            Kudo(
                from_user_id=giver.id,
                to_employee_id=receiver.id,
                badge=badge,
                message=message,
            )
        )
    db.session.flush()


def _seed_survey():
    survey = Survey.query.filter_by(title=SURVEY_TITLE).first()
    if survey is None:
        hr_user = _user_by_email("hr@hrm.local")
        if hr_user is None:
            return
        survey = Survey(
            title=SURVEY_TITLE,
            description=(
                "Khảo sát ẩn danh định kỳ nhằm lắng nghe mức độ gắn kết của "
                "toàn thể nhân viên. Đáp án không gắn với danh tính người trả lời."
            ),
            questions=SURVEY_QUESTIONS,
            status=Survey.STATUS_ACTIVE,
            created_by=hr_user.id,
        )
        db.session.add(survey)
        db.session.flush()

    # Response ẩn danh mẫu: chỉ seed khi khảo sát chưa có response nào.
    if SurveyResponse.query.filter_by(survey_id=survey.id).count() == 0:
        for answers in SAMPLE_RESPONSES:
            db.session.add(SurveyResponse(survey_id=survey.id, answers=answers))
        db.session.flush()

    # Participation mẫu: hr@ và employee@ đã trả lời; manager@ chưa.
    for email in ("hr@hrm.local", "employee@hrm.local"):
        user = _user_by_email(email)
        if user is None:
            continue
        exists = (
            SurveyParticipation.query.filter_by(
                survey_id=survey.id, user_id=user.id
            ).first()
            is not None
        )
        if not exists:
            db.session.add(
                SurveyParticipation(survey_id=survey.id, user_id=user.id)
            )
    db.session.flush()


def seed_demo():
    _seed_kudos()
    _seed_survey()
