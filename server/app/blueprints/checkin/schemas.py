"""Marshmallow schemas cho module chấm công QR + GPS (checkin).

- ScanSchema: dữ liệu nhân viên gửi khi quét QR / nhập mã dự phòng.
- CheckinConfigSchema: HR cài toạ độ văn phòng — validate đúng mục 1.3:
  lat [-90, 90], lon [-180, 180], radius_m [10, 2000].
- CheckinLogSchema: serialize nhật ký cho trang HR.
"""
from marshmallow import EXCLUDE, Schema, fields, validate


class ScanSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    date = fields.Date(required=True)
    token = fields.Str(
        required=True,
        validate=validate.Length(min=1, max=32),
        error_messages={"required": "Thiếu mã chấm công (token)."},
    )
    lat = fields.Float(required=False, allow_none=True, load_default=None)
    lon = fields.Float(required=False, allow_none=True, load_default=None)


class CheckinConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    lat = fields.Float(
        required=True,
        validate=validate.Range(
            min=-90, max=90, error="Vĩ độ (lat) phải trong khoảng -90..90."
        ),
    )
    lon = fields.Float(
        required=True,
        validate=validate.Range(
            min=-180, max=180, error="Kinh độ (lon) phải trong khoảng -180..180."
        ),
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
