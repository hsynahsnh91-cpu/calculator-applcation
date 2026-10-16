import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  AudioLines,
  BookOpen,
  ChevronLeft,
  History,
  Dices,
  Grid2X2,
  Cuboid,
  ImagePlus,
  Keyboard,
  LoaderCircle,
  Mic,
  Plus,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  UserRound,
  Vibrate,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  SmartPrompt,
  type SmartPromptHandle,
} from "./components/chat/SmartPrompt";
import { AnswerBubble } from "./components/chat/AnswerBubble";
import { ToolModal } from "./components/chat/ToolModal";
import { SectionErrorBoundary } from "./components/common/SectionErrorBoundary";
import { RichText } from "./components/common/Tex";
import { localDB } from "./utils/localDB";
import { soundHaptics } from "./utils/soundHaptics";
import { useOfflineSpeech } from "./hooks/useOfflineSpeech";
import { cancelSolver, solveLocally } from "./solver/client";
import { composeAnswer } from "./solver/composer";
import {
  emptyContext,
  ENGINE_LABELS,
  type ConversationTurn,
  type EngineId,
  type SolverAnswer,
  type SolverContext,
} from "./solver/types";
import type { AngleMode, HistoryEntry } from "./types";
import type { ProbabilityContext } from "./solver/probabilityTypes";
import type { GeometryContext } from "./solver/geometryTypes";
import type { MatrixContext } from "./solver/matrixTypes";
import type { NaturalMathFieldHandle } from "./components/common/NaturalMathField";
const NaturalMathField = lazy(() =>
  import("./components/common/NaturalMathField").then((module) => ({
    default: module.NaturalMathField,
  })),
);
const MathKeyPad = lazy(() =>
  import("./components/common/MathKeyPad").then((module) => ({
    default: module.MathKeyPad,
  })),
);
const FormulaReference = lazy(() =>
  import("./components/reference/FormulaReference").then((module) => ({
    default: module.FormulaReference,
  })),
);
const HistoryDrawer = lazy(() =>
  import("./components/history/HistoryDrawer").then((module) => ({
    default: module.HistoryDrawer,
  })),
);
const ImageAttachment = lazy(() =>
  import("./components/chat/ImageAttachment").then((module) => ({
    default: module.ImageAttachment,
  })),
);
const ProbabilityBoard = lazy(
  () => import("./components/probability/ProbabilityBoard"),
);
const MatrixBoard = lazy(() => import("./components/matrices/MatrixBoard"));
const GeometryBoard = lazy(() => import("./components/geometry/GeometryBoard"));
const CurriculumGuide = lazy(
  () => import("./components/reference/CurriculumGuide"),
);
type Modal =
  | "matrices"
  | "curriculum"
  | "geometry"
  | "math"
  | "probability"
  | "reference"
  | "history"
  | "name"
  | "clear"
  | null;
const examples = [
  "جد مشتق f(x)=x^3-3x+1 ونظّم جدول تغيراته",
  "حل المعادلة 2x^2-5x+3=0",
  "احسب تكامل x e^x من 0 إلى 1",
  "اكتب الأشكال الثلاثة للعدد العقدي z=1+i",
];
export default function App() {
  const [turns, setTurns] = useState<ConversationTurn[]>(() =>
    localDB.getConversation(),
  );
  const [name, setName] = useState(() => localDB.getProfile().name),
    [editName, setEditName] = useState("");
  const [draft, setDraft] = useState(""),
    [pending, setPending] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [menu, setMenu] = useState(false),
    [modal, setModal] = useState<Modal>(null);
  const [matrixDraft, setMatrixDraft] = useState<MatrixContext>();
  const openMatrices = useCallback((value?: MatrixContext) => {
    setMatrixDraft(value);
    setMenu(false);
    setModal("matrices");
  }, []);
  const [geometryDraft, setGeometryDraft] = useState<GeometryContext>();
  const openGeometry = useCallback((value?: GeometryContext) => {
    setGeometryDraft(value);
    setMenu(false);
    setModal("geometry");
  }, []);
  const [probabilityDraft, setProbabilityDraft] =
    useState<ProbabilityContext>();
  const openProbability = useCallback((value?: ProbabilityContext) => {
    setProbabilityDraft(value);
    setMenu(false);
    setModal("probability");
  }, []);
  const [angle, setAngle] = useState<AngleMode>(
      () => localDB.getSettings().angleMode,
    ),
    [sound, setSound] = useState(() => soundHaptics.soundEnabled),
    [haptics, setHaptics] = useState(() => soundHaptics.hapticsEnabled);
  const [history, setHistory] = useState(() => localDB.getHistory());
  const [engines, setEngines] = useState<EngineId[]>([]),
    [activeChip, setActiveChip] = useState(0),
    [stage, setStage] = useState("جارٍ التحليل");
  const [mathLatex, setMathLatex] = useState(""),
    [imageFile, setImageFile] = useState<File | null>(null),
    [imagePreview, setImagePreview] = useState(""),
    [imageApproved, setImageApproved] = useState(false);
  const prompt = useRef<SmartPromptHandle>(null),
    mathField = useRef<NaturalMathFieldHandle>(null),
    fileInput = useRef<HTMLInputElement>(null),
    menuRoot = useRef<HTMLDivElement>(null),
    pendingElement = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null),
    token = useRef(0);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const followUp = useCallback((text: string) => {
    void sendRef.current(text);
  }, []);
  const context = useRef<SolverContext>(
    turns[turns.length - 1]?.answer.context ?? emptyContext(),
  );
  const speech = useOfflineSpeech((text) =>
    prompt.current?.insertText((draft ? " " : "") + text),
  );
  useEffect(() => {
    localDB.saveConversation(turns);
  }, [turns]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setActiveChip((value) => (value + 1) % Math.max(engines.length, 1)),
      100,
    );
    return () => clearInterval(timer);
  }, [busy, engines.length]);
  useEffect(() => {
    if (pending)
      pendingElement.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [pending]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        menuRoot.current?.querySelector("button")?.focus();
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(
        menuRoot.current?.querySelectorAll<HTMLButtonElement>(
          ".tools-menu button",
        ) ?? [],
      );
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[next]?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  useEffect(
    () => () => {
      controller.current?.abort();
      cancelSolver();
    },
    [],
  );
  const open = (value: Modal) => {
    setMenu(false);
    if (value === "name") setEditName(name);
    if (value === "math") setMathLatex("");
    if (value === "matrices") {
      const stored = context.current;
      setMatrixDraft(
        stored.matrices ||
          (stored.matrix
            ? {
                values: { M: stored.matrix.map((r) => r.map(String)) },
                active: "M",
              }
            : undefined),
      );
    }
    if (value === "geometry") setGeometryDraft(context.current.geometry);
    if (value === "probability")
      setProbabilityDraft(context.current.probability);
    setModal(value);
  };
  const removeImage = () => {
    setImageFile(null);
    setImagePreview("");
    setImageApproved(false);
  };
  const newConversation = () => {
    token.current++;
    controller.current?.abort();
    cancelSolver();
    setBusy(false);
    setPending("");
    setTurns([]);
    setError("");
    setMenu(false);
    setModal(null);
    context.current = emptyContext();
    localDB.clearConversation();
    prompt.current?.clear();
    removeImage();
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    prompt.current?.focus();
  };
  const send = async (value?: string) => {
    const question = (value ?? prompt.current?.value() ?? "").trim();
    if (!question || busy) return;
    if (question.length > 7000) {
      setError(
        "السؤال أطول من 7000 محرف. قسّمه إلى رسالتين مع إبقاء المعطيات المشتركة في الأولى.",
      );
      return;
    }
    if (imageFile && !imageApproved && !value) {
      setError(
        "راجع نص الصورة واضغط «استخدام النص في مربع السؤال» أولًا، أو احذف الصورة واكتب المسألة يدويًا.",
      );
      return;
    }
    const request = ++token.current;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const image = !value ? imagePreview : undefined;
    setError("");
    setMenu(false);
    setPending(question);
    setBusy(true);
    setStage("جارٍ التحليل");
    setEngines([]);
    setActiveChip(0);
    prompt.current?.clear();
    soundHaptics.playEquals();
    soundHaptics.vibrate(20);
    try {
      const answer = await solveLocally(
        question,
        { angleMode: angle, context: context.current },
        (progress) => {
          if (request !== token.current) return;
          setStage(
            progress.stage === "verifying"
              ? "جارٍ التحقق من النتائج"
              : progress.stage === "running"
                ? "جارٍ حل المسألة"
                : "جارٍ التحليل",
          );
          setEngines((previous) => [
            ...new Set([...previous, ...progress.engines]),
          ]);
        },
        current.signal,
      );
      if (request !== token.current) return;
      context.current = answer.context;
      const turn: ConversationTurn = {
        id: `turn-${Date.now()}`,
        question,
        answer,
        createdAt: Date.now(),
        ...(image ? { image } : {}),
      };
      setTurns((previous) => [...previous, turn].slice(-24));
      if (answer.results.length) soundHaptics.vibrate(15);
      else soundHaptics.playError();
      removeImage();
    } catch (value) {
      if (request !== token.current || current.signal.aborted) return;
      const message =
        value instanceof Error && /[\u0600-\u06ff]/.test(value.message)
          ? value.message
          : "تعذّر تشغيل المحرك المحلي. أعد صياغة الطلب.";
      const answer = composeAnswer(
        question,
        [],
        [{ request: question, message, choices: examples }],
        [],
        context.current,
        0,
      );
      setTurns((previous) => [
        ...previous,
        { id: `turn-${Date.now()}`, question, answer, createdAt: Date.now() },
      ]);
      soundHaptics.playError();
    } finally {
      if (request === token.current) {
        setPending("");
        setBusy(false);
      }
    }
  };
  sendRef.current = send;
  const save = useCallback((answer: SolverAnswer) => {
    if (!answer.results.length) return;
    const final = answer.results
      .map((result) => result.finalLatex)
      .join("\\qquad ");
    localDB.saveHistoryEntry({
      mode: answer.results[0].mode,
      title:
        answer.results.length === 1
          ? answer.results[0].title
          : "مسألة متعددة الأجزاء",
      inputLatex: `\\text{${answer.question.replace(/[{}\\$]/g, " ").slice(0, 260)}}`,
      resultLatex: final,
      steps: answer.results.flatMap((result) =>
        result.steps.map(
          (step) => `${step.title}: ${step.text ?? ""} $${step.latex}$`,
        ),
      ),
      tags: ["conversation", answer.id, `question:${answer.question}`],
    });
    setHistory(localDB.getHistory());
  }, []);
  const selectHistory = (entry: HistoryEntry) => {
    const stored = entry.tags
      ?.find((tag) => tag.startsWith("question:"))
      ?.slice(9);
    prompt.current?.setValue(stored ?? entry.inputLatex);
    setModal(null);
  };
  const loading = (
    <p className="py-8 text-center text-sm text-slate-400">جارٍ فتح الأداة…</p>
  );
  const chatting = turns.length > 0 || !!pending;
  return (
    <div
      className={`chat-app ${chatting ? "has-conversation" : "is-welcome"}`}
      dir="rtl"
    >
      <main className="chat-main">
        {!chatting && (
          <section className="welcome">
            <div className="welcome-mark" aria-hidden="true">
              ✦
            </div>
            <h1>
              مرحبًا{" "}
              <button
                onClick={() => open("name")}
                title="تغيير الاسم"
                className="name-button"
              >
                {name || "صديقي"}
              </button>
              ،<br />
              <span>ماذا يدور في ذهنك؟</span>
            </h1>
            <p>سؤالك، رموزك، وخطوات واضحة إلى الحل.</p>
          </section>
        )}
        {chatting && (
          <div className="conversation" aria-label="المحادثة الرياضية">
            {turns.map((turn, index) => (
              <section className="conversation-turn" key={turn.id}>
                <div className="user-message" dir="auto">
                  {turn.image && (
                    <img
                      src={turn.image}
                      alt="صورة المسألة التي تمت مراجعة نصها"
                      className="question-image"
                    />
                  )}
                  <RichText text={turn.question} autoMath />
                </div>
                <SectionErrorBoundary label="الجواب" resetKey={turn.answer.id}>
                  <AnswerBubble
                    answer={turn.answer}
                    animate={index === turns.length - 1}
                    onFollowUp={followUp}
                    onSave={save}
                    onProbability={openProbability}
                    onGeometry={openGeometry}
                    onMatrices={openMatrices}
                    saved={history.some((entry) =>
                      entry.tags?.includes(turn.answer.id),
                    )}
                  />
                </SectionErrorBoundary>
              </section>
            ))}
            {pending && (
              <section className="conversation-turn" ref={pendingElement}>
                <div className="user-message" dir="auto">
                  <RichText text={pending} autoMath />
                </div>
                <div
                  className="analysis-state"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircle
                    size={18}
                    className="animate-spin text-emerald-300"
                  />
                  <div>
                    <p>{stage}</p>
                    <div className="engine-chips">
                      {engines.length ? (
                        engines.map((engine, index) => (
                          <span
                            key={engine}
                            className={`engine-chip ${index === activeChip ? "engine-chip-active" : ""}`}
                          >
                            {ENGINE_LABELS[engine]}
                          </span>
                        ))
                      ) : (
                        <span className="engine-chip engine-chip-active">
                          توحيد النص والرموز
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
        <div className="composer-zone">
          <div className={`question-composer ${busy ? "composer-busy" : ""}`}>
            {imageFile && (
              <Suspense fallback={loading}>
                <ImageAttachment
                  key={`${imageFile.name}-${imageFile.lastModified}`}
                  file={imageFile}
                  onUse={(text, preview) => {
                    prompt.current?.setValue(text);
                    setImagePreview(preview);
                    setImageApproved(true);
                    setError("");
                  }}
                  onRemove={removeImage}
                />
              </Suspense>
            )}
            <SmartPrompt
              ref={prompt}
              onChange={setDraft}
              onSubmit={() => {
                void send();
              }}
              disabled={busy}
            />
            <div className="composer-tools">
              <div className="composer-right" ref={menuRoot}>
                <button
                  aria-label="فتح أدوات السؤال"
                  aria-expanded={menu}
                  aria-controls="question-tools"
                  className={`composer-icon ${menu ? "tool-open" : ""}`}
                  onClick={() => setMenu((value) => !value)}
                >
                  <Plus size={23} />
                </button>
                <button
                  className="composer-icon"
                  aria-label="محادثة جديدة"
                  title="محادثة جديدة"
                  onClick={newConversation}
                >
                  <SquarePen size={19} />
                </button>
                <span className="angle-indicator" title="وحدة الزوايا الحالية">
                  {angle}
                </span>
                {menu && (
                  <div
                    className="tools-menu"
                    style={{
                      maxHeight: Math.max(
                        160,
                        Math.min(
                          520,
                          (menuRoot.current?.getBoundingClientRect().top ??
                            480) - 24,
                        ),
                      ),
                    }}
                    id="question-tools"
                    role="menu"
                    aria-label="أدوات السؤال"
                  >
                    <button role="menuitem" onClick={() => open("math")}>
                      <Keyboard size={17} />
                      <span>لوحة المفاتيح الرياضية</span>
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        fileInput.current?.click();
                      }}
                    >
                      <ImagePlus size={17} />
                      <span>إرفاق صورة للمسألة</span>
                      <span className="menu-tag">OCR محلي</span>
                    </button>
                    <button role="menuitem" onClick={() => open("matrices")}>
                      <Grid2X2 size={17} />
                      <span>لوحة المصفوفات والجمل</span>
                      <ChevronLeft size={14} />
                    </button>
                    <button role="menuitem" onClick={() => open("geometry")}>
                      <Cuboid size={17} />
                      <span>لوحة الهندسة الفراغية</span>
                      <ChevronLeft size={14} />
                    </button>
                    <button role="menuitem" onClick={() => open("probability")}>
                      <Dices size={17} />
                      <span>لوحة الاحتمالات والإحصاء</span>
                      <ChevronLeft size={14} />
                    </button>
                    <button role="menuitem" onClick={() => open("curriculum")}>
                      <BookOpen size={17} />
                      <span>دليل قدرات التطبيق</span>
                    </button>
                    <button role="menuitem" onClick={() => open("reference")}>
                      <BookOpen size={17} />
                      <span>بنك القوانين</span>
                    </button>
                    <button role="menuitem" onClick={() => open("history")}>
                      <History size={17} />
                      <span>السجل</span>
                      <span className="menu-tag">{history.length}</span>
                    </button>
                    <div className="menu-divider" />
                    <div className="angle-settings">
                      <span>
                        <SlidersHorizontal size={15} />
                        وحدة الزوايا
                      </span>
                      <div role="group" aria-label="وحدة الزوايا">
                        {(["DEG", "RAD", "GRAD"] as const).map((unit) => (
                          <button
                            key={unit}
                            aria-pressed={angle === unit}
                            onClick={() => {
                              setAngle(unit);
                              localDB.saveSettings({ angleMode: unit });
                            }}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      role="menuitemcheckbox"
                      aria-checked={sound}
                      onClick={() => {
                        soundHaptics.soundEnabled = !sound;
                        setSound(!sound);
                      }}
                    >
                      {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                      <span>الصوت</span>
                      <i className={`setting-switch ${sound ? "is-on" : ""}`} />
                    </button>
                    <button
                      role="menuitemcheckbox"
                      aria-checked={haptics}
                      onClick={() => {
                        soundHaptics.hapticsEnabled = !haptics;
                        setHaptics(!haptics);
                      }}
                    >
                      <Vibrate size={17} />
                      <span>الاهتزاز</span>
                      <i
                        className={`setting-switch ${haptics ? "is-on" : ""}`}
                      />
                    </button>
                    <button role="menuitem" onClick={() => open("name")}>
                      <UserRound size={17} />
                      <span>تغيير الاسم</span>
                    </button>
                    <div className="menu-divider" />
                    <button role="menuitem" onClick={newConversation}>
                      <SquarePen size={17} />
                      <span>محادثة جديدة</span>
                    </button>
                    <button
                      role="menuitem"
                      className="menu-danger"
                      onClick={() => open("clear")}
                    >
                      <Trash2 size={17} />
                      <span>مسح المحادثة</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="composer-left">
                {speech.supported && (
                  <button
                    className={`composer-icon ${speech.listening ? "is-listening" : ""}`}
                    aria-label={
                      speech.listening
                        ? "إيقاف الاستماع المحلي"
                        : "إملاء صوتي محلي"
                    }
                    title="التعرّف العربي محليًا فقط"
                    onClick={speech.toggle}
                  >
                    {speech.listening ? (
                      <AudioLines size={21} />
                    ) : (
                      <Mic size={20} />
                    )}
                  </button>
                )}
                {busy ? (
                  <button
                    className="send-button"
                    aria-label="إيقاف التحليل"
                    onClick={() => {
                      token.current++;
                      controller.current?.abort();
                      setBusy(false);
                      setPending("");
                      setError("أُوقف التحليل. لم يُعتمد جواب غير مكتمل.");
                    }}
                  >
                    <X size={19} />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    aria-label="إرسال المسألة"
                    disabled={!draft.trim()}
                    onClick={() => {
                      void send();
                    }}
                  >
                    <ArrowUp size={22} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {(error || speech.error) && (
            <p className="composer-error" role="alert">
              {error || speech.error}
            </p>
          )}
        </div>
        {!chatting && (
          <div className="starter-prompts" aria-label="أمثلة لمسائل">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => {
                  prompt.current?.setValue(example);
                }}
              >
                <span>
                  {example.startsWith("جد مشتق")
                    ? "مشتقة الدالة وجدول تغيراتها"
                    : example.startsWith("حل")
                      ? "حل معادلة من الدرجة الثانية"
                      : "التكامل المحدد خطوة بخطوة"}
                </span>
                <ArrowUp size={14} />
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          aria-label="اختيار صورة المسألة"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              setImageFile(file);
              setImageApproved(false);
              setImagePreview("");
              setError("");
            }
          }}
        />
      </main>
      {modal && (
        <ToolModal
          title={
            modal === "matrices"
              ? "المصفوفات والجمل الخطية"
              : modal === "curriculum"
                ? "قدرات التطبيق وحدود الدعم"
                : modal === "geometry"
                  ? "الهندسة الفراغية"
                  : modal === "probability"
                    ? "لوحة الاحتمالات والإحصاء"
                    : modal === "math"
                      ? "لوحة المفاتيح الرياضية"
                      : modal === "reference"
                        ? "بنك القوانين"
                        : modal === "history"
                          ? "السجل"
                          : modal === "name"
                            ? "كيف أناديك؟"
                            : "مسح المحادثة"
          }
          onClose={() => setModal(null)}
          wide={
            modal === "matrices" ||
            modal === "curriculum" ||
            modal === "reference" ||
            modal === "history" ||
            modal === "probability" ||
            modal === "geometry"
          }
          className={
            modal === "matrices"
              ? "matrix-modal"
              : modal === "geometry"
                ? "geometry-modal"
                : modal === "probability"
                  ? "probability-modal"
                  : ""
          }
        >
          <SectionErrorBoundary label="الأداة" resetKey={modal}>
            <Suspense fallback={loading}>
              {modal === "math" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400 leading-7">
                    اكتب بالكسور والأسس الحقيقية، ثم أدرج التعبير في سؤالك.
                    يمكنك أيضًا كتابة <span dir="ltr">x^</span> مباشرة داخل مربع
                    السؤال.
                  </p>
                  <NaturalMathField
                    ref={mathField}
                    onChange={(_expression, latex) => setMathLatex(latex)}
                  />
                  <MathKeyPad
                    defaultOpen
                    onInsert={(text) => mathField.current?.insert(text)}
                    onBackspace={() => mathField.current?.backspace()}
                    onClear={() => {
                      mathField.current?.clear();
                      setMathLatex("");
                    }}
                  />
                  <button
                    className="primary-button"
                    disabled={!mathLatex}
                    onClick={() => {
                      prompt.current?.insertMath(mathLatex);
                      setModal(null);
                      setMathLatex("");
                    }}
                  >
                    إدراج في السؤال
                  </button>
                </div>
              )}
              {modal === "matrices" && (
                <MatrixBoard
                  context={matrixDraft}
                  busy={busy}
                  onInsert={(question) => {
                    prompt.current?.setValue(question);
                    setModal(null);
                  }}
                  onSolve={(question) => {
                    setModal(null);
                    void sendRef.current(question);
                  }}
                />
              )}
              {modal === "geometry" && (
                <GeometryBoard
                  context={geometryDraft}
                  angleMode={angle}
                  busy={busy}
                  onInsert={(question) => {
                    prompt.current?.setValue(question);
                    setModal(null);
                  }}
                  onSolve={(question) => {
                    setModal(null);
                    void sendRef.current(question);
                  }}
                />
              )}
              {modal === "probability" && (
                <ProbabilityBoard
                  context={probabilityDraft}
                  busy={busy}
                  onInsert={(question) => {
                    prompt.current?.setValue(question);
                    setModal(null);
                  }}
                  onSolve={(question) => {
                    setModal(null);
                    void sendRef.current(question);
                  }}
                />
              )}
              {modal === "curriculum" && (
                <CurriculumGuide
                  onInsert={(question) => {
                    prompt.current?.setValue(question);
                    setModal(null);
                  }}
                />
              )}
              {modal === "reference" && <FormulaReference />}
              {modal === "history" && (
                <HistoryDrawer
                  history={history}
                  onRefreshHistory={() => setHistory(localDB.getHistory())}
                  onSelectEntry={selectHistory}
                />
              )}
              {modal === "name" && (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    localDB.saveProfile(editName);
                    setName(editName.trim().slice(0, 40));
                    setModal(null);
                  }}
                >
                  <p className="text-sm leading-7 text-slate-400">
                    يُحفظ اسمك على هذا الجهاز فقط، ويمكنك تغييره في أي وقت.
                  </p>
                  <input
                    aria-label="اسمك"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={40}
                    placeholder="اكتب اسمك"
                    className="name-input"
                    autoComplete="given-name"
                  />
                  <button className="primary-button" type="submit">
                    حفظ الاسم
                  </button>
                </form>
              )}
              {modal === "clear" && (
                <div className="space-y-5">
                  <p className="text-sm leading-8 text-slate-300">
                    سيُمسح نص هذه المحادثة من الجهاز. العمليات التي حفظتها في
                    السجل لن تُحذف.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="primary-button"
                      onClick={newConversation}
                    >
                      نعم، امسح المحادثة
                    </button>
                    <button
                      className="suggestion-button"
                      onClick={() => setModal(null)}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </Suspense>
          </SectionErrorBoundary>
        </ToolModal>
      )}
    </div>
  );
}
