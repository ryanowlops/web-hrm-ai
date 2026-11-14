"""Marshmallow schemas cho module chấm công QR + GPS (checkin).

- ScanSchema: dữ liệu nhân viên gửi khi quét QR / nhập mã dự phòng.
- CheckinConfigSchema: HR cài toạ độ văn phòng — validate đúng mục 1.3:
  lat [-90, 90], lon [-180, 180], radius_m [10, 2000].
- CheckinLogSchema: serialize nhật ký cho trang HR.
"""
import math

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate


def _finite_in_range(min_value, max_value, label):
    """Validator cho tọa độ: từ chối NaN/Infinity rồi kiểm tra khoảng.

    Không dùng validate.Range trần: mọi so sánh với NaN đều False nên
    Range để NaN lọt qua, và tọa độ vô nghĩa (vd lat=999) chui tới
    haversine sẽ tính ra khoảng cách rác, thậm chí crash 500 khi
    asin/sqrt nhận giá trị ngoài miền. Marshmallow Float mặc định cũng
    chặn NaN/Infinity nhưng chỉ ngầm (message tiếng Anh chung); kiểm tra
    tường minh ở đây để lỗi luôn là 400 VALIDATION_ERROR với message
    tiếng Việt rõ ràng.
    """

    def _validate(value):
        if value is None:
            return
        if not math.isfinite(value):
            raise ValidationError(
                f"{label} phải là một số hữu hạn "
                "(không chấp nhận NaN/Infinity)."
            )
        if value < min_value or value > max_value:
            raise ValidationError(
                f"{label} phải trong khoảng {min_value}..{max_value}."
            )

    return _validate


class ScanSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    date = fields.Date(required=True)
    token = fields.Str(
        required=True,
        validate=validate.Length(min=1, max=32),
        error_messages={"required": "Thiếu mã chấm công (token)."},
    )
    lat = fields.Float(
        required=False,
        allow_none=True,
        load_default=None,
        validate=_finite_in_range(-90, 90, "Vĩ độ (lat)"),
    )
    lon = fields.Float(
        required=False,
        allow_none=True,
        load_default=None,
        validate=_finite_in_range(-180, 180, "Kinh độ (lon)"),
    )


class CheckinConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    lat = fields.Float(
        required=True,
        validate=_finite_in_range(-90, 90, "Vĩ độ (lat)"),
    )
    lon = fields.Float(
        required=True,
        validate=_finite_in_range(-180, 180, "Kinh độ (lon)"),
    )
    radius_m = fields.Int(
        required=False,
        allow_none=True,
        load_default=None,
        validate=validate.Range(
            min=10, max=2000, error="Bán kính phải từ 10 đến 2000 mét."
        ),
    )


class CheckinLogSchema(Schema):
    id = fields.Int(dump_only=True)
    employee_id = fields.Int()
    employee_code = fields.Method("get_employee_code")
    employee_name = fields.Method("get_employee_name")
    date = fields.Date()
    method = fields.Str()
    lat = fields.Float(allow_none=True)
    lon = fields.Float(allow_none=True)
    distance_m = fields.Int(allow_none=True)
    result = fields.Str()
    reason = fields.Str(allow_none=True)
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


scan_schema = ScanSchema()
config_schema = CheckinConfigSchema()
checkin_log_schema = CheckinLogSchema()
checkin_log_list_schema = CheckinLogSchema(many=True)
