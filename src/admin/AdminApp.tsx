import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleHelp,
  CloudUpload,
  FilePenLine,
  Gauge,
  Layers3,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { z } from "zod";
import { Tex } from "../ui/Tex";
import { ENGINE_LABELS, type EngineId, type SolverAnswer } from "../core/solver/types";
import { cancelSolver, solveLocally } from "../core/solver/client";
import {
  adminUiReducer,
  initialAdminUiState,
  type AdminTab,
  type AdminUiState,
  type CorrectionTarget,
  type IncomingFeedback,
  type SessionState,
} from "./adminUiStore";
import { DEFAULT_ENGINE_PROMPT } from "./enginePrompt";
import { adminDraftDB } from "./indexedDB";
import { canonicalizeQuestion, questionFingerprint } from "./normalization";
import type { DocumentAnalysisOptions } from "./DocumentScanner";
import type { ManualTrainingInput } from "./ManualTrainingPanel";
import { PracticeTab } from "./PracticeTab";
import { LibraryTab } from "./tabs/LibraryTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { MonitorTab } from "./tabs/MonitorTab";
import { PublishTab } from "./tabs/PublishTab";
import { ScanTab } from "./tabs/ScanTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { WorkspaceTab } from "./workspace/WorkspaceTab";
import { splitDocumentForAnalysis } from "./analysisChunks";
import { findCurriculumGaps } from "./curriculum";
import { scanDocument, type ScannedDocument } from "./scanner";
import {
  approvedSolutionFromAnswer,
  approvedSolutionsMatch,
} from "../core/knowledge/regression";
import {
  AdminApiError,
  adminLogin,
  adminLogout,
  adminLogoutAll,
  analyzeRemote,
  checkAdminSession,
  getAdminHealth,
  getAdminStatistics,
  getFailures,
  getServerPrompt,
  getVersions,
  publishedLibrary,
  publishKnowledge,
  removeFailure,
  rollbackVersion,
  saveServerPrompt,
  type AdminHealth,
  type AdminStatistics,
} from "./api";
import {
  defaultSolverSettings,
  errorAnalysisSchema,
  knowledgeItemSchema,
  solverSettingsSchema,
  type AnalysisBlock,
  type ApprovedSolution,
  type ErrorAnalysis,
  type FailureRecord,
  type KnowledgeItem,
  type KnowledgeItemType,
  type KnowledgeSnapshot,
  type RegressionOutcome,
  type SolverSettings,
  type VersionSummary,
} from "./types";

type ExerciseRun =
  | { state: "idle" }
  | { state: "running" }
  | { state: "complete"; answer: SolverAnswer; solution?: ApprovedSolution }
  | { state: "error"; message: string };

const itemTypeLabels: Record<KnowledgeItemType, string> = {
  rule: "قاعدة",
  example: "مثال",
  exercise: "تمرين",
  correction: "تصحيح",
  notation: "تعريف/رمز",
};

const statusLabels: Record<KnowledgeItem["status"], string> = {
  draft: "مسودة",
  approved: "معتمد",
  published: "منشور",
};

const tabs: { id: AdminTab; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "نظرة عامة", icon: Gauge },
  { id: "scan", label: "مسح وتحليل", icon: CloudUpload },
  { id: "workspace", label: "مساحة العقل", icon: BrainCircuit },
  { id: "practice", label: "تدرّب", icon: Sparkles },
  { id: "library", label: "المكتبة", icon: LibraryBig },
  { id: "publish", label: "النشر والنسخ", icon: Layers3 },
  { id: "monitor", label: "المتابعة والاختبار", icon: BarChart3 },
  { id: "settings", label: "الإعدادات", icon: Settings2 },
];

const backupSchema = z
  .object({
    items: z.array(knowledgeItemSchema),
    settings: solverSettingsSchema,
  })
  .strict();

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asItemType(block: AnalysisBlock): KnowledgeItemType {
  if (block.classification === "rule") return "rule";
  if (block.classification === "solved_example") return "example";
  if (block.classification === "exercise") return "exercise";
  return "notation";
}

function createItemFromBlock(block: AnalysisBlock, source: string): KnowledgeItem {
  const timestamp = nowIso();
  const canonicalQuestion = canonicalizeQuestion(block.structured || block.originalText);
  return knowledgeItemSchema.parse({
    id: makeId("knowledge"),
    type: asItemType(block),
    originalText: block.originalText,
    structured: block.structured,
    latex: block.latex,
    grade: block.grade,
    unit: block.unit,
    lesson: block.lesson,
    source,
    fileName: source,
    page: block.page,
    status: "draft",
    confidence: block.confidence,
    needsReview: block.needs_review,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 0,
    canonicalQuestion,
    fingerprint: questionFingerprint(canonicalQuestion),
    relatedRuleIds: [],
    ...(block.book_solution ? { bookSolution: block.book_solution } : {}),
    comparison: "not_compared",
  });
}

function inferCorrectionAnalysis(
  item: KnowledgeItem,
  wrongSolution: ApprovedSolution | undefined,
  reason: string,
): ErrorAnalysis {
  const category = item.needsReview
    ? "ocr_error"
    : !wrongSolution
      ? "engine_selection"
      : /صياغ|معطيات|غامض/.test(reason)
        ? "formulation"
        : "missing_rule";
  const labels: Record<ErrorAnalysis["category"], string> = {
    missing_rule: "قاعدة ناقصة أو غير ممثلة في سياق المحرك",
    ocr_error: "خطأ محتمل في قراءة النص أو الرموز",
    engine_selection: "اختيار محرك غير مناسب أو عدم توافر محرك ملائم",
    formulation: "صياغة السؤال أو المعطيات تحتاج تنظيمًا أو توضيحًا",
    unknown: "سبب غير محسوم ويحتاج مراجعة",
  };
  return errorAnalysisSchema.parse({
    category,
    explanation: `${labels[category]}${reason ? `: ${reason}` : ""}. هذا اقتراح آلي بالأنماط ويحتاج اعتمادك.`,
    suggestedRule: `عند ورود مسألة في «${item.unit}» بعنوان «${item.lesson}»، تحقق أولًا من المعطيات والرموز ثم طبّق القاعدة المعتمدة المرتبطة بالسؤال قبل اختيار المحرك.`,
  });
}

function parseIncomingFeedback(value: unknown): IncomingFeedback | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as IncomingFeedback).question === "string" &&
    typeof (value as IncomingFeedback).answerText === "string" &&
    typeof (value as IncomingFeedback).answerLatex === "string" &&
    typeof (value as IncomingFeedback).isCorrect === "boolean" &&
    typeof (value as IncomingFeedback).createdAt === "string"
  )
    return value as IncomingFeedback;
  return undefined;
}

function textSteps(source: string) {
  return source
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((text, index) => ({ title: `الخطوة ${index + 1}`, text }));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("أُلغي التحليل بواسطة المشرف.");
  error.name = "AbortError";
  throw error;
}

function mergeWorkspace(
  localItems: KnowledgeItem[],
  snapshot: KnowledgeSnapshot | null,
): KnowledgeItem[] {
  const map = new Map(localItems.map((item) => [item.id, item]));
  snapshot?.items.forEach((published) => {
    const local = map.get(published.id);
    if (!local || local.status === "published") map.set(published.id, published);
  });
  return [...map.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminLogin(password);
      setPassword("");
      onAuthenticated();
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذّر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="admin-login-page" dir="rtl">
      <section className="admin-login-card">
        <div className="admin-brand-mark" aria-hidden="true">
          ∑
        </div>
        <p className="admin-eyebrow">لوحة تعليم المحرك</p>
        <h1>إدارة المعرفة الرياضية السورية</h1>
        <p>
          أدخل كلمة مرور الإدارة. لا تُخزن كلمة المرور في المتصفح، وتُنشأ جلسة
          محمية في كوكي آمن على الخادم.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            كلمة مرور الإدارة
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          {error && <p className="admin-error-text" role="alert">{error}</p>}
          <button className="admin-primary-button admin-login-button" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="animate-spin" size={17} /> : <LockKeyhole size={17} />}
            دخول آمن
          </button>
        </form>
        <a href="/" className="admin-back-link">العودة إلى الحاسبة</a>
      </section>
    </main>
  );
}

function AnswerPreview({ run }: { run: ExerciseRun }) {
  if (run.state === "idle") return <p className="admin-muted">لم يُشغّل المحرك بعد.</p>;
  if (run.state === "running")
    return <p className="admin-muted"><LoaderCircle className="animate-spin inline" size={14} /> جارٍ تشغيل المحرك الموحد…</p>;
  if (run.state === "error") return <p className="admin-error-text">{run.message}</p>;
  return (
    <div className="admin-answer-preview">
      <p>زمن الحل الفعلي: {Math.round(run.answer.elapsedMs)} مللي ثانية</p>
      {run.answer.results.length === 0 ? (
        <p className="admin-error-text">لم يعطِ المحرك نتيجة؛ لا يمكن اعتماد حل تلقائي.</p>
      ) : (
        run.answer.results.map((result) => (
          <div className="admin-answer-result" key={result.id}>
            <strong>{result.title}</strong>
            <Tex display math={result.finalLatex} />
            <span className={result.verification.passed ? "admin-verified" : "admin-unverified"}>
              {result.verification.passed ? "تم تحقق فعلي" : "غير متحقق"}: {result.verification.method}
            </span>
            {result.steps.length > 0 && (
              <details>
                <summary>خطوات المحرك ({result.steps.length})</summary>
                {result.steps.map((step, index) => (
                  <div key={`${step.title}-${index}`} className="admin-solution-step">
                    <b>{index + 1}. {step.title}</b>
                    {step.text && <p>{step.text}</p>}
                    <Tex display math={step.latex} />
                  </div>
                ))}
              </details>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function AdminApp() {
  const [ui, dispatchUi] = useReducer(adminUiReducer, initialAdminUiState);
  const patchUi = useCallback((patch: Partial<AdminUiState>) => dispatchUi({ patch }), []);
  const { session, tab, notice, error, workspaceBusy, correctionTarget, incomingFeedback, libraryQuery, libraryType, libraryStatus, libraryGrade, libraryUnit, editing, regressionBusy, publishing, publishFailures, publishMessage } = ui;
  const setSession = (value: SessionState) => patchUi({ session: value });
  const setTab = (value: AdminTab) => patchUi({ tab: value });
  const setNotice = (value: string) => patchUi({ notice: value });
  const setError = (value: string) => patchUi({ error: value });
  const setWorkspaceBusy = (value: boolean) => patchUi({ workspaceBusy: value });
  const setCorrectionTarget = (value: CorrectionTarget | null) => patchUi({ correctionTarget: value });
  const setIncomingFeedback = (value: IncomingFeedback | null) => patchUi({ incomingFeedback: value });
  const setLibraryQuery = (value: string) => patchUi({ libraryQuery: value });
  const setLibraryType = (value: KnowledgeItemType | "all") => patchUi({ libraryType: value });
  const setLibraryStatus = (value: KnowledgeItem["status"] | "all") => patchUi({ libraryStatus: value });
  const setLibraryGrade = (value: string) => patchUi({ libraryGrade: value });
  const setLibraryUnit = (value: string) => patchUi({ libraryUnit: value });
  const setEditing = (value: KnowledgeItem | null) => patchUi({ editing: value });
  const setRegressionBusy = (value: boolean) => patchUi({ regressionBusy: value });
  const setPublishing = (value: boolean) => patchUi({ publishing: value });
  const setPublishFailures = (value: RegressionOutcome[]) => patchUi({ publishFailures: value });
  const setPublishMessage = (value: string) => patchUi({ publishMessage: value });

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [settings, setSettings] = useState<SolverSettings>({ ...defaultSolverSettings });
  const [prompt, setPrompt] = useState(DEFAULT_ENGINE_PROMPT);
  const [published, setPublished] = useState<KnowledgeSnapshot | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [runs, setRuns] = useState<Record<string, ExerciseRun>>({});
  const [regression, setRegression] = useState<RegressionOutcome[]>([]);
  const backupInput = useRef<HTMLInputElement>(null);
  const regressionAbort = useRef<AbortController | null>(null);

  const saveItem = useCallback(async (item: KnowledgeItem) => {
    const next = knowledgeItemSchema.parse({ ...item, updatedAt: nowIso() });
    await adminDraftDB.putItem(next);
    setItems((previous) => {
      const index = previous.findIndex((candidate) => candidate.id === next.id);
      if (index < 0) return [next, ...previous];
      const copy = [...previous];
      copy[index] = next;
      return copy.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    });
    return next;
  }, []);

  const refreshRemote = useCallback(async () => {
    const [remoteResult, versionsResult, statsResult, failuresResult, healthResult] = await Promise.allSettled([
      publishedLibrary(),
      getVersions(),
      getAdminStatistics(),
      getFailures(),
      getAdminHealth(),
    ]);
    if (remoteResult.status === "fulfilled") {
      setPublished(remoteResult.value);
      setItems((current) => mergeWorkspace(current, remoteResult.value));
      if (remoteResult.value) await adminDraftDB.putItems(remoteResult.value.items);
    }
    if (versionsResult.status === "fulfilled") setVersions(versionsResult.value);
    if (statsResult.status === "fulfilled") setStats(statsResult.value);
    if (failuresResult.status === "fulfilled") setFailures(failuresResult.value);
    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceBusy(true);
    setError("");
    try {
      const [draftItems, storedSettings, localPrompt, serverPrompt] = await Promise.all([
        adminDraftDB.getItems(),
        adminDraftDB.getSettings(),
        adminDraftDB.getPrompt(),
        getServerPrompt().catch(() => undefined),
      ]);
      setItems(draftItems);
      setSettings(storedSettings);
      setPrompt(serverPrompt ?? localPrompt ?? DEFAULT_ENGINE_PROMPT);
      await refreshRemote();
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر فتح مسودات الإدارة المحلية.");
    } finally {
      setWorkspaceBusy(false);
    }
  }, [refreshRemote]);

  useEffect(() => {
    let active = true;
    void checkAdminSession()
      .then((authenticated) => {
        if (!active) return;
        setSession(authenticated ? "authenticated" : "anonymous");
        if (authenticated) void loadWorkspace();
      })
      .catch(() => {
        if (active) setSession("anonymous");
      });
    return () => {
      active = false;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("syrian-math-admin-feedback");
      if (!raw) return;
      const parsed = parseIncomingFeedback(JSON.parse(raw));
      if (parsed) setIncomingFeedback(parsed);
      sessionStorage.removeItem("syrian-math-admin-feedback");
    } catch {
      // A malformed cross-page helper is ignored rather than blocking Admin.
    }
  }, []);

  useEffect(
    () => () => {
      regressionAbort.current?.abort();
      cancelSolver();
    },
    [],
  );

  const runExercise = useCallback(
    async (item: KnowledgeItem): Promise<ExerciseRun> => {
      if (!["exercise", "example"].includes(item.type)) return { state: "idle" };
      const controller = new AbortController();
      setRuns((previous) => ({ ...previous, [item.id]: { state: "running" } }));
      const relatedRules = items
        .filter((candidate) => candidate.type === "rule" && item.relatedRuleIds.includes(candidate.id))
        .map((rule) => ({
          id: rule.id,
          text: rule.structured || rule.originalText,
          latex: rule.latex || undefined,
          confidence: rule.confidence,
        }));
      try {
        const answer = await solveLocally(
          item.structured || item.originalText,
          {
            angleMode: "DEG",
            disabledEngines: settings.disabledEngines,
            timeoutMs: settings.timeoutMs,
            knowledgeContext: relatedRules,
          },
          () => undefined,
          controller.signal,
        );
        const solution = approvedSolutionFromAnswer(answer);
        const run: ExerciseRun = { state: "complete", answer, ...(solution ? { solution } : {}) };
        setRuns((previous) => ({ ...previous, [item.id]: run }));
        const comparison = item.bookSolution
          ? approvedSolutionsMatch(solution, item.bookSolution)
            ? "matching"
            : "needs_review"
          : "not_compared";
        const updated = knowledgeItemSchema.parse({
          ...item,
          ...(solution ? { approvedSolution: solution } : {}),
          comparison,
          needsReview: item.needsReview || !solution || comparison === "needs_review",
        });
        await saveItem(updated);
        return run;
      } catch (value) {
        const run: ExerciseRun = {
          state: "error",
          message: value instanceof Error ? value.message : "تعذر تشغيل المحرك الموحد.",
        };
        setRuns((previous) => ({ ...previous, [item.id]: run }));
        const updated = knowledgeItemSchema.parse({ ...item, needsReview: true });
        await saveItem(updated);
        return run;
      }
    },
    [items, saveItem, settings],
  );

  const analyzeScannedDocument = useCallback(
    async (document: ScannedDocument, options: DocumentAnalysisOptions = {}) => {
      const chunks = splitDocumentForAnalysis(document, document.text);
      if (!chunks.length) throw new Error("لا يوجد نص صالح لتحليله بعد المسح.");
      const analyses = [] as Awaited<ReturnType<typeof analyzeRemote>>[];
      const attachmentMessage = (document.attachmentMessage ?? "").trim().slice(0, 12_000);
      const warnings = new Set<string>();

      for (const [index, chunk] of chunks.entries()) {
        throwIfAborted(options.signal);
        const currentChunk = index + 1;
        options.onProgress?.({
          currentChunk,
          totalChunks: chunks.length,
          label: `تحليل الجزء ${currentChunk} من ${chunks.length} من كامل الملف…`,
        });
        const analysis = await analyzeRemote(
          {
            text: chunk.text,
            source:
              chunks.length > 1
                ? `${document.fileName} — الجزء ${currentChunk} من ${chunks.length}`
                : document.fileName,
            pageHints: chunk.pageHints,
            attachmentMessage,
          },
          options.signal,
        );
        throwIfAborted(options.signal);
        analyses.push(analysis);
        analysis.warnings.forEach((warning) => warnings.add(warning));
      }

      // Store after all chunks finish. An aborted or failed long analysis never
      // leaves a misleading partial set of "learned" knowledge behind.
      const created = analyses.flatMap((analysis) =>
        analysis.blocks.map((block) => createItemFromBlock(block, document.fileName)),
      );
      if (!created.length) throw new Error("لم يُرجع التحليل أي عناصر قابلة للمراجعة.");
      throwIfAborted(options.signal);
      // IndexedDB writes the complete collection in one transaction. Once this
      // commit starts, finish it and report completion rather than claiming a
      // cancellation while durable knowledge has already been written.
      await adminDraftDB.putItems(created);
      setItems((previous) => [...created, ...previous]);
      const modes = new Set(analyses.map((analysis) => analysis.mode));
      const runnable = created.filter((item) => item.type === "exercise" || item.type === "example");
      const automaticPreviewLimit = 20;
      const deferredRuns = Math.max(0, runnable.length - automaticPreviewLimit);
      setNotice(
        `استخرج تحليل كامل الملف ${created.length} عنصرًا من ${chunks.length} جزء${
          chunks.length === 1 ? "" : "ًا"
        } بأسلوب ${modes.has("ai") ? "الذكاء الاصطناعي" : "الأنماط المحلية"}.${
          deferredRuns
            ? ` شُغِّلت أول ${automaticPreviewLimit} مسائل فقط لحماية المتصفح؛ شغّل البقية من المكتبة أو عبر الاختبار الشامل قبل النشر.`
            : ""
        }`,
      );
      setError(warnings.size ? [...warnings].join(" ") : "");
      for (const item of runnable.slice(0, automaticPreviewLimit)) void runExercise(item);
    },
    [runExercise],
  );

  const saveManualTraining = useCallback(
    async (input: ManualTrainingInput) => {
      const timestamp = nowIso();
      const canonicalQuestion = canonicalizeQuestion(input.question);
      const rule = knowledgeItemSchema.parse({
        id: makeId("manual-rule"),
        type: "rule",
        originalText: `تدريب يدوي — سؤال نموذجي:\n${input.question}\n\nالطريقة المعتمدة من المشرف:\n${input.method}`,
        structured: input.method,
        latex: "",
        grade: input.grade,
        unit: input.unit,
        lesson: input.lesson,
        source: "تدريب يدوي يكتبه المشرف",
        fileName: "تدريب يدوي",
        page: 1,
        status: "approved",
        confidence: 1,
        needsReview: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 0,
        canonicalQuestion,
        fingerprint: questionFingerprint(canonicalQuestion),
        relatedRuleIds: [],
        comparison: "not_compared",
      });
      const example = knowledgeItemSchema.parse({
        id: makeId("manual-example"),
        type: "example",
        originalText: input.question,
        // The example must remain an actual solver question for the mandatory
        // regression gate. The method lives in its related rule as context.
        structured: input.question,
        latex: "",
        grade: input.grade,
        unit: input.unit,
        lesson: input.lesson,
        source: "تدريب يدوي يكتبه المشرف",
        fileName: "تدريب يدوي",
        page: 1,
        status: input.approveExample ? "approved" : "draft",
        confidence: 1,
        needsReview: !input.approveExample,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 0,
        canonicalQuestion,
        fingerprint: questionFingerprint(canonicalQuestion),
        relatedRuleIds: [rule.id],
        approvedSolution: {
          ...(input.answerText ? { answerText: input.answerText } : {}),
          ...(input.answerLatex ? { answerLatex: input.answerLatex } : {}),
          steps: textSteps(input.steps),
          verification: {
            passed: false,
            method: "حل أدخله المشرف يدويًا؛ لم يتحقق منه المحرك بعد.",
          },
        },
        comparison: "not_compared",
      });
      await adminDraftDB.putItems([rule, example]);
      setItems((previous) => [rule, example, ...previous]);
      setNotice(
        input.approveExample
          ? "حُفظت قاعدة التدريب والمثال كمعتمدين محليًا. سيجري اختبار المحرك إلزاميًا قبل النشر."
          : "حُفظت قاعدة التدريب كمعتمدة محليًا والمثال كمسودة للمراجعة؛ لا توجد نتيجة متحققة مدعاة.",
      );
      setError("");
      setTab("library");
    },
    [],
  );

  const approveEngineSolution = async (item: KnowledgeItem) => {
    const run = runs[item.id];
    const solution = run?.state === "complete" ? run.solution : item.approvedSolution;
    if (!solution) {
      setError("لا يوجد حل فعلي من المحرك لاعتماده. شغّل التمرين أو أضف تصحيحًا يدويًا.");
      return;
    }
    await saveItem(knowledgeItemSchema.parse({ ...item, status: "approved", approvedSolution: solution }));
    setNotice("أصبح العنصر معتمدًا محليًا وجاهزًا للنشر.");
  };

  const acceptIncomingFeedback = async () => {
    if (!incomingFeedback) return;
    const timestamp = nowIso();
    const canonicalQuestion = canonicalizeQuestion(incomingFeedback.question);
    const generated = knowledgeItemSchema.parse({
      id: makeId("feedback"),
      type: "exercise",
      originalText: incomingFeedback.question,
      structured: incomingFeedback.question,
      latex: incomingFeedback.answerLatex,
      grade: "غير محدد",
      unit: "غير محددة",
      lesson: "تعليم من إجابة التطبيق",
      source: "تقييم من واجهة الحاسبة",
      fileName: "تقييم مباشر",
      page: 1,
      status: incomingFeedback.isCorrect ? "approved" : "draft",
      confidence: 1,
      needsReview: !incomingFeedback.isCorrect,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 0,
      canonicalQuestion,
      fingerprint: questionFingerprint(canonicalQuestion),
      relatedRuleIds: [],
      approvedSolution: {
        answerText: incomingFeedback.answerText,
        answerLatex: incomingFeedback.answerLatex || undefined,
        steps: [],
      },
      comparison: "not_compared",
    });
    await saveItem(generated);
    setIncomingFeedback(null);
    if (incomingFeedback.isCorrect) {
      setNotice("حُفظت الإجابة المصححة كتمرين معتمد محليًا؛ انشرها عندما تكون جاهزًا.");
      setTab("library");
    } else {
      setCorrectionTarget({ item: generated, wrongSolution: generated.approvedSolution });
    }
  };

  const deleteItem = async (item: KnowledgeItem) => {
    if (!window.confirm(`حذف «${item.originalText.slice(0, 70)}» من المسودات المحلية؟`)) return;
    await adminDraftDB.deleteItem(item.id);
    setItems((previous) => previous.filter((candidate) => candidate.id !== item.id));
    setRuns((previous) => {
      const copy = { ...previous };
      delete copy[item.id];
      return copy;
    });
    setNotice("حُذف العنصر من مساحة العمل المحلية. لا يتغير أي إصدار منشور حتى تنشر نسخة جديدة.");
  };

  const comprehensiveTest = useCallback(async (): Promise<RegressionOutcome[]> => {
    // An approved item without an answer is a real regression too; never skip it.
    const testable = items.filter(
      (item) =>
        ["approved", "published"].includes(item.status) &&
        ["example", "exercise", "correction"].includes(item.type),
    );
    const controller = new AbortController();
    regressionAbort.current?.abort();
    regressionAbort.current = controller;
    setRegressionBusy(true);
    setRegression([]);
    const outcomes: RegressionOutcome[] = [];
    try {
      for (const item of testable) {
        if (controller.signal.aborted) throw new DOMException("أُلغي الاختبار الشامل.", "AbortError");
        const started = performance.now();
        if (!item.approvedSolution) {
          outcomes.push({
            itemId: item.id,
            passed: false,
            elapsedMs: 0,
            message: "العنصر المعتمد لا يحتوي حلًا معتمدًا صالحًا ليُقارن بالمحرك.",
          });
          setRegression([...outcomes]);
          continue;
        }
        try {
          const answer = await solveLocally(
            item.structured || item.originalText,
            {
              angleMode: "DEG",
              disabledEngines: settings.disabledEngines,
              timeoutMs: settings.timeoutMs,
            },
            () => undefined,
            controller.signal,
          );
          const actual = approvedSolutionFromAnswer(answer);
          const passed = approvedSolutionsMatch(actual, item.approvedSolution);
          outcomes.push({
            itemId: item.id,
            passed,
            elapsedMs: Math.round(performance.now() - started),
            message: passed
              ? `نجح: ${item.unit} — ${item.lesson}`
              : "اختلفت نتيجة المحرك أو صيغتها عن الحل المعتمد؛ يحتاج مراجعة بشرية.",
          });
        } catch (value) {
          outcomes.push({
            itemId: item.id,
            passed: false,
            elapsedMs: Math.round(performance.now() - started),
            message: value instanceof Error ? value.message : "فشل تشغيل المثال.",
          });
        }
        setRegression([...outcomes]);
      }
      if (!testable.length) setNotice("لا توجد أمثلة أو تمارين أو تصحيحات معتمدة لاختبارها بعد.");
      else {
        const failed = outcomes.filter((outcome) => !outcome.passed).length;
        setNotice(
          failed
            ? `اكتمل الاختبار الشامل مع ${failed} إخفاقات؛ سيبقى النشر مقفلاً حتى إصلاحها.`
            : `اكتمل اختبار ${testable.length} عنصرًا فعليًا على المحرك الموحد دون انحدار.`,
        );
      }
      return outcomes;
    } finally {
      if (regressionAbort.current === controller) regressionAbort.current = null;
      setRegressionBusy(false);
    }
  }, [items, settings]);

  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    setError("");
    setPublishMessage("");
    try {
      // A fresh complete test is mandatory for every publish; cached reports are never reused.
      const outcomes = await comprehensiveTest();
      const failures = outcomes.filter((outcome) => !outcome.passed);
      if (failures.length) {
        setPublishFailures(failures);
        setError("فشل اختبار الانحدار الإلزامي؛ لم يُرسل أي نشر إلى الخادم.");
        return;
      }
      // Drafts are intentionally local and can exceed the published snapshot
      // capacity after a full-book scan. Send only reviewed knowledge; the
      // server separately retains and regression-tests the prior published set.
      const publishableItems = items.filter(
        (item) => item.status === "approved" || item.status === "published",
      );
      if (publishableItems.length > 2_000)
        throw new Error("عدد العناصر المعتمدة يتجاوز حد النسخة المنشورة (2000). قسّم الاعتماد إلى دفعات مراجعة أصغر.");
      const result = await publishKnowledge({
        items: publishableItems,
        settings,
        regression: outcomes,
      });
      const updated = items.map((item) =>
        item.status === "approved" || item.status === "published"
          ? knowledgeItemSchema.parse({ ...item, status: "published", version: result.version })
          : item,
      );
      await adminDraftDB.replaceItems(updated);
      setItems(updated);
      setPublishFailures([]);
      setPublishMessage(
        `تم نشر ${result.itemCount} عنصرًا في النسخة ${result.version} خلال ${Math.round(result.elapsedMs)} مللي ثانية بعد اجتياز اختبار الانحدار الإلزامي.`,
      );
      await refreshRemote();
    } catch (value) {
      if (value instanceof AdminApiError && value.status === 409) {
        const failures =
          value.body &&
          typeof value.body === "object" &&
          "failures" in value.body &&
          Array.isArray(value.body.failures)
            ? value.body.failures
                .map((entry) => {
                  const parsed = z
                    .object({
                      itemId: z.string(),
                      passed: z.boolean(),
                      message: z.string(),
                      elapsedMs: z.number(),
                    })
                    .safeParse(entry);
                  return parsed.success ? parsed.data : undefined;
                })
                .filter((entry): entry is RegressionOutcome => Boolean(entry))
            : [];
        setPublishFailures(failures);
        setError(value.message);
      } else setError(value instanceof Error ? value.message : "تعذر النشر.");
    } finally {
      setPublishing(false);
    }
  };

  const saveSettings = async (next: SolverSettings) => {
    const parsed = solverSettingsSchema.parse(next);
    const safe: SolverSettings = {
      ...parsed,
      disabledEngines: parsed.disabledEngines.filter(
        (engine): engine is EngineId => Object.prototype.hasOwnProperty.call(ENGINE_LABELS, engine),
      ),
    };
    await adminDraftDB.saveSettings(safe);
    setSettings(safe);
    setNotice("حُفظت إعدادات المحرك محليًا. تصبح عامة لكل الزوار عند نشر نسخة معرفة جديدة.");
  };

  const savePrompt = async () => {
    try {
      await adminDraftDB.savePrompt(prompt);
      await saveServerPrompt(prompt);
      setNotice("حُفظ البرومبت في الخادم وفي مسودات هذا الجهاز.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ البرومبت.");
    }
  };

  const exportBackup = () => {
    const payload = JSON.stringify({ items, settings }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `syrian-math-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = backupSchema.parse(JSON.parse(await file.text()));
      await adminDraftDB.replaceItems(parsed.items);
      await adminDraftDB.saveSettings({
        ...parsed.settings,
        disabledEngines: parsed.settings.disabledEngines.filter(
          (engine): engine is EngineId => Object.prototype.hasOwnProperty.call(ENGINE_LABELS, engine),
        ),
      });
      setItems(parsed.items);
      setSettings({
        ...parsed.settings,
        disabledEngines: parsed.settings.disabledEngines.filter(
          (engine): engine is EngineId => Object.prototype.hasOwnProperty.call(ENGINE_LABELS, engine),
        ),
      });
      setNotice("استُوردت النسخة الاحتياطية إلى المسودات المحلية. لا تُنشر تلقائيًا.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "ملف النسخة الاحتياطية غير صالح.");
    }
  };

  const rollback = async (version: number) => {
    if (!window.confirm(`هل تريد جعل النسخة ${version} هي النسخة الحالية للزوار؟`)) return;
    try {
      await rollbackVersion(version);
      setNotice(`تم التراجع إلى النسخة ${version}. ستلتقطها التطبيقات عند التحديث أو انتهاء ذاكرة التخزين المؤقت.`);
      await refreshRemote();
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر التراجع.");
    }
  };

  const teachFailure = (failure: FailureRecord) => {
    const timestamp = nowIso();
    const canonicalQuestion = canonicalizeQuestion(failure.sampleQuestion);
    const item = knowledgeItemSchema.parse({
      id: makeId("failure"),
      type: "exercise",
      originalText: failure.sampleQuestion,
      structured: failure.sampleQuestion,
      latex: "",
      grade: "غير محدد",
      unit: "من سجل الإخفاقات",
      lesson: "تعليم سؤال متكرر",
      source: "سجل الإخفاقات",
      fileName: "سجل الإخفاقات",
      page: 1,
      status: "draft",
      confidence: 1,
      needsReview: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 0,
      canonicalQuestion,
      fingerprint: questionFingerprint(canonicalQuestion),
      relatedRuleIds: [],
      comparison: "not_compared",
    });
    void saveItem(item);
    setTab("library");
    void runExercise(item);
    setNotice("أضيف سؤال الإخفاق كمسودة وبدأ تشغيل المحرك عليه. صحح النتيجة أو اعتمدها من المكتبة.");
  };

  const filteredItems = useMemo(() => {
    const query = libraryQuery.trim().toLocaleLowerCase("ar");
    return items.filter((item) => {
      const haystack = `${item.originalText} ${item.structured} ${item.grade} ${item.unit} ${item.lesson}`.toLocaleLowerCase("ar");
      return (
        (!query || haystack.includes(query)) &&
        (libraryType === "all" || item.type === libraryType) &&
        (libraryStatus === "all" || item.status === libraryStatus) &&
        (libraryGrade === "all" || item.grade === libraryGrade) &&
        (libraryUnit === "all" || item.unit === libraryUnit)
      );
    });
  }, [items, libraryGrade, libraryQuery, libraryStatus, libraryType, libraryUnit]);

  const gaps = useMemo(() => findCurriculumGaps(items), [items]);
  const grades = useMemo(() => [...new Set(items.map((item) => item.grade))].sort(), [items]);
  const units = useMemo(
    () => [...new Set(items.filter((item) => libraryGrade === "all" || item.grade === libraryGrade).map((item) => item.unit))].sort(),
    [items, libraryGrade],
  );

  if (session === "checking")
    return (
      <main className="admin-login-page" dir="rtl">
        <p className="admin-loading"><LoaderCircle className="animate-spin" /> التحقق من جلسة الإدارة…</p>
      </main>
    );
  if (session === "anonymous")
    return <AdminLogin onAuthenticated={() => setSession("authenticated")} />;

  return (
    <div className="admin-app" dir="rtl">
      <header className="admin-header">
        <a className="admin-logo" href="/" aria-label="العودة إلى الحاسبة">
          <span>∑</span>
          <div><strong>تعليم المحرك</strong><small>منهاج سوريا</small></div>
        </a>
        <div className="admin-header-actions">
          {workspaceBusy && <LoaderCircle className="animate-spin" size={18} />}
          <button className="admin-secondary-button" type="button" onClick={() => void loadWorkspace()}>
            <RotateCcw size={15} /> تحديث
          </button>
          <button
            className="admin-secondary-button"
            type="button"
            onClick={() => {
              if (!window.confirm("إنهاء كل جلسات الإدارة على جميع الأجهزة؟")) return;
              void adminLogoutAll().finally(() => setSession("anonymous"));
            }}
          >
            <LogOut size={15} /> خروج من كل الأجهزة
          </button>
          <button
            className="admin-secondary-button"
            type="button"
            onClick={() => void adminLogout().finally(() => setSession("anonymous"))}
          >
            <LogOut size={15} /> خروج
          </button>
        </div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="أقسام لوحة الإدارة">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "is-active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
          <div className="admin-nav-note">
            <ShieldCheck size={16} />
            المسودات على هذا الجهاز؛ النشر فقط يصل إلى Redis.
          </div>
        </nav>
        <main className="admin-content">
          {(notice || error) && (
            <div className={`admin-alert ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>
              {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span>{error || notice}</span>
              <button type="button" aria-label="إخفاء الرسالة" onClick={() => { setNotice(""); setError(""); }}><X size={16} /></button>
            </div>
          )}

          {incomingFeedback && (
            <section className="admin-feedback-banner">
              <div>
                <strong>{incomingFeedback.isCorrect ? "وصل تقييم: الحل صحيح" : "وصل تقييم: الحل خطأ"}</strong>
                <p>{incomingFeedback.question}</p>
              </div>
              <button className="admin-primary-button" type="button" onClick={() => void acceptIncomingFeedback()}>
                <Plus size={16} /> {incomingFeedback.isCorrect ? "أضفه كحل معتمد" : "أضف التصحيح الآن"}
              </button>
              <button className="admin-icon-button" type="button" onClick={() => setIncomingFeedback(null)}><X size={17} /></button>
            </section>
          )}

          {tab === "overview" && (
            <OverviewTab
              items={items}
              published={published}
              stats={stats}
              failures={failures}
              health={health}
              gaps={gaps}
              onRefresh={() => void refreshRemote()}
            />
          )}

          {tab === "scan" && <ScanTab onAnalyze={analyzeScannedDocument} onSaveManualTraining={saveManualTraining} />}

          {tab === "workspace" && (
            <WorkspaceTab
              items={items}
              onSaveItem={saveItem}
              onNotice={setNotice}
            />
          )}

          {tab === "practice" && <PracticeTab items={items} settings={settings} />}

          {tab === "library" && (
            <LibraryTab
              itemCount={items.length}
              resultCount={filteredItems.length}
              query={libraryQuery}
              type={libraryType}
              status={libraryStatus}
              grade={libraryGrade}
              unit={libraryUnit}
              grades={grades}
              units={units}
              itemTypeLabels={itemTypeLabels}
              statusLabels={statusLabels}
              onQuery={setLibraryQuery}
              onType={setLibraryType}
              onStatus={setLibraryStatus}
              onGrade={(value) => { setLibraryGrade(value); setLibraryUnit("all"); }}
              onUnit={setLibraryUnit}
            >
              <div className="admin-library-list">
                {filteredItems.map((item) => {
                  const run = runs[item.id] ?? { state: "idle" as const };
                  return (
                    <article className="admin-library-card" key={item.id}>
                      <div className="admin-item-meta">
                        <span className={`admin-type-tag type-${item.type}`}>{itemTypeLabels[item.type]}</span>
                        <span className={`admin-status-tag status-${item.status}`}>{statusLabels[item.status]}</span>
                        {item.needsReview && <span className="admin-review-tag">يحتاج مراجعة</span>}
                        {item.comparison === "matching" && <span className="admin-match-tag">حل الكتاب مطابق</span>}
                        {item.comparison === "needs_review" && <span className="admin-review-tag">حل الكتاب يحتاج مراجعة</span>}
                        {item.relations.length > 0 && <span className="admin-type-tag">{item.relations.length} علاقات دلالية</span>}
                        {item.evidence.some((entry) => entry.passed) && <span className="admin-match-tag">دليل تحقق مسجل</span>}
                        {item.learningLog.length > 0 && <span className="admin-type-tag">سجل تعلم {item.learningLog.length}</span>}
                      </div>
                      <h2>{item.lesson}</h2>
                      <p className="admin-item-context">{item.grade} · {item.unit} · {item.source} · ص{item.page}</p>
                      <p className="admin-source-reference"><b>مرجع المصدر:</b> الكتاب/المصدر {item.source} · الجزء/الملف {item.fileName} · الصفحة {item.page}</p>
                      <p className="admin-item-text">{item.originalText}</p>
                      {(item.type === "exercise" || item.type === "example") && <AnswerPreview run={run} />}
                      <div className="admin-card-actions">
                        {(item.type === "exercise" || item.type === "example") && (
                          <button type="button" className="admin-secondary-button" onClick={() => void runExercise(item)}><Play size={15} /> تشغيل المحرك</button>
                        )}
                        {(item.type === "exercise" || item.type === "example") && (
                          <button type="button" className="admin-correct-button" onClick={() => void approveEngineSolution(item)}><Check size={16} /> الحل صحيح</button>
                        )}
                        {(item.type === "exercise" || item.type === "example") && (
                          <button type="button" className="admin-wrong-button" onClick={() => setCorrectionTarget({ item, wrongSolution: run.state === "complete" ? run.solution : item.approvedSolution })}><AlertTriangle size={16} /> الحل خطأ</button>
                        )}
                        <button type="button" className="admin-secondary-button" onClick={() => setEditing(item)}><FilePenLine size={15} /> تعديل</button>
                        <button type="button" className="admin-danger-button" onClick={() => void deleteItem(item)}><Trash2 size={15} /> حذف</button>
                      </div>
                    </article>
                  );
                })}
                {!filteredItems.length && <p className="admin-empty-state">لا توجد عناصر مطابقة للتصفية الحالية.</p>}
              </div>
            </LibraryTab>
          )}

          {tab === "publish" && (
            <PublishTab
              items={items}
              versions={versions}
              published={published}
              publishing={publishing}
              regressionBusy={regressionBusy}
              publishMessage={publishMessage}
              publishFailures={publishFailures}
              backupInput={backupInput}
              onPublish={() => void publish()}
              onRollback={(version) => void rollback(version)}
              onExport={exportBackup}
              onImport={(event) => void importBackup(event)}
              onRequestImport={() => backupInput.current?.click()}
            />
          )}

          {tab === "monitor" && (
            <MonitorTab
              failures={failures}
              regression={regression}
              regressionBusy={regressionBusy}
              onStartRegression={() => void comprehensiveTest()}
              onCancelRegression={() => regressionAbort.current?.abort()}
              onTeachFailure={teachFailure}
              onRemoveFailure={(fingerprint) => {
                void removeFailure(fingerprint).then(() => setFailures((old) => old.filter((value) => value.fingerprint !== fingerprint)));
              }}
            />
          )}

          {tab === "settings" && (
            <SettingsTab
              settings={settings}
              prompt={prompt}
              engineLabels={ENGINE_LABELS}
              onSaveSettings={(next) => void saveSettings(next)}
              onPromptChange={setPrompt}
              onRestorePrompt={() => setPrompt(DEFAULT_ENGINE_PROMPT)}
              onSavePrompt={() => void savePrompt()}
            />
          )}
        </main>
      </div>
      {editing && <KnowledgeEditor item={editing} onClose={() => setEditing(null)} onSave={async (item) => { await saveItem(item); setEditing(null); setNotice("حُفظ تعديل العنصر في المسودات المحلية."); }} />}
      {correctionTarget && <CorrectionDialog target={correctionTarget} onClose={() => setCorrectionTarget(null)} onSave={async (correction) => { await saveItem(correction); setNotice("حُفظ التصحيح مع المثال السلبي. يمكنك اعتماد القاعدة المقترحة الآن بضغطة واحدة."); }} onAcceptSuggestedRule={async (correction) => {
        if (!correction.errorAnalysis) return;
        const timestamp = nowIso();
        const rule = knowledgeItemSchema.parse({
          id: makeId("rule"), type: "rule", originalText: correction.errorAnalysis.suggestedRule, structured: correction.errorAnalysis.suggestedRule, latex: "", grade: correction.grade, unit: correction.unit, lesson: `قاعدة وقائية: ${correction.lesson}`, source: "اقتراح بعد تصحيح", fileName: correction.fileName, page: correction.page, status: "approved", confidence: 0.8, needsReview: false, createdAt: timestamp, updatedAt: timestamp, version: 0, canonicalQuestion: canonicalizeQuestion(correction.errorAnalysis.suggestedRule), fingerprint: questionFingerprint(canonicalizeQuestion(correction.errorAnalysis.suggestedRule)), relatedRuleIds: [], comparison: "not_compared",
        });
        await saveItem(rule);
        setNotice("أضيفت القاعدة المقترحة كعنصر معتمد محليًا.");
      }} />}
    </div>
  );
}

function KnowledgeEditor({
  item,
  onClose,
  onSave,
}: {
  item: KnowledgeItem;
  onClose: () => void;
  onSave: (item: KnowledgeItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const canonicalQuestion = canonicalizeQuestion(draft.structured || draft.originalText);
      await onSave(
        knowledgeItemSchema.parse({
          ...draft,
          ...(item.status === "published" ? { status: "draft", version: 0 } : {}),
          canonicalQuestion,
          fingerprint: questionFingerprint(canonicalQuestion),
        }),
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ التعديل.");
    }
  };
  return (
    <div className="admin-modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-item-heading">
      <form className="admin-modal" onSubmit={(event) => void save(event)}>
        <header><h2 id="edit-item-heading">تعديل عنصر المعرفة</h2><button type="button" className="admin-icon-button" onClick={onClose}><X size={18} /></button></header>
        <div className="admin-modal-body">
          <div className="admin-form-grid">
            <label>النوع<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as KnowledgeItemType })}>{Object.entries(itemTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>الحالة<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as KnowledgeItem["status"] })}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>الصف<input value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })} /></label>
            <label>الوحدة<input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} /></label>
            <label>الدرس<input value={draft.lesson} onChange={(event) => setDraft({ ...draft, lesson: event.target.value })} /></label>
            <label>الصفحة<input type="number" min="1" value={draft.page} onChange={(event) => setDraft({ ...draft, page: Number(event.target.value) })} /></label>
            <label>الثقة<input type="number" min="0" max="1" step="0.01" value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })} /></label>
          </div>
          <label>النص الأصلي<textarea rows={5} value={draft.originalText} onChange={(event) => setDraft({ ...draft, originalText: event.target.value })} /></label>
          <label>الصياغة المنظمة<textarea rows={5} value={draft.structured} onChange={(event) => setDraft({ ...draft, structured: event.target.value })} /></label>
          <label>LaTeX<textarea rows={3} dir="ltr" value={draft.latex} onChange={(event) => setDraft({ ...draft, latex: event.target.value })} /></label>
          <label className="admin-toggle"><input type="checkbox" checked={draft.needsReview} onChange={(event) => setDraft({ ...draft, needsReview: event.target.checked })} /><span>يحتاج مراجعة بشرية</span></label>
          {error && <p className="admin-error-text">{error}</p>}
        </div>
        <footer><button type="button" className="admin-secondary-button" onClick={onClose}>إلغاء</button><button type="submit" className="admin-primary-button"><Save size={15} /> حفظ</button></footer>
      </form>
    </div>
  );
}

function CorrectionDialog({
  target,
  onClose,
  onSave,
  onAcceptSuggestedRule,
}: {
  target: CorrectionTarget;
  onClose: () => void;
  onSave: (item: KnowledgeItem) => Promise<void>;
  onAcceptSuggestedRule: (item: KnowledgeItem) => Promise<void>;
}) {
  const [answerText, setAnswerText] = useState("");
  const [answerLatex, setAnswerLatex] = useState("");
  const [steps, setSteps] = useState("");
  const [reason, setReason] = useState("قاعدة ناقصة أو تطبيق غير صحيح.");
  const [scanState, setScanState] = useState("");
  const [error, setError] = useState("");
  const [savedCorrection, setSavedCorrection] = useState<KnowledgeItem | null>(null);
  const scanner = useRef<AbortController | null>(null);
  useEffect(() => () => scanner.current?.abort(), []);
  const scanCorrection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    scanner.current?.abort();
    const controller = new AbortController();
    scanner.current = controller;
    setScanState("بدء مسح صورة/ملف التصحيح…");
    setError("");
    try {
      const document = await scanDocument(file, controller.signal, (progress) => setScanState(progress.label));
      if (controller.signal.aborted) return;
      setAnswerText((previous) => `${previous}${previous ? "\n" : ""}${document.text}`);
      setScanState("أُدرج النص الممسوح في حقل الجواب. راجعه قبل الحفظ.");
    } catch (value) {
      if (!controller.signal.aborted) setError(value instanceof Error ? value.message : "تعذر مسح التصحيح.");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!answerText.trim() && !answerLatex.trim()) {
      setError("اكتب الجواب الصحيح أو الصيغة LaTex قبل الحفظ.");
      return;
    }
    try {
      const timestamp = nowIso();
      const analysis = inferCorrectionAnalysis(target.item, target.wrongSolution, reason);
      const correction = knowledgeItemSchema.parse({
        id: makeId("correction"),
        type: "correction",
        originalText: target.item.originalText,
        structured: `تصحيح معتمد: ${answerText || answerLatex}`,
        latex: answerLatex,
        grade: target.item.grade,
        unit: target.item.unit,
        lesson: target.item.lesson,
        source: target.item.source,
        fileName: target.item.fileName,
        page: target.item.page,
        status: "approved",
        confidence: 1,
        needsReview: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 0,
        canonicalQuestion: target.item.canonicalQuestion,
        fingerprint: target.item.fingerprint,
        relatedRuleIds: target.item.relatedRuleIds,
        approvedSolution: {
          ...(answerText.trim() ? { answerText: answerText.trim() } : {}),
          ...(answerLatex.trim() ? { answerLatex: answerLatex.trim() } : {}),
          steps: textSteps(steps),
        },
        ...(target.wrongSolution
          ? {
              negativeExample: {
                answerText: target.wrongSolution.answerText || target.wrongSolution.answerLatex || "لم ينتج جواب قابل للنسخ",
                ...(target.wrongSolution.answerLatex ? { answerLatex: target.wrongSolution.answerLatex } : {}),
                reason,
                createdAt: timestamp,
              },
            }
          : {}),
        errorAnalysis: analysis,
        comparison: "not_compared",
      });
      await onSave(correction);
      setSavedCorrection(correction);
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ التصحيح.");
    }
  };
  return (
    <div className="admin-modal-layer" role="dialog" aria-modal="true" aria-labelledby="correction-heading">
      <form className="admin-modal admin-correction-modal" onSubmit={(event) => void submit(event)}>
        <header><div><p className="admin-eyebrow">تصحيح بأولوية عليا</p><h2 id="correction-heading">الحل الصحيح للتمرين</h2></div><button type="button" className="admin-icon-button" onClick={onClose}><X size={18} /></button></header>
        <div className="admin-modal-body">
          <p className="admin-item-text">{target.item.originalText}</p>
          <label>الجواب والخطوات الصحيحة (نص)<textarea rows={5} value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder="اكتب الجواب المعتمد هنا…" /></label>
          <label>صيغة LaTeX إن وجدت<textarea rows={3} dir="ltr" value={answerLatex} onChange={(event) => setAnswerLatex(event.target.value)} /></label>
          <label>خطوات مفصّلة (كل سطر خطوة)<textarea rows={5} value={steps} onChange={(event) => setSteps(event.target.value)} /></label>
          <label>سبب الخطأ<select value={reason} onChange={(event) => setReason(event.target.value)}><option>قاعدة ناقصة أو تطبيق غير صحيح.</option><option>خطأ في القراءة أو OCR.</option><option>اختيار المحرك غير مناسب.</option><option>صياغة السؤال أو المعطيات ملتبسة.</option></select></label>
          <div className="admin-correction-scan"><label className="admin-secondary-button"><Upload size={15} /> مسح صورة أو PDF للتصحيح<input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void scanCorrection(event)} /></label>{scanState && <span>{scanState}</span>}{scanner.current && <button className="admin-icon-button" type="button" onClick={() => scanner.current?.abort()}><X size={15} /></button>}</div>
          {error && <p className="admin-error-text">{error}</p>}
          <div className="admin-suggested-rule"><CircleHelp size={17} /><div><strong>قاعدة مقترحة بعد التصحيح</strong><p>{inferCorrectionAnalysis(target.item, target.wrongSolution, reason).suggestedRule}</p>{savedCorrection ? <button type="button" className="admin-correct-button" onClick={() => { void onAcceptSuggestedRule(savedCorrection).then(onClose).catch((value: unknown) => setError(value instanceof Error ? value.message : "تعذر اعتماد القاعدة المقترحة.")); }}>اعتماد القاعدة المقترحة</button> : <span>احفظ التصحيح أولًا، ثم اعتمد القاعدة المقترحة بضغطة واحدة.</span>}</div></div>
        </div>
        <footer><button type="button" className="admin-secondary-button" onClick={onClose}>إلغاء</button><button type="submit" className="admin-primary-button"><Save size={15} /> حفظ التصحيح واعتماده</button></footer>
      </form>
    </div>
  );
}
