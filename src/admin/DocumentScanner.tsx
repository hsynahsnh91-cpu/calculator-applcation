import { useEffect, useRef, useState } from "react";
import {
  Camera,
  FileText,
  ImagePlus,
  LoaderCircle,
  Play,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import type { ScannedDocument } from "./scanner";
import { scanDocument } from "./scanner";

interface ScanJob {
  id: string;
  fileName: string;
  status: "queued" | "scanning" | "ready" | "analyzing" | "complete" | "error" | "cancelled";
  currentPage: number;
  totalPages: number;
  fraction: number;
  label: string;
  text: string;
  document?: ScannedDocument;
  error?: string;
}

interface DocumentScannerProps {
  onAnalyze: (document: ScannedDocument) => Promise<void>;
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

export function DocumentScanner({ onAnalyze }: DocumentScannerProps) {
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef(Promise.resolve());

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    },
  );

  const patchJob = (id: string, patch: Partial<ScanJob>) => {
    setJobs((previous) =>
      previous.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  };

  const analyze = async (id: string, document?: ScannedDocument, text?: string) => {
    const selected = document ?? jobs.find((job) => job.id === id)?.document;
    if (!selected) return;
    const revised = text ?? jobs.find((job) => job.id === id)?.text ?? selected.text;
    patchJob(id, { status: "analyzing", label: "تحليل النص المنظم…" });
    try {
      await onAnalyze({ ...selected, text: revised });
      patchJob(id, { status: "complete", label: "أضيفت النتائج إلى المسودات المحلية." });
    } catch (error) {
      patchJob(id, {
        status: "ready",
        error: error instanceof Error ? error.message : "تعذر تحليل النص.",
        label: "النص جاهز، ويمكن إعادة التحليل بعد التصحيح.",
      });
    }
  };

  const schedule = (file: File) => {
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
          const document = await scanDocument(file, controller.signal, (progress) => {
            patchJob(id, {
              currentPage: progress.currentPage,
              totalPages: progress.totalPages,
              fraction: progress.fraction,
              label: progress.label,
            });
          });
          if (controller.signal.aborted) {
            patchJob(id, { status: "cancelled", label: "أُلغي المسح." });
            return;
          }
          patchJob(id, {
            status: "ready",
            document,
            text: document.text,
            currentPage: document.pages.length,
            totalPages: document.pages.length,
            fraction: 1,
            label: "النص قابل للمراجعة قبل الاعتماد.",
          });
          if (autoAnalyze) await analyze(id, document, document.text);
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
          controllers.current.delete(id);
        }
      });
  };

  const receiveFiles = (files: File[]) => {
    files.filter(acceptedFile).forEach(schedule);
    const rejected = files.length - files.filter(acceptedFile).length;
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
          <p className="admin-eyebrow">مسح محلي تلقائي</p>
          <h2 id="scan-heading">ارفع صفحات الكتاب أو صوّر السؤال</h2>
          <p>
            تُفحص طبقة النص في PDF أولًا؛ أما الصفحات الممسوحة والصور فتُعالج محليًا
            ثم تمر إلى قارئ OCR العربي والإنجليزي داخل Worker.
          </p>
        </div>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={autoAnalyze}
            onChange={(event) => setAutoAnalyze(event.target.checked)}
          />
          <span>تحليل تلقائي مباشرة</span>
        </label>
      </div>
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
        <span>يمكن اختيار عدة ملفات؛ يبدأ المسح فورًا ويعمل ملف واحد في كل مرة لحماية الذاكرة.</span>
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
        {jobs.length === 0 && (
          <p className="admin-empty-state">لم تُضف أي وثيقة بعد.</p>
        )}
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
              {["queued", "scanning", "analyzing"].includes(job.status) && (
                <LoaderCircle className="animate-spin" size={19} />
              )}
              {["queued", "scanning", "analyzing"].includes(job.status) && (
                <button
                  type="button"
                  className="admin-icon-button"
                  title="إلغاء المسح"
                  onClick={() => controllers.current.get(job.id)?.abort()}
                >
                  <Square size={15} />
                </button>
              )}
              {job.status === "ready" && (
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
            {["queued", "scanning", "analyzing"].includes(job.status) && (
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
                </div>
                <label>
                  النص المستخرج — صححه قبل إعادة التحليل عند الحاجة
                  <textarea
                    value={job.text}
                    rows={8}
                    dir="auto"
                    onChange={(event) => patchJob(job.id, { text: event.target.value, error: undefined })}
                  />
                </label>
                {job.status !== "complete" && (
                  <button
                    type="button"
                    className="admin-primary-button"
                    onClick={() => void analyze(job.id, job.document, job.text)}
                  >
                    <Play size={16} /> تحليل النص الآن
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
