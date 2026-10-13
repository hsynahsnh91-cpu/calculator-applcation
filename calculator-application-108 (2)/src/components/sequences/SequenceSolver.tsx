import React, { useState } from 'react';
import { solveArithmeticSequence, solveGeometricSequence, solveRecurrenceType1 } from '../../utils/sequenceSolver';
import { SequenceSolution, SequenceType, HistoryEntry } from '../../types';
import { Tex, RichText } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { Line } from 'react-chartjs-2';
import { Sparkles, Layers, CheckCircle2, TrendingUp, Table as TableIcon } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { SEQUENCES_GUIDE } from '../../utils/sectionGuides';

interface SequenceSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const TABS: { type: SequenceType; label: string; tex: string }[] = [
  { type: 'arithmetic', label: 'متتالية حسابية', tex: 'u_{n} = u_{p} + (n - p)\\,r' },
  { type: 'geometric', label: 'متتالية هندسية', tex: 'u_{n} = u_{p} \\cdot q^{\\,n - p}' },
  { type: 'recurrence1', label: 'متتالية تراجعية', tex: 'u_{n+1} = a\\,u_{n} + b' }
];

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5 min-w-0">
    <div className="text-xs text-slate-400 min-h-[20px] flex items-center">
      <Tex math={label} className="text-[13px]" />
    </div>
    {children}
  </div>
);

export const SequenceSolver: React.FC<SequenceSolverProps> = ({ onSaveHistory }) => {
  const [seqType, setSeqType] = useState<SequenceType>('recurrence1');
  const [targetSequences, setTargetSequences] = useState<string>('all');

  const [arith, setArith] = useState({ u1: 0, r: 0, start: 0, sumN: 0 });
  const [geom, setGeom] = useState({ u1: 0, q: 0, start: 0, sumN: 0 });
  const [rec, setRec] = useState({ u0: 0, a: 0, b: 0, sumN: 0 });

  const [solution, setSolution] = useState<SequenceSolution | null>(null);

  const handleSolve = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);

    let sol: SequenceSolution;
    if (seqType === 'arithmetic') sol = solveArithmeticSequence({ u1: arith.u1, r: arith.r, startIndex: arith.start, calculateSumN: arith.sumN });
    else if (seqType === 'geometric') sol = solveGeometricSequence({ u1: geom.u1, q: geom.q, startIndex: geom.start, calculateSumN: geom.sumN });
    else sol = solveRecurrenceType1({ u0: rec.u0, a: rec.a, b: rec.b, calculateSumN: rec.sumN });

    setSolution(sol);

    onSaveHistory({
      mode: 'sequences',
      title: `دراسة ${sol.name}`,
      inputLatex: sol.generalTermLatex,
      resultLatex: sol.limit.latex,
      resultDecimal: `Limit: ${sol.limit.value}, Sum: ${sol.sumValue}`,
      steps: sol.steps.map((s) => `${s.title}: ${s.text || ''} $${s.latex}$`)
    });

    burst(['#10b981', '#06b6d4', '#8b5cf6']);
  };

  const chartConfig = solution
    ? {
        labels: solution.chartData.map((d) => String(d.n)),
        datasets: [
          {
            label: 'u(n)',
            data: solution.chartData.map((d) => d.value),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            pointBackgroundColor: '#34d399',
            pointRadius: 4,
            tension: 0.2
          }
        ]
      }
    : null;

  const inputCls = 'w-full text-base';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-100">المتتاليات والمتسلسلات</h2>
          <p className="text-xs text-slate-400 mt-0.5">دراسة الحد العام، التقارب، الرتابة، المجاميع والتمثيل البياني</p>
        </div>
        <GuideButton guide={SEQUENCES_GUIDE} />
      </div>

      {/* Type tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-md">
        {TABS.map((item) => (
          <button
            key={item.type}
            onClick={() => { soundHaptics.playClick(); setSeqType(item.type); setSolution(null); }}
            className={`p-3 rounded-xl transition-all flex flex-col items-center justify-center gap-1.5 min-h-[72px] ${
              seqType === item.type
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span className="text-sm font-bold">{item.label}</span>
            <Tex math={item.tex} className="text-[12px]" />
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>أدخل معطيات المتتالية:</span>
        </div>

        {seqType === 'arithmetic' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="\text{الحد الأول}\ u_{p}"><NumberInput className={inputCls} value={arith.u1} onChange={(v) => setArith({ ...arith, u1: v })} blankOnZero placeholder="مثال: 3" /></Field>
            <Field label="\text{الأساس}\ r"><NumberInput className={inputCls} value={arith.r} onChange={(v) => setArith({ ...arith, r: v })} blankOnZero placeholder="مثال: 2" /></Field>
            <Field label="\text{رتبة البداية}\ p"><NumberInput className={inputCls} allowDecimal={false} value={arith.start} onChange={(v) => setArith({ ...arith, start: v })} blankOnZero placeholder="مثال: 1" /></Field>
            <Field label="\text{المجموع حتى}\ n"><NumberInput className={inputCls} allowDecimal={false} allowNegative={false} value={arith.sumN} onChange={(v) => setArith({ ...arith, sumN: v })} blankOnZero placeholder="مثال: 10" /></Field>
          </div>
        )}

        {seqType === 'geometric' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="\text{الحد الأول}\ u_{p}"><NumberInput className={inputCls} value={geom.u1} onChange={(v) => setGeom({ ...geom, u1: v })} blankOnZero placeholder="مثال: 2" /></Field>
            <Field label="\text{الأساس}\ q"><NumberInput className={inputCls} value={geom.q} onChange={(v) => setGeom({ ...geom, q: v })} blankOnZero placeholder="مثال: 0.5" /></Field>
            <Field label="\text{رتبة البداية}\ p"><NumberInput className={inputCls} allowDecimal={false} value={geom.start} onChange={(v) => setGeom({ ...geom, start: v })} blankOnZero placeholder="مثال: 1" /></Field>
            <Field label="\text{المجموع حتى}\ n"><NumberInput className={inputCls} allowDecimal={false} allowNegative={false} value={geom.sumN} onChange={(v) => setGeom({ ...geom, sumN: v })} blankOnZero placeholder="مثال: 10" /></Field>
          </div>
        )}

        {seqType === 'recurrence1' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="\text{الحد الأول}\ u_{0}"><NumberInput className={inputCls} value={rec.u0} onChange={(v) => setRec({ ...rec, u0: v })} blankOnZero placeholder="مثال: 4" /></Field>
            <Field label="\text{المعامل}\ a"><NumberInput className={inputCls} value={rec.a} onChange={(v) => setRec({ ...rec, a: v })} blankOnZero placeholder="مثال: 0.5" /></Field>
            <Field label="\text{الثابت}\ b"><NumberInput className={inputCls} value={rec.b} onChange={(v) => setRec({ ...rec, b: v })} blankOnZero placeholder="مثال: 3" /></Field>
            <Field label="\text{المجموع حتى}\ n"><NumberInput className={inputCls} allowDecimal={false} allowNegative={false} value={rec.sumN} onChange={(v) => setRec({ ...rec, sumN: v })} blankOnZero placeholder="مثال: 10" /></Field>
          </div>
        )}

        <button
          onClick={handleSolve}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>دراسة المتتالية واستخراج الحد العام والمجموع والنهاية</span>
        </button>
      </div>

      {solution && (
        <div className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من دراسة المتتالية؟"
            subtitle="اختر النتيجة المحددة لعرض برهانها وتفاصيلها أو اختر الحل الشامل:"
            selectedId={targetSequences}
            onSelect={setTargetSequences}
            options={[
              { id: 'general', label: 'عبارة الحد العام uₙ' },
              { id: 'limit', label: 'النهاية وسلوك التقارب' },
              { id: 'monotony', label: 'دراسة الرتابة والتغير' },
              ...(solution.auxiliarySequence ? [{ id: 'aux', label: 'المتتالية المساعدة vₙ' }] : []),
              ...(solution.sumFormulaLatex ? [{ id: 'sum', label: 'مجموع الحدود Sₙ' }] : []),
              { id: 'table', label: 'جدول الحدود الأولى والرسم' },
              { id: 'steps', label: 'البرهان وخطوات الحل الكاملة' }
            ]}
          />

          {/* Key properties — stacked cards */}
          {(targetSequences === 'all' || targetSequences === 'general' || targetSequences === 'limit' || targetSequences === 'monotony') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(targetSequences === 'all' || targetSequences === 'general') && (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2 min-w-0">
                  <span className="text-xs text-slate-400 font-semibold block">عبارة الحد العام:</span>
                  <div className="text-lg font-bold text-emerald-300 overflow-x-auto"><Tex math={solution.generalTermLatex} /></div>
                </div>
              )}

              {(targetSequences === 'all' || targetSequences === 'limit') && (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2 min-w-0">
                  <span className="text-xs text-slate-400 font-semibold block">النهاية والتقارب:</span>
                  <div className="text-lg font-bold text-cyan-300 overflow-x-auto"><Tex math={solution.limit.latex} /></div>
                  <p className="text-[12px] text-slate-400 leading-6"><RichText text={solution.limit.explanation} /></p>
                </div>
              )}

              {(targetSequences === 'all' || targetSequences === 'monotony') && (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2 min-w-0">
                  <span className="text-xs text-slate-400 font-semibold block">الرتابة والتغير:</span>
                  <div className="text-base font-bold text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{solution.monotony.title}</span>
                  </div>
                  <div className="text-sm overflow-x-auto"><Tex math={solution.monotony.explanationLatex} /></div>
                </div>
              )}
            </div>
          )}

          {solution.auxiliarySequence && (targetSequences === 'all' || targetSequences === 'aux') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-purple-500/30 shadow-lg space-y-2">
              <span className="text-xs text-purple-400 font-bold block">المتتالية المساعدة:</span>
              <p className="text-xs text-slate-300 leading-6"><RichText text={solution.auxiliarySequence.reason} /></p>
              <div className="text-base font-bold text-purple-300 bg-slate-950 px-4 py-2 rounded-xl border border-purple-900 overflow-x-auto">
                <Tex math={solution.auxiliarySequence.formulaLatex} />
              </div>
            </div>
          )}

          {solution.sumFormulaLatex && (targetSequences === 'all' || targetSequences === 'sum') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
              <span className="text-xs text-slate-400 font-semibold block">قانون المجموع وقيمته:</span>
              <div className="text-sm text-emerald-300 overflow-x-auto"><Tex math={solution.sumFormulaLatex} /></div>
              {solution.sumValue !== undefined && (
                <div className="inline-flex px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400">
                  <Tex math={`S = ${Number(solution.sumValue.toFixed(6))}`} className="text-base" />
                </div>
              )}
            </div>
          )}

          {/* Table & plot */}
          {(targetSequences === 'all' || targetSequences === 'table') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-3 min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  <TableIcon className="w-4 h-4" />
                  <span>جدول الحدود الأولى:</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-center border-collapse" dir="ltr">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="p-2"><Tex math="n" /></th>
                        <th className="p-2"><Tex math="u_{n}" /></th>
                        <th className="p-2">≈</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solution.firstTerms.map((t) => (
                        <tr key={t.n} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                          <td className="p-2 text-slate-300"><Tex math={String(t.n)} /></td>
                          <td className="p-2 text-emerald-400"><Tex math={`u_{${t.n}} = ${t.latex}`} /></td>
                          <td className="p-2 text-slate-400 font-math">{Number(t.value.toFixed(4))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {chartConfig && (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>التمثيل البياني لحدود المتتالية:</span>
                  </div>
                  <div className="h-64 w-full" dir="ltr">
                    <Line
                      data={chartConfig}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        locale: 'en-US',
                        animation: { duration: 250 },
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                          y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Steps */}
          {(targetSequences === 'all' || targetSequences === 'steps') && (
            <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4" />
                <span>البرهان وخطوات الحل الكاملة:</span>
              </div>

              <div className="space-y-3">
                {solution.steps.map((st, i) => (
                  <div key={i} className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800">
                      <span className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">
                        {i + 1}
                      </span>
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
