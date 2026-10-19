import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { KnowledgeItem, KnowledgeItemType } from "../../types";

export function LibraryTab({
  itemCount,
  resultCount,
  query,
  type,
  status,
  grade,
  unit,
  grades,
  units,
  itemTypeLabels,
  statusLabels,
  onQuery,
  onType,
  onStatus,
  onGrade,
  onUnit,
  children,
}: {
  itemCount: number;
  resultCount: number;
  query: string;
  type: KnowledgeItemType | "all";
  status: KnowledgeItem["status"] | "all";
  grade: string;
  unit: string;
  grades: string[];
  units: string[];
  itemTypeLabels: Record<KnowledgeItemType, string>;
  statusLabels: Record<KnowledgeItem["status"], string>;
  onQuery: (value: string) => void;
  onType: (value: KnowledgeItemType | "all") => void;
  onStatus: (value: KnowledgeItem["status"] | "all") => void;
  onGrade: (value: string) => void;
  onUnit: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">{itemCount} عنصر في مساحة العمل</p>
          <h1>المكتبة المعرفية والمراجعة</h1>
          <p>عدّل أو احذف أي مسودة. العناصر المنشورة في Redis تصبح مسودة عند تعديلها ثم تحتاج نشر نسخة جديدة.</p>
        </div>
      </div>
      <div className="admin-library-filters">
        <label className="admin-search"><Search size={17} /><input placeholder="ابحث في النص أو الدرس…" value={query} onChange={(event) => onQuery(event.target.value)} /></label>
        <select value={type} onChange={(event) => onType(event.target.value as KnowledgeItemType | "all")}><option value="all">كل الأنواع</option>{Object.entries(itemTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={status} onChange={(event) => onStatus(event.target.value as KnowledgeItem["status"] | "all")}><option value="all">كل الحالات</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={grade} onChange={(event) => onGrade(event.target.value)}><option value="all">كل الصفوف</option>{grades.map((candidate) => <option key={candidate}>{candidate}</option>)}</select>
        <select value={unit} onChange={(event) => onUnit(event.target.value)}><option value="all">كل الوحدات</option>{units.map((candidate) => <option key={candidate}>{candidate}</option>)}</select>
      </div>
      <p className="admin-result-count">{resultCount} نتيجة مطابقة</p>
      {children}
    </section>
  );
}
