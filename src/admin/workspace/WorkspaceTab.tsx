import "./workspace.css";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Bot,
  BrainCircuit,
  FileImage,
  FilePlus2,
  GitBranch,
  ImagePlus,
  LoaderCircle,
  MessageCircleQuestion,
  Network,
  Plus,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { Tex } from "../../ui/Tex";
import { parseLatex, printLatexDocument } from "../../brain/latex";
import {
  relationLabels,
  relationTypeSchema,
  type RelationType,
} from "../../brain/semantic/relations";
import {
  understandingFromEvidence,
  verificationEvidenceSchema,
  type UnderstandingLevel,
  type VerificationEvidence,
} from "../../brain/semantic/statement";
import { chatWithAdminBrain } from "../api";
import { adminDraftDB } from "../indexedDB";
import {
  knowledgeItemSchema,
  type AdminChatMessage,
  type KnowledgeItem,
} from "../types";
import {
  workspaceSessionSchema,
  type WorkspaceSession,
  type WorkspaceToolLog,
} from "./types";

const MAX_LOCAL_IMAGE_BYTES = 2 * 1024 * 1024;

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeSession(): WorkspaceSession {
  const timestamp = nowIso();
  return workspaceSessionSchema.parse({
    id: makeId("brain-session"),
    title: "جلسة عقل جديدة",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    toolLog: [],
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function inspect(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 9_000 ? `${serialized.slice(0, 9_000)}\n… اقتُطع العرض المحلي.` : serialized;
  } catch {
    return "تعذر عرض خرج الأداة بصيغة JSON.";
  }
}

function actualEvidence(logs: WorkspaceToolLog[]): VerificationEvidence[] {
  return logs.flatMap((entry) => {
    const output = asRecord(entry.result.output);
    const parsed = output ? verificationEvidenceSchema.safeParse(output.evidence) : undefined;
    return parsed?.success ? [parsed.data] : [];
  });
}

function latestMessage(messages: AdminChatMessage[], role: AdminChatMessage["role"]): string {
  return [...messages].reverse().find((message) => message.role === role)?.content ?? "";
}

function pageImageFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة صورة الصفحة محليًا."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("صيغة صورة الصفحة غير صالحة."));
    reader.readAsDataURL(file);
  });
}

const understandingLabels: Record<UnderstandingLevel, string> = {
  verified_understood: "مفهوم بدليل فعلي",
  understood_unverified: "مفهوم دون دليل تحقق",
  partial: "فهم جزئي",
  not_understood: "لم أفهم بعد",
};

export function WorkspaceTab({
  items,
  onSaveItem,
  onNotice,
}: {
  items: KnowledgeItem[];
  onSaveItem: (item: KnowledgeItem) => Promise<unknown>;
  onNotice: (message: string) => void;
}) {
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("uses");
  const active = sessions.find((session) => session.id === activeId) ?? null;
  const selectedItem = items.find((item) => item.id === active?.selectedItemId) ?? null;
  const evidence = useMemo(() => actualEvidence(active?.toolLog ?? []), [active?.toolLog]);
  const latestQuestion = latestMessage(active?.messages ?? [], "user");
  const latestSuggestion = latestMessage(active?.messages ?? [], "assistant");
  const latexInspection = useMemo(
    () => (selectedItem?.latex ? parseLatex(selectedItem.latex) : undefined),
    [selectedItem?.latex],
  );

  useEffect(() => {
    let alive = true;
    void adminDraftDB
      .getWorkspaceSessions()
      .then(async (stored) => {
        if (!alive) return;
        if (stored.length) {
          setSessions(stored);
          setActiveId(stored[0]!.id);
          return;
        }
        const initial = makeSession();
        await adminDraftDB.putWorkspaceSession(initial);
        if (!alive) return;
        setSessions([initial]);
        setActiveId(initial.id);
      })
      .catch((value: unknown) => {
        if (alive) setError(value instanceof Error ? value.message : "تعذر فتح جلسات مساحة العمل المحلية.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveSession = (next: WorkspaceSession) => {
    setSessions((previous) => {
      const index = previous.findIndex((session) => session.id === next.id);
      const updated = index < 0 ? [next, ...previous] : previous.map((session) => session.id === next.id ? next : session);
      return [...updated].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    });
    void adminDraftDB.putWorkspaceSession(next).catch((value: unknown) =>
      setError(value instanceof Error ? value.message : "تعذر حفظ جلسة مساحة العمل محليًا."),
    );
  };

  const patchActive = (patch: Partial<WorkspaceSession>) => {
    if (!active) return;
    saveSession(workspaceSessionSchema.parse({ ...active, ...patch, updatedAt: nowIso() }));
  };

  const createSession = () => {
    const next = makeSession();
    saveSession(next);
    setActiveId(next.id);
    setMessage("");
    setError("");
  };

  const deleteSession = () => {
    if (!active) return;
    const remaining = sessions.filter((session) => session.id !== active.id);
    void adminDraftDB.deleteWorkspaceSession(active.id).catch((value: unknown) =>
      setError(value instanceof Error ? value.message : "تعذر حذف الجلسة المحلية."),
    );
    if (remaining.length) {
      setSessions(remaining);
      setActiveId(remaining[0]!.id);
      return;
    }
    const next = makeSession();
    saveSession(next);
    setActiveId(next.id);
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || !message.trim() || busy) return;
    const user: AdminChatMessage = {
      id: makeId("brain-message"),
      role: "user",
      content: message.trim(),
      createdAt: nowIso(),
    };
    const started = workspaceSessionSchema.parse({
      ...active,
      title: active.messages.length ? active.title : user.content.slice(0, 80),
      messages: [...active.messages, user].slice(-80),
      updatedAt: nowIso(),
    });
    saveSession(started);
    setMessage("");
    setBusy(true);
    setError("");
    try {
      const response = await chatWithAdminBrain({
        sessionId: started.id,
        messages: started.messages.slice(-40),
        ...(started.pageText ? {
          context: {
            selectedText: started.pageText,
            ...(started.sourceName ? { sourceName: started.sourceName } : {}),
            ...(started.page ? { page: started.page } : {}),
          },
        } : {}),
        maxToolRounds: 4,
        clarificationRounds: started.clarificationRounds,
      });
      const assistant: AdminChatMessage = {
        id: makeId("brain-answer"),
        role: "assistant",
        content: response.message,
        createdAt: nowIso(),
      };
      const logs: WorkspaceToolLog[] = response.toolCalls.flatMap((call) => {
        const result = response.toolResults.find((candidate) => candidate.callId === call.id);
        return result
          ? [{ id: makeId("tool-log"), createdAt: nowIso(), call, result }]
          : [];
      });
      saveSession(workspaceSessionSchema.parse({
        ...started,
        messages: [...started.messages, assistant].slice(-80),
        toolLog: [...started.toolLog, ...logs].slice(-100),
        safetyWarnings: [...started.safetyWarnings, ...response.warnings].filter(
          (warning, index, all) => all.indexOf(warning) === index,
        ).slice(-30),
        clarificationRounds: response.clarificationRounds,
        waitingForClarification: response.waitingForClarification,
        updatedAt: nowIso(),
      }));
      if (response.warnings.length) onNotice(response.warnings.join(" "));
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر إرسال رسالة مساحة العمل.");
    } finally {
      setBusy(false);
    }
  };

  const attachImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !active) return;
    if (
      !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) ||
      !/\.(?:jpe?g|png|webp)$/i.test(file.name)
    ) {
      setError("صورة الصفحة يجب أن تكون JPG أو PNG أو WEBP.");
      return;
    }
    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
      setError("صورة الصفحة أكبر من 2 ميغابايت. صغّرها قبل حفظها محليًا.");
      return;
    }
    try {
      const dataUrl = await pageImageFromFile(file);
      patchActive({ pageImage: { fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", dataUrl } });
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ صورة الصفحة.");
    }
  };

  const createDraftFromSession = async () => {
    if (!active || !latestQuestion || !latestSuggestion) {
      setError("أرسل سؤالًا وتلقَّ اقتراحًا أولًا قبل إنشاء مسودة معرفة.");
      return;
    }
    try {
      const timestamp = nowIso();
      const canonicalQuestion = latestQuestion.trim();
      const draft = knowledgeItemSchema.parse({
        id: makeId("knowledge"),
        type: "rule",
        originalText: latestQuestion,
        structured: latestSuggestion,
        latex: "",
        grade: "غير محدد",
        unit: "مسودة من مساحة العمل",
        lesson: latestQuestion.slice(0, 140),
        source: "جلسة عقل الإدارة — يحتاج مراجعة مدير",
        fileName: active.sourceName || "جلسة محلية",
        page: active.page || 1,
        status: "draft",
        confidence: 0,
        needsReview: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 0,
        canonicalQuestion,
        fingerprint: `workspace-${makeId("draft").slice(-48)}`,
        relatedRuleIds: [],
        mathematicalStatement: {
          kind: "rule",
          symbols: [],
          assumptionsLatex: [],
          procedure: [],
          dependsOnDiagram: Boolean(active.pageImage),
          unresolvedQuote: latestQuestion.slice(0, 8_000),
        },
        relations: [],
        understanding: "not_understood",
        evidence: [],
        learningLog: [
          {
            kind: "draft_created",
            createdAt: timestamp,
            summary: "أُنشئت مسودة من مساحة العمل وتنتظر مراجعة المدير.",
            evidenceTypes: [],
          },
        ],
        learningSource: { kind: "teaching", sessionId: active.id }, 
        comparison: "not_compared",
      });
      await onSaveItem(draft);
      patchActive({ selectedItemId: draft.id });
      onNotice("أُنشئت مسودة معرفة محلية تحتاج مراجعة واعتمادًا صريحًا؛ لم تُنشر.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر إنشاء مسودة المعرفة.");
    }
  };

  const addRelation = async () => {
    if (!selectedItem || !relationTarget || relationTarget === selectedItem.id) return;
    try {
      const relation = { targetId: relationTarget, type: relationType };
      if (selectedItem.relations.some((entry) => entry.targetId === relation.targetId && entry.type === relation.type)) {
        setError("هذه العلاقة موجودة بالفعل.");
        return;
      }
      await onSaveItem(knowledgeItemSchema.parse({
        ...selectedItem,
        ...(selectedItem.status === "published" ? { status: "draft", version: 0 } : {}),
        relations: [...selectedItem.relations, relation],
        learningLog: [
          ...selectedItem.learningLog,
          {
            kind: "relation_added",
            createdAt: nowIso(),
            summary: `أضاف المدير علاقة «${relationLabels[relation.type]}» إلى عنصر معرفة آخر.`,
            evidenceTypes: [],
          },
        ].slice(-80),
      }));
      onNotice("حُفظت العلاقة في المسودة المحلية. لا تصبح منشورة قبل اجتياز بوابة النشر.");
      setRelationTarget("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ العلاقة.");
    }
  };

  const attachActualEvidence = async () => {
    if (!selectedItem || !evidence.length) {
      setError("لا يوجد دليل تحقق فعلي من سجل الأدوات لربطه بالعنصر.");
      return;
    }
    try {
      const unique = [...selectedItem.evidence, ...evidence].filter(
        (entry, index, all) => all.findIndex((candidate) =>
          candidate.type === entry.type && candidate.createdAt === entry.createdAt && candidate.detail === entry.detail,
        ) === index,
      );
      await onSaveItem(knowledgeItemSchema.parse({
        ...selectedItem,
        ...(selectedItem.status === "published" ? { status: "draft", version: 0 } : {}),
        evidence: unique,
        understanding: understandingFromEvidence(selectedItem.understanding, unique),
        learningLog: [
          ...selectedItem.learningLog,
          {
            kind: "evidence_attached",
            createdAt: nowIso(),
            summary: "ربط المدير أدلة تحقق فعلية من سجل أدوات مساحة العمل.",
            evidenceTypes: evidence.map((entry) => entry.type),
          },
        ].slice(-80),
      }));
      onNotice("ارتبطت نتائج الأدوات الفعلية بالمسودة؛ لا يعني ذلك النشر أو الاعتماد النهائي.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر ربط دليل التحقق.");
    }
  };

  const setManualUnderstanding = async (value: Exclude<UnderstandingLevel, "verified_understood">) => {
    if (!selectedItem) return;
    try {
      await onSaveItem(knowledgeItemSchema.parse({
        ...selectedItem,
        ...(selectedItem.status === "published" ? { status: "draft", version: 0 } : {}),
        understanding: value,
        learningLog: [
          ...selectedItem.learningLog,
          {
            kind: "manager_reviewed",
            createdAt: nowIso(),
            summary: `حدّث المدير حالة الفهم إلى «${understandingLabels[value]}».`,
            evidenceTypes: [],
          },
        ].slice(-80),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث حالة الفهم.");
    }
  };

  if (loading) return <p className="admin-loading"><LoaderCircle className="animate-spin" size={17} /> فتح مساحة العمل المحلية…</p>;
  if (!active) return <p className="admin-empty-state">تعذر تهيئة جلسة مساحة العمل.</p>;

  return (
    <section className="admin-section brain-workspace" aria-labelledby="brain-workspace-heading">
      <header className="admin-section-heading brain-workspace-heading">
        <div>
          <p className="admin-eyebrow">جلسات محلية · أدوات مقيدة · قرار المدير</p>
          <h2 id="brain-workspace-heading">مساحة عمل عقل المحرك الرياضي</h2>
          <p className="admin-muted">المحادثات وصور الصفحات وسجل الأدوات محفوظة في IndexedDB على هذا الجهاز ولا تدخل النسخ المنشورة.</p>
        </div>
        <div className="admin-inline-actions">
          <button type="button" className="admin-secondary-button" onClick={createSession}><Plus size={15} /> جلسة جديدة</button>
          <button type="button" className="admin-danger-button" onClick={deleteSession}><Trash2 size={15} /> حذف الجلسة</button>
        </div>
      </header>
      {error && <p className="admin-error-text">{error}</p>}
      {active.safetyWarnings.length > 0 && (
        <div className="brain-safety-warning" role="status"><ShieldAlert size={16} /><span>{active.safetyWarnings.at(-1)}</span></div>
      )}
      {active.waitingForClarification && (
        <div className="brain-clarification-wait" role="status"><MessageCircleQuestion size={16} /><span>وصل الجزء الحالي إلى ثلاث جولات توضيح. يبقى قيد الانتظار بلا تخمين؛ أضف معطى جديدًا ثم ابدأ جزءًا جديدًا.</span><button type="button" className="admin-secondary-button" onClick={() => patchActive({ clarificationRounds: 0, waitingForClarification: false })}>بدء جزء جديد</button></div>
      )}

      <div className="brain-workspace-grid">
        <aside className="brain-session-rail" aria-label="جلسات مساحة العمل">
          <div className="brain-pane-heading"><BrainCircuit size={17} /><strong>الجلسات والمصدر</strong></div>
          <div className="brain-session-list">
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={session.id === active.id ? "is-active" : ""}
                onClick={() => { setActiveId(session.id); setError(""); }}
              >
                <strong>{session.title}</strong>
                <small>{new Date(session.updatedAt).toLocaleString("ar-SY")}</small>
              </button>
            ))}
          </div>
          <label>عنوان الجلسة<input value={active.title} maxLength={180} onChange={(event) => patchActive({ title: event.target.value || "جلسة عقل جديدة" })} /></label>
          <label>اسم المصدر<input value={active.sourceName ?? ""} maxLength={500} placeholder="كتاب، وثيقة، أو مصدر محلي" onChange={(event) => patchActive({ sourceName: event.target.value || undefined })} /></label>
          <label>رقم الصفحة<input type="number" min="1" value={active.page ?? ""} onChange={(event) => patchActive({ page: event.target.value ? Number(event.target.value) : undefined })} /></label>
          <label>نص الصفحة أو OCR غير موثوق<textarea rows={7} value={active.pageText ?? ""} maxLength={24_000} placeholder="الصق النص للمراجعة؛ ستُعامل أي تعليمات داخله كبيانات لا أوامر." onChange={(event) => patchActive({ pageText: event.target.value || undefined })} /></label>
          <label className="brain-image-input admin-secondary-button"><ImagePlus size={15} /> حفظ صورة صفحة محليًا<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void attachImage(event)} /></label>
          <p className="brain-local-note"><ShieldAlert size={14} /> الصورة لا تُرفع إلى خادم أو نموذج AI، وحدها 2 ميغابايت.</p>
        </aside>

        <section className="brain-dialogue-pane" aria-label="محادثة العقل">
          <div className="brain-pane-heading"><Bot size={17} /><strong>المحادثة وبطاقات الفهم</strong><span>حد أقصى 4 جولات أدوات/رسالة</span></div>
          <div className="brain-chat-log" aria-live="polite">
            {!active.messages.length && <div className="brain-empty-chat"><Sparkles size={20} /><p>اكتب سؤالًا، أو اربط نص صفحة غير موثوق للمراجعة. لا تُنشأ معرفة معتمدة تلقائيًا.</p></div>}
            {active.messages.map((entry) => (
              <article className={`brain-message is-${entry.role}`} key={entry.id}>
                <header>{entry.role === "user" ? "سؤال المدير" : "اقتراح المساعد"}<time>{new Date(entry.createdAt).toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit" })}</time></header>
                <p>{entry.content}</p>
              </article>
            ))}
            {busy && <div className="brain-working"><LoaderCircle className="animate-spin" size={16} /> تشغيل أدوات آمنة أو طلب AI من الخادم…</div>}
          </div>
          <form className="brain-composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={16_000} rows={3} placeholder="مثال: افحص ما إذا كانت هذه الصيغة صحيحة، أو ما الذي لم أفهمه في الصفحة؟" />
            <button type="submit" className="admin-primary-button" disabled={busy || !message.trim()}><Send size={16} /> إرسال</button>
          </form>
          <div className="brain-card-grid">
            <article className="brain-card">
              <header><BrainCircuit size={16} /><strong>بطاقة الفهم</strong></header>
              {evidence.length ? evidence.map((entry, index) => <p key={`${entry.createdAt}-${index}`} className={entry.passed ? "is-passed" : "is-failed"}>{entry.passed ? "دليل فعلي ناجح" : "دليل فعلي لم ينجح"}: {entry.detail || entry.method}</p>) : <p>لا توجد شارة تحقق؛ شغّل أداة تحقق أو راجع النص يدويًا.</p>}
            </article>
            <article className="brain-card">
              <header><MessageCircleQuestion size={16} /><strong>بطاقة السؤال</strong></header>
              <p>{latestQuestion || "لم يُرسل سؤال بعد."}</p>
            </article>
            <article className="brain-card">
              <header><Sparkles size={16} /><strong>بطاقة الاقتراح</strong></header>
              <p>{latestSuggestion || "سيظهر الاقتراح هنا بعد الاستجابة."}</p>
              <button type="button" className="admin-secondary-button" disabled={!latestSuggestion || !latestQuestion} onClick={() => void createDraftFromSession()}><FilePlus2 size={14} /> إنشاء مسودة فقط</button>
            </article>
            <article className="brain-card brain-tool-card">
              <header><Wrench size={16} /><strong>سجل الأدوات</strong><span>{active.toolLog.length}</span></header>
              {active.toolLog.length ? active.toolLog.slice().reverse().slice(0, 8).map((entry) => (
                <details key={entry.id}>
                  <summary className={entry.result.ok ? "is-ok" : "is-error"}>{entry.call.name} · {entry.result.ok ? "نجح" : "تعذر"}</summary>
                  <pre dir="ltr">{inspect(entry.result.output)}</pre>
                </details>
              )) : <p>لم تُشغّل أداة بعد.</p>}
            </article>
          </div>
        </section>

        <aside className="brain-inspector" aria-label="مفتش المعرفة والعلاقات">
          <div className="brain-pane-heading"><Network size={17} /><strong>المفتش والعلاقات</strong></div>
          <label>عنصر المعرفة<select value={active.selectedItemId ?? ""} onChange={(event) => patchActive({ selectedItemId: event.target.value || undefined })}><option value="">اختر عنصرًا للمراجعة</option>{items.map((item) => <option key={item.id} value={item.id}>{item.lesson} · {item.status}</option>)}</select></label>
          {selectedItem ? <>
            <article className="brain-inspector-card">
              <div className="brain-item-tags"><span>{selectedItem.status}</span><span>{understandingLabels[selectedItem.understanding]}</span></div>
              <strong>{selectedItem.lesson}</strong>
              <p>{selectedItem.structured || selectedItem.originalText}</p>
              {selectedItem.latex && <div className="brain-math" dir="ltr"><Tex math={selectedItem.latex} display /></div>}
              {latexInspection && <small>{latexInspection.diagnostics.length ? `${latexInspection.diagnostics.length} تشخيص LaTeX يحتاج مراجعة.` : `LaTeX قابل للقراءة محليًا (${printLatexDocument(latexInspection)}).`}</small>}
            </article>
            <article className="brain-inspector-card">
              <strong>الفهم والأدلة</strong>
              <p>الحالة الحالية: {understandingLabels[selectedItem.understanding]}</p>
              <div className="brain-inline-form"><select value={selectedItem.understanding === "verified_understood" ? "understood_unverified" : selectedItem.understanding} onChange={(event) => void setManualUnderstanding(event.target.value as Exclude<UnderstandingLevel, "verified_understood">)}><option value="not_understood">لم أفهم بعد</option><option value="partial">فهم جزئي</option><option value="understood_unverified">فهم دون تحقق</option></select><button type="button" className="admin-secondary-button" onClick={() => void attachActualEvidence()}><Save size={14} /> ربط دليل فعلي</button></div>
              <small>لا يمكن ضبط «مفهوم بدليل فعلي» يدويًا؛ لا يظهر إلا عند ربط نتيجة أداة حقيقية.</small>
            </article>
            <article className="brain-inspector-card">
              <strong>إضافة علاقة</strong>
              <div className="brain-relation-form"><select value={relationType} onChange={(event) => setRelationType(relationTypeSchema.parse(event.target.value))}>{Object.entries(relationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">اختر العنصر الهدف</option>{items.filter((item) => item.id !== selectedItem.id).map((item) => <option key={item.id} value={item.id}>{item.lesson}</option>)}</select><button type="button" className="admin-secondary-button" disabled={!relationTarget} onClick={() => void addRelation()}><GitBranch size={14} /> ربط</button></div>
              <RelationGraph item={selectedItem} items={items} />
            </article>
          </> : <p className="admin-empty-state">اختر مسودة أو عنصرًا موجودًا لمراجعة LaTeX والفهم والعلاقات.</p>}
          {active.pageImage && <article className="brain-inspector-card"><strong><FileImage size={15} /> صورة الصفحة المحلية</strong><img className="brain-page-image" src={active.pageImage.dataUrl} alt={`صورة ${active.pageImage.fileName}`} /><small>{active.pageImage.fileName} · لا تدخل النشر.</small></article>}
        </aside>
      </div>
    </section>
  );
}

function RelationGraph({ item, items }: { item: KnowledgeItem; items: KnowledgeItem[] }) {
  const relations = item.relations
    .map((relation) => ({ relation, target: items.find((candidate) => candidate.id === relation.targetId) }))
    .filter((value): value is { relation: KnowledgeItem["relations"][number]; target: KnowledgeItem } => Boolean(value.target))
    .slice(0, 8);
  if (!relations.length) return <p className="admin-muted">لا توجد علاقات محفوظة لهذا العنصر بعد.</p>;
  return (
    <svg className="brain-relation-graph" viewBox="0 0 360 80" role="img" aria-label="رسم علاقات عنصر المعرفة">
      <defs><marker id="brain-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#6dc5aa" /></marker></defs>
      <rect x="128" y="26" width="105" height="28" rx="7" fill="#1e4b45" stroke="#64b8a0" />
      <text x="180" y="44" textAnchor="middle" fill="#d8f3eb" fontSize="9">{item.lesson.slice(0, 17)}</text>
      {relations.map(({ relation, target }, index) => {
        const y = 10 + index * 9;
        const right = index % 2 === 0;
        const startX = right ? 233 : 128;
        const endX = right ? 337 : 23;
        return <g key={`${relation.targetId}-${relation.type}`}><path d={`M${startX} 40 C${right ? 278 : 83} 40, ${right ? 285 : 75} ${y}, ${endX} ${y}`} stroke="#6dc5aa" strokeWidth="1" fill="none" markerEnd="url(#brain-arrow)" /><text x={right ? 284 : 76} y={Math.max(9, y - 2)} textAnchor="middle" fill="#a8cdbf" fontSize="7">{relationLabels[relation.type]}</text><text x={right ? 350 : 10} y={Math.min(76, y + 3)} textAnchor={right ? "end" : "start"} fill="#b7c7d5" fontSize="7">{target.lesson.slice(0, 17)}</text></g>;
      })}
    </svg>
  );
}
