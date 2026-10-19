import { useEffect, useRef, useState } from "react";
import {
  Camera,
  FileText,
  ImagePlus,
  LoaderCircle,
  Play,
  ScanText,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import {
  scanDocument,
  type PdfScanMode,
  type ScannedDocument,
} from "./scanner";
import { adminDraftDB, type CachedOcrDocument } from "../../lib/indexedDB";

interface ScanJob {
  id: string;
  fileName: string;
  status: "queued" | "scanning" | "ready" | "analyzing" | "complete" | "error" | "cancelled";
  currentPage: number;
  totalPages: number;
  fraction: number;
  label: string;
  text: string;
  attachmentMessage: string;
  pdfMode: PdfScanMode;
  document?: ScannedDocument;
  error?: string;
}

export interface DocumentAnalysisProgress {
  currentChunk: number;
  totalChunks: number;
  label: string;
}

export interface DocumentAnalysisOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DocumentAnalysisProgress) => void;
}

interface DocumentScannerProps {
  onAnalyze: (document: ScannedDocument, options?: DocumentAnalysisOptions) => Promise<void>;
}

function jobId(file: File): string {
  return `upload-${Date.now()}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

function acceptedFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    /^image\/(png|jpe?g|webp)$/i.test(file.type) ||
    /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
  );
}

function isActiveJob(status: ScanJob["status"]): boolean {
  return status === "queued" || status === "scanning" || status === "analyzing";
}

/**
 * Local OCR happens first. The optional manager note travels with the document
 * to the server-side classifier only; it never changes OCR or executes code.
 */
export function DocumentScanner({ onAnalyze }: DocumentScannerProps) {
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [pdfMode, setPdfMode] = useState<PdfScanMode>("text-first");
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [cachedDocuments, setCachedDocuments] = useState<CachedOcrDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef(Promise.resolve());
  const deferredCleanup = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // React development Strict Mode may briefly run an effect cleanup followed
    // by setup again. Deferring the abort avoids cancelling a just-queued PDF
    // during that non-user remount while still releasing workers on real exit.
    if (deferredCleanup.current !== undefined) {
      clearTimeout(deferredCleanup.current);
      deferredCleanup.current = undefined;
    }
    return () => {
      deferredCleanup.current = setTimeout(() => {
        controllers.current.forEach((controller) => controller.abort());
        controllers.current.clear();
      }, 0);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void adminDraftDB
      .listOcrDocuments()
      .then((documents) => {
        if (active) setCachedDocuments(documents);
      })
      .catch(() => {
        // OCR cache is an optional local-resume aid; scanning remains usable.
      });
    return () => {
      active = false;
    };
  }, []);

  const patchJob = (id: string, patch: Partial<ScanJob>) => {
    setJobs((previous) =>
      previous.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  };

  const cancelJob = (id: string) => {
    const controller = controllers.current.get(id);
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    // Keep the card active until the worker/network call actually unwinds, so
    // the UI never reports a completed cancellation before resources stop.
    patchJob(id, { label: "جارٍ إلغاء العملية بأمان…" });
  };

  const restoreCachedDocument = async (id: string) => {
    const document = await adminDraftDB.getOcrDocument(id);
    if (!document) return;
    const restoredId = `restored-${document.id}-${Date.now()}`;
    setAttachmentMessage(document.attachmentMessage ?? "");
    setJobs((previous) => [
      {
        id: restoredId,
        fileName: document.fileName,
        status: "ready",
        currentPage: document.pages.length,
        totalPages: document.pages.length,
        fraction: 1,
        label: "استُعيد النص المحفوظ محليًا؛ راجعه أو حلّله دون إعادة OCR.",
        text: document.text,
        attachmentMessage: document.attachmentMessage ?? "",
        pdfMode: document.pdfMode ?? "text-first",
        document,
      },
      ...previous,
    ]);
  };

  const analyze = async (
    id: string,
    document?: ScannedDocument,
    text?: string,
    existingSignal?: AbortSignal,
  ) => {
    const current = jobs.find((job) => job.id === id);
    const selected = document ?? current?.document;
    if (!selected) return;
    const revised = text ?? current?.text ?? selected.text;
    const message = current?.attachmentMessage ?? selected.attachmentMessage ?? "";
    const ownedController = existingSignal ? undefined : new AbortController();
    const signal = existingSignal ?? ownedController?.signal;
    if (ownedController) controllers.current.set(id, ownedController);
    patchJob(id, {
      status: "analyzing",
      error: undefined,
      fraction: 0,
      label: "تقسيم الملف وتحليل جميع صفحاته…",
    });
    try {
      await onAnalyze(
        { ...selected, text: revised, attachmentMessage: message },
        {
          signal,
          onProgress: (progress) =>
            patchJob(id, {
              currentPage: progress.currentChunk,
              totalPages: progress.totalChunks,
              fraction: progress.totalChunks ? progress.currentChunk / progress.totalChunks : 0,
              label: progress.label,
            }),
        },
      );
      patchJob(id, {
        status: "complete",
        fraction: 1,
        label: "أضيفت نتائج كامل الملف إلى المسودات المحلية للمراجعة والنشر لاحقًا.",
      });
    } catch (error) {
      const cancelled = Boolean(signal?.aborted);
      patchJob(id, {
        status: cancelled ? "cancelled" : "ready",
        error: cancelled
          ? undefined
          : error instanceof Error
            ? error.message
            : "تعذر تحليل النص.",
        label: cancelled
          ? "أُلغي التحليل قبل حفظ أي عناصر جديدة."
          : "النص جاهز، ويمكن إعادة التحليل بعد التصحيح.",
      });
    } finally {
      if (ownedController && controllers.current.get(id) === ownedController)
        controllers.current.delete(id);
    }
  };

  const schedule = (
    file: File,
    note: string,
    selectedPdfMode: PdfScanMode,
    shouldAutoAnalyze: boolean,
  ) => {
    const id = jobId(file);
    const controller = new AbortController();
    controllers.current.set(id, controller);
    setJobs((previous) => [
      ...previous,
      {
        id,
        fileName: file.name,
        status: "queued",
        currentPage: 0,
        totalPages: 0,
        fraction: 0,
        label: "في طابور المسح المحلي…",
        text: "",
        attachmentMessage: note,
        pdfMode: selectedPdfMode,
      },
    ]);
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (controller.signal.aborted) {
          patchJob(id, { status: "cancelled", label: "أُلغيت قبل بدء المسح." });
          return;
        }
        patchJob(id, { status: "scanning", label: "بدء المسح…" });
        try {
          const scanned = await scanDocument(
            file,
            controller.signal,
            (progress) => {
              patchJob(id, {
                currentPage: progress.currentPage,
                totalPages: progress.totalPages,
                fraction: progress.fraction,
                label: progress.label,
              });
            },
            { pdfMode: selectedPdfMode },
          );
          if (controller.signal.aborted) {
            patchJob(id, { status: "cancelled", label: "أُلغي المسح." });
            return;
          }
          const document: ScannedDocument = {
            ...scanned,
            attachmentMessage: note,
            pdfMode: scanned.pdfMode ?? selectedPdfMode,
          };
          // Preserve the extracted OCR document independently of network state.
          // A quota/storage failure never discards the in-memory review result.
          void adminDraftDB
            .putOcrDocument(document)
            .then(() => adminDraftDB.listOcrDocuments())
            .then(setCachedDocuments)
            .catch(() => undefined);
          patchJob(id, {
            status: "ready",
            document,
            text: document.text,
            currentPage: document.pages.length,
            totalPages: document.pages.length,
            fraction: 1,
            label: "اكتمل نسخ النص؛ راجعه أو حلله كملف كامل.",
          });
          if (shouldAutoAnalyze) await analyze(id, document, document.text, controller.signal);
        } catch (error) {
          patchJob(id, {
            status: controller.signal.aborted ? "cancelled" : "error",
            error:
              controller.signal.aborted
                ? undefined
                : error instanceof Error
                  ? error.message
                  : "تعذر مسح الملف.",
            label: controller.signal.aborted ? "أُلغي المسح." : "فشل المسح دون إضافة نتائج.",
          });
        } finally {
          if (controllers.current.get(id) === controller) controllers.current.delete(id);
        }
      });
  };

  const receiveFiles = (files: File[]) => {
    const accepted = files.filter(acceptedFile);
    const note = attachmentMessage.trim().slice(0, 12_000);
    accepted.forEach((file) => schedule(file, note, pdfMode, autoAnalyze));
    const rejected = files.length - accepted.length;
    if (rejected) {
      const id = `rejected-${Date.now()}`;
      setJobs((previous) => [
        ...previous,
        {
          id,
          fileName: "ملف غير مدعوم",
          status: "error",
          currentPage: 0,
          totalPages: 0,
          fraction: 0,
          text: "",
          attachmentMessage: "",
          pdfMode,
          label: "يُقبل PDF وJPG وPNG وWEBP فقط.",
          error: "استُبعد ملف غير مدعوم.",
        },
      ]);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="scan-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">مسح محلي تلقائي وتعلّم منظم</p>
          <h2 id="scan-heading">ارفع صفحات الكتاب أو صوّر السؤال</h2>
          <p>
            يُقرأ كامل PDF صفحةً صفحة: طبقة النص أولًا أو OCR كامل عند تفعيله. بعد ذلك
            يُقسّم النص بأمان إلى دفعات ويدخل المسودات للمراجعة، لا إلى النشر المباشر.
          </p>
        </div>
        <div className="admin-scan-options">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(event) => setAutoAnalyze(event.target.checked)}
            />
            <span>تحليل تلقائي مباشرة</span>
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={pdfMode === "ocr-all-pages"}
              onChange={(event) =>
                setPdfMode(event.target.checked ? "ocr-all-pages" : "text-first")
              }
            />
            <span>مسح ضوئي كامل لصفحات PDF</span>
          </label>
        </div>
      </div>

      {cachedDocuments.length > 0 && (
        <details className="admin-ocr-resume">
          <summary>استعادة نص ممسوح محفوظ محليًا ({cachedDocuments.length})</summary>
          <p>يمكنك متابعة المراجعة أو التحليل دون رفع الملف أو إعادة OCR. تبقى هذه البيانات على هذا الجهاز فقط.</p>
          <ul>
            {cachedDocuments.slice(0, 8).map((cached) => (
              <li key={cached.id}>
                <span>{cached.fileName} · {new Date(cached.cachedAt).toLocaleString("ar-SY")}</span>
                <button type="button" className="admin-secondary-button" onClick={() => void restoreCachedDocument(cached.id)}>استعادة</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <label className="admin-scan-context">
        رسالة مرافقة للملف — مثل الصف والوحدة والهدف التعليمي
        <textarea
          value={attachmentMessage}
          rows={3}
          maxLength={12_000}
          placeholder="مثال: هذا فصل النهايات للبكالوريا العلمي. استخرج القواعد والأمثلة والتمارين، ولا تعتمد أي جواب غير ظاهر في الكتاب."
          onChange={(event) => setAttachmentMessage(event.target.value)}
        />
        <small>
          تستخدم الرسالة كسياق للتصنيف فقط؛ لا تنشر محتوى ولا تمنح الذكاء صلاحية تجاوز
          المراجعة البشرية.
        </small>
      </label>

      <div
        className={`admin-drop-zone ${dragging ? "is-dragging" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="منطقة رفع ملفات PDF وصور"
        onClick={() => uploadInput.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            uploadInput.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          receiveFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <UploadCloud size={30} />
        <strong>اسحب ملفات PDF أو JPG أو PNG أو WEBP هنا</strong>
        <span>
          يمكن اختيار عدة ملفات؛ يعمل ملف واحد في كل مرة لحماية الذاكرة. تفعيل المسح
          الضوئي الكامل أبطأ لكنه يقرأ حتى صفحات PDF التي تحتوي طبقة نص.
        </span>
        <div className="admin-inline-actions">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={(event) => {
              event.stopPropagation();
              uploadInput.current?.click();
            }}
          >
            <ImagePlus size={16} /> اختيار ملفات
          </button>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={(event) => {
              event.stopPropagation();
              cameraInput.current?.click();
            }}
          >
            <Camera size={16} /> الكاميرا
          </button>
        </div>
      </div>
      <input
        ref={uploadInput}
        className="hidden"
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          receiveFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => {
          receiveFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="admin-scan-list">
        {jobs.length === 0 && <p className="admin-empty-state">لم تُضف أي وثيقة بعد.</p>}
        {jobs.map((job) => (
          <article className="admin-scan-card" key={job.id}>
            <div className="admin-scan-card-heading">
              <FileText size={20} />
              <div>
                <strong>{job.fileName}</strong>
                <p>
                  {job.totalPages ? `صفحة ${job.currentPage} من ${job.totalPages} · ` : ""}
                  {job.label}
                </p>
              </div>
              {isActiveJob(job.status) && <LoaderCircle className="animate-spin" size={19} />}
              {isActiveJob(job.status) && (
                <button
                  type="button"
                  className="admin-icon-button"
                  title="إلغاء المسح أو التحليل"
                  onClick={() => cancelJob(job.id)}
                >
                  <Square size={15} />
                </button>
              )}
              {!isActiveJob(job.status) && (
                <button
                  type="button"
                  className="admin-icon-button"
                  title="حذف هذه الوثيقة من القائمة"
                  onClick={() => setJobs((previous) => previous.filter((entry) => entry.id !== job.id))}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {isActiveJob(job.status) && (
              <div className="admin-progress" aria-label={`تقدم ${job.fileName}`}>
                <i style={{ width: `${Math.round(job.fraction * 100)}%` }} />
              </div>
            )}
            {job.error && <p className="admin-error-text">{job.error}</p>}
            {job.document && (
              <div className="admin-scan-review">
                <div className="admin-page-sources">
                  {job.document.pages.map((page) => (
                    <span key={page.page}>
                      ص{page.page}: {page.source === "pdf-text" ? "طبقة النص" : "OCR"}
                      {page.confidence !== undefined ? ` ${Math.round(page.confidence)}٪` : ""}
                    </span>
                  ))}
                  {job.document.pdfMode === "ocr-all-pages" && (
                    <span><ScanText size={12} /> OCR كامل</span>
                  )}
                </div>
                <label>
                  الرسالة المرافقة لهذا الملف
                  <textarea
                    value={job.attachmentMessage}
                    rows={3}
                    maxLength={12_000}
                    dir="auto"
                    onChange={(event) =>
                      patchJob(job.id, { attachmentMessage: event.target.value, error: undefined })
                    }
                  />
                </label>
                <label>
                  النص المستخرج — صححه قبل إعادة التحليل عند الحاجة
                  <textarea
                    value={job.text}
                    rows={8}
                    dir="auto"
                    onChange={(event) => patchJob(job.id, { text: event.target.value, error: undefined })}
                  />
                </label>
                {job.status !== "complete" && !isActiveJob(job.status) && (
                  <button
                    type="button"
                    className="admin-primary-button"
                    onClick={() => void analyze(job.id, job.document, job.text)}
                  >
                    <Play size={16} /> تحليل كامل الملف الآن
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
