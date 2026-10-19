import { RotateCcw, Save } from "lucide-react";
import type { EngineId } from "../../core/solver/types";
import type { SolverSettings } from "../types";

export function SettingsTab({
  settings,
  prompt,
  engineLabels,
  onSaveSettings,
  onPromptChange,
  onRestorePrompt,
  onSavePrompt,
}: {
  settings: SolverSettings;
  prompt: string;
  engineLabels: Record<EngineId, string>;
  onSaveSettings: (settings: SolverSettings) => void;
  onPromptChange: (prompt: string) => void;
  onRestorePrompt: () => void;
  onSavePrompt: () => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">إعدادات لا تغيّر المحركات نفسها</p><h1>الضبط والبرومبت</h1><p>إيقاف أي قسم يمنع تشغيله بوضوح ولا يولد جوابًا بديلًا. انشر نسخة لتعميم الإعدادات على الزوار.</p></div></div>
      <article className="admin-panel-card admin-settings-card">
        <h2>أقسام المحرك</h2>
        <div className="admin-engine-grid">
          {(Object.entries(engineLabels) as [EngineId, string][]).map(([engine, label]) => (
            <label key={engine} className="admin-engine-toggle"><input type="checkbox" checked={!settings.disabledEngines.includes(engine)} onChange={(event) => {
              const disabledEngines = event.target.checked ? settings.disabledEngines.filter((value) => value !== engine) : [...settings.disabledEngines, engine];
              onSaveSettings({ ...settings, disabledEngines });
            }} /><span>{label}</span><i>{settings.disabledEngines.includes(engine) ? "معطّل" : "مفعّل"}</i></label>
          ))}
        </div>
        <div className="admin-number-settings">
          <label>حد الثقة للمطابقة التقريبية<input type="number" min="0.85" max="0.999" step="0.001" value={settings.matchThreshold} onChange={(event) => onSaveSettings({ ...settings, matchThreshold: Number(event.target.value) })} /></label>
          <label>مهلة الحل (مللي ثانية)<input type="number" min="2000" max="60000" step="1000" value={settings.timeoutMs} onChange={(event) => onSaveSettings({ ...settings, timeoutMs: Number(event.target.value) })} /></label>
        </div>
      </article>
      <article className="admin-panel-card admin-prompt-card">
        <div className="admin-prompt-heading"><div><h2>برومبت التحليل الذكي</h2><p>يبقى المفتاح في الخادم؛ هذه الصياغة فقط هي القابلة للتحرير.</p></div><div className="admin-inline-actions"><button type="button" className="admin-secondary-button" onClick={onRestorePrompt}><RotateCcw size={15} /> استعادة الافتراضي</button><button type="button" className="admin-primary-button" onClick={onSavePrompt}><Save size={15} /> حفظ البرومبت</button></div></div>
        <textarea value={prompt} rows={18} dir="rtl" onChange={(event) => onPromptChange(event.target.value)} />
      </article>
    </section>
  );
}
