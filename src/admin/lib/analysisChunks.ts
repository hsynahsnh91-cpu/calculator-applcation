export interface AnalysisPageText {
  page: number;
  text: string;
}

export interface AnalysisDocumentText {
  /** The scanner's page list, used to retain page hints when possible. */
  pages: AnalysisPageText[];
  /** The scanner's original combined text. */
  text: string;
}

export interface AnalysisChunk {
  text: string;
  pageHints: number[];
}

// Leave room below the API's 120,000-character validation limit for future
// server-side annotations and keep an individual model request reasonably sized.
export const ANALYSIS_CHUNK_CHARACTER_LIMIT = 100_000;
// The response schema accepts at most 120 extracted blocks. Keep a margin so
// a page with many numbered exercises is never silently sliced by the server.
export const ANALYSIS_CHUNK_BLOCK_LIMIT = 80;

interface PageFragment {
  page: number;
  text: string;
}

function validPage(page: number): number {
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function markerFor(page: number): string {
  return `[الصفحة ${validPage(page)}]`;
}

function textFromMarkers(source: string): PageFragment[] {
  const marker = /\[\s*الصفحة\s+(\d+)\s*\]/g;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [];
  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      return {
        page: validPage(Number(match[1])),
        text: source.slice(start, end).trim(),
      };
    })
    .filter((fragment) => fragment.text.length > 0);
}

function pageFragments(document: AnalysisDocumentText, source: string): PageFragment[] {
  const marked = textFromMarkers(source);
  if (marked.length) return marked;

  // If an administrator has not edited the combined text, regenerate the page
  // headings from the original page list. If it was edited without headings,
  // treat it as one intentional text stream rather than silently losing edits.
  if (source.trim() === document.text.trim() && document.pages.length) {
    return document.pages
      .map((page) => ({
        page: validPage(page.page),
        text: `${markerFor(page.page)}\n${page.text}`.trim(),
      }))
      .filter((fragment) => fragment.text.length > 0);
  }
  return [{ page: validPage(document.pages[0]?.page ?? 1), text: source.trim() }];
}

function splitAtSafeBoundary(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const pieces: string[] = [];
  let remaining = trimmed;
  while (remaining.length > limit) {
    const sample = remaining.slice(0, limit);
    const preferredBoundaries = ["\n\n", "\n", "۔", "؟", "!", "؛", ";", ".", " "];
    let cut = 0;
    for (const boundary of preferredBoundaries) {
      const position = sample.lastIndexOf(boundary);
      if (position >= 0) cut = Math.max(cut, position + boundary.length);
    }
    if (cut < Math.floor(limit * 0.5)) cut = limit;
    const piece = remaining.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function splitAtBlockLimit(text: string): string[] {
  const source = text.trim();
  const boundary = /(?=^\s*(?:(?:مثال|تمرين|تدريب|قانون|تعريف|ملاحظة|حل)(?=\s|:|：|-|$)|\d+\s*[-.)]))/gim;
  const starts = [...source.matchAll(boundary)]
    .map((match) => match.index ?? 0)
    .filter((start, index, all) => index === 0 || start !== all[index - 1]);
  if (starts.length <= ANALYSIS_CHUNK_BLOCK_LIMIT) return [source];

  const preamble = source.slice(0, starts[0]).trim();
  const blocks = starts.map((start, index) =>
    source.slice(start, starts[index + 1] ?? source.length).trim(),
  );
  const groups: string[] = [];
  for (let index = 0; index < blocks.length; index += ANALYSIS_CHUNK_BLOCK_LIMIT) {
    const content = blocks.slice(index, index + ANALYSIS_CHUNK_BLOCK_LIMIT).join("\n\n");
    groups.push(`${index === 0 && preamble ? `${preamble}\n\n` : ""}${content}`.trim());
  }
  return groups.filter(Boolean);
}

/**
 * Divides a scanned document without truncating it. Page headings and page
 * hints travel with each chunk so server-side classification can keep useful
 * provenance. This module deliberately has no network or browser dependency.
 */
export function splitDocumentForAnalysis(
  document: AnalysisDocumentText,
  suppliedText: string,
  maximumCharacters = ANALYSIS_CHUNK_CHARACTER_LIMIT,
): AnalysisChunk[] {
  const limit = Math.max(1_000, Math.min(maximumCharacters, ANALYSIS_CHUNK_CHARACTER_LIMIT));
  const source = suppliedText.trim();
  if (!source) return [];

  const chunks: AnalysisChunk[] = [];
  let currentText = "";
  let currentPages: number[] = [];
  const flush = () => {
    if (!currentText.trim()) return;
    chunks.push({ text: currentText.trim(), pageHints: [...new Set(currentPages)] });
    currentText = "";
    currentPages = [];
  };

  for (const fragment of pageFragments(document, source)) {
    for (const piece of splitAtSafeBoundary(fragment.text, limit)) {
      const separator = currentText ? "\n\n" : "";
      if (currentText && currentText.length + separator.length + piece.length > limit) flush();
      currentText = `${currentText}${currentText ? "\n\n" : ""}${piece}`;
      currentPages.push(validPage(fragment.page));
    }
  }
  flush();
  return chunks.flatMap((chunk) =>
    splitAtBlockLimit(chunk.text).flatMap((blockGroup) =>
      splitAtSafeBoundary(blockGroup, limit).map((text) => ({
        text,
        pageHints: chunk.pageHints,
      })),
    ),
  );
}
