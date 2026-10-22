// Khung chờ dạng skeleton (pulse nhẹ) — giữ bố cục ổn định trong lúc chunk
// của trang đang tải, tránh cảm giác trang trắng/nhảy hình.
// Dùng ở router (Suspense fallback), ProtectedRoute (chờ khôi phục phiên)
// và RouteErrorPage. Tách thành file riêng để tránh import vòng
// router.jsx <-> ProtectedRoute.jsx.
export default function PageLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Đang tải trang" className="animate-pulse">
      <div className="mb-2 h-6 w-56 rounded-md bg-gray-200" />
      <div className="mb-6 h-4 w-80 max-w-full rounded-md bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-5 h-64 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
