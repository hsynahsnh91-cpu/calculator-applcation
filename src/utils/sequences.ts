import { solveArithmeticSequence, solveGeometricSequence, solveRecurrenceType1 } from './sequenceSolver';
import type { SequenceInput } from '../solver/extractors';
import type { Verification } from '../solver/types';
export { solveArithmeticSequence, solveGeometricSequence, solveRecurrenceType1 };
export function solveSequence(input: SequenceInput) {
  const solution = input.kind === 'recurrence'
    ? solveRecurrenceType1({ u0: input.first, a: input.a, b: input.b, calculateSumN: input.count })
    : input.kind === 'arithmetic'
      ? solveArithmeticSequence({ u1: input.first, r: input.ratio, startIndex: input.start, calculateSumN: input.count })
      : solveGeometricSequence({ u1: input.first, q: input.ratio, startIndex: input.start, calculateSumN: input.count });
  let sum = 0, term = input.first;
  const length = input.count - input.start + 1;
  let verification: Verification = { passed: false, method: 'لم يُجمع عدد كبير من الحدود للتحقق المباشر' };
  if (length <= 50000) {
    for (let index = 0; index < length; index++) { sum += term; term = input.kind === 'arithmetic' ? term + input.ratio : input.kind === 'geometric' ? term * input.ratio : input.a * term + input.b; }
    const error = Math.abs(sum - (solution.sumValue ?? NaN)) / (1 + Math.abs(sum));
    verification = { passed: Number.isFinite(error) && error < 1e-8, maxError: Number.isFinite(error) ? error : undefined, samples: length, method: 'مطابقة صيغة المجموع مع توليد الحدود وجمعها مباشرة' };
  }
  return { solution, verification };
}
