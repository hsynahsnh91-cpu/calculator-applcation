import { LoaderCircle, Play, Trash2, X } from "lucide-react";
import type { FailureRecord, RegressionOutcome } from "../../types";

export function MonitorTab({
  failures,
  regression,
  regressionBusy,
  onStartRegression,
  onCancelRegression,
  onTeachFailure,
  onRemoveFailure,
}: {
  failures: FailureRecord[];
  regression: RegressionOutcome[];
  regressionBusy: boolean;
  onStartRegression: () => void;
  onCancelRegression: () => void;
  onTeachFailure: (failure: FailureRecord) => void;
  onRemoveFailure: (fingerprint: string) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div><p className="admin-eyebrow">تشخيص حقيقي لا تخمين</p><h1>سجل الإخفاقات والاختبار الشامل</h1><p>تُسجّل الإخفاقات العامة بشكل مجمّع في Redis، ثم يمكنك تحويل أي سؤال إلى مسودة تعليمية.</p></div>
        <div className="admin-inline-actions">
          {regressionBusy ? <button className="admin-wrong-button" type="button" onClick={onCancelRegression}><X size={15} /> إلغاء الاختبار</button> : <button className="admin-primary-button" type="button" onClick={onStartRegression}><Play size={16} /> اختبار شامل</button>}
        </div>
      </div>
      <div className="admin-two-columns">
        <article className="admin-panel-card">
          <h2>الأسئلة التي فشل فيها المحرك</h2>
          <ul className="admin-failure-list">
            {failures.map((failure) => <li key={failure.fingerprint}><div><b>{failure.sampleQuestion}</b><span>تكرّر {failure.count} مرة · {failure.reason}</span></div><div className="admin-inline-actions"><button type="button" className="admin-secondary-button" onClick={() => onTeachFailure(failure)}>علّمه الآن</button><button type="button" className="admin-icon-button" title="حذف من السجل" onClick={() => onRemoveFailure(failure.fingerprint)}><Trash2 size={15} /></button></div></li>)}
            {!failures.length && <li className="admin-empty-state">لا توجد إخفاقات مسجلة بعد.</li>}
          </ul>
        </article>
        <article className="admin-panel-card">
          <h2>نتيجة الاختبار الشامل</h2>
          {regressionBusy && <p className="admin-muted"><LoaderCircle className="animate-spin inline" size={14} /> تشغيل الأمثلة بالتوازي…</p>}
          <ul className="admin-regression-list">
            {regression.map((outcome) => <li key={outcome.itemId} className={outcome.passed ? "is-passed" : "is-failed"}><span>{outcome.passed ? "نجح" : "فشل"}</span><p>{outcome.message}</p><b>{outcome.elapsedMs}ms</b></li>)}
            {!regression.length && !regressionBusy && <li className="admin-empty-state">اضغط «اختبار شامل» لتشغيل كل مثال معتمد فعليًا.</li>}
          </ul>
        </article>
      </div>
    </section>
  );
}
