import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../../../app/AuthContext.jsx';
import { login } from '../services';
import { Alert, Button } from '../../../components/ui';
import { PulseBar } from '../../../components/motion';

// ============================================================
// Trang đăng nhập — route /login (giao diện enterprise 2 cột)
// - Cột trái (màn hình lớn): panel thương hiệu navy + tính năng nổi bật.
// - Cột phải: form đăng nhập trong thẻ trắng — email / mật khẩu,
//   báo lỗi tiếng Việt ngay tại trường.
// - Đăng nhập thành công: services.login lưu token vào localStorage
//   (hrm_access_token / hrm_refresh_token), sau đó refreshUser() đồng bộ
//   trạng thái vào AuthContext (ProtectedRoute dựa vào context này)
//   rồi mới chuyển về "/" (hoặc trang trước đó nếu bị route bảo vệ chặn).
// ============================================================

// Thông báo thân thiện theo mã lỗi của API (không dựa vào message của server).
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
  UNAUTHORIZED: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khóa. Vui lòng liên hệ phòng nhân sự (HR).',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa tạm thời. Vui lòng liên hệ phòng nhân sự (HR).',
  TOO_MANY_REQUESTS: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.',
  VALIDATION_ERROR: 'Thông tin đăng nhập chưa hợp lệ. Vui lòng kiểm tra lại các trường bên dưới.',
  NETWORK_ERROR: 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.',
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.',
};

function validateForm({ email, password }) {
  const errors = {};
  const emailValue = email.trim();
  if (!emailValue) {
    errors.email = 'Vui lòng nhập email.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    errors.email = 'Email chưa đúng định dạng (ví dụ: ten@congty.vn).';
  }
  if (!password) {
    errors.password = 'Vui lòng nhập mật khẩu.';
  }
  return errors;
}

// Điểm nhấn tính năng hiển thị trên panel thương hiệu (chỉ trình bày).
const HIGHLIGHTS = [
  {
    title: 'Quản lý nhân sự & chấm công tập trung',
    text: 'Hồ sơ, phòng ban, hợp đồng và bảng công của toàn công ty trong một hệ thống.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    ),
  },
  {
    title: 'Nghỉ phép & bảng lương minh bạch',
    text: 'Duyệt phép 2 cấp, tính lương tự động từ bảng công và chốt kỳ an toàn.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12V12Zm0 2.25h.008v.008H12v-.008Zm0 2.25h.008v.008H12v-.008ZM9.75 12h.008v.008H9.75V12Zm0 2.25h.008v.008H9.75v-.008Zm0 2.25h.008v.008H9.75v-.008Zm5.25-4.5h.008v.008H15V12Zm0 2.25h.008v.008H15v-.008Zm0 2.25h.008v.008H15v-.008Z"
      />
    ),
  },
  {
    title: 'AI sàng lọc CV & chatbot HR nội bộ',
    text: 'AI chấm điểm hồ sơ theo JD và trả lời quy chế từ tài liệu công ty — HR là người quyết định cuối cùng.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    ),
  },
];

// Nhịp ngày làm việc — mốc cho PulseBar ở panel thương hiệu (chỉ trình bày).
const LOGIN_PULSE_MILESTONES = [
  { at: 0.06, label: '07:30', done: true },
  { at: 0.34, label: '09:00', done: true },
  { at: 0.6, label: '12:00', done: true },
  { at: 0.88, label: '17:30', done: false },
];

const highlightContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.3 } },
};

const highlightItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
  },
};

function LogoMark({ className = 'h-11 w-11 rounded-xl text-[22px]' }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(39,79,234,.65)] ring-1 ring-white/25 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[58%] w-[58%]">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M8.25 21v-3.75a3.75 3.75 0 0 1 7.5 0V21M8.25 6.75h.008v.008H8.25V6.75Zm3.75 0h.008v.008H12V6.75Zm3.75 0h.008v.008h-.008V6.75ZM8.25 10.5h.008v.008H8.25V10.5Zm3.75 0h.008v.008H12V10.5Zm3.75 0h.008v.008h-.008V10.5Z"
        />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user: authUser, loading: authLoading, refreshUser } = useAuth();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Đã có phiên đăng nhập (AuthContext xác nhận) thì không ở lại trang login.
  useEffect(() => {
    if (!authLoading && authUser) {
      navigate('/', { replace: true });
    }
  }, [authLoading, authUser, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Xoá lỗi của trường đang sửa để người dùng đỡ rối.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    if (formError) setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const errors = validateForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      // Đồng bộ user vào AuthContext trước khi chuyển trang,
      // nếu không ProtectedRoute sẽ đẩy ngược lại /login.
      await refreshUser();
      const redirectTo = location.state?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const serverFieldErrors = err?.fieldErrors || {};
      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      }
      setFormError(
        ERROR_MESSAGES[err?.code] ||
          err?.message ||
          'Đăng nhập thất bại. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputErrorClass = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15';

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-slate-800 antialiased">
      {/* ===== Panel thương hiệu (chỉ hiện trên màn hình lớn) ===== */}
      <aside className="relative hidden w-[44%] overflow-hidden bg-navy-950 lg:flex xl:w-1/2">
        {/* Lớp nền gradient + đốm sáng mờ chuyển động chậm */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-950 to-brand-950" />
        <div
          aria-hidden="true"
          className="absolute -left-32 -top-32 h-96 w-96 animate-pulse-soft rounded-full bg-brand-500/25 blur-3xl"
          style={{ animationDuration: '7s' }}
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 top-1/3 h-80 w-80 animate-pulse-soft rounded-full bg-accent-500/20 blur-3xl"
          style={{ animationDuration: '9s' }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-36 left-1/4 h-96 w-96 animate-pulse-soft rounded-full bg-brand-400/15 blur-3xl"
          style={{ animationDuration: '11s' }}
        />

        <div className="relative z-10 flex w-full flex-col justify-between px-12 py-12 xl:px-16">
          <motion.div
            className="flex items-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <LogoMark />
            <div>
              <p className="font-display text-lg font-extrabold leading-tight tracking-tight text-white">Web HRM AI</p>
              <p className="text-[13px] font-medium text-slate-300/90">Enterprise HR Platform</p>
            </div>
          </motion.div>

          <motion.div
            className="max-w-md"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="font-display text-[34px] font-extrabold leading-[1.15] tracking-tight text-white xl:text-4xl">
              Quản trị nhân sự
              <br />
              chuẩn doanh nghiệp,
              <br />
              <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">
                tăng tốc bằng AI.
              </span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-slate-300">
              Một nền tảng duy nhất cho nhân sự, chấm công, nghỉ phép, lương và
              tuyển dụng — dữ liệu tập trung, phân quyền chặt chẽ theo vai trò.
            </p>

            {/* Khoảnh khắc lớn duy nhất của trang: đường nhịp vẽ một lần khi tải (800ms, PulseBar tự tôn trọng reduced-motion) */}
            <div className="mt-9" aria-hidden="true">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Nhịp ngày làm việc
              </p>
              <PulseBar value={72} milestones={LOGIN_PULSE_MILESTONES} />
            </div>

            <motion.ul
              className="mt-10 space-y-6"
              variants={highlightContainer}
              initial={reduce ? false : 'hidden'}
              animate="show"
            >
              {HIGHLIGHTS.map((item) => (
                <motion.li
                  key={item.title}
                  className="flex gap-4"
                  variants={highlightItem}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[.07] text-accent-300 ring-1 ring-inset ring-white/15">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6">
                      {item.icon}
                    </svg>
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-white">{item.title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-300/90">{item.text}</span>
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          <p className="animate-fade-in text-[13px] text-slate-400" style={{ animationDelay: '520ms' }}>
            © 2026 Web HRM AI — Hệ thống quản lý nhân sự nội bộ. Truy cập dành cho nhân viên được cấp quyền.
          </p>
        </div>
      </aside>

      {/* ===== Cột form đăng nhập ===== */}
      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 animate-pulse-soft rounded-full bg-brand-200/40 blur-3xl lg:hidden"
          style={{ animationDuration: '8s' }}
        />
        <motion.div
          className="relative w-full max-w-[430px] rounded-2xl border border-slate-200/90 bg-white p-7 shadow-pop sm:p-9"
          initial={reduce ? false : { opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 }
          }
        >
          <div className="mb-7 text-center">
            <div className="mb-4 flex justify-center">
              <LogoMark className="h-12 w-12 rounded-2xl" />
            </div>
            <h1 className="font-display text-[24px] font-extrabold tracking-tight text-slate-900">
              Web HRM tích hợp AI
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              Đăng nhập để quản lý nhân sự, chấm công, nghỉ phép và tuyển dụng.
            </p>
          </div>

          {formError && (
            <Alert tone="error" className="mb-5">
              {formError}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="login-email" className="ui-label">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                className={`ui-input ${fieldErrors.email ? inputErrorClass : ''}`}
                placeholder="ten@congty.vn"
                autoComplete="email"
                value={values.email}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.email && (
                <div id="login-email-error" className="mt-1.5 text-[13px] font-medium text-rose-600" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="login-password" className="ui-label">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`ui-input pr-14 ${fieldErrors.password ? inputErrorClass : ''}`}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  value={values.password}
                  onChange={handleChange}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-brand-600 transition hover:bg-brand-50 hover:text-brand-700"
                  tabIndex={-1}
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
              {fieldErrors.password && (
                <div id="login-password-error" className="mt-1.5 text-[13px] font-medium text-rose-600" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] leading-relaxed text-slate-500">
            Quên mật khẩu hoặc chưa có tài khoản? Vui lòng liên hệ phòng nhân sự (HR)
            để được cấp lại.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
