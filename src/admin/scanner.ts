import { normalizeScannedText } from "./normalization";

type OcrModule = typeof import("../core/solver/ocr");
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let ocrModulePromise: Promise<OcrModule> | undefined;
let pdfModulePromise: Promise<{ pdfjs: PdfJsModule; workerUrl: string }> | undefined;

function loadOcr(): Promise<OcrModule> {
  if (!ocrModulePromise) ocrModulePromise = import("../core/solver/ocr");
  return ocrModulePromise;
}

function loadPdf(): Promise<{ pdfjs: PdfJsModule; workerUrl: string }> {
  if (!pdfModulePromise)
    pdfModulePromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => ({ pdfjs, workerUrl: worker.default }));
  return pdfModulePromise;
}

export type ScanSource = "pdf-text" | "ocr";
export type PdfScanMode = "text-first" | "ocr-all-pages";

export interface ScanOptions {
  pdfMode?: PdfScanMode;
}

export interface ScannedPage {
  page: number;
  text: string;
  source: ScanSource;
  confidence?: number;
}

export interface ScannedDocument {
  id: string;
  fileName: string;
  pages: ScannedPage[];
  text: string;
  /** Manager-provided context sent with each safe analysis chunk. */
  attachmentMessage?: string;
  /** Records whether PDF pages were OCR'd even when a text layer existed. */
  pdfMode?: PdfScanMode;
}

export interface ScanProgress {
  fileName: string;
  currentPage: number;
  totalPages: number;
  fraction: number;
  label: string;
}

type ProgressListener = (progress: ScanProgress) => void;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isSupportedImage(file: File): boolean {
  return (
    /^image\/(png|jpe?g|webp)$/i.test(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name)
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("أُلغيت عملية المسح.", "AbortError");
}

function documentId(file: File): string {
  return `scan-${file.lastModified}-${file.size}-${file.name.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}`;
}

function extractTextItems(items: readonly unknown[]): string {
  return items
    .map((item) => {
      if (
        item !== null &&
        typeof item === "object" &&
        "str" in item &&
        typeof item.str === "string"
      )
        return item.str;
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("تعذّر تحويل صفحة PDF إلى صورة للمسح.")),
      "image/png",
    );
  });
}

async function scanImage(
  file: File,
  signal: AbortSignal,
  onProgress: ProgressListener,
): Promise<ScannedDocument> {
  throwIfAborted(signal);
  const { prepareImage, recognizeImage } = await loadOcr();
  const prepared = await prepareImage(file);
  throwIfAborted(signal);
  const recognized = await recognizeImage(
    prepared.blob,
    (fraction, label) =>
      onProgress({
        fileName: file.name,
        currentPage: 1,
        totalPages: 1,
        fraction,
        label,
      }),
    signal,
  );
  const text = normalizeScannedText(recognized.text);
  if (!text)
    throw new Error("لم ينتج قارئ الصور نصًا قابلًا للمراجعة من هذه الصورة.");
  return {
    id: documentId(file),
    fileName: file.name,
    pages: [{ page: 1, text, source: "ocr", confidence: recognized.confidence }],
    text,
  };
}

async function scanPdf(
  file: File,
  signal: AbortSignal,
  onProgress: ProgressListener,
  options: ScanOptions,
): Promise<ScannedDocument> {
  if (file.size > 35 * 1024 * 1024)
    throw new Error("حجم PDF أكبر من 35 ميغابايت. قسّمه إلى ملف أصغر أولًا.");
  const { pdfjs, workerUrl } = await loadPdf();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  throwIfAborted(signal);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
  });
  const abortPdf = () => loadingTask.destroy();
  signal.addEventListener("abort", abortPdf, { once: true });
  try {
    const pdfDocument = await loadingTask.promise;
    if (pdfDocument.numPages > 250)
      throw new Error("يُسمح بحد أقصى 250 صفحة في الملف الواحد. قسّم الكتاب أولًا.");
    const pages: ScannedPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      throwIfAborted(signal);
      const mustUseOcr = options.pdfMode === "ocr-all-pages";
      onProgress({
        fileName: file.name,
        currentPage: pageNumber,
        totalPages: pdfDocument.numPages,
        fraction: (pageNumber - 1) / pdfDocument.numPages,
        label: mustUseOcr
          ? "المسح الضوئي الكامل مفعل؛ بدء OCR لصفحة PDF…"
          : "استخراج طبقة النص من صفحة PDF…",
      });
      const page = await pdfDocument.getPage(pageNumber);
      let textLayer = "";
      if (!mustUseOcr) {
        try {
          const textContent = await page.getTextContent();
          textLayer = normalizeScannedText(extractTextItems(textContent.items));
        } catch {
          // A damaged/unsupported text layer is treated like a scanned page and
          // continues through the local image OCR path below.
          textLayer = "";
        }
      }
      if (!mustUseOcr && textLayer.replace(/[^\p{L}\p{N}]/gu, "").length >= 8) {
        pages.push({ page: pageNumber, text: textLayer, source: "pdf-text" });
        onProgress({
          fileName: file.name,
          currentPage: pageNumber,
          totalPages: pdfDocument.numPages,
          fraction: pageNumber / pdfDocument.numPages,
          label: "استُخدمت طبقة النص المضمنة في الصفحة.",
        });
        page.cleanup();
        continue;
      }
      onProgress({
        fileName: file.name,
        currentPage: pageNumber,
        totalPages: pdfDocument.numPages,
        fraction: (pageNumber - 0.78) / pdfDocument.numPages,
        label: mustUseOcr
          ? "المسح الضوئي الكامل مفعل؛ تجهيز الصفحة بدقة عالية لـ OCR…"
          : "الصفحة ممسوحة؛ تجهيزها بدقة عالية لـ OCR…",
      });
      const naturalViewport = page.getViewport({ scale: 1 });
      const maxDimension = 3_200;
      const scale = Math.max(
        1.7,
        Math.min(3, maxDimension / Math.max(naturalViewport.width, naturalViewport.height)),
      );
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("تعذّر إنشاء مساحة رسم صفحة PDF.");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      throwIfAborted(signal);
      const image = new File(
        [await canvasToPng(canvas)],
        `page-${pageNumber}.png`,
        { type: "image/png" },
      );
      const { prepareImage, recognizeImage } = await loadOcr();
      const prepared = await prepareImage(image);
      const result = await recognizeImage(
        prepared.blob,
        (fraction, label) =>
          onProgress({
            fileName: file.name,
            currentPage: pageNumber,
            totalPages: pdfDocument.numPages,
            fraction: (pageNumber - 1 + fraction) / pdfDocument.numPages,
            label,
          }),
        signal,
      );
      const ocrText = normalizeScannedText(result.text);
      if (!ocrText)
        throw new Error(`لم ينتج OCR نصًا من الصفحة ${pageNumber} في «${file.name}».`);
      pages.push({
        page: pageNumber,
        text: ocrText,
        source: "ocr",
        confidence: result.confidence,
      });
      page.cleanup();
    }
    return {
      id: documentId(file),
      fileName: file.name,
      pages,
      text: pages.map((page) => `\n[الصفحة ${page.page}]\n${page.text}`).join("\n").trim(),
      pdfMode: options.pdfMode ?? "text-first",
    };
  } finally {
    signal.removeEventListener("abort", abortPdf);
    await loadingTask.destroy();
  }
}

/** Scan starts as soon as a file enters the queue; no server upload is used. */
export async function scanDocument(
  file: File,
  signal: AbortSignal,
  onProgress: ProgressListener,
  options: ScanOptions = {},
): Promise<ScannedDocument> {
  const abortOcr = () => {
    void ocrModulePromise?.then(({ stopOCR }) => stopOCR());
  };
  signal.addEventListener("abort", abortOcr, { once: true });
  try {
    if (isPdf(file)) return await scanPdf(file, signal, onProgress, options);
    if (isSupportedImage(file)) return await scanImage(file, signal, onProgress);
    throw new Error("الملفات المدعومة هي PDF وJPG وPNG وWEBP فقط.");
  } finally {
    signal.removeEventListener("abort", abortOcr);
  }
}
