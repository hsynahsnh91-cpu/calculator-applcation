import { useState, type FormEvent } from "react";
import { BrainCircuit, LoaderCircle, Save } from "lucide-react";

export interface ManualTrainingInput {
  question: string;
  method: string;
  answerText: string;
  answerLatex: string;
  steps: string;
  grade: string;
  unit: string;
  lesson: string;
  /** Explicit manager confirmation only; defaults to a reviewable draft. */
  approveExample: boolean;
}

interface ManualTrainingPanelProps {
  onSave: (input: ManualTrainingInput) => Promise<void>;
}

const initialDraft: ManualTrainingInput = {
  question: "",
  method: "",
  answerText: "",
  answerLatex: "",
  steps: "",
  grade: "غير محدد",
  unit: "تدريب يدوي",
  lesson: "طريقة حل يحددها المشرف",
  approveExample: false,
};

/**
 * Captures an administrator's worked exercise as knowledge, rather than
 * claiming to retrain a model. The parent stores a related rule and example
 * through the existing draft/review/publish workflow.
 */
export function ManualTrainingPanel({ onSave }: ManualTrainingPanelProps) {
  const [draft, setDraft] = useState<ManualTrainingInput>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof ManualTrainingInput>(key: K, value: ManualTrainingInput[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!draft.question.trim() || !draft.method.trim()) {
      setError("اكتب التمرين والطريقة أو القاعدة التي تريد تطبيقها على مسائل شبيهة.");
      return;
    }
    if (!draft.answerText.trim() && !draft.answerLatex.trim()) {
      setError("اكتب الجواب النهائي المتوقع بالنص أو بصيغة LaTeX؛ الخطوات وحدها لا تكفي للتحقق الدقيق.");
      return;
    }
    const stepLines = draft.steps.split("\n").map((line) => line.trim()).filter(Boolean);
    if (stepLines.length > 80 || stepLines.some((line) => line.length > 4_000)) {
      setError("أدخل حتى 80 خطوة، وبحد أقصى 4000 محرف لكل خطوة.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...draft,
        question: draft.question.trim(),
        method: draft.method.trim(),
        answerText: draft.answerText.trim(),
        answerLatex: draft.answerLatex.trim(),
        steps: draft.steps.trim(),
        grade: draft.grade.trim() || "غير محدد",
        unit: draft.unit.trim() || "تدريب يدوي",
        lesson: draft.lesson.trim() || "طريقة حل يحددها المشرف",
      });
      setDraft(initialDraft);
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ التدريب اليدوي.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section admin-training-section" aria-labelledby="manual-training-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">معرفة يحددها المشرف</p>
          <h2 id="manual-training-heading"><BrainCircuit size={20} /> تدريب يدوي بالتمارين</h2>
          <p>
            يحفظ النظام قاعدة مرتبطة ومثالًا محلولًا في المكتبة المحلية. لا يعيد تدريب نموذج
            ذكاء اصطناعي؛ بعد المراجعة والنشر تظهر القاعدة ذات الصلة كمرجع مع جواب المحرك
            في المسائل الشبيهة، ويُعاد الجواب المحفوظ فقط عند مطابقة قوية.
          </p>
        </div>
      </div>
      <form className="admin-training-form" onSubmit={(event) => void submit(event)}>
        <label>
          التمرين أو السؤال النموذجي
          <textarea
            rows={4}
            required
            maxLength={12_000}
            value={draft.question}
            placeholder="مثال: أوجد نهاية (س² - 1) / (س - 1) عندما س تؤول إلى 1."
            onChange={(event) => update("question", event.target.value)}
          />
        </label>
        <label>
          الطريقة أو القاعدة التي تريد تعميمها على المسائل الشبيهة
          <textarea
            rows={4}
            required
            maxLength={12_000}
            value={draft.method}
            placeholder="نفكك البسط إلى (س - 1)(س + 1)، نختزل العامل المشترك عند س ≠ 1، ثم نعوّض."
            onChange={(event) => update("method", event.target.value)}
          />
        </label>
        <div className="admin-form-grid">
          <label>
            الصف
            <input maxLength={120} value={draft.grade} onChange={(event) => update("grade", event.target.value)} />
          </label>
          <label>
            الوحدة
            <input maxLength={180} value={draft.unit} onChange={(event) => update("unit", event.target.value)} />
          </label>
          <label>
            الدرس
            <input maxLength={240} value={draft.lesson} onChange={(event) => update("lesson", event.target.value)} />
          </label>
        </div>
        <div className="admin-form-grid admin-training-answer-grid">
          <label>
            الجواب المتوقع بالنص
            <textarea
              rows={3}
              maxLength={12_000}
              value={draft.answerText}
              placeholder="2"
              onChange={(event) => update("answerText", event.target.value)}
            />
          </label>
          <label>
            الجواب المتوقع بـ LaTeX (اختياري)
            <textarea
              rows={3}
              maxLength={12_000}
              dir="ltr"
              value={draft.answerLatex}
              placeholder="2"
              onChange={(event) => update("answerLatex", event.target.value)}
            />
          </label>
          <label>
            خطوات الحل، خطوة في كل سطر
            <textarea
              rows={3}
              maxLength={30_000}
              value={draft.steps}
              placeholder="نفكك البسط.&#10;نختزل العامل المشترك.&#10;نعوّض بالقيمة."
              onChange={(event) => update("steps", event.target.value)}
            />
          </label>
        </div>
        <label className="admin-toggle admin-training-approval">
          <input
            type="checkbox"
            checked={draft.approveExample}
            onChange={(event) => update("approveExample", event.target.checked)}
          />
          <span>
            اعتمد المثال بعد مراجعتي الآن — سيظل النشر محجوبًا حتى يجتاز المحرك اختبار
            الانحدار الفعلي.
          </span>
        </label>
        {!draft.approveExample && (
          <p className="admin-muted">
            سيُحفظ المثال كمسودة للمراجعة، بينما تُحفظ القاعدة كمعتمدة محليًا وجاهزة لمسار
            النشر الآمن.
          </p>
        )}
        {error && <p className="admin-error-text">{error}</p>}
        <button type="submit" className="admin-primary-button" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
          {busy ? "جارٍ حفظ المعرفة…" : "حفظ قاعدة ومثال التدريب"}
        </button>
      </form>
    </section>
  );
}
