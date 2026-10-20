"""Marshmallow schemas cho module chấm công (attendance).

Model Attendance (theo docs/architecture.md A7):
    id, employee_id, work_date, check_in_at, check_out_at,
    status (present/late/absent/on_leave), note, edited_by,
    created_at, updated_at — unique (employee_id, work_date).
"""
from marshmallow import EXCLUDE, Schema, fields, validate

ATTENDANCE_STATUSES = ("present", "late", "absent", "on_leave")


class AttendanceSchema(Schema):
    """Serialize một bản ghi chấm công.

    Các trường thông tin nhân viên dùng fields.Method + getattr để an toàn
    khi model Employee thay đổi nhẹ (không vỡ serialize).
    """

    id = fields.Int(dump_only=True)
    employee_id = fields.Int(required=True)
    employee_code = fields.Method("get_employee_code")
    employee_name = fields.Method("get_employee_name")
    department_id = fields.Method("get_department_id")
    work_date = fields.Date(required=True)
    check_in_at = fields.DateTime(format="iso", allow_none=True)
    check_out_at = fields.DateTime(format="iso", allow_none=True)
    status = fields.Str(required=True)
    note = fields.Str(allow_none=True)
    edited_by = fields.Int(allow_none=True)
    created_at = fields.DateTime(format="iso", dump_only=True, allow_none=True)
    updated_at = fields.DateTime(format="iso", dump_only=True, allow_none=True)

    @staticmethod
    def _employee(obj):
        return getattr(obj, "employee", None)

    def get_employee_code(self, obj):
        emp = self._employee(obj)
        return getattr(emp, "code", None) if emp is not None else None

    def get_employee_name(self, obj):
        emp = self._employee(obj)
        return getattr(emp, "full_name", None) if emp is not None else None

    def get_department_id(self, obj):
        emp = self._employee(obj)
        return getattr(emp, "department_id", None) if emp is not None else None


class AttendanceUpdateSchema(Schema):
    """Dữ liệu HR sửa một bản ghi chấm công.

    `note` là BẮT BUỘC: lý do sửa (theo quy trình A5.2, mọi chỉnh sửa bảng
    công phải có lý do và được ghi nhật ký).
    """

    class Meta:
        unknown = EXCLUDE

    work_date = fields.Date(required=False)
    check_in_at = fields.DateTime(format="iso", required=False, allow_none=True)
    check_out_at = fields.DateTime(format="iso", required=False, allow_none=True)
    status = fields.Str(
        required=False, validate=validate.OneOf(ATTENDANCE_STATUSES)
    )
    note = fields.Str(
        required=True,
        validate=validate.Length(min=1),
        error_messages={
            "required": "Bắt buộc nhập lý do sửa (note).",
            "null": "Bắt buộc nhập lý do sửa (note).",
        },
    )


attendance_schema = AttendanceSchema()
attendance_list_schema = AttendanceSchema(many=True)
attendance_update_schema = AttendanceUpdateSchema()
