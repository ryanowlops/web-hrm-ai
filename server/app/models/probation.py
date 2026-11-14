"""Đánh giá thử việc (ProbationEvaluation) — quyết định cuối / gia hạn thử việc.

Bảng MỚI, được db.create_all() tạo tự động (không cần migration) vì model
được đăng ký trong app.models. Một hợp đồng thử việc có thể có nhiều lần
đánh giá (gia hạn nhiều lần), nhưng chỉ được MỘT quyết định chốt (pass/fail)
— luật chốt chặn ở probation/services.evaluate_contract.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class ProbationEvaluation(TimestampMixin, db.Model):
    __tablename__ = "probation_evaluations"

    DECISION_PASS = "pass"
    DECISION_FAIL = "fail"
    DECISION_EXTEND = "extend"
    DECISIONS = (DECISION_PASS, DECISION_FAIL, DECISION_EXTEND)

    id = db.Column(db.Integer, primary_key=True)
    contract_id = db.Column(
        db.Integer, db.ForeignKey("contracts.id"), nullable=False, index=True
    )
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    # pass = đạt, chuyển chính thức; fail = không đạt, nghỉ việc;
    # extend = gia hạn thử việc thêm một thời gian.
    decision = db.Column(db.String(20), nullable=False, index=True)
    notes = db.Column(db.Text, nullable=True)
    evaluated_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )

    contract = db.relationship("Contract")
    employee = db.relationship("Employee")
    evaluator = db.relationship("User", foreign_keys=[evaluated_by])

    def __repr__(self):
        return (
            f"<ProbationEvaluation id={self.id} contract_id={self.contract_id} "
            f"decision={self.decision!r}>"
        )
