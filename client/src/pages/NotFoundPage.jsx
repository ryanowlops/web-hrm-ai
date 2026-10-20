import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1d4ed8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3M8.5 11h5" />
      </svg>
      <h1 style={{ fontSize: '1.75rem', margin: '1rem 0 0.5rem' }}>404 — Không tìm thấy trang</h1>
      <p style={{ color: '#475569', maxWidth: 460, margin: '0 0 1.5rem' }}>
        Trang bạn đang tìm không tồn tại hoặc đã được di chuyển. Kiểm tra lại địa chỉ, hoặc quay
        về trang tổng quan để tiếp tục.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          to="/"
          style={{
            background: '#1d4ed8',
            color: '#ffffff',
            padding: '0.6rem 1.1rem',
            borderRadius: '0.55rem',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Về trang tổng quan
        </Link>
        <Link
          to="/jobs"
          style={{
            border: '1px solid #cbd5e1',
            color: '#1e40af',
            padding: '0.6rem 1.1rem',
            borderRadius: '0.55rem',
            textDecoration: 'none',
            fontWeight: 600,
            background: '#ffffff',
          }}
        >
          Xem tin tuyển dụng
        </Link>
      </div>
    </div>
  );
}
