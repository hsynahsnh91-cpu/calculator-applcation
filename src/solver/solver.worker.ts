import { solvePrompt } from "./orchestrator";
import type { WorkerReply, WorkerRequest } from "./types";
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (reply: WorkerReply) => void;
};
worker.onmessage = async ({ data }) => {
  try {
    const answer = await solvePrompt(data.question, data.options, (progress) =>
      worker.postMessage({ id: data.id, type: "progress", progress }),
    );
    worker.postMessage({ id: data.id, type: "answer", answer });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      type: "error",
      message:
        error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
          ? error.message
          : "تعذّر تحليل المسألة. قسّمها إلى طلبات أقصر.",
    });
  }
};
