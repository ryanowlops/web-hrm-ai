import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

// Trang 404 — phẳng kiểu template thật (design v4):
// nền gray-50, nội dung giữa màn hình, số 404 lớn màu xám tĩnh,
// không gradient, không quầng sáng, không thẻ nổi.
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
      <main className="w-full max-w-md text-center">
        <div
          aria-hidden="true"
          className="select-none text-[7rem] font-semibold leading-none tracking-tight text-gray-300 sm:text-[8rem]"
        >
          404
        </div>

        <h1 className="mt-4 text-xl font-semibold tracking-[-0.01em] text-gray-900">
          Không tìm thấy trang
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
          Trang bạn đang tìm không tồn tại hoặc đã được di chuyển. Kiểm tra lại địa chỉ, hoặc quay
          về trang tổng quan để tiếp tục.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button variant="primary">Về trang tổng quan</Button>
          </Link>
          <Link to="/jobs">
            <Button variant="secondary">Xem tin tuyển dụng</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
