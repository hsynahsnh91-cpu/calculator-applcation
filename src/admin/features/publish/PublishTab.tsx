import { AlertTriangle, CloudUpload, Download, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import type { KnowledgeItem, KnowledgeSnapshot, RegressionOutcome, VersionSummary } from "../../types";

export function PublishTab({
  items,
  versions,
  published,
  publishing,
  regressionBusy,
  publishMessage,
  publishFailures,
  backupInput,
  onPublish,
  onRollback,
  onExport,
  onImport,
  onRequestImport,
}: {
  items: KnowledgeItem[];
  versions: VersionSummary[];
  published: KnowledgeSnapshot | null;
  publishing: boolean;
  regressionBusy: boolean;
  publishMessage: string;
  publishFailures: RegressionOutcome[];
  backupInput: RefObject<HTMLInputElement | null>;
  onPublish: () => void;
  onRollback: (version: number) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onRequestImport: () => void;
}) {
  const publishableCount = items.filter((item) => ["approved", "published"].includes(item.status)).length;
  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">نشر ذري دون ملفات عامة</p>
          <h1>نشر التعليم وإدارة النسخ</h1>
          <p>يفحص النشر المخطط والحجم، ثم يختبر الأمثلة السابقة محليًا على المحرك قبل تبديل مؤشر النسخة في Redis.</p>
        </div>
      </div>
      <div className="admin-publish-card">
        <div><strong>{publishableCount}</strong><span>عنصر جاهز للنشر</span></div>
        <button className="admin-primary-button" type="button" disabled={publishing || regressionBusy} onClick={onPublish}>
          {publishing ? <LoaderCircle className="animate-spin" size={17} /> : <CloudUpload size={17} />} نشر التعليم
        </button>
      </div>
      {publishMessage && <p className="admin-success-text">{publishMessage}</p>}
      {publishFailures.length > 0 && (
        <div className="admin-blocking-card">
          <AlertTriangle size={20} />
          <div><strong>أوقف اختبار الانحدار النشر</strong><p>أصلح كل عنصر أدناه ثم أعد تشغيل النشر؛ لا يوجد تجاوز لهذا الحاجز.</p><ul>{publishFailures.map((failure) => <li key={failure.itemId}>{failure.message}</li>)}</ul></div>
        </div>
      )}
      <div className="admin-two-columns">
        <article className="admin-panel-card">
          <h2>النسخ المنشورة</h2>
          <ul className="admin-version-list">
            {versions.map((version) => (
              <li key={version.version}>
                <div><b>النسخة {version.version}</b><span>{new Date(version.publishedAt).toLocaleString("ar-SY")} · {version.itemCount} عنصر</span></div>
                <button type="button" className="admin-secondary-button" disabled={published?.version === version.version} onClick={() => onRollback(version.version)}><RotateCcw size={14} /> تراجع</button>
              </li>
            ))}
            {!versions.length && <li className="admin-empty-state">لا توجد نسخة منشورة بعد.</li>}
          </ul>
        </article>
        <article className="admin-panel-card">
          <h2>نسخة احتياطية ثانوية</h2>
          <p>التصدير والاستيراد اختياريان لمسودات هذا الجهاز فقط، وليس جزءًا من النشر ولا يتطلب إعادة نشر الموقع.</p>
          <div className="admin-inline-actions">
            <button type="button" className="admin-secondary-button" onClick={onExport}><Download size={15} /> تصدير احتياطي</button>
            <button type="button" className="admin-secondary-button" onClick={onRequestImport}><Upload size={15} /> استيراد احتياطي</button>
          </div>
          <input ref={backupInput} type="file" className="hidden" accept="application/json,.json" onChange={onImport} />
        </article>
      </div>
    </section>
  );
}
