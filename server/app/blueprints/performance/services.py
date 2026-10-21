"""Service layer — module Hieu suat / KPI-OKR (performance).

Toan bo logic nghiep vu nam o day (routes chi validate + goi service):
- Chu ky danh gia: draft -> active -> in_review -> closed (HR/Admin).
- Muc tieu (Objective) + Key Result: tao (draft) -> gui duyet (pending)
  -> Manager/HR duyet (active) hoac tra lai (draft).
- Check-in: chu muc tieu cap nhat current_value cua KR, luu lich su.
- Danh gia: nhan vien tu danh gia (self), Manager cham diem chot (manager);
  Manager nop danh gia thi cac Objective active cua nhan vien trong chu ky
  chuyen sang completed.
- Diem theo tai lieu 4.1: KR progress co clamp + direction, Objective la
  trung binh co trong so cua KR, diem chu ky la trung binh co trong so
  cua Objective; xep loai theo thang 0-100.
- Phan quyen theo du lieu (scope) kiem tra tai day, giong leave/attendance:
  Employee chi thay cua minh, Manager thay team, HR/Admin toan cuc.
"""

import unicodedata
from decimal import Decimal

from flask_jwt_extended import get_jwt_identity
from sqlalchemy import and_, or_

from app.errors import ApiError
from app.extensions import db
from app.models import Department, Employee, Notification, User
from app.models.performance import (
    GoalCheckin,
    KeyResult,
    Objective,
    PerformanceCycle,
    PerformanceReview,
)

# Chuyen doi trang thai chu ky hop le.
CYCLE_TRANSITIONS = {
    PerformanceCycle.STATUS_DRAFT: {
        PerformanceCycle.STATUS_ACTIVE,
        PerformanceCycle.STATUS_CLOSED,
    },
    PerformanceCycle.STATUS_ACTIVE: {
        PerformanceCycle.STATUS_IN_REVIEW,
        PerformanceCycle.STATUS_CLOSED,
    },
    PerformanceCycle.STATUS_IN_REVIEW: {PerformanceCycle.STATUS_CLOSED},
    PerformanceCycle.STATUS_CLOSED: set(),
}

# Nguong xep loai (tai lieu 4.1) — sap xep giam dan de tra cuu.
RATING_BANDS = (
    (90, "Xuất sắc"),
    (75, "Tốt"),
    (60, "Đạt"),
    (40, "Cần cải thiện"),
    (0, "Không đạt"),
)


def rating_for(score):
    """Xep loai tu diem 0-100 theo tai lieu 4.1."""
    if score is None:
        return None
    for threshold, label in RATING_BANDS:
        if score >= threshold:
            return label
    return "Không đạt"


# ---------------------------------------------------------------------------
# Cong thuc diem (tai lieu 4.1)
# ---------------------------------------------------------------------------

def key_result_progress(kr):
    """Tien do 0..1 cua mot Key Result.

    increase: clamp(current / target). decrease: clamp(target / current)
    khi current > 0; current <= 0 (da giam ve 0) coi nhu dat 100%.
    """
    target = float(kr.target_value or 0)
    current = float(kr.current_value or 0)
    if kr.direction == KeyResult.DIRECTION_DECREASE:
        if current <= 0:
            return 1.0
        if target < 0:
            return 0.0
        return max(0.0, min(1.0, target / current))
    if target <= 0:
        return 1.0 if current >= target else 0.0
    return max(0.0, min(1.0, current / target))


def objective_score(obj):
    """Diem Objective 0-100: trung binh co trong so tien do cac KR."""
    key_results = list(getattr(obj, "key_results", []) or [])
    if not key_results:
        return 0.0
    total_weight = 0.0
    weighted = 0.0
    for kr in key_results:
        weight = float(kr.weight or 0)
        if weight <= 0:
            weight = 1.0
        weighted += key_result_progress(kr) * weight
        total_weight += weight
    if total_weight <= 0:
        return 0.0
    return weighted / total_weight * 100.0


def objective_progress_map(obj):
    return {kr.id: key_result_progress(kr) for kr in obj.key_results}


# ---------------------------------------------------------------------------
# Nguoi dung hien tai + scope (theo pattern cua leave services)
# ---------------------------------------------------------------------------

def get_current_user():
    identity = get_jwt_identity()
    try:
        identity = int(identity)
    except (TypeError, ValueError):
        pass
    user = db.session.get(User, identity)
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.")
    return user


def get_current_employee():
    user = get_current_user()
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return user, employee


def get_current_actor():
    """(user, employee|None) — HR/Admin co the khong gan ho so nhan vien
    (vd tai khoan admin he thong) nhung van xem/duyet toan cuc duoc.
    Employee/Manager khong co ho so thi khong dung duoc module nay.
    Cac thao tac ca nhan (check-in, tu danh gia, gui duyet) phai kiem tra
    me is None o tung use-case.
    """
    user = get_current_user()
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    if employee is None and user.role in ("employee", "manager"):
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return user, employee


def _require_employee(me):
    if me is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên nên không thực hiện được thao tác cá nhân này.",
        )
    return me


def _find_user_id_for_employee(employee_id):
    user = User.query.filter_by(employee_id=employee_id).first()
    return user.id if user else None


def _notify_employee(employee_id, title, content, related_type, related_id):
    user_id = _find_user_id_for_employee(employee_id)
    if user_id is None:
        return
    db.session.add(
        Notification(
            user_id=user_id,
            type="performance",
            title=title,
            content=content,
            is_read=False,
            related_type=related_type,
            related_id=related_id,
        )
    )


def _is_manager_of(manager_employee, employee):
    """Manager quan ly truc tiep (manager_id) hoac la truong phong cua nhan vien."""
    if employee is None or manager_employee is None:
        return False
    if getattr(employee, "manager_id", None) == manager_employee.id:
        return True
    department = None
    if getattr(employee, "department_id", None):
        department = db.session.get(Department, employee.department_id)
    return department is not None and department.manager_id == manager_employee.id


def _team_employee_ids(manager_employee):
    """ID nhan vien thuoc pham vi quan ly cua Manager (khong gom chinh Manager)."""
    ids = {
        e.id for e in Employee.query.filter_by(manager_id=manager_employee.id).all()
    }
    managed_departments = Department.query.filter_by(
        manager_id=manager_employee.id
    ).all()
    for dept in managed_departments:
        ids.update(
            e.id for e in Employee.query.filter_by(department_id=dept.id).all()
        )
    ids.discard(manager_employee.id)
    return ids


def _managed_department_ids(manager_employee):
    return {
        d.id for d in Department.query.filter_by(manager_id=manager_employee.id).all()
    }


def _can_view_employee(user, me, employee_id):
    if user.role in ("hr", "admin"):
        return True
    if employee_id is None:
        return False
    if employee_id == me.id:
        return True
    if user.role == "manager":
        return employee_id in _team_employee_ids(me)
    return False


def can_view_objective(user, me, obj):
    if user.role in ("hr", "admin"):
        return True
    if obj.employee_id is not None:
        return _can_view_employee(user, me, obj.employee_id)
    # Muc tieu cap phong ban: nhan vien trong phong / Manager cua phong xem duoc.
    if obj.department_id is not None:
        if getattr(me, "department_id", None) == obj.department_id:
            return True
        if obj.department_id in _managed_department_ids(me):
            return True
    return obj.created_by == me.id


def _can_approve_objective(user, me, obj):
    """Nguoi duyet: HR/Admin, hoac Manager cua chu muc tieu / phong ban."""
    if user.role in ("hr", "admin"):
        return True
    if user.role != "manager":
        return False
    if obj.employee_id is not None:
        owner = db.session.get(Employee, obj.employee_id)
        return _is_manager_of(me, owner) or obj.employee_id in _team_employee_ids(me)
    if obj.department_id is not None:
        # Muc tieu phong ban: chi truong phong cua phong do moi duyet.
        return obj.department_id in _managed_department_ids(me)
    return False


# ---------------------------------------------------------------------------
# Chu ky danh gia
# ---------------------------------------------------------------------------

def list_cycles():
    return (
        PerformanceCycle.query.order_by(
            PerformanceCycle.start_date.desc(), PerformanceCycle.id.desc()
        ).all()
    )


def get_cycle_or_404(cycle_id):
    cycle = db.session.get(PerformanceCycle, cycle_id)
    if cycle is None:
        raise ApiError(404, "NOT_FOUND", "Chu kỳ đánh giá không tồn tại.")
    return cycle


def create_cycle(data):
    if data["end_date"] < data["start_date"]:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Ngày kết thúc chu kỳ phải sau hoặc bằng ngày bắt đầu.",
        )
    cycle = PerformanceCycle(
        name=data["name"],
        start_date=data["start_date"],
        end_date=data["end_date"],
        status=PerformanceCycle.STATUS_DRAFT,
    )
    db.session.add(cycle)
    db.session.commit()
    return cycle


def update_cycle_status(cycle_id, new_status):
    cycle = get_cycle_or_404(cycle_id)
    allowed = CYCLE_TRANSITIONS.get(cycle.status, set())
    if new_status not in allowed:
        raise ApiError(
            409,
            "INVALID_STATE",
            f"Không thể chuyển chu kỳ từ '{cycle.status}' sang '{new_status}'.",
        )
    cycle.status = new_status
    db.session.commit()
    return cycle


# ---------------------------------------------------------------------------
# Muc tieu + Key Result
# ---------------------------------------------------------------------------

def _resolve_employee_id_param(raw, me):
    """employee_id=me (chuoi) -> id cua chinh nguoi goi; con lai giu nguyen."""
    if raw is None:
        return None
    if isinstance(raw, str) and raw.lower() == "me":
        _require_employee(me)
        return me.id
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR", "employee_id phải là số nguyên hoặc 'me'.")


def list_objectives(user, me, cycle_id=None, employee_id=None, department_id=None, status=None):
    employee_id = _resolve_employee_id_param(employee_id, me)
    query = Objective.query

    # --- Data-scope ---
    if user.role == "employee":
        conditions = [
            Objective.employee_id == me.id,
            Objective.created_by == me.id,
        ]
        if getattr(me, "department_id", None):
            conditions.append(
                and_(
                    Objective.employee_id.is_(None),
                    Objective.department_id == me.department_id,
                )
            )
        query = query.filter(or_(*conditions))
    elif user.role == "manager":
        team_ids = _team_employee_ids(me)
        allowed_ids = list(team_ids) + [me.id]
        conditions = [
            Objective.employee_id.in_(allowed_ids),
            Objective.created_by == me.id,
        ]
        dept_ids = _managed_department_ids(me)
        if getattr(me, "department_id", None):
            dept_ids.add(me.department_id)
        if dept_ids:
            conditions.append(
                and_(
                    Objective.employee_id.is_(None),
                    Objective.department_id.in_(dept_ids),
                )
            )
        query = query.filter(or_(*conditions))
    elif user.role in ("hr", "admin"):
        pass
    else:
        raise ApiError(403, "FORBIDDEN", "Vai trò không được phép xem mục tiêu.")

    if cycle_id is not None:
        query = query.filter(Objective.cycle_id == cycle_id)
    if employee_id is not None:
        query = query.filter(Objective.employee_id == employee_id)
    if department_id is not None:
        query = query.filter(Objective.department_id == department_id)
    if status:
        if status not in Objective.STATUSES:
            raise ApiError(400, "VALIDATION_ERROR", f"Trạng thái không hợp lệ: {status}.")
        query = query.filter(Objective.status == status)

    return query.order_by(Objective.created_at.desc(), Objective.id.desc()).all()


def get_objective_or_404(objective_id):
    obj = db.session.get(Objective, objective_id)
    if obj is None:
        raise ApiError(404, "NOT_FOUND", "Mục tiêu không tồn tại.")
    return obj


def _build_key_results(objective, key_results_data):
    for item in key_results_data or []:
        kr = KeyResult(
            objective_id=objective.id,
            title=item["title"],
            unit=item.get("unit"),
            target_value=Decimal(str(item["target_value"])),
            current_value=Decimal(str(item.get("current_value") or 0)),
            weight=Decimal(str(item.get("weight") or 1)),
            direction=item.get("direction") or KeyResult.DIRECTION_INCREASE,
        )
        db.session.add(kr)


def create_objective(user, me, data):
    cycle = get_cycle_or_404(data["cycle_id"])
    employee_id = _resolve_employee_id_param(data.get("employee_id"), me)
    department_id = data.get("department_id")

    if employee_id is None and department_id is None:
        # Khong chi dinh chu the: mac dinh la muc tieu ca nhan cua nguoi tao.
        if me is not None:
            employee_id = me.id
        else:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Mục tiêu phải thuộc về một nhân viên (employee_id) hoặc một phòng ban (department_id).",
            )

    if employee_id is not None:
        target = db.session.get(Employee, employee_id)
        if target is None:
            raise ApiError(404, "NOT_FOUND", "Nhân viên không tồn tại.")
        # Quyen tao: cho chinh minh / HR-Admin / Manager cua nhan vien do.
        if user.role in ("hr", "admin"):
            pass
        elif me is not None and employee_id == me.id:
            pass
        elif (
            me is not None
            and user.role == "manager"
            and (_is_manager_of(me, target) or employee_id in _team_employee_ids(me))
        ):
            pass
        else:
            raise ApiError(
                403, "FORBIDDEN", "Bạn không có quyền tạo mục tiêu cho nhân viên này."
            )
    else:
        department = db.session.get(Department, department_id)
        if department is None:
            raise ApiError(404, "NOT_FOUND", "Phòng ban không tồn tại.")
        if user.role not in ("hr", "admin"):
            if not (
                me is not None
                and user.role == "manager"
                and department_id in _managed_department_ids(me)
            ):
                raise ApiError(
                    403,
                    "FORBIDDEN",
                    "Chỉ HR/Admin hoặc Trưởng phòng mới tạo được mục tiêu phòng ban.",
                )

    key_results_data = data.get("key_results") or []
    if not (1 <= len(key_results_data) <= 5):
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Mỗi mục tiêu cần có từ 1 đến 5 Key Result.",
        )

    objective = Objective(
        cycle_id=cycle.id,
        employee_id=employee_id,
        department_id=department_id,
        title=data["title"],
        description=data.get("description"),
        weight=Decimal(str(data.get("weight") or 1)),
        status=Objective.STATUS_DRAFT,
        created_by=me.id if me is not None else None,
    )
    db.session.add(objective)
    db.session.flush()
    _build_key_results(objective, key_results_data)
    db.session.commit()
    return objective


def update_objective(user, me, objective_id, data):
    _require_employee(me)
    obj = get_objective_or_404(objective_id)
    is_owner = obj.employee_id == me.id or obj.created_by == me.id
    if not (is_owner or user.role in ("hr", "admin")):
        raise ApiError(403, "FORBIDDEN", "Chỉ chủ mục tiêu hoặc HR mới sửa được mục tiêu.")
    if obj.status != Objective.STATUS_DRAFT:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Chỉ sửa được mục tiêu đang ở trạng thái nháp (draft).",
        )
    if "title" in data and data["title"]:
        obj.title = data["title"]
    if "description" in data:
        obj.description = data["description"]
    if data.get("weight") is not None:
        obj.weight = Decimal(str(data["weight"]))
    if data.get("key_results") is not None:
        key_results_data = data["key_results"]
        if not (1 <= len(key_results_data) <= 5):
            raise ApiError(
                400, "VALIDATION_ERROR", "Mỗi mục tiêu cần có từ 1 đến 5 Key Result."
            )
        for kr in list(obj.key_results):
            db.session.delete(kr)
        db.session.flush()
        _build_key_results(obj, key_results_data)
    db.session.commit()
    return obj


def cancel_objective(user, me, objective_id):
    """Huy muc tieu = xoa mem (status cancelled), chi khi dang draft."""
    obj = get_objective_or_404(objective_id)
    is_owner = obj.employee_id == me.id or obj.created_by == me.id
    if not (is_owner or user.role in ("hr", "admin")):
        raise ApiError(403, "FORBIDDEN", "Chỉ chủ mục tiêu hoặc HR mới hủy được mục tiêu.")
    if obj.status != Objective.STATUS_DRAFT:
        raise ApiError(
            409, "INVALID_STATE", "Chỉ hủy được mục tiêu đang ở trạng thái nháp (draft)."
        )
    obj.status = Objective.STATUS_CANCELLED
    db.session.commit()
    return obj


def submit_objective(user, me, objective_id):
    _require_employee(me)
    obj = get_objective_or_404(objective_id)
    is_owner = obj.employee_id == me.id or obj.created_by == me.id
    if not is_owner:
        raise ApiError(403, "FORBIDDEN", "Chỉ chủ mục tiêu mới gửi duyệt được.")
    if obj.status != Objective.STATUS_DRAFT:
        raise ApiError(
            409, "INVALID_STATE", "Chỉ gửi duyệt được mục tiêu đang ở trạng thái nháp."
        )
    obj.status = Objective.STATUS_PENDING
    owner = db.session.get(Employee, obj.employee_id) if obj.employee_id else None
    manager_id = getattr(owner, "manager_id", None) if owner else None
    if manager_id and manager_id != me.id:
        _notify_employee(
            manager_id,
            "Có mục tiêu chờ duyệt",
            f"{owner.full_name if owner else 'Nhân viên'} đã gửi mục tiêu "
            f"“{obj.title}” chờ bạn duyệt.",
            "objective",
            obj.id,
        )
    db.session.commit()
    return obj


def approve_objective(user, me, objective_id):
    obj = get_objective_or_404(objective_id)
    if not _can_approve_objective(user, me, obj):
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền duyệt mục tiêu này.")
    if obj.status != Objective.STATUS_PENDING:
        raise ApiError(
            409, "INVALID_STATE", "Mục tiêu không ở trạng thái chờ duyệt (pending)."
        )
    obj.status = Objective.STATUS_ACTIVE
    if obj.employee_id and (me is None or obj.employee_id != me.id):
        _notify_employee(
            obj.employee_id,
            "Mục tiêu đã được duyệt",
            f"Mục tiêu “{obj.title}” của bạn đã được duyệt và đang hiệu lực.",
            "objective",
            obj.id,
        )
    db.session.commit()
    return obj


def return_objective(user, me, objective_id, note=None):
    obj = get_objective_or_404(objective_id)
    if not _can_approve_objective(user, me, obj):
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền trả lại mục tiêu này.")
    if obj.status != Objective.STATUS_PENDING:
        raise ApiError(
            409, "INVALID_STATE", "Mục tiêu không ở trạng thái chờ duyệt (pending)."
        )
    obj.status = Objective.STATUS_DRAFT
    if obj.employee_id and (me is None or obj.employee_id != me.id):
        content = f"Mục tiêu “{obj.title}” bị trả lại để chỉnh sửa."
        if note:
            content += f" Lý do: {note}"
        _notify_employee(obj.employee_id, "Mục tiêu bị trả lại", content, "objective", obj.id)
    db.session.commit()
    return obj


# ---------------------------------------------------------------------------
# Check-in Key Result
# ---------------------------------------------------------------------------

def get_key_result_or_404(key_result_id):
    kr = db.session.get(KeyResult, key_result_id)
    if kr is None:
        raise ApiError(404, "NOT_FOUND", "Key Result không tồn tại.")
    return kr


def check_in_key_result(user, me, key_result_id, data):
    _require_employee(me)
    kr = get_key_result_or_404(key_result_id)
    obj = kr.objective
    is_owner = obj.employee_id == me.id or obj.created_by == me.id
    if not (is_owner or user.role in ("hr", "admin")):
        raise ApiError(
            403, "FORBIDDEN", "Chỉ chủ mục tiêu mới check-in được tiến độ."
        )
    if obj.status != Objective.STATUS_ACTIVE:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Chỉ check-in được khi mục tiêu đang hiệu lực (active).",
        )
    old_value = kr.current_value
    kr.current_value = Decimal(str(data["new_value"]))
    checkin = GoalCheckin(
        key_result_id=kr.id,
        author_id=me.id,
        old_value=old_value,
        new_value=kr.current_value,
        note=data.get("note"),
    )
    db.session.add(checkin)
    db.session.commit()
    return checkin, obj


def list_checkins(user, me, key_result_id):
    kr = get_key_result_or_404(key_result_id)
    if not can_view_objective(user, me, kr.objective):
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền xem lịch sử check-in này.")
    return (
        GoalCheckin.query.filter_by(key_result_id=kr.id)
        .order_by(GoalCheckin.created_at.desc(), GoalCheckin.id.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Danh gia (reviews)
# ---------------------------------------------------------------------------

def create_review(user, me, data):
    cycle = get_cycle_or_404(data["cycle_id"])
    review_type = data["review_type"]
    status = data.get("status") or PerformanceReview.STATUS_SUBMITTED

    if review_type == PerformanceReview.TYPE_SELF:
        _require_employee(me)
        employee_id = me.id
        reviewer_id = me.id
    else:  # manager review
        employee_id = _resolve_employee_id_param(data.get("employee_id"), me)
        if employee_id is None:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Đánh giá của Manager bắt buộc có employee_id (nhân viên được đánh giá).",
            )
        if me is not None and employee_id == me.id:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Manager không tự chấm điểm cho chính mình; hãy dùng tự đánh giá (self).",
            )
        target = db.session.get(Employee, employee_id)
        if target is None:
            raise ApiError(404, "NOT_FOUND", "Nhân viên không tồn tại.")
        if user.role not in ("hr", "admin") and not (
            me is not None
            and user.role == "manager"
            and (_is_manager_of(me, target) or employee_id in _team_employee_ids(me))
        ):
            raise ApiError(
                403, "FORBIDDEN", "Bạn không có quyền đánh giá nhân viên này."
            )
        reviewer_id = me.id if me is not None else None

    # Upsert: moi (chu ky, nhan vien, loai danh gia) chi co 1 ban ghi.
    review = PerformanceReview.query.filter_by(
        cycle_id=cycle.id, employee_id=employee_id, review_type=review_type
    ).first()
    if review is None:
        review = PerformanceReview(
            cycle_id=cycle.id,
            employee_id=employee_id,
            reviewer_id=reviewer_id,
            review_type=review_type,
        )
        db.session.add(review)
    review.reviewer_id = reviewer_id
    if data.get("score") is not None:
        review.score = Decimal(str(data["score"]))
    if "comment" in data:
        review.comment = data["comment"]
    review.status = status
    db.session.flush()

    if review_type == PerformanceReview.TYPE_MANAGER and status == PerformanceReview.STATUS_SUBMITTED:
        # Cham diem chot xong: dong cac Objective dang active cua nhan vien trong chu ky.
        active_objectives = Objective.query.filter_by(
            cycle_id=cycle.id, employee_id=employee_id, status=Objective.STATUS_ACTIVE
        ).all()
        for item in active_objectives:
            item.status = Objective.STATUS_COMPLETED
        _notify_employee(
            employee_id,
            "Bạn đã có kết quả đánh giá hiệu suất",
            f"Quản lý đã chấm điểm hiệu suất chu kỳ {cycle.name} cho bạn"
            + (f": {float(review.score)} điểm." if review.score is not None else "."),
            "performance_review",
            review.id,
        )
    elif review_type == PerformanceReview.TYPE_SELF and status == PerformanceReview.STATUS_SUBMITTED:
        employee = db.session.get(Employee, employee_id)
        manager_id = getattr(employee, "manager_id", None) if employee else None
        if manager_id and manager_id != me.id:
            _notify_employee(
                manager_id,
                "Nhân viên đã tự đánh giá hiệu suất",
                f"{employee.full_name if employee else 'Nhân viên'} đã nộp tự đánh giá "
                f"chu kỳ {cycle.name}.",
                "performance_review",
                review.id,
            )
    db.session.commit()
    return review


def list_reviews(user, me, cycle_id=None, employee_id=None):
    employee_id = _resolve_employee_id_param(employee_id, me)
    query = PerformanceReview.query
    if user.role == "employee":
        query = query.filter(PerformanceReview.employee_id == me.id)
    elif user.role == "manager":
        allowed = list(_team_employee_ids(me)) + [me.id]
        query = query.filter(PerformanceReview.employee_id.in_(allowed))
    elif user.role in ("hr", "admin"):
        pass
    else:
        raise ApiError(403, "FORBIDDEN", "Vai trò không được phép xem đánh giá.")
    if cycle_id is not None:
        query = query.filter(PerformanceReview.cycle_id == cycle_id)
    if employee_id is not None:
        query = query.filter(PerformanceReview.employee_id == employee_id)
    return query.order_by(
        PerformanceReview.created_at.desc(), PerformanceReview.id.desc()
    ).all()


# ---------------------------------------------------------------------------
# Dashboard tong hop
# ---------------------------------------------------------------------------

def _scoped_employee_ids_for_dashboard(user, me):
    if user.role in ("hr", "admin"):
        return None  # None = toan cong ty
    if user.role == "manager":
        return _team_employee_ids(me) | {me.id}
    return {me.id}


def get_dashboard(user, me, cycle_id=None):
    if cycle_id is not None:
        cycle = get_cycle_or_404(cycle_id)
    else:
        cycle = (
            PerformanceCycle.query.filter_by(status=PerformanceCycle.STATUS_ACTIVE)
            .order_by(PerformanceCycle.start_date.desc())
            .first()
        ) or (
            PerformanceCycle.query.order_by(
                PerformanceCycle.start_date.desc(), PerformanceCycle.id.desc()
            ).first()
        )
    if cycle is None:
        return {
            "cycle": None,
            "summary": {
                "employees": 0,
                "objectives": 0,
                "avg_progress": 0.0,
                "pending_approvals": 0,
            },
            "employees": [],
            "by_department": [],
            "rating_distribution": {},
        }

    allowed_ids = _scoped_employee_ids_for_dashboard(user, me)
    objectives = Objective.query.filter_by(cycle_id=cycle.id).all()
    if allowed_ids is not None:
        objectives = [
            o for o in objectives if o.employee_id is not None and o.employee_id in allowed_ids
        ]

    reviews = PerformanceReview.query.filter_by(
        cycle_id=cycle.id, review_type=PerformanceReview.TYPE_MANAGER
    ).all()
    final_scores = {
        r.employee_id: float(r.score)
        for r in reviews
        if r.score is not None and r.status == PerformanceReview.STATUS_SUBMITTED
    }

    per_employee = {}
    for obj in objectives:
        if obj.employee_id is None or obj.status == Objective.STATUS_CANCELLED:
            continue
        entry = per_employee.setdefault(obj.employee_id, {"objectives": []})
        entry["objectives"].append(obj)

    employees_data = []
    rating_distribution = {}
    dept_buckets = {}
    total_score = 0.0
    for employee_id, entry in per_employee.items():
        employee = db.session.get(Employee, employee_id)
        objs = entry["objectives"]
        weighted = 0.0
        total_weight = 0.0
        for obj in objs:
            w = float(obj.weight or 0) or 1.0
            weighted += objective_score(obj) * w
            total_weight += w
        progress_score = weighted / total_weight if total_weight else 0.0
        final_score = final_scores.get(employee_id)
        effective = final_score if final_score is not None else progress_score
        rating = rating_for(effective)
        rating_distribution[rating] = rating_distribution.get(rating, 0) + 1
        total_score += effective

        department = employee.department if employee is not None else None
        employees_data.append(
            {
                "employee_id": employee_id,
                "employee_name": employee.full_name if employee else None,
                "department_id": employee.department_id if employee else None,
                "department_name": department.name if department else None,
                "objectives_count": len(objs),
                "score": round(progress_score, 2),
                "final_score": final_score,
                "rating": rating,
                "rating_is_final": final_score is not None,
            }
        )
        if department is not None:
            bucket = dept_buckets.setdefault(
                department.id,
                {"department_id": department.id, "department_name": department.name, "scores": []},
            )
            bucket["scores"].append(effective)

    employees_data.sort(key=lambda item: item["score"], reverse=True)
    by_department = [
        {
            "department_id": bucket["department_id"],
            "department_name": bucket["department_name"],
            "employees": len(bucket["scores"]),
            "avg_score": round(sum(bucket["scores"]) / len(bucket["scores"]), 2)
            if bucket["scores"]
            else 0.0,
        }
        for bucket in dept_buckets.values()
    ]
    by_department.sort(key=lambda item: item["avg_score"], reverse=True)

    pending_approvals = sum(
        1 for o in objectives if o.status == Objective.STATUS_PENDING
    )
    employee_count = len(employees_data)
    return {
        "cycle": cycle,
        "summary": {
            "employees": employee_count,
            "objectives": sum(e["objectives_count"] for e in employees_data),
            "avg_progress": round(total_score / employee_count, 2) if employee_count else 0.0,
            "pending_approvals": pending_approvals,
        },
        "employees": employees_data,
        "by_department": by_department,
        "rating_distribution": rating_distribution,
    }


# ---------------------------------------------------------------------------
# Goi y mau (suggestions) — catalog tinh theo chuc vu / phong ban
# ---------------------------------------------------------------------------

def _normalize(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFD", str(text))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D").lower()


SUGGESTION_CATALOG = [
    {
        "key": "developer",
        "label": "Kỹ thuật / Lập trình",
        "match_titles": ["developer", "lap trinh", "engineer", "ky thuat", "software", "tester", "qa", "devops"],
        "match_departments": ["ky thuat", "cong nghe", "it", "phan mem", "phat trien san pham"],
        "objectives": [
            {
                "title": "Đảm bảo chất lượng và tiến độ phát triển sản phẩm",
                "description": "Gợi ý mẫu — hoàn thành đúng hạn với chất lượng code tốt.",
                "key_results": [
                    {"title": "Hoàn thành story point trong kỳ", "unit": "story point", "target_value": 40, "direction": "increase", "weight": 2},
                    {"title": "Số bug nghiêm trọng lọt lên production", "unit": "bug", "target_value": 2, "direction": "decrease", "weight": 2},
                    {"title": "Tỉ lệ code review xử lý đúng hạn", "unit": "%", "target_value": 95, "direction": "increase", "weight": 1},
                ],
            },
            {
                "title": "Phát triển năng lực kỹ thuật cá nhân",
                "description": "Gợi ý mẫu — học tập và chia sẻ kiến thức trong team.",
                "key_results": [
                    {"title": "Hoàn thành khóa học / chứng chỉ chuyên môn", "unit": "khóa", "target_value": 1, "direction": "increase", "weight": 1},
                    {"title": "Số buổi chia sẻ kỹ thuật nội bộ", "unit": "buổi", "target_value": 2, "direction": "increase", "weight": 1},
                ],
            },
        ],
    },
    {
        "key": "sales",
        "label": "Kinh doanh / Bán hàng",
        "match_titles": ["sales", "kinh doanh", "ban hang", "account", "tu van"],
        "match_departments": ["kinh doanh", "sales", "ban hang"],
        "objectives": [
            {
                "title": "Đạt mục tiêu doanh số của kỳ",
                "description": "Gợi ý mẫu — doanh thu và khách hàng mới.",
                "key_results": [
                    {"title": "Doanh thu mang về", "unit": "triệu đồng", "target_value": 500, "direction": "increase", "weight": 3},
                    {"title": "Số khách hàng mới ký hợp đồng", "unit": "khách hàng", "target_value": 20, "direction": "increase", "weight": 2},
                    {"title": "Tỉ lệ chốt deal", "unit": "%", "target_value": 30, "direction": "increase", "weight": 1},
                ],
            },
            {
                "title": "Chăm sóc và giữ chân khách hàng hiện hữu",
                "description": "Gợi ý mẫu — duy trì mức độ hài lòng của khách hàng.",
                "key_results": [
                    {"title": "Điểm hài lòng khách hàng (CSAT)", "unit": "%", "target_value": 90, "direction": "increase", "weight": 1},
                    {"title": "Số lần gặp / trao đổi với khách hàng", "unit": "lần", "target_value": 12, "direction": "increase", "weight": 1},
                ],
            },
        ],
    },
    {
        "key": "hr",
        "label": "Nhân sự",
        "match_titles": ["nhan su", "hr", "tuyen dung", "recruiter", "hanh chinh"],
        "match_departments": ["nhan su", "hanh chinh", "hr"],
        "objectives": [
            {
                "title": "Tuyển dụng đúng số lượng và đúng hạn",
                "description": "Gợi ý mẫu — lấp đầy các vị trí đang mở.",
                "key_results": [
                    {"title": "Số vị trí tuyển đủ người", "unit": "vị trí", "target_value": 5, "direction": "increase", "weight": 2},
                    {"title": "Thời gian tuyển trung bình cho một vị trí", "unit": "ngày", "target_value": 30, "direction": "decrease", "weight": 1},
                ],
            },
            {
                "title": "Vận hành nhân sự chính xác, đúng hạn",
                "description": "Gợi ý mẫu — hồ sơ, hợp đồng và dữ liệu nhân sự.",
                "key_results": [
                    {"title": "Tỉ lệ hồ sơ nhân viên hoàn thiện đúng hạn", "unit": "%", "target_value": 100, "direction": "increase", "weight": 1},
                ],
            },
        ],
    },
    {
        "key": "marketing",
        "label": "Marketing / Truyền thông",
        "match_titles": ["marketing", "truyen thong", "content", "seo", "brand"],
        "match_departments": ["marketing", "truyen thong"],
        "objectives": [
            {
                "title": "Tăng trưởng kênh truyền thông của công ty",
                "description": "Gợi ý mẫu — lead và mức độ tiếp cận.",
                "key_results": [
                    {"title": "Số lead thu về từ các kênh", "unit": "lead", "target_value": 300, "direction": "increase", "weight": 2},
                    {"title": "Tăng trưởng người theo dõi kênh chính", "unit": "%", "target_value": 20, "direction": "increase", "weight": 1},
                    {"title": "Số nội dung được xuất bản đúng kế hoạch", "unit": "bài", "target_value": 24, "direction": "increase", "weight": 1},
                ],
            },
        ],
    },
    {
        "key": "default",
        "label": "Mẫu chung cho mọi vị trí",
        "match_titles": [],
        "match_departments": [],
        "objectives": [
            {
                "title": "Hoàn thành công việc được giao đúng hạn",
                "description": "Gợi ý mẫu — áp dụng được cho mọi vị trí.",
                "key_results": [
                    {"title": "Tỉ lệ nhiệm vụ hoàn thành đúng hạn", "unit": "%", "target_value": 95, "direction": "increase", "weight": 2},
                    {"title": "Số nhiệm vụ / dự án hoàn thành trong kỳ", "unit": "nhiệm vụ", "target_value": 10, "direction": "increase", "weight": 1},
                ],
            },
            {
                "title": "Phát triển bản thân và hỗ trợ đồng đội",
                "description": "Gợi ý mẫu — học tập và đóng góp cho tập thể.",
                "key_results": [
                    {"title": "Số khóa đào tạo nội bộ đã hoàn thành", "unit": "khóa", "target_value": 1, "direction": "increase", "weight": 1},
                    {"title": "Số buổi đào tạo / họp chuyên môn đã tham gia", "unit": "buổi", "target_value": 4, "direction": "increase", "weight": 1},
                ],
            },
        ],
    },
]


def get_suggestions(me, position_title=None, department_name=None):
    """Chon nhom goi y theo chuc vu/phong ban cua nhan vien (hoac tham so truyen vao)."""
    if position_title is None and getattr(me, "position", None) is not None:
        position_title = me.position.title
    if department_name is None and getattr(me, "department", None) is not None:
        department_name = me.department.name

    norm_title = _normalize(position_title)
    norm_dept = _normalize(department_name)
    matched = None
    for group in SUGGESTION_CATALOG:
        if group["key"] == "default":
            continue
        title_hit = any(keyword in norm_title for keyword in group["match_titles"])
        dept_hit = any(keyword in norm_dept for keyword in group["match_departments"])
        if title_hit or dept_hit:
            matched = group
            break

    default_group = SUGGESTION_CATALOG[-1]
    suggestions = []
    source_groups = [matched, default_group] if matched else [default_group]
    seen_titles = set()
    for group in source_groups:
        for item in group["objectives"]:
            if item["title"] in seen_titles:
                continue
            seen_titles.add(item["title"])
            suggestions.append(
                {
                    "group": group["key"],
                    "group_label": group["label"],
                    "source": "Gợi ý mẫu",
                    "title": item["title"],
                    "description": item["description"],
                    "key_results": item["key_results"],
                }
            )
    return {
        "position": position_title,
        "department": department_name,
        "matched_group": matched["key"] if matched else "default",
        "suggestions": suggestions,
    }
