import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../../../app/AuthContext.jsx';
import { login } from '../services';
import { Alert, Button, Input } from '../../../components/ui';

// ============================================================
// Trang đăng nhập — route /login (v4: auth kiểu shadcn-admin/TailAdmin)
// - Nền gray-50, form căn giữa max-w 400px: logo, tiêu đề, mô tả,
//   thẻ trắng border gray-200 chứa form email / mật khẩu,
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

function LogoMark({ className = 'h-9 w-9 rounded-lg' }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-brand-600 text-white ${className}`}
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 font-sans text-gray-800 antialiased">
      <motion.div
        className="w-full max-w-[400px]"
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
      >
        {/* Logo + tiêu đề */}
        <div className="mb-6 text-center">
          <div className="mb-5 flex items-center justify-center gap-2.5">
            <LogoMark />
            <span className="text-[15px] font-semibold text-gray-900">Web HRM AI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-gray-900">
            Web HRM tích hợp AI
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Đăng nhập để quản lý nhân sự, chấm công, nghỉ phép và tuyển dụng.
          </p>
        </div>

        {/* Thẻ form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card sm:p-7">
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
              <Input
                id="login-email"
                name="email"
                type="email"
                className={fieldErrors.email ? inputErrorClass : ''}
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
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`pr-14 ${fieldErrors.password ? inputErrorClass : ''}`}
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
        </div>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-gray-500">
          Quên mật khẩu hoặc chưa có tài khoản? Vui lòng liên hệ phòng nhân sự (HR)
          để được cấp lại.
        </p>
        <p className="mt-2 text-center text-[13px] text-gray-400">
          © 2026 Web HRM AI — Hệ thống quản lý nhân sự nội bộ. Truy cập dành cho nhân viên được cấp quyền.
        </p>
      </motion.div>
    </div>
  );
}
