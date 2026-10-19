import workerSource from "tesseract.js/dist/worker.min.js?raw";
import coreSource from "tesseract.js-core/tesseract-core-lstm.wasm.js?raw";
import arabicURL from "../../assets/ocr/ara.traineddata?url";
import englishURL from "../../assets/ocr/eng.traineddata?url";

type Progress = (progress: number, message: string) => void;
interface PendingJob {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}
interface OCRSession {
  worker: Worker;
  urls: string[];
  jobs: Map<string, PendingJob>;
  ready: Promise<void>;
  closed: boolean;
  progress: Progress | null;
}
let session: OCRSession | null = null;
let sequence = 0;

function request(
  target: OCRSession,
  action: string,
  payload: unknown,
): Promise<unknown> {
  if (target.closed)
    return Promise.reject(
      new DOMException("أُلغيت قراءة الصورة", "AbortError"),
    );
  const jobId = `ocr-${++sequence}`;
  return new Promise((resolve, reject) => {
    target.jobs.set(jobId, { resolve, reject });
    target.worker.postMessage({
      workerId: "local-ocr",
      jobId,
      action,
      payload,
    });
  });
}

/** Terminate even during initialization; never leave a hidden recognition worker. */
export function stopOCR(): void {
  const current = session;
  session = null;
  if (!current) return;
  current.closed = true;
  current.worker.terminate();
  current.jobs.forEach((job) =>
    job.reject(new DOMException("أُلغيت قراءة الصورة", "AbortError")),
  );
  current.jobs.clear();
  current.urls.forEach((url) => URL.revokeObjectURL(url));
}

function getSession(): OCRSession {
  if (session) return session;
  // A file:// document has an opaque origin: sibling blob: URLs cannot be
  // imported by the worker. Put the embedded WASM core in the very same script.
  const workerURL = URL.createObjectURL(
    new Blob(
      [
        coreSource,
        "\n;self.TesseractCore=TesseractCore;\n",
        workerSource.replace(/\/\/# sourceMappingURL=.*$/gm, ""),
      ],
      { type: "application/javascript" },
    ),
  );
  let worker: Worker;
  try {
    worker = new Worker(workerURL);
  } catch (error) {
    URL.revokeObjectURL(workerURL);
    throw error;
  }
  const current: OCRSession = {
    worker,
    urls: [workerURL],
    jobs: new Map(),
    ready: Promise.resolve(),
    closed: false,
    progress: null,
  };
  session = current;
  worker.onmessage = ({
    data,
  }: MessageEvent<{ jobId: string; status: string; data: unknown }>) => {
    if (data.status === "progress") {
      const info = data.data as { status?: string; progress?: number };
      const recognizing = info.status === "recognizing text";
      current.progress?.(
        recognizing ? 0.25 + 0.75 * (info.progress ?? 0) : 0.15,
        recognizing
          ? "قراءة النص من الصورة على جهازك…"
          : "تهيئة قارئ الصور المحلي…",
      );
      return;
    }
    const job = current.jobs.get(data.jobId);
    if (!job) return;
    current.jobs.delete(data.jobId);
    if (data.status === "resolve") job.resolve(data.data);
    else
      job.reject(
        new Error("تعذّر تحليل الصورة محليًا. جرّب صورة أوضح أو اكتب المسألة."),
      );
  };
  worker.onerror = (event) => {
    event.preventDefault();
    current.jobs.forEach((job) =>
      job.reject(new Error("تعذّر تشغيل قارئ الصور المحلي في هذا المتصفح.")),
    );
    current.jobs.clear();
  };
  // Tesseract 7's pinned worker protocol. Passing byte arrays prevents any CDN fallback.
  current.ready = (async () => {
    await request(current, "load", {
      options: {
        lstmOnly: true,
        // Fail closed if the bundled core is unavailable; never select a CDN.
        corePath:
          "data:application/javascript,throw%20Error(%22Offline%20core%20unavailable%22)%3B#core.js",
        logging: false,
      },
    });
    const [arabic, english] = await Promise.all([
      fetch(arabicURL).then((response) => response.arrayBuffer()),
      fetch(englishURL).then((response) => response.arrayBuffer()),
    ]);
    const languages = [
      { code: "ara", data: new Uint8Array(arabic) },
      { code: "eng", data: new Uint8Array(english) },
    ];
    await request(current, "loadLanguage", {
      langs: languages,
      options: { cacheMethod: "none", gzip: false, lstmOnly: true },
    });
    await request(current, "initialize", {
      langs: "ara+eng",
      oem: 1,
      config: {},
    });
    await request(current, "setParameters", {
      params: {
        tessedit_pageseg_mode: "3",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      },
    });
  })();
  return current;
}

function preprocessForOCR(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.getImageData(0, 0, width, height);
  const source = image.data;
  const luminance = new Uint8ClampedArray(width * height);
  for (let index = 0; index < luminance.length; index++) {
    const offset = index * 4;
    const gray = Math.round(
      0.2126 * source[offset] +
        0.7152 * source[offset + 1] +
        0.0722 * source[offset + 2],
    );
    // A restrained contrast lift preserves faint pencil/photocopied symbols.
    luminance[index] = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.48 + 128)));
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      let value = luminance[index];
      // Remove isolated one-pixel speckles without blurring characters.  Only
      // a pixel opposed to at least seven neighbours is replaced.
      let light = 0;
      let dark = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const neighborX = x + dx;
          const neighborY = y + dy;
          if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height)
            continue;
          if (luminance[neighborY * width + neighborX] >= 180) light++;
          if (luminance[neighborY * width + neighborX] <= 75) dark++;
        }
      }
      if (value <= 75 && light >= 7) value = 255;
      else if (value >= 180 && dark >= 7) value = 0;
      const offset = index * 4;
      source[offset] = value;
      source[offset + 1] = value;
      source[offset + 2] = value;
      source[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

export async function prepareImage(
  file: File,
): Promise<{ blob: Blob; preview: string }> {
  if (!/^image\/(png|jpe?g|webp|bmp)$/.test(file.type))
    throw new Error(
      "اختر صورة PNG أو JPEG أو WebP أو BMP. لا تُحمّل ملفات SVG أو روابط صور.",
    );
  if (file.size > 12 * 1024 * 1024)
    throw new Error(
      "حجم الصورة أكبر من 12 ميغابايت. اختر صورة أصغر أو قصّ المسألة.",
    );
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("أبعاد الصورة كبيرة جدًا. قصّ الجزء الذي يحتوي المسألة.");
  }
  const maxPixels = 18_000_000;
  const scale = Math.min(
    2.4,
    2_800 / Math.max(bitmap.width, bitmap.height),
    Math.sqrt(maxPixels / (bitmap.width * bitmap.height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("تعذّر تجهيز الصورة في هذا المتصفح.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  preprocessForOCR(context, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("تعذّر تجهيز الصورة.")),
      "image/png",
    ),
  );
  const thumbnail = document.createElement("canvas");
  const ratio = Math.min(1, 400 / canvas.width, 240 / canvas.height);
  thumbnail.width = Math.max(1, Math.round(canvas.width * ratio));
  thumbnail.height = Math.max(1, Math.round(canvas.height * ratio));
  thumbnail
    .getContext("2d")
    ?.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  return { blob, preview: thumbnail.toDataURL("image/jpeg", 0.7) };
}

export async function recognizeImage(
  image: Blob,
  onProgress: Progress,
  signal: AbortSignal,
): Promise<{ text: string; confidence: number }> {
  if (signal.aborted) throw new DOMException("أُلغيت القراءة", "AbortError");
  onProgress(0.05, "تجهيز القراءة المحلية…");
  let interrupt: (error: Error) => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  const abort = () => {
    stopOCR();
    interrupt(new DOMException("أُلغيت القراءة", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    stopOCR();
    interrupt(new Error("لم تكتمل القراءة خلال دقيقة. اختر صورة أوضح وأصغر."));
  }, 60000);
  let current: OCRSession | null = null;
  try {
    const work = async () => {
      current = getSession();
      current.progress = onProgress;
      await current.ready;
      const data = (await request(current, "recognize", {
        image: new Uint8Array(await image.arrayBuffer()),
        options: {},
        output: { text: true },
      })) as { text?: string; confidence?: number };
      const text = data.text?.trim().replace(/[−–]/g, "-");
      if (!text)
        throw new Error(
          "لم يظهر نص واضح في الصورة. قصّ المسألة واستخدم صورة أوضح، أو اكتبها يدويًا.",
        );
      return {
        text,
        confidence: Number.isFinite(data.confidence) ? data.confidence! : 0,
      };
    };
    return await Promise.race([work(), interruption]);
  } catch (error) {
    stopOCR();
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    if (session) session.progress = null;
  }
}
