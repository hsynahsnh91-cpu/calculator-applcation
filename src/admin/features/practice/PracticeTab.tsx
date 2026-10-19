import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { solveLocally } from "../../../core/solver/client";
import { approvedSolutionFromAnswer, approvedSolutionsMatch } from "../../../core/knowledge/regression";
import type { KnowledgeItem, SolverSettings } from "../../types";

interface PracticeVariant {
  source: KnowledgeItem;
  question: string;
  expectedLatex: string;
  explanation: string;
}

function replaceOneCoefficient(source: string): string | undefined {
  const matches = [...source.matchAll(/(?<![\p{L}\p{N}])(-?\d{1,4})(?![\p{L}\p{N}])/gu)];
  if (!matches.length) return undefined;
  const match = matches.find((candidate) => Number(candidate[1]) !== 0) ?? matches[0];
  const value = Number(match[1]);
  const next = value >= 0 ? value + 1 : value - 1;
  return `${source.slice(0, match.index)}${next}${source.slice(match.index! + match[0].length)}`;
}

/** A conservative variant generator: it changes one visible coefficient and
 * obtains the answer from the actual unified solver before showing the task. */
export function PracticeTab({
  items,
  settings,
}: {
  items: KnowledgeItem[];
  settings: SolverSettings;
}) {
  const sources = useMemo(
    () =>
      items.filter(
        (item) =>
          ["approved", "published"].includes(item.status) &&
          ["example", "exercise"].includes(item.type),
      ),
    [items],
  );
  const [selectedId, setSelectedId] = useState("");
  const [variant, setVariant] = useState<PracticeVariant | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    const source = sources.find((item) => item.id === (selectedId || sources[0]?.id));
    if (!source) return;
    const question = replaceOneCoefficient(source.structured || source.originalText);
    if (!question) {
      setMessage("لا يحتوي هذا المثال على معامل عددي آمن لتغييره تلقائيًا. اختر مثالًا آخر.");
      return;
    }
    setBusy(true);
    setMessage("");
    setAnswer("");
    try {
      const result = await solveLocally(
        question,
        {
          angleMode: "DEG",
          disabledEngines: settings.disabledEngines,
          timeoutMs: settings.timeoutMs,
        },
        () => undefined,
      );
      const expected = approvedSolutionFromAnswer(result);
      if (!expected?.verification?.passed || !expected.answerLatex)
        throw new Error("لم يتحقق المحرك من جواب التمرين المتغير، لذلك لم يُعرض للطالب.");
      setVariant({
        source,
        question,
        expectedLatex: expected.answerLatex,
        explanation: "غُيّر معامل واحد فقط، ثم حُسب الجواب بمحرك مستقل قبل عرض التمرين.",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء تمرين متحقق.");
    } finally {
      setBusy(false);
    }
  };

  const checkAnswer = async () => {
    if (!variant || !answer.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const studentRun = await solveLocally(
        answer,
        {
          angleMode: "DEG",
          disabledEngines: settings.disabledEngines,
          timeoutMs: settings.timeoutMs,
        },
        () => undefined,
      );
      const actual = approvedSolutionFromAnswer(studentRun);
      const expected = {
        answerLatex: variant.expectedLatex,
        steps: [],
      };
      const matched = Boolean(
        actual?.verification?.passed && approvedSolutionsMatch(actual, expected),
      );
      setMessage(
        matched
          ? "إجابتك مطابقة للجواب الذي أعاد المحرك حسابه. أحسنت!"
          : "الإجابة لا تطابق الجواب المتحقق. راجع الخطوات ثم حاول مرة أخرى.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر التحقق من إجابتك.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="practice-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">تدريب متحقق من المحرك</p>
          <h1 id="practice-heading"><Sparkles size={21} /> وضع تدرّب</h1>
          <p>يغيّر معاملًا ظاهرًا في مثال معتمد، ثم يعيد المحرك حساب الجواب قبل عرضه. لا يُعرض تمرين إذا لم يثبت جوابه.</p>
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
          <small>{variant.explanation}</small>
        </article>
      )}
      {message && <p className="admin-practice-message" role="status">{message}</p>}
    </section>
  );
}
