import { useEffect, useRef, useState } from "react";
interface LocalRecognition {
  lang: string;
  processLocally: boolean;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionConstructor {
  new (): LocalRecognition;
  prototype: { processLocally?: boolean };
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
}
export function useOfflineSpeech(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false),
    [listening, setListening] = useState(false),
    [error, setError] = useState("");
  const active = useRef<LocalRecognition | null>(null),
    callback = useRef(onText);
  callback.current = onText;
  const constructor = useRef<RecognitionConstructor | null>(null);
  useEffect(() => {
    let mounted = true;
    // Headless Chromium can expose this experimental API without its native backend.
    // Probing it in that environment can terminate the renderer, not just reject.
    if (/HeadlessChrome/i.test(navigator.userAgent)) return;

    const browser = window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    // Standard recognition may upload speech. Never fall back to that mode.
    if (Recognition?.available && "processLocally" in Recognition.prototype) {
      Recognition.available({ langs: ["ar-SA"], processLocally: true })
        .then((status) => {
          if (mounted && status === "available") {
            constructor.current = Recognition;
            setSupported(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
      active.current?.abort();
    };
  }, []);
  const toggle = () => {
    if (listening) {
      active.current?.stop();
      return;
    }
    const Recognition = constructor.current;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.processLocally = true;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ");
      if (text) callback.current(text);
    };
    recognition.onerror = () => {
      setListening(false);
      setError(
        "تعذّر الاستماع المحلي. تحقق من إذن الميكروفون وحزمة العربية في المتصفح.",
      );
    };
    recognition.onend = () => setListening(false);
    active.current = recognition;
    setError("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("الميكروفون غير متاح محليًا في هذه الجلسة.");
    }
  };
  return { supported, listening, error, toggle };
}
