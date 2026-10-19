import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import {
  checkPracticeAnswer,
  createVerifiedPracticeVariant,
  isPublishedPracticeItem,
} from "../../core/knowledge/practice";
import {
  currentKnowledge,
  currentKnowledgeSettings,
} from "../../core/knowledge/client";
import { RichText } from "../../ui/Tex";
import type { AngleMode } from "../../types";

export interface ConversationPracticeSource {
  id: string;
  label: string;
  text: string;
}

export function PracticeBoard({
  angleMode,
  conversationSources,
  onInsert,
  onSolve,
}: {
  angleMode: AngleMode;
  conversationSources: ConversationPracticeSource[];
  onInsert: (question: string) => void;
  onSolve: (question: string) => void;
}) {
  const published = useMemo(() => {
    const items = currentKnowledge()?.items ?? [];
    return items.filter(isPublishedPracticeItem);
  }, []);
  const sources = useMemo(() => {
    const fromKnowledge = published.map((item) => ({
      id: `k:${item.id}`,
      label: `${item.lesson} — ص${item.page}`,
      text: item.structured || item.originalText,
    }));
    return [...fromKnowledge, ...conversationSources];
  }, [published, conversationSources]);
  const settings = currentKnowledgeSettings();
  const [selectedId, setSelectedId] = useState("");
  const [question, setQuestion] = useState("");
  const [expectedLatex, setExpectedLatex] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const options = {
    angleMode,
    disabledEngines: settings.disabledEngines,
    timeoutMs: settings.timeoutMs,
  };

  const generate = async () => {
    const source = sources.find((item) => item.id === (selectedId || sources[0]?.id));
    if (!source) return;
    setBusy(true);
    setMessage("");
    setAnswer("");
    const result = await createVerifiedPracticeVariant(source.text, options);
    setBusy(false);
    if (!result.ok) {
      setQuestion("");
      setExpectedLatex("");
      setMessage(result.error);
      return;
    }
    setQuestion(result.question);
    setExpectedLatex(result.expectedLatex);
    setMessage("غُيّر معامل واحد فقط، ثم حُسب الجواب بالمحرّك المحلي قبل العرض.");
  };

  const check = async () => {
    if (!expectedLatex) return;
    setBusy(true);
    const result = await checkPracticeAnswer(answer, expectedLatex, options);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(
      result.matched
        ? "إجابتك مطابقة للجواب الذي أعاد المحرك حسابه. أحسنت!"
        : "الإجابة لا تطابق الجواب المتحقق. راجع الخطوات أو اطلب الحل في المحادثة.",
    );
  };

  return (
    <div className="practice-board" dir="rtl">
      <p className="practice-lead">
        <Sparkles size={16} />
        تمرين مشابه من منهاج منشور أو من مسألة تحققت في محادثتك. الحساب محلي؛ لا
        يُرسل شيء إلى ذكاء اصطناعي.
      </p>
      {!sources.length ? (
        <p className="practice-empty" role="status">
          لا توجد تمارين منشورة بعد، ولا جواب متحقق في هذه المحادثة. حل مسألة في
          الحوار أولًا، أو انتظر نشر المدير لأمثلة المنهاج.
        </p>
      ) : (
        <div className="practice-controls">
          <label>
            المثال المرجعي
            <select
              value={selectedId || sources[0]?.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void generate()}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            إنشاء تمرين مشابه
          </button>
        </div>
      )}
      {question && (
        <article className="practice-card">
          <h3>حل التمرين</h3>
          <div className="practice-question">
            <RichText text={question} autoMath />
          </div>
          <label>
            إجابتك النهائية
            <input
              value={answer}
              dir="ltr"
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="اكتب القيمة أو الصيغة النهائية"
              aria-label="إجابتك النهائية"
            />
          </label>
          <div className="practice-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy || !answer.trim()}
              onClick={() => void check()}
            >
              <CheckCircle2 size={16} /> تحقق من إجابتي
            </button>
            <button type="button" className="suggestion-button" onClick={() => onInsert(question)}>
              إدراج في السؤال
            </button>
            <button type="button" className="suggestion-button" onClick={() => onSolve(question)}>
              حلّه في المحادثة
            </button>
          </div>
        </article>
      )}
      {message && (
        <p className="practice-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
