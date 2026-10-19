import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import {
  checkPracticeAnswer,
  createVerifiedPracticeVariant,
  isApprovedPracticeItem,
} from "../../../core/knowledge/practice";
import type { KnowledgeItem, SolverSettings } from "../../types";

interface PracticeVariant {
  source: KnowledgeItem;
  question: string;
  expectedLatex: string;
}

/** Manager preview of the same verified-variant path the student app uses. */
export function PracticeTab({
  items,
  settings,
}: {
  items: KnowledgeItem[];
  settings: SolverSettings;
}) {
  const sources = useMemo(() => items.filter(isApprovedPracticeItem), [items]);
  const [selectedId, setSelectedId] = useState("");
  const [variant, setVariant] = useState<PracticeVariant | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const options = {
    angleMode: "DEG" as const,
    disabledEngines: settings.disabledEngines,
    timeoutMs: settings.timeoutMs,
  };

  const generate = async () => {
    const source = sources.find((item) => item.id === (selectedId || sources[0]?.id));
    if (!source) return;
    setBusy(true);
    setMessage("");
    setAnswer("");
    const result = await createVerifiedPracticeVariant(
      source.structured || source.originalText,
      options,
    );
    setBusy(false);
    if (!result.ok) {
      setVariant(null);
      setMessage(result.error);
      return;
    }
    setVariant({ source, question: result.question, expectedLatex: result.expectedLatex });
    setMessage("غُيّر معامل واحد فقط، ثم حُسب الجواب بمحرك مستقل قبل عرض التمرين.");
  };

  const checkAnswer = async () => {
    if (!variant) return;
    setBusy(true);
    const result = await checkPracticeAnswer(answer, variant.expectedLatex, options);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(
      result.matched
        ? "إجابتك مطابقة للجواب الذي أعاد المحرك حسابه. أحسنت!"
        : "الإجابة لا تطابق الجواب المتحقق. راجع الخطوات ثم حاول مرة أخرى.",
    );
  };

  return (
    <section className="admin-section" aria-labelledby="practice-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">تدريب متحقق من المحرك</p>
          <h1 id="practice-heading"><Sparkles size={21} /> وضع تدرّب</h1>
          <p>يغيّر معاملًا ظاهرًا في مثال معتمد، ثم يعيد المحرك حساب الجواب قبل عرضه. لا يُعرض تمرين إذا لم يثبت جوابه. نفس المسار يُستخدم في تدرّب الطالب.</p>
        </div>
      </div>
      {!sources.length ? (
        <p className="admin-empty-state">اعتمد مثالًا أو تمرينًا أولًا، ثم أنشئ منه تمرينًا مشابهًا هنا.</p>
      ) : (
        <div className="admin-practice-grid">
          <label>
            المثال المرجعي
            <select value={selectedId || sources[0]?.id} onChange={(event) => setSelectedId(event.target.value)}>
              {sources.map((item) => <option key={item.id} value={item.id}>{item.lesson} — ص{item.page}</option>)}
            </select>
          </label>
          <button type="button" className="admin-primary-button" disabled={busy} onClick={() => void generate()}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />} إنشاء تمرين مشابه
          </button>
        </div>
      )}
      {variant && (
        <article className="admin-practice-card">
          <p className="admin-source-reference"><b>المرجع:</b> الكتاب/المصدر {variant.source.source} · الجزء/الملف {variant.source.fileName} · الصفحة {variant.source.page}</p>
          <h2>حل التمرين</h2>
          <p className="admin-item-text">{variant.question}</p>
          <label>
            إجابتك النهائية
            <input value={answer} dir="ltr" onChange={(event) => setAnswer(event.target.value)} placeholder="اكتب القيمة أو الصيغة النهائية" />
          </label>
          <button type="button" className="admin-secondary-button" disabled={busy || !answer.trim()} onClick={() => void checkAnswer()}>
            <CheckCircle2 size={16} /> تحقق من إجابتي
          </button>
        </article>
      )}
      {message && <p className="admin-practice-message" role="status">{message}</p>}
    </section>
  );
}
