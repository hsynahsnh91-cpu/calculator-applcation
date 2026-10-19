import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
} from "react";
import {
  BookmarkPlus,
  Check,
  CheckCheck,
  Copy,
  Info,
  Dices,
  Printer,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Tex, RichText } from "../../ui/Tex";
import { Step } from "../../ui/Step";
import { SectionErrorBoundary } from "../../ui/SectionErrorBoundary";
import {
  ENGINE_LABELS,
  type EngineId,
  type SolverAnswer,
} from "../../core/solver/types";
import { copyToClipboard } from "../../shared/utils/cn";
import { answerAsText } from "../../core/solver/composer";
import type { ProbabilityContext } from "../../core/solver/probabilityTypes";
import type { ResultViewProps } from "./ResultVisuals";
const Scientific = lazy(() => import("../scientific/ScientificCalculator"));
const Equations = lazy(() => import("../equations/EquationSolver"));
const Sequences = lazy(() => import("../sequences/SequenceSolver"));
const Calculus = lazy(() => import("../calculus/CalculusSolver"));
const Integration = lazy(() => import("../integration/IntegrationSolver"));
const Geometry = lazy(() => import("../geometry/GeometrySolver"));
const Matrices = lazy(() => import("../matrices/MatrixSolver"));
const Probability = lazy(() => import("../probability/ProbabilitySolver"));
const Complex = lazy(() => import("../complex/ComplexSolver"));
const views: Record<EngineId, ComponentType<ResultViewProps>> = {
  mathEngine: Scientific,
  equationSolver: Equations,
  sequences: Sequences,
  calculusEngine: Calculus,
  limitsEngine: Calculus,
  integrationEngine: Integration,
  geometryEngine: Geometry,
  geometryTools: Geometry,
  matricesEngine: Matrices,
  probabilityEngine: Probability,
  probabilityTools: Probability,
  complexEngine: Complex,
  complexTools: Complex,
};
function TypedIntro({ text, animate }: { text: string; animate: boolean }) {
  const [length, setLength] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (
      !animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setLength(text.length);
      return;
    }
    setLength(0);
    const timer = setInterval(
      () =>
        setLength((value) => {
          if (value >= text.length) {
            clearInterval(timer);
            return value;
          }
          return value + 3;
        }),
      15,
    );
    return () => clearInterval(timer);
  }, [text, animate]);
  return (
    <p className="answer-intro" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, length)}</span>
    </p>
  );
}
export const AnswerBubble = memo(function AnswerBubble({
  answer,
  onFollowUp,
  onSave,
  onKnowledgeFeedback,
  onProbability,
  saved,
  animate = false,
}: {
  answer: SolverAnswer;
  onFollowUp: (text: string) => void;
  onSave: (answer: SolverAnswer) => void;
  onKnowledgeFeedback?: (
    answer: SolverAnswer,
    isCorrect: boolean,
    reason?: string,
  ) => void;
  onProbability?: (context?: ProbabilityContext) => void;
  saved: boolean;
  animate?: boolean;
}) {
  const [copied, setCopied] = useState(false),
    [phase, setPhase] = useState(animate ? 0 : 2),
    [copyError, setCopyError] = useState(""),
    [reportOpen, setReportOpen] = useState(false),
    [reportReason, setReportReason] = useState(""),
    [reportSent, setReportSent] = useState(false);
  useEffect(() => {
    if (
      !animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setPhase(2);
      return;
    }
    const a = setTimeout(() => setPhase(1), 55),
      b = setTimeout(() => setPhase(2), 110);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [animate]);
  const copy = async () => {
    if (await copyToClipboard(answerAsText(answer))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else
      setCopyError("تعذّر الوصول إلى الحافظة. يمكنك تحديد النص ونسخه يدويًا.");
  };
  const printAnswer = () => {
    const article = document.querySelector(
      `[data-answer-id="${answer.id}"]`,
    );
    article?.classList.add("is-print-target");
    document.body.classList.add("printing-answer");
    const done = () => {
      article?.classList.remove("is-print-target");
      document.body.classList.remove("printing-answer");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <article
      className="assistant-message"
      aria-label="جواب المسألة"
      data-answer-id={answer.id}
    >
      <div className="answer-avatar" aria-hidden="true">
        ✦
      </div>
      <div className="answer-content">
        {answer.knowledge?.source === "approved" && (
          <div className="knowledge-source-badge" title="مطابقة مع تصحيح أو حل منشور اعتمده المدير">
            <CheckCheck size={14} />
            حل معتمد من المنهاج
          </div>
        )}
        {answer.knowledge?.source === "engine" &&
          (answer.knowledge.relatedRules?.length ?? 0) > 0 && (
            <details className="knowledge-rules" open>
              <summary>قواعد مرتبطة من المكتبة المعرفية</summary>
              <p>مرجع تعليمي لمسألة شبيهة؛ الجواب أعلاه حُسب بالمحرك ولا يُعد حلًا محفوظًا إلا عند المطابقة المعتمدة.</p>
              <ul>
                {answer.knowledge.relatedRules?.map((rule) => (
                  <li key={rule.id}>{rule.text}</li>
                ))}
              </ul>
            </details>
          )}
        {answer.results.length > 0 && (
          <div className="final-answer" data-testid="final-answer">
            <div className="final-label">الجواب النهائي</div>
            {answer.results.map((result) => (
              <SectionErrorBoundary
                key={result.id}
                resetKey={result.id}
                label="النتيجة النهائية"
              >
                <section className="final-result">
                  {answer.results.length > 1 && (
                    <p className="text-xs text-slate-400 mb-2">
                      {result.title}
                    </p>
                  )}
                  <Tex
                    display
                    math={result.finalLatex}
                    className="text-[1.13rem] sm:text-xl text-emerald-100"
                  />
                  {result.decimal !== undefined && (
                    <div className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-2">
                      <span>عدديًا</span>
                      <Tex math={String(result.decimal)} />
                    </div>
                  )}
                  <div className="verification-row">
                    {result.verification.passed ? (
                      <span
                        className="verified-badge"
                        title={result.verification.method}
                      >
                        <CheckCheck size={14} />
                        تم التحقق
                      </span>
                    ) : (
                      <span
                        className="unverified-note"
                        title={result.verification.method}
                      >
                        <Info size={12} />
                        دون شارة تحقق عددي
                      </span>
                    )}
                    <span className="engine-credit">
                      {ENGINE_LABELS[result.engine]}
                    </span>
                  </div>
                </section>
              </SectionErrorBoundary>
            ))}
          </div>
        )}
        <TypedIntro text={answer.intro} animate={animate} />
        {phase >= 1 && answer.results.length > 0 && (
          <div className="steps-block reveal-section">
            <h3>خطوات الحل</h3>
            {answer.results.map((result) => (
              <SectionErrorBoundary
                key={result.id}
                label={`خطوات ${result.title}`}
                resetKey={result.id}
              >
                <div className="space-y-3">
                  {answer.results.length > 1 && (
                    <h4 className="text-sm text-emerald-200 pt-4">
                      {result.title}
                    </h4>
                  )}
                  {result.steps.map((step, index) => (
                    <Step key={index} step={step} number={index + 1} />
                  ))}
                  {result.note && (
                    <p className="answer-note">
                      <RichText text={result.note} />
                    </p>
                  )}
                </div>
              </SectionErrorBoundary>
            ))}
          </div>
        )}
        {phase >= 2 && (
          <div className="space-y-4 reveal-section">
            {answer.results
              .filter((result) => result.visuals.length)
              .map((result) => {
                const View = views[result.engine];
                return (
                  <SectionErrorBoundary
                    key={result.id}
                    label={`رسوم ${result.title}`}
                    resetKey={result.id}
                  >
                    <Suspense
                      fallback={
                        <p className="text-xs text-slate-500">تجهيز الرسم…</p>
                      }
                    >
                      <View result={result} />
                    </Suspense>
                  </SectionErrorBoundary>
                );
              })}
          </div>
        )}
        {answer.unsolved.map((part, index) => (
          <div className="clarification-card" key={index} role="status">
            <p>{part.message}</p>
            {part.engine && answer.results.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                الجزء غير المكتمل: {ENGINE_LABELS[part.engine]}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {part.choices.map((choice) => (
                <button
                  className="suggestion-button text-right"
                  key={choice}
                  aria-label={choice}
                  onClick={() => onFollowUp(choice)}
                >
                  <RichText text={choice} autoMath />
                </button>
              ))}
            </div>
          </div>
        ))}
        {phase >= 2 && (
          <>
            <div className="answer-actions">
              {onKnowledgeFeedback && answer.results.length > 0 && (
                <div className="knowledge-feedback" aria-label="تقييم الحل من أجل التعليم">
                  <button
                    type="button"
                    className="knowledge-feedback-correct"
                    onClick={() => onKnowledgeFeedback(answer, true)}
                  >
                    <ThumbsUp size={15} />
                    الحل صحيح
                  </button>
                  <button
                    type="button"
                    className="knowledge-feedback-wrong"
                    onClick={() => setReportOpen(true)}
                  >
                    <ThumbsDown size={15} />
                    الجواب خاطئ أو ناقص
                  </button>
                </div>
              )}
              {onProbability &&
                (answer.results.some((r) => r.mode === "probability") ||
                  answer.unsolved.some(
                    (r) => r.engine === "probabilityEngine",
                  )) && (
                  <button
                    type="button"
                    className="answer-action"
                    aria-label="تعديل تجربة الاحتمالات"
                    onClick={() => onProbability(answer.context.probability)}
                  >
                    <Dices size={15} />
                    <span>لوحة الاحتمالات</span>
                  </button>
                )}
              <button
                onClick={copy}
                className="answer-action"
                aria-label="نسخ الجواب"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? "تم النسخ" : "نسخ"}</span>
              </button>
              <button
                onClick={printAnswer}
                className="answer-action"
                aria-label="طباعة الجواب أو حفظه PDF"
              >
                <Printer size={15} />
                <span>طباعة / PDF</span>
              </button>
              {answer.results.length > 0 && (
                <button
                  onClick={() => onSave(answer)}
                  disabled={saved}
                  className="answer-action"
                  aria-label="حفظ في السجل"
                >
                  {saved ? <Check size={15} /> : <BookmarkPlus size={15} />}
                  <span>{saved ? "محفوظ في السجل" : "حفظ في السجل"}</span>
                </button>
              )}
            </div>
            {copyError && (
              <p role="alert" className="text-xs text-rose-300">
                {copyError}
              </p>
            )}
            {reportOpen && onKnowledgeFeedback && (
              <form
                className="clarification-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  onKnowledgeFeedback(answer, false, reportReason.trim());
                  setReportOpen(false);
                  setReportSent(true);
                }}
              >
                <p>يُرسل السؤال والجواب المعروض إلى لوحة الإخفاقات بموافقتك.</p>
                <textarea
                  className="ocr-review"
                  rows={2}
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  placeholder="سبب اختياري"
                  aria-label="سبب اختياري للبلاغ"
                />
                <div className="answer-actions">
                  <button type="submit" className="primary-button">
                    إرسال البلاغ
                  </button>
                  <button
                    type="button"
                    className="answer-action"
                    onClick={() => setReportOpen(false)}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}
            {reportSent && (
              <p role="status" className="text-xs text-emerald-300">
                أُرسل البلاغ. شكرًا لمراجعتك.
              </p>
            )}
            {!!answer.suggestions.length && (
              <div className="follow-ups">
                {answer.suggestions.map((suggestion) => (
                  <button
                    className="suggestion-button"
                    key={suggestion}
                    aria-label={suggestion}
                    onClick={() => onFollowUp(suggestion)}
                  >
                    <RichText text={suggestion} autoMath />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
});
