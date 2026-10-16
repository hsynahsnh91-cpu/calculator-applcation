import { RichText } from "../common/Tex";
import {
  normalizeMathTypography,
  stripPromptMarkdown,
} from "../../solver/textbook";
import { useEffect, useState } from "react";
import { Check, Image, LoaderCircle, X } from "lucide-react";
export function ImageAttachment({
  file,
  onUse,
  onRemove,
}: {
  file: File;
  onUse: (text: string, preview: string) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState(""),
    [text, setText] = useState(""),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState("تجهيز الصورة…"),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false),
    [used, setUsed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let engine: typeof import("../../solver/ocr") | null = null;
    (async () => {
      try {
        engine = await import("../../solver/ocr");
        if (controller.signal.aborted) return;
        const image = await engine.prepareImage(file);
        if (controller.signal.aborted) return;
        setPreview(image.preview);
        const answer = await engine.recognizeImage(
          image.blob,
          (fraction, label) => {
            if (!controller.signal.aborted) {
              setProgress(fraction);
              setMessage(label);
            }
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setText(normalizeMathTypography(answer.text));
        setComplete(true);
        setMessage(`استخراج محلي · ثقة OCR: ${Math.round(answer.confidence)}٪`);
      } catch (value) {
        if (!controller.signal.aborted) {
          setError(
            value instanceof Error && /[\u0600-\u06ff]/.test(value.message)
              ? value.message
              : "تعذّرت قراءة الصورة محليًا. استخدم صورة أوضح أو اكتب المسألة.",
          );
          setComplete(true);
          setMessage("تعذّرت القراءة المحلية");
        }
      }
    })();
    return () => {
      controller.abort();
      void engine?.stopOCR();
    };
  }, [file]);
  return (
    <div className="image-attachment">
      <div className="flex gap-3 items-start">
        {preview ? (
          <img
            src={preview}
            alt="الصورة المرفقة للمسألة"
            className="h-16 w-20 rounded-lg object-cover border border-white/10"
          />
        ) : (
          <Image className="w-8 h-8 text-slate-500" />
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs text-slate-200">{file.name}</p>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
            {!complete && <LoaderCircle className="h-3 w-3 animate-spin" />}
            {message}
          </p>
        </div>
        <button
          onClick={onRemove}
          aria-label="إزالة الصورة وإلغاء قراءتها"
          className="icon-button"
        >
          <X size={16} />
        </button>
      </div>
      {!complete && (
        <div className="h-1 rounded-full bg-slate-800 mt-3 overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-300 mt-3">
          {error}
        </p>
      )}
      {text && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-200 leading-6">
            راجع النص، خاصة الكسور والأسس وإشارات الطرح. قارئ الصور محلي، وقد
            يخطئ في الخط اليدوي والمعادلات؛ لن تُرسل الصورة أو تُحلّ تلقائيًا.
          </p>
          <textarea
            aria-label="مراجعة النص المستخرج من الصورة"
            className="ocr-review"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setUsed(false);
            }}
            rows={3}
            dir="auto"
          />
          <details className="ocr-formula-preview" open>
            <summary>معاينة الصيغ قبل الإرسال</summary>
            <div
              className="ocr-formula-preview-body"
              data-testid="ocr-math-preview"
            >
              <RichText
                text={stripPromptMarkdown(normalizeMathTypography(text)).slice(
                  0,
                  7000,
                )}
                autoMath
              />
            </div>
            <p>
              هذه معاينة للنص الذي تراجعه، لا تأكيد لصحته. تحقّق من i و1، ومن
              إشارة الجذر واللاحقات؛ لا نخمّن الرموز المفقودة.
            </p>
          </details>
          <button
            className="text-xs inline-flex gap-1.5 items-center text-emerald-300 font-bold py-1"
            onClick={() => {
              onUse(text, preview);
              setUsed(true);
            }}
          >
            <Check size={14} />
            {used
              ? "تم الإدراج — أرسل بعد المراجعة"
              : "استخدام النص في مربع السؤال"}
          </button>
        </div>
      )}
    </div>
  );
}
