import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

// Trang 404 — tối giản chuẩn enterprise (design system v2):
// nền canvas, thẻ trắng shadow-pop, số 404 lớn màu brand-100,
// hiệu ứng scale-in cho thẻ và fade-up so le cho nội dung.
export default function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-16">
      {/* Quầng sáng trang trí rất nhẹ theo tông brand/accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-brand-100/60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-[-8%] h-96 w-96 rounded-full bg-accent-100/50 blur-3xl"
      />

      <main className="relative w-full max-w-lg animate-scale-in rounded-xl2 border border-slate-200/70 bg-white px-6 py-12 text-center shadow-pop sm:px-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-card">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3M8.5 11h5" />
          </svg>
        </div>

        <div
          aria-hidden="true"
          className="mt-4 select-none text-[6.5rem] font-extrabold leading-none tracking-tight text-brand-100 sm:text-[7.5rem]"
        >
          404
        </div>

        <h1
          className="mt-3 animate-fade-up text-2xl font-bold tracking-tight text-navy-950"
          style={{ animationDelay: '.08s' }}
        >
          Không tìm thấy trang
        </h1>
        <p
          className="mx-auto mt-3 max-w-md animate-fade-up text-[15px] leading-relaxed text-slate-500"
          style={{ animationDelay: '.16s' }}
        >
          Trang bạn đang tìm không tồn tại hoặc đã được di chuyển. Kiểm tra lại địa chỉ, hoặc quay
          về trang tổng quan để tiếp tục.
        </p>

        <div
          className="mt-8 flex animate-fade-up flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: '.24s' }}
        >
          <Link to="/">
            <Button variant="primary" size="lg">
              Về trang tổng quan
            </Button>
          </Link>
          <Link to="/jobs">
            <Button variant="secondary" size="lg">
              Xem tin tuyển dụng
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
