/** Tailwind CSS — Web HRM AI design system v2 (enterprise).
 * Bảng màu + font + shadow + animation dùng chung toàn hệ thống.
 * Mọi trang KHÔNG tự chế màu ngoài bảng này (trừ màu trạng thái ngữ nghĩa).
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Màu thương hiệu chính (xanh doanh nghiệp)
        brand: {
          50: '#EEF4FF', 100: '#DCE7FD', 200: '#C0D4FE', 300: '#94B8FD',
          400: '#6193FA', 500: '#3D6EF5', 600: '#274FEA', 700: '#1F3FD8',
          800: '#2134AE', 900: '#0F2160', 950: '#0A1638',
        },
        // Navy cho sidebar / vùng tối
        navy: {
          700: '#1B3358', 800: '#14294B', 900: '#0E1F3C', 950: '#0A1730',
        },
        // Màu nhấn phụ (teal) cho AI / điểm nhấn
        accent: {
          50: '#EFFDF9', 100: '#C9F7EA', 300: '#5FE3C3', 400: '#27CFA9',
          500: '#0DB795', 600: '#02957B', 700: '#017763',
        },
        // Nền ứng dụng
        canvas: '#F4F7FB',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)',
        lift: '0 8px 24px -8px rgba(16,24,40,.16), 0 4px 8px -4px rgba(16,24,40,.08)',
        pop: '0 16px 40px -12px rgba(10,22,56,.25), 0 4px 12px -4px rgba(10,22,56,.12)',
        glow: '0 0 0 4px rgba(39,79,234,.14)',
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
