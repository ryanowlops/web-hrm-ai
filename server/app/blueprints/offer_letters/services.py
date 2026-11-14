"""Service layer cho module Thư mời nhận việc (Offer Letter).

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError
(app.errors) để error handler toàn cục chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}.

Quy tắc trạng thái (lưu trong DB):
    draft -> sent -> accepted | declined
    draft | sent -> withdrawn
'expired' KHÔNG lưu trong DB: thư ở trạng thái 'sent' mà đã quá hạn
trả lời (deadline < hôm nay) thì serialize thành 'expired' lúc đọc
(xem effective_status) — việc này không đổi trạng thái đã lưu.
"""

from datetime import date

from app.errors import ApiError
from app.extensions import db
from app.models import Candidate, JobPosting
from app.models.offer_letter import OfferLetter

COMPANY_NAME = "HRM AI"


def parse_pagination(args):
    """Đọc page/limit từ query string, kẹp trong giới hạn cho phép."""
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    page = max(page, 1)
    limit = min(max(limit, 1), 100)
    return page, limit


def paginate(query, page, limit):
    """Phân trang một query SQLAlchemy, trả (items, meta) đúng quy ước."""
    total = query.count()
    total_pages = (total + limit - 1) // limit if total else 0
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": total_pages,
    }
    return items, meta


def format_salary_vnd(salary: int) -> str:
    """12.000.000 -> "12.000.000 VNĐ/tháng" (dấu phân cách hàng nghìn)."""
    return f"{salary:,}".replace(",", ".") + " VNĐ/tháng"


def _format_date(value) -> str:
    """date -> "07/09/2026" (dd/mm/yyyy)."""
    return value.strftime("%d/%m/%Y") if value is not None else ""


def build_letter_body(candidate, job, salary, start_date, deadline) -> str:
    """Sinh nội dung thư mời (tiếng Việt) từ mẫu.

    Thư chứa: tên ứng viên, tên vị trí, lương (định dạng VNĐ/tháng),
    ngày bắt đầu, hạn trả lời (nếu có), tên công ty "HRM AI".
    """
    job_title = None
    if job is not None:
        job_title = job.title
    elif getattr(candidate, "job", None) is not None:
        job_title = candidate.job.title
    if not job_title:
        job_title = "vị trí ứng tuyển"

    lines = [
        f"Kính gửi {candidate.full_name},",
        "",
        f"Công ty {COMPANY_NAME} trân trọng mời bạn nhận vị trí "
        f"{job_title} tại công ty chúng tôi.",
        "",
        "Thông tin chính của thư mời:",
        f"- Vị trí: {job_title}",
        f"- Mức lương: {format_salary_vnd(salary)}",
        f"- Ngày bắt đầu làm việc: {_format_date(start_date)}",
    ]
    if deadline is not None:
        lines.append(f"- Hạn trả lời thư mời: {_format_date(deadline)}")
    lines += [
        "",
        "Nếu bạn đồng ý với các điều khoản trên, vui lòng xác nhận lại "
        "với chúng tôi trước hạn trả lời (nếu có) để công ty chuẩn bị "
        "thủ tục nhận việc.",
        "",
        "Chúng tôi rất mong được chào đón bạn gia nhập đội ngũ "
        f"{COMPANY_NAME}.",
        "",
        "Trân trọng,",
        f"Phòng Nhân sự — {COMPANY_NAME}",
    ]
    return "\n".join(lines)


def effective_status(offer: OfferLetter, today: date | None = None) -> str:
    """Trạng thái hiển thị: 'sent' + quá hạn trả lời -> 'expired'.

    Chỉ tính lúc đọc, không đổi trạng thái đã lưu trong DB.
    """
    if today is None:
        today = date.today()
    if (
        offer.status == OfferLetter.STATUS_SENT
        and offer.deadline is not None
        and offer.deadline < today
    ):
        return OfferLetter.STATUS_EXPIRED
    return offer.status


def get_offer_or_404(offer_id: int) -> OfferLetter:
    offer = db.session.get(OfferLetter, offer_id)
    if offer is None:
        raise ApiError(
            404, "OFFER_NOT_FOUND", "Không tìm thấy thư mời nhận việc."
        )
    return offer


def list_offers(args):
    """Danh sách thư mời, mới nhất trước.

    Lọc theo ?status= (draft/sent/accepted/declined/withdrawn/expired —
    'expired' là trạng thái tính lúc đọc: sent + quá hạn) và
    ?candidate_id=.
    """
    query = OfferLetter.query
    status = args.get("status")
    if status:
        if status == OfferLetter.STATUS_EXPIRED:
            query = query.filter(
                OfferLetter.status == OfferLetter.STATUS_SENT,
                OfferLetter.deadline.isnot(None),
                OfferLetter.deadline < date.today(),
            )
        elif status in OfferLetter.STORED_STATUSES:
            query = query.filter(OfferLetter.status == status)
        else:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "status không hợp lệ.",
                details=[{"field": "status", "message": "Trạng thái không hợp lệ."}],
            )
    candidate_id = args.get("candidate_id")
    if candidate_id:
        try:
            candidate_id_int = int(candidate_id)
        except (TypeError, ValueError):
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "candidate_id phải là số nguyên.",
                details=[{"field": "candidate_id", "message": "Phải là số nguyên."}],
            )
        query = query.filter(OfferLetter.candidate_id == candidate_id_int)
    query = query.order_by(
        OfferLetter.created_at.desc(), OfferLetter.id.desc()
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def create_offer_letter(
    candidate_id, job_id, salary, start_date, deadline, created_by=None
) -> OfferLetter:
    """Tạo thư mời ở trạng thái nháp, nội dung sinh từ mẫu tiếng Việt.

    - Ứng viên phải tồn tại (404), tin tuyển dụng phải tồn tại nếu có (404).
    - Lương phải > 0; ngày bắt đầu không được trong quá khứ.
    - job_id null -> lấy vị trí ứng viên đã ứng tuyển để ghi vào thư.
    """
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        raise ApiError(404, "CANDIDATE_NOT_FOUND", "Không tìm thấy ứng viên.")
    job = None
    if job_id is not None:
        job = db.session.get(JobPosting, job_id)
        if job is None:
            raise ApiError(
                404, "JOB_NOT_FOUND", "Không tìm thấy tin tuyển dụng."
            )
    if not isinstance(salary, int) or isinstance(salary, bool) or salary <= 0:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Lương phải là số nguyên lớn hơn 0.",
            details=[{"field": "salary", "message": "Phải lớn hơn 0."}],
        )
    if start_date is None or start_date < date.today():
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Ngày bắt đầu làm việc không được trong quá khứ.",
            details=[
                {
                    "field": "start_date",
                    "message": "Ngày bắt đầu không được trong quá khứ.",
                }
            ],
        )

    offer = OfferLetter(
        candidate_id=candidate.id,
        job_id=job.id if job is not None else None,
        salary=salary,
        start_date=start_date,
        deadline=deadline,
        status=OfferLetter.STATUS_DRAFT,
        letter_body=build_letter_body(
            candidate, job, salary, start_date, deadline
        ),
        created_by=created_by,
    )
    db.session.add(offer)
    db.session.commit()
    return offer


def send_offer(offer_id: int) -> OfferLetter:
    """Gửi thư mời: chỉ từ trạng thái nháp (draft -> sent)."""
    offer = get_offer_or_404(offer_id)
    if offer.status != OfferLetter.STATUS_DRAFT:
        raise ApiError(
            409,
            "OFFER_INVALID_STATUS",
            "Chỉ gửi được thư mời đang ở trạng thái nháp.",
        )
    offer.status = OfferLetter.STATUS_SENT
    db.session.commit()
    return offer


def record_response(offer_id: int, decision: str) -> OfferLetter:
    """Ghi nhận phản hồi của ứng viên: sent -> accepted | declined."""
    offer = get_offer_or_404(offer_id)
    if offer.status != OfferLetter.STATUS_SENT:
        raise ApiError(
            409,
            "OFFER_INVALID_STATUS",
            "Chỉ ghi nhận phản hồi cho thư mời đã gửi.",
        )
    if decision == OfferLetter.STATUS_ACCEPTED:
        offer.status = OfferLetter.STATUS_ACCEPTED
    elif decision == OfferLetter.STATUS_DECLINED:
        offer.status = OfferLetter.STATUS_DECLINED
    else:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "decision phải là accepted hoặc declined.",
            details=[
                {
                    "field": "decision",
                    "message": "Phải là accepted hoặc declined.",
                }
            ],
        )
    db.session.commit()
    return offer


def withdraw_offer(offer_id: int) -> OfferLetter:
    """Thu hồi thư mời: chỉ từ nháp hoặc đã gửi (draft|sent -> withdrawn)."""
    offer = get_offer_or_404(offer_id)
    if offer.status not in (
        OfferLetter.STATUS_DRAFT,
        OfferLetter.STATUS_SENT,
    ):
        raise ApiError(
            409,
            "OFFER_INVALID_STATUS",
            "Chỉ thu hồi được thư mời đang ở trạng thái nháp hoặc đã gửi.",
        )
    offer.status = OfferLetter.STATUS_WITHDRAWN
    db.session.commit()
    return offer
