import { defaultSolverSettings, knowledgeSnapshotSchema, type KnowledgeSnapshot, type SolverSettings } from "../../admin/types";
import { solveLocally } from "../solver/client";
import type { SolveOptions, SolverAnswer, SolverProgress } from "../solver/types";
import { findApprovedKnowledge, findRelatedRules, approvedKnowledgeAnswer } from "./matcher";

const CACHE_KEY = "syrian-math-knowledge-cache-v1";
const CACHE_LIMIT = 4_500_000;

interface CachedKnowledge {
  etag?: string;
  snapshot: KnowledgeSnapshot;
}

let activeSnapshot: KnowledgeSnapshot | null = null;
let activeEtag: string | undefined;
const listeners = new Set<(snapshot: KnowledgeSnapshot | null) => void>();

function readCache(): CachedKnowledge | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || raw.length > CACHE_LIMIT) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value !== null &&
      typeof value === "object" &&
      "snapshot" in value
    ) {
      const record = value as Record<string, unknown>;
      const parsed = knowledgeSnapshotSchema.safeParse(record.snapshot);
      if (parsed.success)
        return {
          snapshot: parsed.data,
          ...(typeof record.etag === "string" ? { etag: record.etag } : {}),
        };
    }
  } catch {
    // Cache is an optimization only; the math engine must remain available.
  }
  return null;
}

function writeCache(snapshot: KnowledgeSnapshot, etag?: string): void {
  try {
    const payload = JSON.stringify({ snapshot, etag } satisfies CachedKnowledge);
    if (payload.length <= CACHE_LIMIT) localStorage.setItem(CACHE_KEY, payload);
  } catch {
    // Browser privacy/quota restrictions never block a solution.
  }
}

function notify(): void {
  listeners.forEach((listener) => listener(activeSnapshot));
}

export function currentKnowledge(): KnowledgeSnapshot | null {
  if (!activeSnapshot) {
    const cached = readCache();
    if (cached) {
      activeSnapshot = cached.snapshot;
      activeEtag = cached.etag;
    }
  }
  return activeSnapshot;
}

export function currentKnowledgeSettings(): SolverSettings {
  return currentKnowledge()?.settings ?? { ...defaultSolverSettings };
}

export async function loadKnowledge(): Promise<KnowledgeSnapshot | null> {
  const cached = readCache();
  if (!activeSnapshot && cached) {
    activeSnapshot = cached.snapshot;
    activeEtag = cached.etag;
    notify();
  }
  try {
    const headers: Record<string, string> = {};
    if (activeEtag) headers["If-None-Match"] = activeEtag;
    const response = await fetch("/api/knowledge", {
      method: "GET",
      headers,
      credentials: "same-origin",
    });
    if (response.status === 304) return activeSnapshot;
    if (!response.ok) throw new Error(`Knowledge endpoint returned ${response.status}`);
    const parsed = knowledgeSnapshotSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Published knowledge did not match its schema.");
    activeSnapshot = parsed.data;
    activeEtag = response.headers.get("ETag") ?? undefined;
    writeCache(activeSnapshot, activeEtag);
    notify();
    return activeSnapshot;
  } catch {
    // Keep the last validated version (or no knowledge) and leave the solver untouched.
    return activeSnapshot;
  }
}

export function subscribeKnowledge(
  listener: (snapshot: KnowledgeSnapshot | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function solveWithKnowledge(
  question: string,
  options: SolveOptions,
  onProgress: (progress: SolverProgress) => void,
  signal?: AbortSignal,
): Promise<SolverAnswer> {
  const snapshot = currentKnowledge();
  const settings = snapshot?.settings ?? defaultSolverSettings;
  const matched = findApprovedKnowledge(question, snapshot, settings.matchThreshold);
  const relatedRules = findRelatedRules(question, snapshot, matched);
  if (matched) return approvedKnowledgeAnswer(question, matched, relatedRules);
  return solveLocally(
    question,
    {
      ...options,
      knowledgeContext: relatedRules,
      disabledEngines: settings.disabledEngines,
      timeoutMs: settings.timeoutMs,
    },
    onProgress,
    signal,
  );
}

/** Public failure telemetry is intentionally best-effort and never awaited by UI flows. */
export function recordKnowledgeFailure(question: string, reason: string): void {
  void fetch("/api/knowledge-failure", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, reason }),
  }).catch(() => {
    // Redis may be intentionally absent while the standalone calculator remains usable.
  });
}

export function recordKnowledgeSuccess(): void {
  void fetch("/api/knowledge-event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solved: true }),
  }).catch(() => {
    // Statistics are optional and do not affect the user's answer.
  });
}
