# Hợp đồng thiết kế Frontend v4 — bám template thật (shadcn-admin × Untitled UI × pattern HR BambooHR)

> Lý do làm v4: người dùng nhận xét v3 "nhìn AI quá" (gradient navy, hero band trang trí, thẻ bo tròn đều, hiệu ứng trang trí). v4 bỏ hẳn ngôn ngữ tự chế, **bám sát các template do người thiết kế** dưới đây. Tài liệu này là HỢP ĐỒNG bắt buộc cho mọi worker v4 — lệch hợp đồng là sai.
>
> Mẫu tham chiếu (đã tra cứu 2026-10-21):
> 1. **shadcn-admin** (satnaing, GitHub ~11–15k★) — khung chính: sidebar SÁNG, palette trung tính, topbar có ô tìm kiếm ⌘K, bảng dữ liệu phẳng, light theme. Stack trùng hệt dự án: React + Vite + Tailwind.
> 2. **Untitled UI** — hệ số đo: thang xám, border, radius, shadow siêu nhẹ, typography Inter.
> 3. **TailAdmin React** — pattern component phụ (badge, dropdown, bảng).
> 4. **thefrontkit HR Dashboard / BambooHR** — pattern nghiệp vụ HR: danh bạ nhân viên dạng bảng avatar 2 dòng, hàng chờ duyệt phép, bảng chấm công, pipeline tuyển dụng.

## 1. CẤM TUYỆT ĐỐI (dấu hiệu "AI")

- Không gradient (linear/radial/conic) ở bất kỳ đâu trong UI.
- Không hero band tối màu, không panel navy trang trí, không glassmorphism/blur trang trí, không blob/quầng sáng/glow, không PulseBar/timeline trang trí, không vòng trang trí.
- Không bo góc lớn đồng loạt: nút/input `rounded-lg` (8px), thẻ `rounded-xl` (12px) là tối đa; không `rounded-2xl/3xl` cho thẻ nội dung.
- Không shadow nổi (lift/pop/glow): thẻ chỉ dùng **border + shadow-xs**. Shadow lớn chỉ cho modal/dropdown (`shadow-lg` nhẹ).
- Không font hiển thị riêng: **Inter cho mọi thứ** (bỏ Be Vietnam Pro trong giao diện; class `font-display` được W1 ánh xạ về Inter).
- Không eyebrow chữ hoa trang trí trên tiêu đề trang; không số liệu khổng lồ trang trí.

## 2. Palette (Untitled UI — ghi đè thang `gray` của Tailwind)

| Token | Hex | Token | Hex |
|---|---|---|---|
| gray-25 | #FCFCFD | gray-500 | #667085 |
| gray-50 | #F9FAFB | gray-600 | #475467 |
| gray-100 | #F2F4F7 | gray-700 | #344054 |
| gray-200 | #EAECF0 | gray-800 | #1D2939 |
| gray-300 | #D0D5DD | gray-900 | #101828 |
| gray-400 | #98A2B3 | gray-950 | #0C111D |

- Màu chính giữ thang `brand` hiện có; hành động chính dùng **brand-600**, hover brand-700, nền nhấn nhẹ brand-50, chữ nhấn brand-700.
- Ngữ nghĩa (dùng cho Badge/Alert — W4/W5 ánh xạ tone sang các giá trị này): success bg #ECFDF3 / text #067647 / dot #12B76A · warning bg #FFFAEB / text #B54708 / dot #F79009 · error bg #FEF3F2 / text #B42318 / dot #F04438 · info dùng brand · neutral dùng gray.
- Nền app: gray-50 (#F9FAFB). Bề mặt: trắng. Border mặc định: gray-200. Chữ chính gray-900, chữ phụ gray-500, chữ mờ gray-400.
- Biểu đồ Recharts: màu phẳng brand-600, accent-500 (teal), gray-300, amber-500 — fill đặc opacity thấp, KHÔNG gradient fill.

## 3. Số đo & typography

- Font: Inter Variable, `tabular-nums` cho mọi số liệu/cột số.
- Tiêu đề trang: **20px, semibold (600), gray-900, tracking -0.01em** + mô tả 14px gray-500 ngay dưới. Tiêu đề thẻ: 14–16px semibold. Nhãn nhỏ: 13px gray-500. Thân: 14px.
- Nút: cao 36–40px, 14px medium, rounded-lg, primary = brand-600 trắng chữ; secondary = trắng, border gray-300, chữ gray-700, hover bg-gray-50.
- Input/Select: cao 40px, border gray-300, rounded-lg, focus ring brand-600/20 + border brand-600.
- Thẻ: trắng, `border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(16,24,40,0.05)]` (token `shadow-card` được W1 định nghĩa lại đúng giá trị này).
- Bảng: thead bg-gray-50, chữ 12px medium gray-500, hàng border-t gray-200 (trong thẻ) / gray-100, hover bg-gray-50, padding ô 12px 16px, ô tên có avatar tròn 32–36px + 2 dòng (tên 14px medium gray-900, phụ 13px gray-500).

## 4. Khung ứng dụng (W8 — AppLayout theo shadcn-admin)

- **Sidebar TRẮNG** 264px, border-r gray-200 (bỏ hẳn sidebar navy): logo = ô vuông brand-600 rounded-lg 32px chứa chữ "H" trắng + tên "Web HRM AI" 15px semibold gray-900, phụ đề 12px gray-500. Nhãn nhóm: 12px medium gray-500, không hoa. Mục menu: icon 18px (icons.jsx hoặc lucide-react), chữ 14px gray-700, rounded-lg, hover bg-gray-50; đang chọn: **bg-brand-50, chữ brand-700, medium**. Cuối sidebar: thẻ người dùng (avatar + tên + vai trò + nút đăng xuất) tách bằng border-t.
- **Topbar trắng** 64px, border-b gray-200: trái = ô tìm kiếm giả lập kiểu shadcn-admin (border gray-300, rounded-lg, placeholder "Tìm kiếm...", phím ⌘K dạng kbd ở phải ô) — chỉ trình bày, giữ nguyên hành vi tìm kiếm hiện có nếu có; phải = chuông thông báo có chấm đỏ nhỏ + khối người dùng.
- Nội dung: bg-gray-50, padding 24px (lg 32px), không giới hạn max-width kiểu marketing.
- Mobile: giữ hành vi thu gọn/hamburger hiện tại.

## 5. Mẫu trang (mọi worker trang phải theo)

1. PageHeader: trái tiêu đề + mô tả; phải = cụm nút hành động (secondary trước, primary sau).
2. Thanh lọc (nếu trang có): hàng ngang trên nền trắng trong thẻ mỏng hoặc ngay dưới header — input tìm kiếm + select lọc + nút.
3. Nội dung chính: thẻ bảng full-width (bảng tràn viền thẻ, thead như mục 3) hoặc lưới thẻ theo nghiệp vụ; trạng thái tải = Skeleton đúng hình dạng; rỗng = EmptyState có nút hành động.
4. Dashboard (W10, theo trang Overview của shadcn-admin): hàng **4 StatCard phẳng** (nhãn 13px gray-500, số 24px semibold, dòng phụ 13px — TUYỆT ĐỐI không bịa số liệu/số % không có từ API; không có dữ liệu phụ thì để dòng phụ mô tả nguồn số liệu); hàng 2: biểu đồ chấm công (2/3) + thẻ "Cần xử lý" (1/3) dạng danh sách việc có Badge; hàng 3: cơ cấu phòng ban + bảng đơn phép gần đây. **Không hero, không band tối.**
5. Login (W11, theo auth của shadcn-admin/TailAdmin): nền gray-50, form giữa màn hình max-w ~400px: logo, tiêu đề 24px semibold, mô tả, thẻ trắng border chứa form (hoặc form trực tiếp trên nền như shadcn-admin), nút primary full-width; dưới form là khối tài khoản demo trình bày dạng bảng nhỏ/border. Không panel navy, không hero.
6. Public Jobs (W12, theo trang careers Personio): nền trắng, header border-b (logo trái, nút "Đăng nhập nội bộ" phải), vùng đầu trang nền trắng — tiêu đề 30px semibold gray-900 + mô tả + ô tìm kiếm lớn; danh sách việc dạng hàng/thẻ border rounded-xl hover border-brand-300; chi tiết/ứng tuyển giữ nguyên luồng.
7. Chatbot (W20): khung chat trong thẻ trắng border, tin nhắn user bg-brand-600 chữ trắng bo 12px, tin nhắn bot bg-gray-100 gray-900; không bong bóng gradient.

## 6. Chuyển động (giữ thư viện `motion`, giảm liều)

- PageTransition: opacity 0→1 + y 4px, **150ms**. StaggerList: tối đa 6 phần tử đầu, step 25ms — quá đó hiện ngay. Modal: scale .98→1 + fade 160ms. Drawer: trượt 200ms ease-out. AnimatedNumber/ProgressRing giữ cho số liệu nhỏ. **Xoá mọi hiệu ứng trang trí lặp vô hạn.** Tất cả vẫn tôn trọng `prefers-reduced-motion`. PulseBar: không trang nào được dùng nữa (giữ file cho tương thích, ghi chú deprecated).

## 7. Quy ước làm việc cho worker

- CHỈ sửa file được giao; giữ nguyên 100% logic, lời gọi API, route, key localStorage (`hrm_user`, `hrm_access_token`), và văn bản hiển thị (chỉ bỏ các eyebrow/hero trang trí của v3 khi file của mình chứa chúng).
- Chỉ import những gì đã tồn tại: UI kit `components/ui` (Button, Card, CardHeader, CardBody, FormField, Input, Select, Textarea, Badge, Modal, Spinner, Skeleton, TableSkeleton, EmptyState, Alert, PageHeader, StatCard), motion `components/motion` (PageTransition, StaggerList, StaggerItem, AnimatedNumber, ProgressRing, CheckMotion, Drawer, ActivePill — KHÔNG dùng PulseBar), icons `components/icons.jsx` (IconHome, IconUsers, …), hoặc `lucide-react` (đã cài).
- Không chạy npm install, không git, không sửa package.json. Sau khi sửa, tự kiểm tra cú pháp từng file .jsx bằng esbuild có sẵn trong `client/node_modules/.bin/esbuild` (loader jsx) và báo cáo kết quả.
- Nếu hợp đồng v4 mâu thuẫn với code hiện tại trong file được giao, ưu tiên hợp đồng v4 cho LỚP TRÌNH BÀY.
