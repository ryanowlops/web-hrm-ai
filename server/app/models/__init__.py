"""Toan bo SQLAlchemy models cua he thong HRM (theo docs/architecture.md A7).

Import package nay de dang ky tat ca bang voi SQLAlchemy metadata
(dung truoc db.create_all() / Flask-Migrate).
"""
from app.models.users import TimestampMixin, User, utcnow
from app.models.org import Department, Position
from app.models.employees import Contract, Employee
from app.models.attendance import Attendance
from app.models.leave import LeaveBalance, LeaveRequest, LeaveType
from app.models.payroll import PayrollItem, PayrollPeriod
from app.models.recruitment import AiJob, Candidate, CvAnalysis, JobPosting
from app.models.kb import ChatLog, KbChunk, KbDocument
from app.models.misc import AuditLog, Notification, Setting
from app.models.performance import (
    GoalCheckin,
    KeyResult,
    Objective,
    PerformanceCycle,
    PerformanceReview,
)
from app.models.onboarding import (
    OnboardingPlan,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateTask,
)
from app.models.assets import Asset, AssetAssignment
from app.models.training import Course, CourseEnrollment
from app.models.announcements import Announcement
from app.models.shifts import (
    AttendanceCorrection,
    OvertimeRequest,
    ShiftAssignment,
    ShiftDefinition,
)
from app.models.documents import CertificateRequest, EmployeeDocument
from app.models.offboarding import OffboardingProcess, OffboardingTask
from app.models.engagement import (
    Kudo,
    Survey,
    SurveyParticipation,
    SurveyResponse,
)
from app.models.feed import FeedComment, FeedLike, FeedPost
from app.models.gamification import PointsLedger, Redemption, Reward

__all__ = [
    # users / org
    "User",
    "Department",
    "Position",
    # employees
    "Employee",
    "Contract",
    # attendance / leave
    "Attendance",
    "LeaveType",
    "LeaveRequest",
    "LeaveBalance",
    # payroll
    "PayrollPeriod",
    "PayrollItem",
    # recruitment / AI
    "JobPosting",
    "Candidate",
    "CvAnalysis",
    "AiJob",
    # knowledge base / chatbot
    "KbDocument",
    "KbChunk",
    "ChatLog",
    # performance (KPI/OKR)
    "PerformanceCycle",
    "Objective",
    "KeyResult",
    "GoalCheckin",
    "PerformanceReview",
    # onboarding
    "OnboardingTemplate",
    "OnboardingTemplateTask",
    "OnboardingPlan",
    "OnboardingTask",
    # assets
    "Asset",
    "AssetAssignment",
    # training
    "Course",
    "CourseEnrollment",
    # announcements
    "Announcement",
    # shifts (ca làm / tăng ca / giải trình) — v3
    "ShiftDefinition",
    "ShiftAssignment",
    "OvertimeRequest",
    "AttendanceCorrection",
    # documents (hồ sơ điện tử / giấy xác nhận) — v3
    "EmployeeDocument",
    "CertificateRequest",
    # offboarding — v3
    "OffboardingProcess",
    "OffboardingTask",
    # engagement (kudos / khảo sát) — v3
    "Kudo",
    "Survey",
    "SurveyResponse",
    "SurveyParticipation",
    # feed (bảng tin nội bộ) — v4
    "FeedPost",
    "FeedLike",
    "FeedComment",
    # gamification (điểm thưởng / cửa hàng quà) — v4
    "PointsLedger",
    "Reward",
    "Redemption",
    # misc
    "Notification",
    "Setting",
    "AuditLog",
    # helpers
    "TimestampMixin",
    "utcnow",
]
