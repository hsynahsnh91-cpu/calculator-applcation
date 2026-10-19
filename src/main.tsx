import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app/App";

// The administrative console includes OCR, review, and authoring code. Keep it
// out of the public calculator's initial route and CDN payload.
const AdminApp = lazy(() => import("./admin/app/AdminApp"));
const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const isAdminRoute = pathname.toLowerCase() === "/admin";

function LoadingScreen() {
  return (
    <main className="app-route-loading" dir="rtl" aria-busy="true">
      <span>جارٍ فتح لوحة الإدارة…</span>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={<LoadingScreen />}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);

if (!isAdminRoute) {
  const warm = () => {
    void import("./core/solver/client").then((module) => {
      module.warmupSolver();
    });
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm, { timeout: 2500 });
  } else {
    window.setTimeout(warm, 1);
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation must never stop the calculator when storage is disabled.
    });
  });
}
