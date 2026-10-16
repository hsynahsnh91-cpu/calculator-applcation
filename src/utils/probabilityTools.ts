import { combinations, factorial, permutations, solveUrnExperiment, type UrnEvent, type DrawMode, type UrnColor } from './probabilityEngine';
import type { TreeNode, Verification } from '../solver/types';

export function solveCombinatorics(n: number, k: number) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(k) || n < 0 || k < 0 || k > n || n > 170) throw new Error('الشرط: عددان صحيحان 0 ≤ k ≤ n ≤ 170.');
  const result = { n, k, nFact: factorial(n), pnk: permutations(n, k), cnk: combinations(n, k), nk: n ** k };
  if (!Number.isFinite(result.nk)) throw new Error('الناتج خارج المجال العددي المتاح.');
  return result;
}
export function parseStatistics(source: string): number[] {
  const text = source.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) - (d <= '٩' ? 0x660 : 0x6f0))).replace(/٫/g, '.');
  const values = text.trim().split(/[\s,،;؛]+/).filter(Boolean);
  if (!values.length || values.some((value) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) throw new Error('اكتب قائمة أعداد مفصولة بفواصل أو مسافات.');
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) throw new Error('البيانات يجب أن تكون أعدادًا منتهية.');
  return numbers;
}
export function selectUrnEvents(events: UrnEvent[], text: string): UrnEvent[] {
  if (/مختلف|اختلاف|لونين|مختلفتي اللون/.test(text)) return events.filter((event) => /ليست كلها/.test(event.eventTitle)).slice(0, 1);
  if (/نفس اللون|متشابه|متماثلتي اللون/.test(text)) return events.filter((event) => /كل الكرات المسحوبة من نفس/.test(event.eventTitle)).slice(0, 1);
  if (/كل الاحداث|جميع الاحتمالات/.test(text)) return events.slice(0, 30);
  const color = events.find((event) => /كلها/.test(event.eventTitle) && text.includes(event.group.replace('كرات ', '')));
  if (color) return [color];
  return [];
}
export function probabilityTree(colors: UrnColor[], drawCount: number, mode: DrawMode): TreeNode | null {
  if (drawCount > 3 || colors.length > 4) return null;
  const walk = (counts: number[], depth: number): TreeNode[] => {
    if (depth === drawCount) return [];
    const total = counts.reduce((sum, count) => sum + count, 0);
    return counts.flatMap((count, index) => {
      if (!count) return [];
      const next = [...counts];
      if (mode !== 'successive_with_rep') next[index]--;
      return [{ label: colors[index].name, probability: `${count}/${total}`, children: walk(next, depth + 1) }];
    });
  };
  return { label: 'البداية', probability: '1', children: walk(colors.map((color) => color.count), 0) };
}
export function solveUrnQuestion(colors: UrnColor[], drawCount: number, mode: DrawMode, query: string) {
  const solution = solveUrnExperiment(colors, drawCount, mode);
  const selected = selectUrnEvents(solution.events, query);
  let verification: Verification = { passed: false, method: 'لم يجرِ تحقق مستقل لهذا الحدث' };
  if (colors.length === 2 && drawCount === 2 && selected.length === 1 && /مختلف|اختلاف/.test(query)) {
    const [a, b] = colors.map((color) => color.count), total = a + b;
    const independent = mode === 'successive_with_rep' ? 2 * a * b / total ** 2 : 2 * a * b / (total * (total - 1));
    const error = Math.abs(independent - selected[0].probabilityDec);
    verification = { passed: error < 1e-12, maxError: error, method: 'مطابقة العدّ بالتوافيق مع جمع احتمالي مساري الشجرة المرتبين' };
  }
  return { solution, selected, tree: probabilityTree(colors, drawCount, mode), verification };
}
