"""Schema (serialize + validate) cho Quản lý thử việc.

Serialize theo quy ước camelCase của các module mới (xem holidays):
frontend nhận date dạng ISO "YYYY-MM-DD". Validate trả danh sách lỗi
dạng [{"field": ..., "message": ...}] để routes đóng vào error.details.
"""

from app.models import ProbationEvaluation


def evaluation_to_dict(evaluation):
    if evaluation is None:
        return None
    return {
        "id": evaluation.id,
        "contractId": evaluation.contract_id,
        "employeeId": evaluation.employee_id,
        "decision": evaluation.decision,
        "notes": evaluation.notes,
        "evaluatedBy": evaluation.evaluated_by,
        "createdAt": (
            evaluation.created_at.isoformat() if evaluation.created_at else None
        ),
        "updatedAt": (
            evaluation.updated_at.isoformat() if evaluation.updated_at else None
        ),
    }


def contract_to_dict(contract):
    if contract is None:
        return None
    return {
        "id": contract.id,
        "employeeId": contract.employee_id,
        "contractType": contract.contract_type,
        "startDate": (
            contract.start_date.isoformat() if contract.start_date else None
        ),
        "endDate": contract.end_date.isoformat() if contract.end_date else None,
        "baseSalary": contract.base_salary,
        "allowance": contract.allowance,
        "status": contract.status,
    }


def probation_to_dict(row):
    """Serialize một dòng thử việc: hợp đồng + nhân viên + đánh giá mới nhất."""
    contract = row["contract"]
    employee = row["employee"]
    department = getattr(employee, "department", None)
    return {
        "contractId": contract.id,
        "employeeId": employee.id,
        "employeeCode": employee.code,
        "employeeName": employee.full_name,
        "departmentId": employee.department_id,
        "departmentName": getattr(department, "name", None)
        if department is not None
        else None,
        "contractType": contract.contract_type,
        "startDate": (
            contract.start_date.isoformat() if contract.start_date else None
        ),
        "endDate": contract.end_date.isoformat() if contract.end_date else None,
        # Số ngày còn lại tới hạn thử việc; null = hợp đồng không thời hạn.
        "daysRemaining": row["days_remaining"],
        "baseSalary": contract.base_salary,
        "allowance": contract.allowance,
        "contractStatus": contract.status,
        "latestEvaluation": evaluation_to_dict(row["evaluation"]),
    }


def validate_evaluate_payload(data):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}

    # decision — bắt buộc, chỉ pass / fail / extend.
    decision = data.get("decision")
    if decision not in ProbationEvaluation.DECISIONS:
        errors.append(
            {
                "field": "decision",
                "message": "decision phải là pass, fail hoặc extend.",
            }
        )
    else:
        cleaned["decision"] = decision

    # notes — tùy chọn.
    if "notes" in data and data["notes"] is not None:
        if not isinstance(data["notes"], str):
            errors.append({"field": "notes", "message": "Phải là chuỗi."})
        else:
            cleaned["notes"] = data["notes"].strip() or None

    # extend_days — bắt buộc khi decision = extend, số nguyên 1..180.
    if decision == ProbationEvaluation.DECISION_EXTEND:
        days = data.get("extend_days")
        if isinstance(days, bool) or not isinstance(days, int):
            errors.append(
                {
                    "field": "extend_days",
                    "message": "extend_days là số nguyên 1..180.",
                }
            )
        elif not 1 <= days <= 180:
            errors.append(
                {
                    "field": "extend_days",
                    "message": "extend_days phải trong khoảng 1..180 ngày.",
                }
            )
        else:
            cleaned["extend_days"] = days

    return cleaned, errors
