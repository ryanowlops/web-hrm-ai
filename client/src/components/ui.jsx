/* ============================================================
   UI COMPONENTS dùng chung — Web HRM tích hợp AI.
   Chỉ phụ thuộc React + icons.jsx + các class trong styles/.
   Cần import styles theo thứ tự trong main.jsx:
     import "./styles/tokens.css"; "./styles/base.css";
     "./styles/components.css"; "./styles/animations.css";
   ============================================================ */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconAlertTriangle,
  IconInfo,
  IconX,
} from "./icons";

/* ---------------- Button ----------------
   <Button variant="primary|secondary|ghost|danger|outline-danger"
           size="sm|md|lg" loading icon onClick>...</Button> */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon = null,
  block = false,
  className = "",
  disabled,
  children,
  ...props
}) {
  const cls = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...props}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({ title, actions, children, footer, className = "", hover = false }) {
  return (
    <section className={`card${hover ? " card-hover" : ""} ${className}`.trim()}>
      {(title || actions) && (
        <header className="card-header">
          {title ? <h3 className="card-title">{title}</h3> : <span />}
          {actions}
        </header>
      )}
      <div className="card-body">{children}</div>
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}

/* ---------------- Badge ----------------
   variant: neutral | primary | success | warning | danger | accent */
export function Badge({ variant = "neutral", children, className = "" }) {
  return <span className={`badge badge-${variant} ${className}`.trim()}>{children}</span>;
}

/* Ánh xạ trạng thái nghiệp vụ HRM -> variant badge (dùng thống nhất toàn app) */
export const STATUS_BADGE = {
  // nhân viên
  working: "success",
  on_leave: "warning",
  resigned: "neutral",
  // chấm công
  present: "success",
  late: "warning",
  absent: "danger",
  // đơn nghỉ
  pending: "warning",
  manager_approved: "primary",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  // kỳ lương
  draft: "neutral",
  locked: "success",
  // tuyển dụng / ứng viên
  open: "success",
  closed: "neutral",
  new: "primary",
  reviewing: "warning",
  interview: "accent",
  passed: "success",
  // tài liệu KB / job AI
  processing: "warning",
  ready: "success",
  done: "success",
  failed: "danger",
};

export function StatusBadge({ status, label }) {
  return <Badge variant={STATUS_BADGE[status] || "neutral"}>{label || status}</Badge>;
}

/* ---------------- Input / Select ---------------- */
export function Input({ label, required, error, hint, id, ...props }) {
  const inputId = id || `in-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="field">
      {label && (
        <label className={`label${required ? " label-required" : ""}`} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`input${error ? " input-error" : ""}`} aria-invalid={!!error} {...props} />
      {error ? (
        <span className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Select({ label, required, error, hint, id, children, ...props }) {
  const selectId = id || `sel-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="field">
      {label && (
        <label className={`label${required ? " label-required" : ""}`} htmlFor={selectId}>
          {label}
        </label>
      )}
      <select id={selectId} className={`input select${error ? " input-error" : ""}`} aria-invalid={!!error} {...props}>
        {children}
      </select>
      {error ? (
        <span className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

/* ---------------- Table có phân trang ----------------
   columns: [{ key, label, render?: (row) => node, numeric?: bool, actions?: bool }]
   Phân trang server-side: truyền page, totalPages, totalItems, onPageChange. */
export function DataTable({
  columns,
  data = [],
  loading = false,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription,
  page,
  totalPages,
  totalItems,
  onPageChange,
  rowKey = "id",
}) {
  if (!loading && data.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric || c.actions ? "cell-numeric" : undefined} style={c.actions ? { textAlign: "right" } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <div className="skeleton skeleton-text" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => (
                <tr key={row[rowKey]}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? "cell-numeric" : c.actions ? "cell-actions" : undefined}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {totalPages != null && onPageChange && (
        <div className="pagination">
          <span>
            {totalItems != null ? `Tổng ${totalItems} bản ghi · ` : ""}Trang {page}/{totalPages}
          </span>
          <div className="pagination-pages">
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Trang trước"
            >
              <IconChevronLeft size={16} />
            </button>
            <button type="button" className="pagination-btn pagination-btn-active" aria-current="page">
              {page}
            </button>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Trang sau"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, large = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      role="presentation"
    >
      <div className={`modal${large ? " modal-lg" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Đóng">
            <IconX size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* Modal xác nhận nguy hiểm (xoá / chốt kỳ lương...) */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Xác nhận thao tác",
  message,
  confirmText = "Xác nhận",
  cancelText = "Huỷ",
  danger = false,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-secondary">{message}</p>
    </Modal>
  );
}

/* ---------------- Toast ---------------- */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = "success", duration = 4000) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const api = {
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error", 6000),
    warning: (m) => push(m, "warning", 5000),
    info: (m) => push(m, "info"),
    push,
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.variant}`} role="status">
            {t.variant === "success" ? (
              <IconCheck size={18} />
            ) : t.variant === "error" || t.variant === "warning" ? (
              <IconAlertTriangle size={18} />
            ) : (
              <IconInfo size={18} />
            )}
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải dùng bên trong <ToastProvider>");
  return ctx;
}

/* ---------------- StatCard ---------------- */
export function StatCard({ icon, label, value, sub, accent = false }) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon${accent ? " stat-card-icon-accent" : ""}`}>{icon}</div>
      <div>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{value}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ lines = 3, height, circle = false, width }) {
  if (circle) {
    const s = height || 40;
    return <div className="skeleton skeleton-circle" style={{ width: s, height: s }} aria-hidden="true" />;
  }
  if (height) {
    return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
  }
  return (
    <div aria-hidden="true" style={width ? { width } : undefined}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" style={i === lines - 1 ? { width: "60%" } : undefined} />
      ))}
    </div>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({ icon, title = "Chưa có dữ liệu", description, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-title">{title}</div>
      {description && <p className="text-sm">{description}</p>}
      {action}
    </div>
  );
}

/* ---------------- Spinner ---------------- */
export function Spinner({ label = "Đang tải..." }) {
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
