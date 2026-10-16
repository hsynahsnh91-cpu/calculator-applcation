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
  Cuboid,
  Grid2X2,
} from "lucide-react";
import { Tex, RichText } from "../common/Tex";
import { Step } from "../common/Step";
import { SectionErrorBoundary } from "../common/SectionErrorBoundary";
import {
  ENGINE_LABELS,
  type EngineId,
  type SolverAnswer,
} from "../../solver/types";
import { copyToClipboard } from "../../utils/cn";
import { answerAsText } from "../../solver/composer";
import type { ProbabilityContext } from "../../solver/probabilityTypes";
import type { GeometryContext } from "../../solver/geometryTypes";
import type { MatrixContext } from "../../solver/matrixTypes";
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
  onProbability,
  onGeometry,
  onMatrices,
  saved,
  animate = false,
}: {
  answer: SolverAnswer;
  onFollowUp: (text: string) => void;
  onSave: (answer: SolverAnswer) => void;
  onProbability?: (context?: ProbabilityContext) => void;
  onGeometry?: (context?: GeometryContext) => void;
  onMatrices?: (context?: MatrixContext) => void;
  saved: boolean;
  animate?: boolean;
}) {
  const schoolCards = answer.results.some((r) => !!r.school?.label);
  const [copied, setCopied] = useState(false),
    [phase, setPhase] = useState(animate ? 0 : 2),
    [copyError, setCopyError] = useState("");
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
        {answer.results.length > 0 && (
          <div className="final-answer" data-testid="final-answer">
            <div className="final-label">الجواب النهائي</div>
            {answer.results.map((result) => (
              <SectionErrorBoundary
                key={result.id}
                resetKey={result.id}
                label="النتيجة النهائية"
              >
                <section
                  className={`final-result ${result.mode === "matrices" ? "matrix-answer" : ""}`}
                >
                  {(answer.results.length > 1 ||
                    result.school?.label ||
                    result.mode === "matrices") && (
                    <p className="school-result-heading">
                      {result.school?.label && (
                        <bdi className="school-request-label">
                          {result.school.label}
                        </bdi>
                      )}
                      <RichText
                        text={
                          result.school?.label
                            ? result.school.title
                            : result.title
                        }
                        autoMath
                      />
                    </p>
                  )}
                  <Tex
                    display
                    math={result.finalLatex}
                    className="text-[1.13rem] sm:text-xl text-emerald-100"
                  />
                  {result.decimal !== undefined &&
                    (result.school && !result.school.showDecimal ? (
                      <details className="answer-decimal">
                        <summary>طلب تقريب عددي</summary>
                        <Tex math={String(result.decimal)} />
                      </details>
                    ) : (
                      <div className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-2">
                        <span>عدديًا</span>
                        <Tex math={String(result.decimal)} />
                      </div>
                    ))}
                  {result.verification.passed && (
                    <p className="verification-method">
                      {result.verification.method}
                    </p>
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
                <section
                  className={`${schoolCards ? "school-request-card" : "space-y-3"} ${result.mode === "matrices" ? "matrix-answer" : ""}`}
                  data-request-label={result.school?.label || undefined}
                >
                  {(schoolCards || answer.results.length > 1) && (
                    <h4 className="school-result-heading">
                      {result.school?.label && (
                        <bdi className="school-request-label">
                          {result.school.label}
                        </bdi>
                      )}
                      <RichText
                        text={
                          result.school?.label
                            ? result.school.title
                            : result.title
                        }
                        autoMath
                      />
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
                  {schoolCards && phase >= 2 && result.visuals.length > 0 && (
                    <Suspense
                      fallback={
                        <p className="text-xs text-slate-500">تجهيز الرسم…</p>
                      }
                    >
                      {(() => {
                        const View = views[result.engine];
                        return <View result={result} />;
                      })()}
                    </Suspense>
                  )}
                </section>
              </SectionErrorBoundary>
            ))}
          </div>
        )}
        {phase >= 2 && (
          <div className="space-y-4 reveal-section">
            {answer.results
              .filter((result) => result.visuals.length && !schoolCards)
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
        {answer.unsolved.slice(0, 1).map((part, index) => (
          <div className="clarification-card" key={index} role="status">
            {part.school?.label && (
              <p className="school-result-heading">
                <bdi className="school-request-label">{part.school.label}</bdi>
                <RichText text={part.school.title} autoMath />
              </p>
            )}
            <p>
              <RichText
                text={part.message.replace(/؟(?=[\s\S]*؟)/g, "،")}
                autoMath
              />
            </p>
            {answer.unsolved.length > 1 && (
              <details className="school-pending">
                <summary>
                  الطلبات المعلّقة الأخرى ({answer.unsolved.length - 1})
                </summary>
                <ul>
                  {answer.unsolved.slice(1).map((u, i) => (
                    <li key={i}>
                      <bdi>{u.school?.label}</bdi>{" "}
                      <RichText text={u.school?.title || u.request} autoMath />
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
              {onMatrices &&
                (answer.results.some((r) => r.mode === "matrices") ||
                  answer.unsolved.some((r) => r.engine === "matricesEngine") ||
                  answer.results.some((r) => !!r.contextPatch?.matrices)) && (
                  <button
                    type="button"
                    className="answer-action"
                    aria-label="تعديل معطيات المصفوفات"
                    onClick={() => onMatrices(answer.context.matrices)}
                  >
                    <Grid2X2 size={15} />
                    <span>لوحة المصفوفات</span>
                  </button>
                )}
              {onGeometry &&
                (answer.results.some(
                  (r) => r.mode === "geometry" || !!r.contextPatch?.geometry,
                ) ||
                  answer.unsolved.some(
                    (r) =>
                      r.engine === "geometryEngine" ||
                      r.engine === "geometryTools",
                  )) && (
                  <button
                    type="button"
                    className="answer-action"
                    aria-label="تعديل معطيات الهندسة الفراغية"
                    onClick={() => onGeometry(answer.context.geometry)}
                  >
                    <Cuboid size={15} />
                    <span>لوحة الهندسة</span>
                  </button>
                )}
              {onProbability &&
                (answer.results.some(
                  (r) =>
                    r.mode === "probability" || !!r.contextPatch?.probability,
                ) ||
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
