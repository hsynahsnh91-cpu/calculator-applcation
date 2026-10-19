import { copyToClipboard } from '../../shared/utils/cn';
import React, { useState } from 'react';
import { HistoryEntry, AppMode } from '../../types';
import { localDB } from '../../app/storage/localDB';
import { KaTeXDisplay } from '../../ui/KaTeXDisplay';
import { RichText } from '../../ui/Tex';
import { useModalAccessibility } from '../../ui/GuideModal';
import { soundHaptics } from '../../shared/utils/soundHaptics';
import { 
  Trash2, 
  Star, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  Calendar, 
  Filter
} from 'lucide-react';

interface HistoryDrawerProps {
  history: HistoryEntry[];
  onRefreshHistory: () => void;
  onSelectEntry?: (entry: HistoryEntry) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  history,
  onRefreshHistory,
  onSelectEntry
}) => {
  const [filterMode, setFilterMode] = useState<AppMode | 'all'>('all');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = history.filter((h) => {
    const matchesMode = filterMode === 'all' || h.mode === filterMode;
    const matchesFav = !onlyFavorites || h.favorite;
    return matchesMode && matchesFav;
  });

  const handleToggleFav = (id: string) => {
    soundHaptics.playClick();
    localDB.toggleFavorite(id);
    onRefreshHistory();
  };

  const handleDelete = (id: string) => {
    soundHaptics.playClick();
    localDB.deleteHistoryEntry(id);
    onRefreshHistory();
  };

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const dialogRef = useModalAccessibility(confirmOpen, () => setConfirmOpen(false));

  // opens the in-app styled confirmation dialog (instead of the plain white browser dialog)
  const handleClearAll = () => {
    soundHaptics.playClick();
    soundHaptics.vibrate(15);
    setConfirmOpen(true);
  };

  const confirmClear = () => {
    soundHaptics.playClick();
    soundHaptics.vibrate(25);
    localDB.clearHistory();
    onRefreshHistory();
    setConfirmOpen(false);
  };

  const handleExport = () => {
    soundHaptics.playClick();
    const json = localDB.exportDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calculator_history_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const success = localDB.importDataJSON(String(event.target?.result ?? ''));
        if (success) {
          alert('تم استيراد السجل وقاعدة البيانات بنجاح!');
          onRefreshHistory();
        } else {
          alert('تعذر استيراد الملف، تأكد من صحة التنسيق.');
        }
      };
      reader.onerror = () => alert('تعذرت قراءة الملف. جرّب اختيار ملف JSON صالح مرة أخرى.');
      reader.readAsText(file);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    soundHaptics.playClick();
    if (!await copyToClipboard(text)) { soundHaptics.playError(); return; }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getModeLabel = (m: AppMode) => {
    switch (m) {
      case 'scientific': return 'علمية';
      case 'equations': return 'معادلات';
      case 'sequences': return 'متتاليات';
      case 'calculus': return 'اشتقاق';
      case 'integration': return 'تكامل';
      case 'limits': return 'نهايات';
      case 'geometry': return 'هندسة فراغية';
      case 'probability': return 'احتمالات';
      case 'matrices': return 'مصفوفات';
      case 'complex': return 'أعداد مركبة';
      default: return m;
    }
  };

  return (
    <div className="space-y-4">
      {/* Styled confirmation dialog for clearing the whole history */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-950/85 animate-fadeIn"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-rose-500/30 shadow-2xl shadow-rose-950/40 overflow-hidden"
          >
            <div className="p-5 flex flex-col items-center text-center space-y-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-rose-500/20 blur-xl" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-lg shadow-rose-950">
                  <Trash2 className="w-8 h-8 text-white" />
                </div>
              </div>
              <h3 id="clear-history-title" className="text-base font-extrabold text-slate-100">مسح كامل السجل؟</h3>
              <p className="text-xs text-slate-400 leading-6">
                سيتم حذف جميع العمليات والحلول المحفوظة
                (<span className="font-math text-rose-300" dir="ltr">{history.length}</span> عملية)
                نهائياً من قاعدة البيانات المحلية، ولا يمكن التراجع عن ذلك.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg px-2.5 py-1.5">
                <Download className="w-3.5 h-3.5" />
                <span>نصيحة: يمكنك تصدير السجل أولاً للاحتفاظ بنسخة.</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-800 bg-slate-950">
              <button
                onClick={() => { soundHaptics.playClick(); setConfirmOpen(false); }}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold border border-slate-700 active:scale-95 transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={confirmClear}
                className="py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-sm font-bold shadow-md shadow-rose-950 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>نعم، امسح الكل</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Action & Filter Bar */}
      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-200">سجل العمليات والحلول المحفوظة ({filtered.length})</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              title="تصدير السجل JSON"
              aria-label="تصدير"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تصدير</span>
            </button>

            <label role="button" tabIndex={0} aria-label="استيراد" title="استيراد السجل JSON" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.querySelector('input')?.click(); } }} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 cursor-pointer transition-all">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">استيراد</span>
              <input type="file" aria-label="ملف السجل JSON" accept=".json" onChange={handleImport} className="hidden" />
            </label>

            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                aria-label="مسح الكل"
                className="p-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-xs flex items-center gap-1 border border-rose-800 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">مسح الكل</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center gap-1 text-slate-400 ml-2">
            <Filter className="w-3.5 h-3.5" />
            <span>تصفية:</span>
          </div>

          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filterMode === 'all'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            الكل
          </button>

          {(['scientific', 'equations', 'sequences', 'calculus', 'integration', 'limits', 'geometry', 'probability', 'matrices', 'complex'] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === m
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {getModeLabel(m)}
            </button>
          ))}

          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all mr-auto ${
              onlyFavorites
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-950 text-amber-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>المفضلة فقط</span>
          </button>
        </div>
      </div>

      {/* History Cards List */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 p-10 rounded-2xl border border-slate-800 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Calendar className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-400">لا توجد عمليات مسجلة في هذا القسم بعد.</p>
          <p className="text-xs text-slate-500">جميع نتائج الحسابات والمعادلات تحفظ تلقائياً هنا في قاعدة البيانات المحلية.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectEntry && onSelectEntry(item)}
              className="bg-slate-900 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 shadow-md space-y-2.5 transition-all group"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700">
                    {getModeLabel(item.mode)}
                  </span>
                  <span className="text-xs font-bold text-slate-300">{item.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(item.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    title={item.favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                    onClick={(e) => { e.stopPropagation(); handleToggleFav(item.id); }}
                    className="p-1 rounded text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    <Star className={`w-4 h-4 ${item.favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                  </button>
                  <button
                    title="حذف العملية"
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expression and Result View */}
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 overflow-x-auto">
                <div className="text-xs text-slate-300 font-mono-math">
                  {item.tags?.some((tag) => tag.startsWith('question:')) ? <RichText autoMath text={item.tags.find((tag) => tag.startsWith('question:'))!.slice(9)}/> : <KaTeXDisplay math={item.inputLatex} />}
                </div>
                <div className="text-sm font-bold text-emerald-400 font-mono-math">
                  <KaTeXDisplay math={`= ${item.resultLatex}`} />
                </div>
              </div>

              {item.resultDecimal && (
                <div className="text-[11px] text-slate-400 overflow-x-auto">
                  <RichText text={item.resultDecimal.includes('\\') ? `$${item.resultDecimal}$` : item.resultDecimal} />
                </div>
              )}
              {item.steps && item.steps.length > 0 && (
                <details className="rounded-xl border border-slate-800 bg-slate-950/60 p-3" onClick={(event) => event.stopPropagation()}>
                  <summary className="text-xs font-bold text-emerald-400 cursor-pointer">خطوات الحل</summary>
                  <ol className="space-y-2 mt-3 list-decimal list-inside text-xs text-slate-300">
                    {item.steps.map((step, index) => <li className="overflow-x-auto leading-7" key={index}><RichText text={step} /></li>)}
                  </ol>
                </details>
              )}

              {/* Action Toolbar */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(item.id, item.resultLatex || item.resultDecimal || ''); }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 border border-slate-700 transition-all"
                >
                  {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === item.id ? 'تم النسخ' : 'نسخ النتيجة'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
