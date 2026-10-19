/** Change one visible integer coefficient. Zero is skipped when another number exists. */
export function replaceOneCoefficient(source: string): string | undefined {
  const matches = [...source.matchAll(/(?<![\p{L}\p{N}])(-?\d{1,4})(?![\p{L}\p{N}])/gu)];
  if (!matches.length) return undefined;
  const match = matches.find((candidate) => Number(candidate[1]) !== 0) ?? matches[0];
  const value = Number(match[1]);
  const next = value >= 0 ? value + 1 : value - 1;
  return `${source.slice(0, match.index)}${next}${source.slice(match.index! + match[0].length)}`;
}

export function isPublishedPracticeItem(item: { status: string; type: string }): boolean {
  return item.status === "published" && (item.type === "example" || item.type === "exercise");
}

export function isApprovedPracticeItem(item: { status: string; type: string }): boolean {
  return (
    (item.status === "approved" || item.status === "published") &&
    (item.type === "example" || item.type === "exercise")
  );
}
