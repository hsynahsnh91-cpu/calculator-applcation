import React, { useState } from 'react';
import { solveLinear, solveQuadratic, solveCubic, solveSystem2x2, solveSystem3x3 } from '../../utils/equationSolver';
import { EquationSolution, EquationType, HistoryEntry } from '../../types';
import { Tex, RichText } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Sparkles, Layers, CheckCircle2, TrendingUp } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { EQUATIONS_GUIDE } from '../../utils/sectionGuides';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface EquationSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const TABS: { type: EquationType; label: string; tex: string }[] = [
  { type: 'deg1', label: 'الدرجة الأولى', tex: 'ax + b = 0' },
  { type: 'deg2', label: 'الدرجة الثانية', tex: 'ax^{2} + bx + c = 0' },
  { type: 'deg3', label: 'الدرجة الثالثة', tex: 'ax^{3} + bx^{2} + cx + d = 0' },
  { type: 'system2', label: 'جملة 2 × 2', tex: '\\begin{cases} \\cdot \\\\ \\cdot \\end{cases}' },
  { type: 'system3', label: 'جملة 3 × 3', tex: '\\begin{cases} \\cdot \\\\ \\cdot \\\\ \\cdot \\end{cases}' }
];

// one coefficient input followed by its variable, e.g. [ 2 ] x²
const Term: React.FC<{ value: number; onChange: (v: number) => void; sym?: string; sign?: boolean }> = ({ value, onChange, sym, sign = true }) => (
  <span className="inline-flex items-center gap-1.5">
    {sign && <Tex math="+" className="text-slate-400 text-lg" />}
    <NumberInput value={value} onChange={onChange} className="w-16 sm:w-[72px] text-base" blankOnZero placeholder="مثال: 2" />
    {sym && <Tex math={sym} className="text-cyan-300 text-lg" />}
  </span>
);

export const EquationSolver: React.FC<EquationSolverProps> = ({ onSaveHistory }) => {
  const [eqType, setEqType] = useState<EquationType>('deg2');
  const [targetEquations, setTargetEquations] = useState<string>('all');

  const [deg1, setDeg1] = useState<number[]>([0, 0]);
  const [deg2, setDeg2] = useState<number[]>([0, 0, 0]);
  const [deg3, setDeg3] = useState<number[]>([0, 0, 0, 0]);
  const [sys2, setSys2] = useState<number[][]>([[0, 0, 0], [0, 0, 0]]);
  const [sys3, setSys3] = useState<number[][]>([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);

  const [solution, setSolution] = useState<EquationSolution | null>(null);

  const setAt = (arr: number[], i: number, v: number) => arr.map((x, k) => (k === i ? v : x));
  const setCell = (m: number[][], r: number, c: number, v: number) => m.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row));

  const handleSolve = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);

    let sol: EquationSolution;
    if (eqType === 'deg1') sol = solveLinear(deg1[0], deg1[1]);
    else if (eqType === 'deg2') sol = solveQuadratic(deg2[0], deg2[1], deg2[2]);
    else if (eqType === 'deg3') sol = solveCubic(deg3[0], deg3[1], deg3[2], deg3[3]);
    else if (eqType === 'system2') sol = solveSystem2x2(sys2[0][0], sys2[0][1], sys2[0][2], sys2[1][0], sys2[1][1], sys2[1][2]);
    else sol = solveSystem3x3(sys3.map((r) => r.slice(0, 3)), sys3.map((r) => r[3]));

    setSolution(sol);

    onSaveHistory({
      mode: 'equations',
      title: `حل معادلة ${eqType === 'deg1' ? 'من الدرجة الأولى' : eqType === 'deg2' ? 'من الدرجة الثانية' : eqType === 'deg3' ? 'من الدرجة الثالثة' : 'جملة معادلات'}`,
      inputLatex: sol.equationLatex,
      resultLatex: sol.roots.map((r) => r.exactLatex).join(' ,\\; '),
      resultDecimal: sol.roots.map((r) => `${r.label}=${r.decimal}`).join(' , '),
      steps: sol.steps.map((s) => `${s.title}: ${s.description} $${s.mathLatex}$`)
    });

    burst(['#10b981', '#38bdf8', '#a855f7']);
  };

  const chartConfig = solution?.plotData
    ? {
        labels: solution.plotData.xValues.map((x) => x.toFixed(2)),
        datasets: [
          {
            label: 'f(x)',
            data: solution.plotData.yValues,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0
          }
        ]
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-100">حل المعادلات والجمل الخطية</h2>
          <p className="text-xs text-slate-400 mt-0.5">حلول دقيقة من الدرجة 1 و2 و3 والجمل الخطية مع المميز والتحليل والرسم</p>
        </div>
        <GuideButton guide={EQUATIONS_GUIDE} />
      </div>

      {/* Type tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-md">
        {TABS.map((item) => (
          <button
            key={item.type}
            onClick={() => { soundHaptics.playClick(); setEqType(item.type); setSolution(null); }}
            className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center gap-1 min-h-[64px] ${
              eqType === item.type
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span className="text-xs font-bold">{item.label}</span>
            <Tex math={item.tex} className="text-[11px] opacity-90" />
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>أدخل معاملات المعادلة:</span>
        </div>

        <div dir="ltr" className="overflow-x-auto pb-1">
          {eqType === 'deg1' && (
            <div className="flex items-center flex-wrap gap-2.5">
              <Term sign={false} value={deg1[0]} onChange={(v) => setDeg1(setAt(deg1, 0, v))} sym="x" />
              <Term value={deg1[1]} onChange={(v) => setDeg1(setAt(deg1, 1, v))} />
              <Tex math="= 0" className="text-lg" />
            </div>
          )}

          {eqType === 'deg2' && (
            <div className="flex items-center flex-wrap gap-2.5">
              <Term sign={false} value={deg2[0]} onChange={(v) => setDeg2(setAt(deg2, 0, v))} sym="x^{2}" />
              <Term value={deg2[1]} onChange={(v) => setDeg2(setAt(deg2, 1, v))} sym="x" />
              <Term value={deg2[2]} onChange={(v) => setDeg2(setAt(deg2, 2, v))} />
              <Tex math="= 0" className="text-lg" />
            </div>
          )}

          {eqType === 'deg3' && (
            <div className="flex items-center flex-wrap gap-2.5">
              <Term sign={false} value={deg3[0]} onChange={(v) => setDeg3(setAt(deg3, 0, v))} sym="x^{3}" />
              <Term value={deg3[1]} onChange={(v) => setDeg3(setAt(deg3, 1, v))} sym="x^{2}" />
              <Term value={deg3[2]} onChange={(v) => setDeg3(setAt(deg3, 2, v))} sym="x" />
              <Term value={deg3[3]} onChange={(v) => setDeg3(setAt(deg3, 3, v))} />
              <Tex math="= 0" className="text-lg" />
            </div>
          )}

          {eqType === 'system2' && (
            <div className="space-y-2.5">
              {[0, 1].map((r) => (
                <div key={r} className="flex items-center flex-wrap gap-2.5">
                  <Term sign={false} value={sys2[r][0]} onChange={(v) => setSys2(setCell(sys2, r, 0, v))} sym="x" />
                  <Term value={sys2[r][1]} onChange={(v) => setSys2(setCell(sys2, r, 1, v))} sym="y" />
                  <Tex math="=" className="text-lg" />
                  <NumberInput value={sys2[r][2]} onChange={(v) => setSys2(setCell(sys2, r, 2, v))} className="w-16 sm:w-[72px] text-base" blankOnZero placeholder="مثال: 5" />
                </div>
              ))}
            </div>
          )}

          {eqType === 'system3' && (
            <div className="space-y-2.5">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-1.5 sm:gap-2.5 min-w-max">
                  <span className="inline-flex items-center gap-1.5">
                    <NumberInput value={sys3[r][0]} onChange={(v) => setSys3(setCell(sys3, r, 0, v))} className="w-14 sm:w-16 text-base" blankOnZero placeholder="مثال: 2" />
                    <Tex math="x" className="text-cyan-300 text-lg" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Tex math="+" className="text-slate-400 text-lg" />
                    <NumberInput value={sys3[r][1]} onChange={(v) => setSys3(setCell(sys3, r, 1, v))} className="w-14 sm:w-16 text-base" blankOnZero placeholder="مثال: 1" />
                    <Tex math="y" className="text-cyan-300 text-lg" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Tex math="+" className="text-slate-400 text-lg" />
                    <NumberInput value={sys3[r][2]} onChange={(v) => setSys3(setCell(sys3, r, 2, v))} className="w-14 sm:w-16 text-base" blankOnZero placeholder="مثال: 3" />
                    <Tex math="z" className="text-cyan-300 text-lg" />
                  </span>
                  <Tex math="=" className="text-lg" />
                  <NumberInput value={sys3[r][3]} onChange={(v) => setSys3(setCell(sys3, r, 3, v))} className="w-14 sm:w-16 text-base" blankOnZero placeholder="مثال: 8" />
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSolve}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>حل المعادلة واستخراج الخطوات والمنحنى</span>
        </button>
      </div>

      {solution && (
        <div className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من حل المعادلة؟"
            subtitle="اختر النتيجة المحددة لعرض برهانها وتفاصيلها أو اختر الحل الشامل:"
            selectedId={targetEquations}
            onSelect={setTargetEquations}
            options={[
              { id: 'roots', label: 'الجذور والحلول النهائية' },
              ...(solution.discriminant ? [{ id: 'disc', label: 'المميز دلتا (Δ) ونوعه' }] : []),
              ...(solution.vertex ? [{ id: 'vertex', label: 'إحداثيات رأس القطع' }] : []),
              ...(solution.factoredForm ? [{ id: 'factored', label: 'التحليل إلى جداء عوامل' }] : []),
              ...(chartConfig ? [{ id: 'plot', label: 'التمثيل البياني للمنحنى' }] : []),
              { id: 'steps', label: 'خطوات الحل والبرهان الكامل' }
            ]}
          />

          {/* Summary card */}
          {(targetEquations === 'all' || targetEquations === 'roots' || targetEquations === 'disc' || targetEquations === 'vertex' || targetEquations === 'factored') && (
            <div className="bg-gradient-to-br from-slate-900 to-emerald-950/40 p-4 sm:p-5 rounded-2xl border border-emerald-500/30 shadow-xl space-y-4">
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 font-semibold block">المعادلة المعالجة:</span>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-lg">
                  <Tex math={solution.equationLatex} display />
                </div>
              </div>

              {(targetEquations === 'all' || targetEquations === 'roots') && (
                <>
                  <div className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>جذور وحلول المعادلة:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {solution.roots.map((r, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-950/80 border border-emerald-600/30 flex flex-col gap-1.5 min-w-0">
                        <span className="text-[11px] text-slate-400">{r.label}</span>
                        <div className="text-lg font-bold text-emerald-300 overflow-x-auto">
                          <Tex math={r.exactLatex} />
                        </div>
                        {typeof r.decimal === 'number' && (
                          <span className="text-[12px] text-slate-400 font-math" dir="ltr">≈ {Number(r.decimal.toFixed(5))}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {solution.discriminant && (targetEquations === 'all' || targetEquations === 'disc') && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <span className="block font-semibold text-slate-400">المميز دلتا (Δ):</span>
                  <Tex math={solution.discriminant.latex} className="text-base" />
                  <span className="block text-slate-400">{solution.discriminant.explanation}</span>
                </div>
              )}

              {solution.vertex && (targetEquations === 'all' || targetEquations === 'vertex') && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <span className="block font-semibold text-slate-400">إحداثيات رأس القطع المكافئ (الذروة):</span>
                  <Tex math={solution.vertex.latex} className="text-base" />
                </div>
              )}

              {solution.factoredForm && (targetEquations === 'all' || targetEquations === 'factored') && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <span className="block font-semibold text-slate-400">التحليل إلى جداء عوامل:</span>
                  <Tex math={solution.factoredForm} display />
                </div>
              )}
            </div>
          )}

          {chartConfig && (targetEquations === 'all' || targetEquations === 'plot') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                <TrendingUp className="w-4 h-4" />
                <span>التمثيل البياني للمنحنى:</span>
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
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 8 } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Steps */}
          {(targetEquations === 'all' || targetEquations === 'steps') && (
            <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4" />
                <span>خطوات الحل والبرهان الكامل:</span>
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
                      <p className="text-xs text-slate-300 leading-7">
                        <RichText text={st.description} />
                      </p>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px]">
                        <Tex math={st.mathLatex} display />
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
