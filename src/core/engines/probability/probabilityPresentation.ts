export const PROBABILITY_COLORS = [
  { name: "حمراء", hex: "#ed8c8e" },
  { name: "بيضاء", hex: "#e5e7eb" },
  { name: "خضراء", hex: "#83cbb0" },
  { name: "زرقاء", hex: "#89b7e7" },
  { name: "صفراء", hex: "#e5c77b" },
  { name: "سوداء", hex: "#657489" },
  { name: "برتقالية", hex: "#dda77d" },
  { name: "بنفسجية", hex: "#b7a2da" },
];
export function probabilityColor(name: string, index = 0) {
  return (
    PROBABILITY_COLORS.find((c) => c.name === name.replace(/^ال/, "").trim())
      ?.hex || PROBABILITY_COLORS[index % PROBABILITY_COLORS.length].hex
  );
}
/** A proportional, bounded display. Randomness changes positions, never the data. */
export function displayBalls(
  colors: { name: string; count: number }[],
  random: () => number = Math.random,
) {
  const total = colors.reduce((n, c) => n + c.count, 0),
    limit = Math.min(80, total),
    balls: { color: number; rotation: number; offset: number }[] = [];
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    colors.some((c) => !Number.isSafeInteger(c.count) || c.count < 0)
  )
    return balls;
  let cumulative = 0,
    index = 0;
  for (let i = 0; i < limit; i++) {
    const position = ((i + 0.5) * total) / limit;
    while (
      index < colors.length - 1 &&
      position >= cumulative + colors[index].count
    ) {
      cumulative += colors[index].count;
      index++;
    }
    balls.push({
      color: index,
      rotation: Math.round(random() * 340),
      offset: Math.round(random() * 5) - 2,
    });
  }
  for (let i = balls.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  return balls;
}
