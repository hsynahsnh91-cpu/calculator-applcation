import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { adminLogin } from "../lib/api";

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("auth_error") ?? "";
  });
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminLogin(password);
      setPassword("");
      onAuthenticated();
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذّر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="admin-login-page" dir="rtl">
      <section className="admin-login-card">
        <div className="admin-brand-mark" aria-hidden="true">
          ∑
        </div>
        <p className="admin-eyebrow">لوحة تعليم المحرك</p>
        <h1>إدارة المعرفة الرياضية السورية</h1>
        <p>
          ادخل بحساب Google المصرّح به على الخادم، أو بكلمة مرور الإدارة إن
          كانت مضبوطة. لا تُخزن الأسرار في المتصفح.
        </p>
        <a className="admin-primary-button admin-login-button" href="/api/admin-google">
          دخول بحساب Google
        </a>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            كلمة مرور الإدارة
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="admin-error-text" role="alert">{error}</p>}
          <button className="admin-secondary-button admin-login-button" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="animate-spin" size={17} /> : <LockKeyhole size={17} />}
            دخول بكلمة المرور
          </button>
        </form>
        <a href="/" className="admin-back-link">العودة إلى الحاسبة</a>
      </section>
    </main>
  );
}
