import SolverWorker from "./solver.worker?worker&inline";
import { composeAnswer } from "./composer";
import {
  emptyContext,
  type SolveOptions,
  type SolverAnswer,
  type SolverProgress,
  type SolverResult,
  type WorkerReply,
  type WorkerRequest,
} from "./types";
let worker: Worker | null = null;
const cache = new Map<string, SolverAnswer>();
export function cancelSolver(): void {
  worker?.terminate();
  worker = null;
}
export function solveLocally(
  question: string,
  options: SolveOptions,
  onProgress: (progress: SolverProgress) => void,
  signal?: AbortSignal,
): Promise<SolverAnswer> {
  const key = JSON.stringify([
    question,
    options.angleMode,
    options.context ?? emptyContext(),
  ]);
  const cached = cache.get(key);
  if (cached)
    return Promise.resolve({
      ...cached,
      id: `answer-${Date.now()}`,
      elapsedMs: 0,
    });
  if (!worker) worker = new SolverWorker();
  const active = worker;
  const id = `request-${Date.now()}`;
  const started = performance.now();
  const timeoutMs = Math.max(2_000, Math.min(60_000, options.timeoutMs ?? 15_000));
  return new Promise((resolve, reject) => {
    let partial: SolverResult[] = [];
    let done = false;
    const finish = (answer?: SolverAnswer, error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active.removeEventListener("message", listener);
      active.removeEventListener("error", failure);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (answer) {
        if (answer.results.length && !answer.unsolved.length) {
          cache.set(key, answer);
          if (cache.size > 16) cache.delete(cache.keys().next().value!);
        }
        resolve(answer);
      }
    };
    const abort = () => {
      cancelSolver();
      finish(undefined, new DOMException("أُلغيت العملية", "AbortError"));
    };
    const failure = () => {
      cancelSolver();
      finish(
        undefined,
        new Error("تعذّر تشغيل محرك الحساب المحلي في هذا المتصفح."),
      );
    };
    const listener = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.id !== id) return;
      if (reply.type === "progress") {
        if (reply.progress.results) partial = reply.progress.results;
        onProgress(reply.progress);
      } else if (reply.type === "answer") finish(reply.answer);
      else finish(undefined, new Error(reply.message));
    };
    const timer = window.setTimeout(() => {
      cancelSolver();
      const context = { ...(options.context ?? emptyContext()) };
      for (const item of partial) Object.assign(context, item.contextPatch);
      finish(
        composeAnswer(
          question,
          partial,
          [
            {
              request: question,
              message: partial.length
                ? "ظهرت النتائج المكتملة. أوقف الجزء الأبطأ عند حد الزمن؛ أعد إرساله منفردًا."
                : "لم يكتمل التحقق ضمن مهلة التفاعل. قسّم المسألة إلى طلب واحد أقصر؛ لم يُخترع جواب.",
              choices: context.expression
                ? [
                    `جد مشتق f(x)=${context.expression}`,
                    `جد نهاية ${context.expression} عندما x تؤول إلى 0`,
                  ]
                : ["حل المعادلة 2x^2-5x+3=0"],
            },
          ],
          [],
          context,
          performance.now() - started,
        ),
      );
    }, timeoutMs);
    active.addEventListener("message", listener);
    active.addEventListener("error", failure);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    const request: WorkerRequest = { id, question, options };
    active.postMessage(request);
  });
}
