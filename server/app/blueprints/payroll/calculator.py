"""Hàm thuần tính lương theo công thức A5.3 trong docs/architecture.md.

Module này KHÔNG phụ thuộc Flask / database để unit test đối chiếu số liệu
trực tiếp mà không cần dựng app.

Công thức (A5.3):

    Lương theo ngày công = Lương cơ bản x (Ngày công hưởng lương / Ngày công chuẩn)
    Khấu trừ bảo hiểm    = Lương cơ bản x Tỷ lệ BHXH/BHYT/BHTN (từ cấu hình)
    Thực lĩnh            = Lương theo ngày công + Phụ cấp
                           - Khấu trừ bảo hiểm - Khấu trừ khác

Trong đó "ngày công hưởng lương" (``paid_workdays``) = ngày làm thực tế
+ ngày nghỉ CÓ phép; ngày nghỉ KHÔNG lương (``unpaid_days``) không nằm trong
``paid_workdays`` nên không bị trừ hai lần — ``unpaid_days`` chỉ được ghi vào
breakdown để HR đối chiếu. Mọi số tiền là số nguyên VND, làm tròn HALF_UP
bằng Decimal để tránh sai số float.
"""

from __future__ import annotations

import calendar as _calendar
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

# Tỷ lệ khấu trừ bảo hiểm phía người lao động mặc định (BHXH 8% + BHYT 1,5%
# + BHTN 1% = 10,5%). Giá trị thật lấy từ bảng settings (key "insurance_rate")
# ở services.py; hằng số này chỉ là phương án dự phòng.
DEFAULT_INSURANCE_RATE = Decimal("0.105")


def _money(value: Decimal) -> int:
    """Làm tròn Decimal thành số nguyên VND (HALF_UP)."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def calculate_salary(
    base_salary: int,
    allowance: int,
    standard_workdays: float,
    paid_workdays: float,
    unpaid_days: float = 0,
    insurance_rate: float | str | Decimal = DEFAULT_INSURANCE_RATE,
    other_deduction: int = 0,
) -> dict:
    """Tính một dòng lương và trả về breakdown đầy đủ để lưu vào payroll_items.

    Tham số:
        base_salary: lương cơ bản trong hợp đồng hiện hành (VND, >= 0).
        allowance: phụ cấp cố định (VND, >= 0).
        standard_workdays: ngày công chuẩn của tháng (> 0).
        paid_workdays: ngày công hưởng lương = ngày làm thực tế + ngày nghỉ
            có phép (>= 0). Nghỉ không lương KHÔNG tính vào đây.
        unpaid_days: số ngày nghỉ không lương trong tháng — chỉ để đối chiếu
            trong breakdown, không trừ thêm vào lương.
        insurance_rate: tỷ lệ khấu trừ bảo hiểm, ví dụ 0.105 = 10,5%.
        other_deduction: khấu trừ khác do HR nhập (VND, >= 0).

    Trả về dict gồm các trường của payroll_items (workdays_paid, base_salary,
    allowance, insurance_deduction, other_deduction, total_salary) kèm
    "breakdown" chi tiết từng thành phần đã tính.

    Ví dụ kiểm chứng 1 — nghỉ không lương 1 ngày trong tháng 22 ngày công:
        >>> r = calculate_salary(base_salary=12_000_000, allowance=1_000_000,
        ...                      standard_workdays=22, paid_workdays=21,
        ...                      unpaid_days=1, insurance_rate=0.105)
        >>> r["breakdown"]["workday_salary"]   # 12.000.000 x 21/22
        11454545
        >>> r["insurance_deduction"]           # 12.000.000 x 10,5%
        1260000
        >>> r["total_salary"]                  # 11.454.545 + 1.000.000 - 1.260.000
        11194545

    Ví dụ kiểm chứng 2 — đi làm đủ tháng:
        >>> r = calculate_salary(base_salary=10_000_000, allowance=500_000,
        ...                      standard_workdays=22, paid_workdays=22,
        ...                      unpaid_days=0, insurance_rate=0.105)
        >>> r["breakdown"]["workday_salary"], r["insurance_deduction"], r["total_salary"]
        (10000000, 1050000, 9450000)
    """
    base = int(base_salary)
    allow = int(allowance)
    other = int(other_deduction)
    if base < 0 or allow < 0 or other < 0:
        raise ValueError("Lương cơ bản, phụ cấp và khấu trừ khác không được âm")
    standard = Decimal(str(standard_workdays))
    if standard <= 0:
        raise ValueError("Ngày công chuẩn phải lớn hơn 0")
    paid = Decimal(str(paid_workdays))
    if paid < 0:
        raise ValueError("Ngày công hưởng lương không được âm")
    rate = Decimal(str(insurance_rate))
    if rate < 0 or rate >= 1:
        raise ValueError("Tỷ lệ bảo hiểm phải nằm trong khoảng [0, 1)")

    workday_salary = _money(Decimal(base) * paid / standard)
    insurance_deduction = _money(Decimal(base) * rate)
    total_salary = workday_salary + allow - insurance_deduction - other

    return {
        "workdays_paid": float(paid_workdays),
        "base_salary": base,
        "allowance": allow,
        "insurance_deduction": insurance_deduction,
        "other_deduction": other,
        "total_salary": total_salary,
        "breakdown": {
            "formula": "base_salary * paid_workdays / standard_workdays "
            "+ allowance - insurance_deduction - other_deduction",
            "base_salary": base,
            "allowance": allow,
            "standard_workdays": float(standard_workdays),
            "paid_workdays": float(paid_workdays),
            "unpaid_days": float(unpaid_days),
            "workday_salary": workday_salary,
            "insurance_rate": float(rate),
            "insurance_deduction": insurance_deduction,
            "other_deduction": other,
            "total_salary": total_salary,
            "currency": "VND",
        },
    }


def standard_workdays_of_month(year: int, month: int) -> int:
    """Số ngày làm việc Thứ 2–Thứ 6 trong tháng — ngày công chuẩn mặc định."""
    days_in_month = _calendar.monthrange(year, month)[1]
    count = 0
    for day in range(1, days_in_month + 1):
        if date(year, month, day).weekday() < 5:
            count += 1
    return count


def count_weekdays_between(start: date, end: date) -> int:
    """Số ngày Thứ 2–Thứ 6 trong đoạn [start, end] (tính cả hai đầu)."""
    if end < start:
        return 0
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count
