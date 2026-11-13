"""Service layer cho Briefing — báo cáo điều hành AI (v6 mục 4).

Nguyên tắc số liệu (bắt buộc, mục 4.1): LLM KHÔNG BAO GIỜ tự nghĩ ra số.
`collect_numbers()` gom "gói số" từ tầng sở hữu số liệu:

- people_ai.services.get_attrition_risk()  → số nhân sự nguy cơ cao (gọi thẳng)
- engagement.services.survey_results()     → eNPS của khảo sát gần nhất có
  câu hỏi eNPS đã có phản hồi (gọi thẳng)
- Còn lại (nhân sự, chấm công, nghỉ phép, tuyển dụng, kudos) chưa có service
  tổng hợp theo kỳ ở module sở hữu → truy vấn trực tiếp model sở hữu với
  định nghĩa nêu rõ trong từng hàm con.

Văn xuôi: AI khả dụng → provider.chat_completion(json_mode=False) với gói
số đưa nguyên văn vào prompt; prose trả về được KIỂM CHỨNG bằng regex —
mọi con số trong prose phải thuộc gói số (hoặc thành phần ngày tháng của
kỳ), sai là bỏ, rơi xuống template. Template dựng báo cáo xác định từ
cùng gói số và nói rõ "chưa có dữ liệu" ở mục thiếu thay vì bỏ qua.
"""

import json
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func

from app.errors import ApiError
from app.extensions import db
from app.models.attendance import Attendance
from app.models.briefing import Briefing
from app.models.employees import Employee
from app.models.engagement import Kudo, Survey
from app.models.leave import LeaveRequest
from app.models.offboarding import OffboardingProcess
from app.models.recruitment import Candidate, JobPosting

ICT = ZoneInfo("Asia/Ho_Chi_Minh")

VALID_PERIODS = (Briefing.PERIOD_WEEK, Briefing.PERIOD_MONTH)


def today_ict() -> date:
    return datetime.now(ICT).date()


def period_window(period: str, ref_date: date) -> tuple[date, date]:
    """Khung [start, end] (gồm cả 2 đầu) của kỳ chứa ref_date.

    week  → tuần ISO (thứ 2 .. chủ nhật) chứa ref_date.
    month → ngày 1 .. ngày cuối tháng chứa ref_date.
    """
    if period == Briefing.PERIOD_WEEK:
        start = ref_date - timedelta(days=ref_date.weekday())
        return start, start + timedelta(days=6)
    start = ref_date.replace(day=1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return start, end


def _dt_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Khung datetime cho cột created_at (timestamp UTC).

    Kỳ tính theo ngày ICT nên mốc là 00:00 ICT đổi sang UTC:
    [start 00:00 ICT, end+1 00:00 ICT).
    """
    return (
        datetime.combine(start, time.min, tzinfo=ICT).astimezone(timezone.utc),
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=ICT)
        .astimezone(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Gói số liệu — từng mục một, truy vấn tầng sở hữu số liệu
# ---------------------------------------------------------------------------

def _headcount_and_movement(start: date, end: date) -> dict:
    """Tổng nhân sự hiện hành + biến động trong kỳ.

    - headcount_total: nhân viên chưa nghỉ việc (status != resigned) tại
      thời điểm tạo báo cáo.
    - new_hires: nhân viên có start_date rơi trong kỳ.
    - departures: quy trình offboarding ĐÃ HOÀN TẤT có ngày làm việc cuối
      (last_working_day) rơi trong kỳ.
    """
    headcount_total = (
        Employee.query.filter(Employee.status != Employee.STATUS_RESIGNED).count()
    )
    new_hires = (
        Employee.query
        .filter(Employee.start_date >= start, Employee.start_date <= end)
        .count()
    )
    departures = (
        OffboardingProcess.query
        .filter(
            OffboardingProcess.status == OffboardingProcess.STATUS_COMPLETED,
            OffboardingProcess.last_working_day >= start,
            OffboardingProcess.last_working_day <= end,
        )
        .count()
    )
    return {
        "headcount_total": headcount_total,
        "new_hires": new_hires,
        "departures": departures,
    }


def _attendance_numbers(start: date, end: date) -> dict:
    """Chấm công trong kỳ theo work_date.

    on_time_rate = present / tổng bản ghi * 100 (làm tròn 1 chữ số);
    None khi kỳ chưa có bản ghi nào (FE/template nói "chưa có dữ liệu").
    """
    rows = (
        db.session.query(Attendance.status, func.count(Attendance.id))
        .filter(Attendance.work_date >= start, Attendance.work_date <= end)
        .group_by(Attendance.status)
        .all()
    )
    counts = dict(rows)
    present = counts.get(Attendance.STATUS_PRESENT, 0)
    late = counts.get(Attendance.STATUS_LATE, 0)
    absent = counts.get(Attendance.STATUS_ABSENT, 0)
    on_leave = counts.get(Attendance.STATUS_ON_LEAVE, 0)
    total = present + late + absent + on_leave
    return {
        "total_records": total,
        "present": present,
        "late": late,
        "absent": absent,
        "on_leave": on_leave,
        "on_time_rate": round(present * 100.0 / total, 1) if total else None,
    }


def _leave_numbers(start: date, end: date) -> dict:
    """Đơn nghỉ: đang chờ duyệt (ảnh chụp hiện tại) + đã duyệt bắt đầu trong kỳ."""
    pending = (
        LeaveRequest.query
        .filter(LeaveRequest.status.in_((
            LeaveRequest.STATUS_PENDING,
            LeaveRequest.STATUS_MANAGER_APPROVED,
        )))
        .count()
    )
    approved_in_period = (
        LeaveRequest.query
        .filter(
            LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
            LeaveRequest.from_date >= start,
            LeaveRequest.from_date <= end,
        )
        .count()
    )
    return {"pending_requests": pending, "approved_in_period": approved_in_period}


def _recruitment_numbers(start: date, end: date) -> dict:
    """Tin tuyển đang mở (hiện tại) + ứng viên nộp mới trong kỳ."""
    open_jobs = JobPosting.query.filter_by(status=JobPosting.STATUS_OPEN).count()
    dt_start, dt_end = _dt_bounds(start, end)
    new_candidates = (
        Candidate.query
        .filter(Candidate.created_at >= dt_start, Candidate.created_at < dt_end)
        .count()
    )
    return {"open_job_postings": open_jobs, "new_candidates": new_candidates}


def _latest_enps() -> dict | None:
    """eNPS mới nhất qua engagement.services.survey_results (gọi thẳng).

    Quét khảo sát từ mới nhất về trước; lấy khảo sát đầu tiên có câu hỏi
    dạng enps đã có điểm (enps_score != None). Không có → None (báo cáo
    ghi rõ "chưa có dữ liệu eNPS").
    """
    from app.blueprints.engagement import services as engagement_services

    surveys = (
        Survey.query
        .order_by(Survey.created_at.desc(), Survey.id.desc())
        .all()
    )
    for survey in surveys:
        questions = survey.questions or []
        if not any(q.get("type") == "enps" for q in questions):
            continue
        results = engagement_services.survey_results(survey.id)
        for question in results.get("questions", []):
            if question.get("type") == "enps" and question.get("enps_score") is not None:
                return {
                    "score": question["enps_score"],
                    "survey_id": survey.id,
                    "survey_title": survey.title,
                    "responses": results.get("total_responses", 0),
                }
    return None


def collect_numbers(user, period: str, ref_date: date) -> dict:
    """Gom toàn bộ gói số cho kỳ. Đây là nguồn sự thật duy nhất của prose."""
    start, end = period_window(period, ref_date)

    from app.blueprints.people_ai import services as people_ai_services

    attrition = people_ai_services.get_attrition_risk(user)
    attrition_summary = attrition.get("summary") or {}

    dt_start, dt_end = _dt_bounds(start, end)
    kudos_in_period = (
        Kudo.query
        .filter(Kudo.created_at >= dt_start, Kudo.created_at < dt_end)
        .count()
    )

    numbers = {
        "period": period,
        "ref_date": ref_date.isoformat(),
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "attendance": _attendance_numbers(start, end),
        "leave": _leave_numbers(start, end),
        "recruitment": _recruitment_numbers(start, end),
        "engagement": {
            "kudos_in_period": kudos_in_period,
            "enps": _latest_enps(),
        },
        "attrition_high_risk": attrition_summary.get("high", 0),
        "attrition_window_days": attrition.get("window_days"),
    }
    numbers.update(_headcount_and_movement(start, end))
    return numbers


# ---------------------------------------------------------------------------
# Văn xuôi — AI (có kiểm chứng số) hoặc template xác định
# ---------------------------------------------------------------------------

_PROSE_SYSTEM_PROMPT = (
    "Bạn là trợ lý phân tích nhân sự viết báo cáo điều hành cho ban lãnh đạo "
    "công ty. Viết văn xuôi tiếng Việt trang trọng, súc tích (4-6 đoạn ngắn), "
    "chỉ diễn giải ĐÚNG các số liệu trong gói số được cung cấp. TUYỆT ĐỐI "
    "không tự thêm bất kỳ con số nào khác (kể cả số phần trăm, số ngày, số "
    "người) ngoài gói số. Mục nào gói số ghi là chưa có dữ liệu (null) thì "
    "nói rõ 'chưa có dữ liệu' cho mục đó. Không bịa tên người, tên phòng ban "
    "hay sự kiện cụ thể."
)

_NUMBER_TOKEN_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _allowed_number_values(numbers: dict) -> set[float]:
    """Mọi giá trị số hợp lệ mà prose được phép nhắc tới.

    Gồm: mọi số lá trong gói số + các thành phần ngày/tháng/năm của kỳ
    (để prose được viết kiểu 'tuần từ ngày 19/10 đến 25/10/2026') + mọi
    chữ số nằm ngay trong các chuỗi của gói số (vd tiêu đề khảo sát
    'Khảo sát gắn kết Q4' — prose trích nguyên văn tiêu đề là trung thực,
    không phải bịa số).
    """
    allowed: set[float] = set()

    def walk(value):
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            allowed.add(float(value))
        elif isinstance(value, str):
            for token in _NUMBER_TOKEN_RE.findall(value):
                allowed.add(float(token.replace(",", ".")))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(numbers)
    for key in ("period_start", "period_end", "ref_date"):
        raw = numbers.get(key)
        if isinstance(raw, str):
            for part in re.findall(r"\d+", raw):
                allowed.add(float(part))
    return allowed


def _metric_number_values(numbers: dict) -> tuple[dict[str, set[float]], dict[str, set[float]]]:
    """Gói số -> ({đường dẫn metric: {giá trị số}}, {chuỗi lá: {số trong chuỗi}}).

    Mọi số lá được gắn với đúng metric chứa nó theo đường dẫn (vd
    'attendance.present', 'engagement.enps.score'), thay vì đổ chung vào
    một tập phẳng — để bước kiểm chứng gắn mỗi con số trong prose với
    metric mà nó đang nói tới, thay vì chấp nhận số của metric khác.
    Số nằm trong chuỗi lá (vd 'Q4' trong tiêu đề khảo sát) được trả riêng
    để prose trích nguyên văn tiêu đề vẫn được chấp nhận.
    """
    metrics: dict[str, set[float]] = {}
    string_numbers: dict[str, set[float]] = {}

    def collect(path, value):
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            metrics.setdefault(path, set()).add(float(value))
        elif isinstance(value, str):
            tokens = {
                float(token.replace(",", "."))
                for token in _NUMBER_TOKEN_RE.findall(value)
            }
            if tokens:
                metrics.setdefault(path, set()).update(tokens)
                string_numbers[value] = tokens
        elif isinstance(value, dict):
            for key, item in value.items():
                collect(f"{path}.{key}" if path else str(key), item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                collect(path, item)

    collect("", numbers)
    return metrics, string_numbers


def _date_component_values(numbers: dict) -> set[float]:
    """Thành phần ngày/tháng/năm của kỳ (cho prose viết 'ngày 19/10')."""
    parts: set[float] = set()
    for key in ("period_start", "period_end", "ref_date"):
        raw = numbers.get(key)
        if isinstance(raw, str):
            for part in re.findall(r"\d+", raw):
                parts.add(float(part))
    return parts


# Từ khoá (tiếng Việt) -> metric mà con số đứng cạnh nó phải thuộc về.
# Một từ khoá có thể trỏ tới nhiều metric khi cùng ngữ cảnh (vd 'đúng giờ'
# vừa là số lượt vừa là tỉ lệ).
_METRIC_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("tổng nhân sự", ("headcount_total",)),
    ("tổng số nhân viên", ("headcount_total",)),
    ("vào mới", ("new_hires",)),
    ("nhân viên mới", ("new_hires",)),
    ("nhân sự mới", ("new_hires",)),
    ("nghỉ việc", ("departures",)),
    ("nguy cơ cao", ("attrition_high_risk",)),
    ("rủi ro cao", ("attrition_high_risk",)),
    ("cửa sổ", ("attrition_window_days",)),
    ("bản ghi chấm công", ("attendance.total_records",)),
    ("bản ghi", ("attendance.total_records",)),
    ("đúng giờ", ("attendance.present", "attendance.on_time_rate")),
    ("tỉ lệ", ("attendance.on_time_rate",)),
    ("tỷ lệ", ("attendance.on_time_rate",)),
    ("đi muộn", ("attendance.late",)),
    ("muộn", ("attendance.late",)),
    ("vắng mặt", ("attendance.absent",)),
    ("vắng", ("attendance.absent",)),
    ("nghỉ phép", ("attendance.on_leave", "leave.approved_in_period")),
    ("chờ duyệt", ("leave.pending_requests",)),
    ("đã duyệt", ("leave.approved_in_period",)),
    ("tin tuyển", ("recruitment.open_job_postings",)),
    ("đang mở", ("recruitment.open_job_postings",)),
    ("ứng viên", ("recruitment.new_candidates",)),
    ("kudos", ("engagement.kudos_in_period",)),
    ("vinh danh", ("engagement.kudos_in_period",)),
    ("enps", ("engagement.enps.score", "engagement.enps.responses")),
    ("phản hồi", ("engagement.enps.responses",)),
)

def _near(value: float, candidates) -> bool:
    """So sánh số với sai số cho phép (giữ ngưỡng cũ 0,051)."""
    return any(abs(value - candidate) < 0.051 for candidate in candidates)


def prose_numbers_are_grounded(prose: str, numbers: dict) -> bool:
    """True nếu MỌI con số trong prose đều đúng metric của nó.

    Thứ tự kiểm tra cho mỗi con số:
    1. Thành phần ngày/tháng/năm của kỳ (vd '19/10/2026') -> cho qua.
    2. Số nằm trong một chuỗi của gói số được prose trích nguyên văn
       (vd tiêu đề khảo sát '... Q4') -> cho qua.
    3. Số phải thuộc một trong các metric mà từ khoá của mệnh đề chứa nó
       đang nói tới (mệnh đề = đoạn câu tách bằng dấu phẩy/chấm phẩy;
       mệnh đề không có từ khoá thì lấy cả câu). Đây là điểm chặn tráo
       số: '47 người đã nghỉ việc' bị loại khi departures = 2 dù
       headcount_total = 47, vì mệnh đề đó chỉ nhắc tới 'nghỉ việc'.
    4. Câu không nhắc metric nào -> dự phòng như trước: số phải thuộc gói số.
    """
    metrics, string_numbers = _metric_number_values(numbers)
    flat = _allowed_number_values(numbers)
    date_parts = _date_component_values(numbers)
    text = prose or ""
    folded = text.casefold()

    # Vị trí mọi lần prose trích nguyên văn một chuỗi lá có chứa số.
    quoted_spans: list[tuple[int, int, set[float]]] = []
    for string_value, tokens in string_numbers.items():
        start = 0
        while True:
            idx = folded.find(string_value.casefold(), start)
            if idx < 0:
                break
            quoted_spans.append((idx, idx + len(string_value), tokens))
            start = idx + 1

    def _keywords_in(span_text: str) -> tuple[str, ...]:
        lowered = span_text.casefold()
        found: list[str] = []
        for keyword, _paths in _METRIC_KEYWORDS:
            if keyword in lowered:
                found.append(keyword)
        return tuple(found)

    # Ranh giới câu: sau dấu kết câu / xuống dòng. Ranh giới mệnh đề trong
    # câu: dấu phẩy / chấm phẩy.
    sentence_bounds = [0]
    for match in re.finditer(r"[.!?\n]+", text):
        sentence_bounds.append(match.end())
    sentence_bounds.append(len(text))
    sentences = [
        (sentence_bounds[i], sentence_bounds[i + 1])
        for i in range(len(sentence_bounds) - 1)
    ]

    keyword_paths = dict(_METRIC_KEYWORDS)
    for match in _NUMBER_TOKEN_RE.finditer(text):
        value = float(match.group(0).replace(",", "."))
        if _near(value, date_parts):
            continue
        token_start, token_end = match.span()
        if any(
            start <= token_start and token_end <= end and _near(value, tokens)
            for start, end, tokens in quoted_spans
        ):
            continue
        sent_start, sent_end = next(
            (s, e) for s, e in sentences if s <= token_start < e
        )
        clause_start, clause_end = sent_start, sent_end
        for sep in re.finditer(r"[,;]", text[sent_start:sent_end]):
            boundary = sent_start + sep.start() + 1
            if boundary <= token_start:
                clause_start = max(clause_start, boundary)
            elif boundary > token_end and clause_end == sent_end:
                clause_end = boundary
        keywords = _keywords_in(text[clause_start:clause_end])
        if not keywords:
            keywords = _keywords_in(text[sent_start:sent_end])
        if keywords:
            allowed: set[float] = set()
            for keyword in keywords:
                for path in keyword_paths[keyword]:
                    allowed |= metrics.get(path, set())
            if not _near(value, allowed):
                return False
        elif not _near(value, flat):
            return False
    return True


def _fmt_rate(value) -> str:
    """92.5 → '92,5' theo thói quen viết số tiếng Việt."""
    return str(value).replace(".", ",")


def _period_label(numbers: dict) -> str:
    start = date.fromisoformat(numbers["period_start"])
    end = date.fromisoformat(numbers["period_end"])
    span = f"từ {start.strftime('%d/%m/%Y')} đến {end.strftime('%d/%m/%Y')}"
    return f"tuần {span}" if numbers["period"] == "week" else f"tháng {span}"


def template_prose(numbers: dict) -> str:
    """Dự phòng xác định: dựng báo cáo từ đúng gói số, đủ mọi mục."""
    label = _period_label(numbers)
    att = numbers["attendance"]
    leave = numbers["leave"]
    rec = numbers["recruitment"]
    eng = numbers["engagement"]
    enps = eng.get("enps")

    paragraphs = [
        (
            f"Báo cáo điều hành {label}: Tổng nhân sự hiện hành là "
            f"{numbers['headcount_total']} người. Trong kỳ ghi nhận "
            f"{numbers['new_hires']} nhân viên vào mới và "
            f"{numbers['departures']} trường hợp đã hoàn tất nghỉ việc."
        )
    ]
    if att["total_records"]:
        paragraphs.append(
            f"Về chuyên cần: có {att['total_records']} bản ghi chấm công trong "
            f"kỳ, gồm {att['present']} lượt đúng giờ, {att['late']} lượt đi muộn, "
            f"{att['absent']} lượt vắng và {att['on_leave']} lượt nghỉ phép. "
            f"Tỉ lệ đúng giờ đạt {_fmt_rate(att['on_time_rate'])}%."
        )
    else:
        paragraphs.append(
            "Về chuyên cần: chưa có dữ liệu chấm công trong kỳ này."
        )
    paragraphs.append(
        f"Về nghỉ phép: hiện có {leave['pending_requests']} đơn đang chờ duyệt; "
        f"số đơn đã duyệt có ngày bắt đầu nghỉ trong kỳ là "
        f"{leave['approved_in_period']} đơn."
    )
    paragraphs.append(
        f"Về tuyển dụng: đang có {rec['open_job_postings']} tin tuyển dụng mở "
        f"và {rec['new_candidates']} ứng viên nộp mới trong kỳ."
    )
    if enps is not None:
        paragraphs.append(
            f"Về gắn kết: nhân viên đã gửi {eng['kudos_in_period']} lượt vinh "
            f"danh (kudos) trong kỳ. Điểm eNPS gần nhất đạt {enps['score']} "
            f"điểm qua khảo sát “{enps['survey_title']}” với "
            f"{enps['responses']} lượt phản hồi."
        )
    else:
        paragraphs.append(
            f"Về gắn kết: nhân viên đã gửi {eng['kudos_in_period']} lượt vinh "
            "danh (kudos) trong kỳ. Chưa có dữ liệu eNPS — chưa có khảo sát "
            "eNPS nào có phản hồi."
        )
    paragraphs.append(
        f"Về rủi ro nhân sự: hệ thống chấm điểm nguy cơ nghỉ việc (cửa sổ "
        f"{numbers['attrition_window_days']} ngày) hiện ghi nhận "
        f"{numbers['attrition_high_risk']} nhân viên ở mức nguy cơ cao — bộ "
        "phận nhân sự nên ưu tiên trao đổi, chăm sóc các trường hợp này."
    )
    return "\n\n".join(paragraphs)


def _ai_prose(numbers: dict) -> str | None:
    """Nhờ AI viết prose quanh gói số; None nếu AI không khả dụng/lỗi/sai số."""
    try:
        from app.ai_service import get_provider

        provider = get_provider()
        if not provider.is_available:
            return None
        user_prompt = (
            f"Kỳ báo cáo: {_period_label(numbers)}.\n"
            "Gói số liệu (nguồn sự thật duy nhất, dùng nguyên các số này):\n"
            + json.dumps(numbers, ensure_ascii=False, indent=2)
            + "\nHãy viết báo cáo điều hành theo đúng các số trên."
        )
        raw = provider.chat_completion(
            _PROSE_SYSTEM_PROMPT, user_prompt, json_mode=False, temperature=0.5
        )
        prose = (raw or "").strip()
        if not prose:
            return None
        if not prose_numbers_are_grounded(prose, numbers):
            return None
        return prose
    except Exception:
        return None


def generate_briefing(user, period: str, ref_date: date) -> Briefing:
    """Tạo + lưu một Briefing mới cho kỳ; trả object đã persist."""
    if period not in VALID_PERIODS:
        raise ApiError(
            400, "VALIDATION_ERROR",
            "Kỳ báo cáo không hợp lệ.",
            [{"field": "period", "message": "Chỉ nhận 'week' hoặc 'month'."}],
        )
    numbers = collect_numbers(user, period, ref_date)
    prose = _ai_prose(numbers)
    source = Briefing.SOURCE_AI if prose is not None else Briefing.SOURCE_TEMPLATE
    if prose is None:
        prose = template_prose(numbers)
    briefing = Briefing(
        period=period,
        ref_date=ref_date,
        numbers=numbers,
        prose=prose,
        source=source,
        created_by=user.id if user is not None else None,
    )
    db.session.add(briefing)
    db.session.commit()
    return briefing


def latest_briefing(period: str) -> Briefing | None:
    return (
        Briefing.query
        .filter_by(period=period)
        .order_by(Briefing.created_at.desc(), Briefing.id.desc())
        .first()
    )


def briefing_history(period: str | None, limit: int) -> list[Briefing]:
    query = Briefing.query
    if period:
        query = query.filter_by(period=period)
    return (
        query.order_by(Briefing.created_at.desc(), Briefing.id.desc())
        .limit(limit)
        .all()
    )
