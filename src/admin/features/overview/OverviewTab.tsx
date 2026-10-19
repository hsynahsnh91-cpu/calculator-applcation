import { AlertTriangle, BarChart3, BookOpen, FilePenLine, RotateCcw } from "lucide-react";
import type { AdminHealth, AdminStatistics } from "../../lib/api";
import type { CurriculumGap } from "../../lib/curriculum";
import type { FailureRecord, KnowledgeItem, KnowledgeSnapshot } from "../../types";

export function OverviewTab({
  items,
  published,
  stats,
  failures,
  health,
  gaps,
  onRefresh,
}: {
  items: KnowledgeItem[];
  published: KnowledgeSnapshot | null;
  stats: AdminStatistics | null;
  failures: FailureRecord[];
  health: AdminHealth | null;
  gaps: CurriculumGap[];
  onRefresh: () => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">النسخة الحالية {published ? `#${published.version}` : "غير منشورة"}</p>
          <h1>مرحبًا في لوحة التعليم الذكي</h1>
          <p>استخدم المسح ثم راجع النتائج واعتمدها قبل النشر. لا يُعرض للطلاب إلا ما نُشر بنجاح.</p>
        </div>
      </div>
      <div className="admin-stat-grid">
        <article><BookOpen size={21} /><strong>{Math.max(stats?.approvedItems ?? 0, items.filter((item) => item.status !== "draft").length)}</strong><span>عنصر منشور/معتمد</span></article>
        <article><FilePenLine size={21} /><strong>{Math.max(stats?.corrections ?? 0, items.filter((item) => item.type === "correction" && item.status !== "draft").length)}</strong><span>تصحيح معتمد</span></article>
        <article><BarChart3 size={21} /><strong>{stats?.solveRate === null || stats?.solveRate === undefined ? "—" : `${Math.round(stats.solveRate * 100)}٪`}</strong><span>نسبة الأسئلة المحلولة</span></article>
        <article><AlertTriangle size={21} /><strong>{failures.length}</strong><span>أسئلة فاشلة مسجلة</span></article>
      </div>
      <div className="admin-health-card" aria-label="حالة الخدمات الإدارية">
        <div><b>ADMIN_PASSWORD</b><span className={health?.admin.passwordConfigured ? "is-ok" : "is-bad"}>{health?.admin.passwordConfigured ? "مضبوط" : "غير متاح"}</span></div>
        <div><b>ADMIN_SECRET</b><span className={health?.admin.secretConfigured ? "is-ok" : "is-bad"}>{health?.admin.secretConfigured ? "مضبوط وآمن" : "غير متاح"}</span></div>
        <div><b>Google</b><span className={health?.admin.googleAuthConfigured ? "is-ok" : "is-bad"}>{health?.admin.googleAuthConfigured ? "دخول البريد مسموح" : "غير مضبوط"}</span></div>
        <div><b>Gemini</b><span className={health?.admin.geminiConfigured ? "is-ok" : "is-bad"}>{health?.admin.geminiConfigured ? "مضبوط على الخادم" : "وضع محلي"}</span></div>
        <div><b>Firestore</b><span className={health?.admin.firestoreConfigured ? "is-ok" : "is-bad"}>{health?.admin.firestoreConfigured ? "مضبوط" : "غير مضبوط"}</span></div>
        <div><b>Redis</b><span className={health?.redis.reachable ? "is-ok" : "is-bad"}>{health?.redis.reachable ? "متصل" : health?.redis.configured ? "غير قابل للوصول" : "غير مضبوط"}</span></div>
        <button type="button" className="admin-secondary-button" onClick={onRefresh}><RotateCcw size={14} /> فحص الحالة</button>
      </div>
      <div className="admin-two-columns">
        <article className="admin-panel-card">
          <h2>أكثر الأقسام احتياجًا للتعليم</h2>
          {stats?.mostFailingSections.length ? (
            <ol className="admin-ranked-list">
              {stats.mostFailingSections.map((entry) => <li key={entry.section}><span>{entry.section}</span><b>{entry.count}</b></li>)}
            </ol>
          ) : <p className="admin-empty-state">لا توجد بيانات حل كافية بعد؛ لا تُعرض نسبة أو قسم مخمّن.</p>}
        </article>
        <article className="admin-panel-card">
          <h2>اقتراحات تغطية المنهاج</h2>
          {gaps.length ? (
            <ul className="admin-gap-list">
              {gaps.slice(0, 12).map((gap) => <li key={`${gap.grade}-${gap.topic}`}><span>{gap.grade}</span>{gap.topic}</li>)}
            </ul>
          ) : <p className="admin-empty-state">أضف عناصر ذات صف ووحدة لتظهر فجوات تغطية ذات معنى.</p>}
        </article>
      </div>
    </section>
  );
}
