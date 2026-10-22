import Modal from './Modal.jsx';
import Button from './Button.jsx';

// Hộp thoại xác nhận dùng chung — tách mẫu từ AdminPage (dialog thay cho
// window.confirm): Modal v4, nút "Huỷ" (secondary) và nút xác nhận
// (danger khi thao tác phá huỷ, primary trong các trường hợp còn lại).
// Giữ nguyên logic gọi API sau khi xác nhận ở phía trang gọi.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={!!open}
      title={title}
      onClose={onCancel}
      actions={(
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {typeof description === 'string' ? (
        <p className="text-sm leading-relaxed text-gray-600">{description}</p>
      ) : (
        description
      )}
    </Modal>
  );
}
