import type { KnowledgeItem } from "../types";

/**
 * A deliberately small, editable map used only to highlight gaps in the
 * administrator's own collection.  It never claims that a missing topic is
 * absent from the official curriculum; it means no matching item was stored.
 */
export const SYRIAN_CURRICULUM_TOPICS: Record<string, string[]> = {
  "السابع": ["الأعداد النسبية", "الجبر", "الهندسة", "الإحصاء"],
  "الثامن": ["الأعداد الحقيقية", "المعادلات", "الهندسة", "الإحصاء"],
  "التاسع": ["الجبر", "الهندسة", "الدوال", "الإحصاء والاحتمالات"],
  "العاشر": ["العبارات الجبرية", "الهندسة", "المثلثات", "الإحصاء"],
  "الحادي عشر العلمي": ["الدوال", "المتتاليات", "الاحتمالات", "الهندسة الفضائية"],
  "الحادي عشر الأدبي": ["الدوال", "الإحصاء", "الاحتمالات"],
  "البكالوريا العلمي": ["النهايات", "الاشتقاق", "التكامل", "الأعداد العقدية", "الاحتمالات"],
  "البكالوريا الأدبي": ["الدوال", "الإحصاء", "الاحتمالات"],
};

export interface CurriculumGap {
  grade: string;
  topic: string;
}

export function findCurriculumGaps(items: KnowledgeItem[]): CurriculumGap[] {
  const available = new Set(
    items
      .filter((item) => item.status !== "draft")
      .map((item) => `${item.grade}|${item.unit}`.replace(/\s+/g, "").toLowerCase()),
  );
  const knownGrades = new Set(items.map((item) => item.grade));
  const gaps: CurriculumGap[] = [];
  for (const [grade, topics] of Object.entries(SYRIAN_CURRICULUM_TOPICS)) {
    if (!knownGrades.has(grade)) continue;
    for (const topic of topics) {
      const key = `${grade}|${topic}`.replace(/\s+/g, "").toLowerCase();
      if (!available.has(key)) gaps.push({ grade, topic });
    }
  }
  return gaps;
}
