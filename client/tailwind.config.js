/** Tailwind CSS — Web HRM AI design system v4 (bám shadcn-admin × Untitled UI).
 * Bảng màu + font + shadow + animation dùng chung toàn hệ thống.
 * Mọi trang KHÔNG tự chế màu ngoài bảng này (trừ màu trạng thái ngữ nghĩa).
 * Đồng bộ với src/styles/tokens.css — sửa màu phải sửa cả hai nơi.
 * v4: KHÔNG gradient, KHÔNG shadow nổi — thẻ chỉ border gray-200 + shadow-card siêu nhẹ.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Thang xám Untitled UI (ghi đè thang gray mặc định của Tailwind)
        gray: {
          25: '#FCFCFD', 50: '#F9FAFB', 100: '#F2F4F7', 200: '#EAECF0',
          300: '#D0D5DD', 400: '#98A2B3', 500: '#667085', 600: '#475467',
          700: '#344054', 800: '#1D2939', 900: '#101828', 950: '#0C111D',
        },
        // Màu thương hiệu chính (xanh doanh nghiệp) — giữ nguyên từ v2/v3
        brand: {
          50: '#EEF4FF', 100: '#DCE7FD', 200: '#C0D4FE', 300: '#94B8FD',
          400: '#6193FA', 500: '#3D6EF5', 600: '#274FEA', 700: '#1F3FD8',
          800: '#2134AE', 900: '#0F2160', 950: '#0A1638',
        },
        // Navy — v4 CHỈ còn dùng cho chữ/phụ, KHÔNG dùng làm nền sidebar/hero nữa.
        // Giữ token để không vỡ class cũ; không xoá.
        navy: {
          700: '#1B3358', 800: '#12294D', 900: '#0C2144', 950: '#081A3A',
        },
        ink: '#081A3A',
        // Amber cảnh báo / chờ duyệt (dùng tiết kiệm, đúng ngữ nghĩa)
        signal: '#F59E0B',
        // Màu nhấn phụ (teal) cho AI / trạng thái tích cực
        accent: {
          50: '#EFFDF9', 100: '#C9F7EA', 300: '#5FE3C3', 400: '#27CFA9',
          500: '#0DB795', 600: '#02957B', 700: '#017763',
        },
        // Nền ứng dụng — gray-50 Untitled UI
        canvas: '#F9FAFB',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // v4: Inter cho MỌI thứ (bỏ Be Vietnam Pro) — font-display ánh xạ về Inter
        display: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        // Thẻ: chỉ shadow-xs phẳng đúng Untitled UI
        card: '0 1px 2px rgba(16,24,40,.05)',
        // lift/pop/glow của v3 đã bị LOẠI khỏi hệ thống v4 — ánh xạ về mức nhẹ
        // tương đương để class cũ không vỡ: lift ≈ shadow-lg nhẹ (modal/dropdown),
        // pop = shadow vừa cho lớp phủ, glow = hạ về shadow-card.
        lift: '0 10px 15px -3px rgba(16,24,40,.08), 0 4px 6px -4px rgba(16,24,40,.08)',
        pop: '0 12px 24px -8px rgba(16,24,40,.12)',
        glow: '0 1px 2px rgba(16,24,40,.05)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.21,.9,.35,1) both',
        'fade-in': 'fade-in .3s ease both',
        'scale-in': 'scale-in .28s cubic-bezier(.21,.9,.35,1) both',
        'slide-in': 'slide-in .35s cubic-bezier(.21,.9,.35,1) both',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.21,.9,.35,1)',
      },
    },
  },
  plugins: [],
};
