import React, { useState } from 'react';
import { solveMatrixOperations } from '../../utils/matricesEngine';
import { MatrixSolution, HistoryEntry } from '../../types';
import { Tex, RichText } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { tex } from '../../utils/equationSolver';
import { Sparkles, Layers, Grid, Rows3 } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { MATRICES_GUIDE } from '../../utils/sectionGuides';

interface MatrixSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

// A matrix editor drawn with real brackets; cells shrink to fit phone screens
const MatrixEditor: React.FC<{
  name: string;
  color: string;
  m: number[][];
  onChange: (m: number[][]) => void;
}> = ({ name, color, m, onChange }) => {
  const n = m.length;
  // compact phone-friendly cells: fixed width per cell instead of stretching across the screen
  const cell = n === 2 ? 'h-10 text-base' : n === 3 ? 'h-9 text-[15px]' : 'h-8 text-sm';
  const maxW = n === 2 ? 'max-w-[190px]' : n === 3 ? 'max-w-[250px]' : 'max-w-[300px]';
  return (
    <div className="bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3 min-w-0">
      <div className={`text-sm font-bold ${color}`}>
        <Tex math={`${name} \\in \\mathcal{M}_{${n}}(\\mathbb{R})`} />
      </div>
      <div className={`flex items-stretch gap-1.5 mx-auto w-full ${maxW}`} dir="ltr">
        <div className="w-2 border-l-2 border-y-2 border-slate-400 rounded-l-md shrink-0" />
        <div className="flex-1 grid gap-1.5 min-w-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {m.map((row, r) =>
            row.map((val, c) => (
              <NumberInput
                key={`${r}-${c}`}
                value={val}
                onChange={(v) => onChange(m.map((rw, i) => (i === r ? rw.map((x, j) => (j === c ? v : x)) : rw)))}
                className={`w-full px-0.5 ${cell}`}
                blankOnZero
                placeholder="مثال: 2"
              />
            ))
          )}
        </div>
        <div className="w-2 border-r-2 border-y-2 border-slate-400 rounded-r-md shrink-0" />
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center space-y-1 min-w-0">
    <div className="text-[11px] text-slate-400"><Tex math={label} /></div>
    <div className={`text-lg font-bold ${color} overflow-x-auto`}><Tex math={value} /></div>
  </div>
);

export const MatrixSolver: React.FC<MatrixSolverProps> = ({ onSaveHistory }) => {
  const [size, setSize] = useState<number>(2);
  const [targetMatrix, setTargetMatrix] = useState<string>('all');
  const [matA, setMatA] = useState<number[][]>([[0, 0], [0, 0]]);
  const [matB, setMatB] = useState<number[][]>([[0, 0], [0, 0]]);
  const [solution, setSolution] = useState<MatrixSolution | null>(null);
  const [showGauss, setShowGauss] = useState<boolean>(false);

  const handleSizeChange = (s: number) => {
    soundHaptics.playClick();
    setSize(s);
    setMatA(Array.from({ length: s }, () => Array.from({ length: s }, () => 0)));
    setMatB(Array.from({ length: s }, () => Array.from({ length: s }, () => 0)));
    setSolution(null);
  };

  const handleSolve = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);
    const sol = solveMatrixOperations(matA, matB);
    setSolution(sol);
    onSaveHistory({
      mode: 'matrices',
      title: `حسابات المصفوفات (${size}×${size})`,
      inputLatex: `\\det(A) = ${tex(sol.detA ?? 0)}`,
      resultLatex: `\\det(A) = ${tex(sol.detA ?? 0)},\\ \\operatorname{tr}(A) = ${tex(sol.traceA ?? 0)}`,
      steps: sol.steps.map((s) => `${s.title}: $${s.latex}$`)
    });
    burst(['#10b981', '#38bdf8', '#f59e0b']);
  };

  const invertible = solution ? Math.abs(solution.detA ?? 0) > 1e-9 : false;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-md flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Grid className="w-4 h-4 text-emerald-400" />
            <span>رتبة المصفوفة:</span>
          </span>
          <GuideButton guide={MATRICES_GUIDE} />
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800" dir="ltr">
          {[2, 3].map((s) => (
            <button
              key={s}
              onClick={() => handleSizeChange(s)}
              className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${size === s ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              style={{ fontFamily: 'KaTeX_Main, serif' }}
            >
              {s} × {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MatrixEditor name="A" color="text-emerald-400" m={matA} onChange={setMatA} />
        <MatrixEditor name="B" color="text-cyan-400" m={matB} onChange={setMatB} />
      </div>

      <button
        onClick={handleSolve}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <Sparkles className="w-4 h-4" />
        <span>حساب المحدد والمقلوب والجداء والقيم الذاتية</span>
      </button>

      {solution && (
        <div className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من حل المصفوفات؟"
            subtitle="اختر النتيجة المحددة لعرض برهانها وتفاصيلها أو اختر الحل الشامل:"
            selectedId={targetMatrix}
            onSelect={setTargetMatrix}
            options={[
              { id: 'det', label: 'المحدد وقابلية القلب' },
              ...(solution.inverseA ? [{ id: 'inv', label: 'المصفوفة العكسية A⁻¹' }] : []),
              ...(solution.gauss ? [{ id: 'gauss', label: 'طريقة غاوس (المصفوفة المدرجة)' }] : []),
              { id: 'trace_eigen', label: 'الأثر والقيم الذاتية والجداء' },
              { id: 'steps', label: 'خطوات الحل والبرهان الكامل' }
            ]}
          />

          {(targetMatrix === 'all' || targetMatrix === 'det') && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="\det(A)" value={tex(solution.detA ?? 0)} color="text-emerald-300" />
              <Stat label="\det(B)" value={tex(solution.detB ?? 0)} color="text-cyan-300" />
              <Stat label="\operatorname{tr}(A)" value={tex(solution.traceA ?? 0)} color="text-purple-300" />
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center space-y-1">
                <div className="text-[11px] text-slate-400">قابلية القلب</div>
                <div className={`text-sm font-bold ${invertible ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {invertible ? 'قابلة للقلب' : 'شاذة'}
                </div>
              </div>
            </div>
          )}

          {/* Gauss method */}
          {solution.gauss && (targetMatrix === 'all' || targetMatrix === 'gauss') && (
            <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 overflow-hidden shadow-xl p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-indigo-500/30 pb-2">
                <span className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Rows3 className="w-4 h-4" />
                  <span>طريقة غاوس: المصفوفة المدرجة (المكافئة)</span>
                </span>
                <button
                  onClick={() => { soundHaptics.playClick(); setShowGauss((v) => !v); }}
                  className="px-2 py-1 rounded-lg bg-indigo-900/60 text-xs text-indigo-200 border border-indigo-700"
                >
                  {showGauss ? 'طي التفاصيل' : 'عرض كل العمليات'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 block">المصفوفة المدرجة (شكل السلم):</span>
                  <div className="overflow-x-auto text-[15px]" dir="ltr"><Tex math={`A \\sim ${solution.gauss.echelonLatex}`} display /></div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 block">المصفوفة المدرجة المختزلة (غاوس-جوردان):</span>
                  <div className="overflow-x-auto text-[15px]" dir="ltr"><Tex math={`A \\sim ${solution.gauss.rrefLatex}`} display /></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200">
                  رتبة المصفوفة: <Tex math={`\\operatorname{rg}(A) = ${solution.gauss.rank}`} />
                </span>
                {solution.gauss.detLatex && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 overflow-x-auto max-w-full">
                    <Tex math={solution.gauss.detLatex} />
                  </span>
                )}
              </div>

              {(showGauss || targetMatrix === 'gauss') && (
                solution.gauss.ops.length === 0 ? (
                  <p className="text-xs text-slate-400">المصفوفة مدرجة أصلاً، لا حاجة لعمليات على الأسطر.</p>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-indigo-800/40">
                    <span className="text-[11px] font-bold text-indigo-300 block">العمليات على الأسطر خطوة بخطوة:</span>
                    {solution.gauss.ops.map((op, i) => (
                      <div key={i} className="rounded-lg bg-slate-950/80 border border-slate-800 p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 flex items-center justify-center text-[10px] font-bold font-math shrink-0">{i + 1}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${op.phase === 'forward' ? 'bg-sky-950 text-sky-300' : 'bg-violet-950 text-violet-300'}`}>
                            {op.phase === 'forward' ? 'تصفير تحت المحور' : 'تصفير فوق المحور'}
                          </span>
                          <span className="text-indigo-200 text-sm" dir="ltr"><Tex math={op.opLatex} /></span>
                        </div>
                        <div className="overflow-x-auto text-[14px]" dir="ltr"><Tex math={`\\sim ${op.matrixLatex}`} display /></div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Steps & other sections */}
          {(targetMatrix === 'all' || targetMatrix === 'steps' || targetMatrix === 'inv' || targetMatrix === 'trace_eigen') && (
            <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4" />
                <span>خطوات الحل والبرهان الكامل:</span>
              </div>

              <div className="space-y-3">
                {solution.steps
                  .filter((st) => {
                    if (targetMatrix === 'inv') return st.title.includes('مقلوب');
                    if (targetMatrix === 'trace_eigen') return st.title.includes('أثر') || st.title.includes('الذاتية') || st.title.includes('جداء');
                    return true;
                  })
                  .map((st, i) => (
                    <div key={i} className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800">
                        <span className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">{i + 1}</span>
                        <span className="text-xs font-bold text-emerald-400">{st.title}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {st.text && <p className="text-xs text-slate-300 leading-7"><RichText text={st.text} /></p>}
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px]">
                          <Tex math={st.latex} display />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
