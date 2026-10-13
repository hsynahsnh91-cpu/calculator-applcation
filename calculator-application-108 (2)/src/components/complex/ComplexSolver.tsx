import React, { useState } from 'react';
import { solveComplexNumber, quadrantInfo, algebraicSquareRoots } from '../../utils/complexEngine';
import { ComplexSolution, HistoryEntry } from '../../types';
import { Tex } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { Sparkles, Compass, Layers, ScrollText, ChevronDown } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { COMPLEX_GUIDE } from '../../utils/sectionGuides';

interface ComplexSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const fmt = (x: number) => String(Number(x.toFixed(4)));
const zTex = (a: number, b: number) => {
  if (b === 0) return fmt(a);
  const bi = Math.abs(b) === 1 ? 'i' : `${fmt(Math.abs(b))}i`;
  if (a === 0) return `${b < 0 ? '-' : ''}${bi}`;
  return `${fmt(a)} ${b < 0 ? '-' : '+'} ${bi}`;
};

type Proof = { title: string; latex: string; text?: string }[];

const Card: React.FC<{ n: number; title: string; text?: string; math: string; proof?: Proof }> = ({ n, title, text, math, proof }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-purple-950 border border-purple-700 text-purple-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">{n}</span>
          <span className="text-xs font-bold text-purple-300">{title}</span>
        </span>
        {proof && proof.length > 0 && (
          <button
            onClick={() => { soundHaptics.playClick(); setOpen(!open); }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all shrink-0 ${
              open ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-amber-950/40 text-amber-300 border-amber-700/60 hover:bg-amber-950/70'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>البرهان</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        {text && <p className="text-xs text-slate-300 leading-7">{text}</p>}
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px]">
          <Tex math={math} display />
        </div>

        {proof && open && (
          <div className="mt-2 rounded-xl border border-amber-700/40 bg-amber-950/10 overflow-hidden animate-fadeIn">
            <div className="px-3 py-2 bg-amber-950/30 border-b border-amber-700/40 text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" />
              <span>القوانين والعمليات المستعملة للحصول على النتيجة</span>
            </div>
            <div className="p-2.5 space-y-2">
              {proof.map((s, i) => (
                <div key={i} className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-700 text-amber-300 flex items-center justify-center text-[10px] font-bold font-math shrink-0">{i + 1}</span>
                    <span className="text-[11px] font-bold text-amber-200">{s.title}</span>
                  </div>
                  {s.text && <p className="text-[11px] text-slate-400 leading-6">{s.text}</p>}
                  <div className="p-2 rounded bg-slate-900 border border-slate-800/80 overflow-x-auto text-[14px]" dir="ltr">
                    <Tex math={s.latex} display />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Roots of a complex number drawn on the Argand plane (regular polygon on a circle)
const RootsPlot: React.FC<{ roots: { k: number; re: number; im: number }[] }> = ({ roots }) => {
  const S = 240;
  const C = S / 2;
  const maxR = Math.max(...roots.map((r) => Math.hypot(r.re, r.im)), 0.001);
  const scale = (C - 34) / maxR;
  const px = (v: number) => C + v * scale;
  const py = (v: number) => C - v * scale;
  const poly = roots.map((r) => `${px(r.re)},${py(r.im)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[280px] mx-auto" role="img" aria-label="صور الجذور النونية">
      <circle cx={C} cy={C} r={maxR * scale} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="8" y1={C} x2={S - 8} y2={C} stroke="#475569" strokeWidth="1" />
      <line x1={C} y1="8" x2={C} y2={S - 8} stroke="#475569" strokeWidth="1" />
      <text x={S - 14} y={C - 6} fill="#64748b" fontSize="11" fontStyle="italic">Re</text>
      <text x={C + 6} y="16" fill="#64748b" fontSize="11" fontStyle="italic">Im</text>
      {roots.length > 2 && <polygon points={poly} fill="rgba(168,85,247,0.12)" stroke="#a855f7" strokeWidth="1.5" />}
      {roots.map((r) => (
        <g key={r.k}>
          <line x1={C} y1={C} x2={px(r.re)} y2={py(r.im)} stroke="#7c3aed" strokeWidth="1" opacity="0.6" />
          <circle cx={px(r.re)} cy={py(r.im)} r="5" fill="#c084fc" stroke="#f5f3ff" strokeWidth="1.5" />
          <text x={px(r.re) + 8} y={py(r.im) - 7} fill="#e9d5ff" fontSize="11" fontWeight="bold">w{r.k}</text>
        </g>
      ))}
    </svg>
  );
};

export const ComplexSolver: React.FC<ComplexSolverProps> = ({ onSaveHistory }) => {
  const [re, setRe] = useState<number>(0);
  const [im, setIm] = useState<number>(0);
  const [powerN, setPowerN] = useState<number>(0);
  const [rootN, setRootN] = useState<number>(0);
  const [targetComplex, setTargetComplex] = useState<string>('all');
  const [solution, setSolution] = useState<ComplexSolution | null>(null);
  const [error, setError] = useState('');

  const handleSolve = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);
    setError('');
    if (!Number.isInteger(powerN) || powerN < 1 || !Number.isInteger(rootN) || rootN < 1) {
      setError('أدخل أساً ورتبة جذر صحيحين موجبين.');
      return;
    }
    const n = Math.min(Math.max(Math.round(rootN), 2), 8);
    const p = Math.min(Math.max(Math.round(powerN), 2), 20);
    const sol = solveComplexNumber(re, im, undefined, undefined, p, n);
    setSolution(sol);
    onSaveHistory({
      mode: 'complex',
      title: `تحليل العدد المركب z = ${zTex(re, im)}`,
      inputLatex: `z = ${zTex(re, im)}`,
      resultLatex: sol.exponentialLatex,
      resultDecimal: `|z|=${sol.modulus}, arg=${sol.argumentDeg}°`
    });
    burst(['#a855f7', '#06b6d4', '#10b981']);
  };

  const s = solution;
  const a = s?.z1.re ?? 0;
  const b = s?.z1.im ?? 0;
  const pa = (x: number) => (x < 0 ? `\\left(${fmt(x)}\\right)` : fmt(x));
  const expRhs = s ? s.exponentialLatex.replace('\\cdot ', '') : '';
  const polarRhs = s?.polarLatex ?? '';
  const quad = s ? quadrantInfo(a, b) : null;
  const sqrtRes = s ? algebraicSquareRoots(a, b) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <Compass className="w-5 h-5 text-purple-400" /> الأعداد المركبة
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">التحويل بين الأشكال الجبرية والمثلثية والأسية مع براهين مفصلة ودستور دوموافر والجذور</p>
        </div>
        <GuideButton guide={COMPLEX_GUIDE} />
      </div>

      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <span className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <Compass className="w-4 h-4 text-purple-400" />
          <span>أدخل العدد المركب:</span>
        </span>

        {/* z = [a] + [b] i */}
        <div className="flex items-center justify-center gap-2 flex-wrap p-3 rounded-xl bg-slate-950/60 border border-slate-800" dir="ltr">
          <Tex math="z =" className="text-xl text-slate-200" />
          <NumberInput value={re} onChange={setRe} className="w-20 sm:w-24 text-lg" blankOnZero placeholder="مثال: 3" />
          <Tex math="+" className="text-xl text-slate-400" />
          <NumberInput value={im} onChange={setIm} className="w-20 sm:w-24 text-lg" blankOnZero placeholder="مثال: 4" />
          <Tex math="i" className="text-xl text-fuchsia-300" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400 flex items-center gap-1"><span>الأس</span><Tex math="n" /><span>لحساب</span><Tex math="z^{n}" /></div>
            <NumberInput value={powerN} onChange={setPowerN} allowDecimal={false} allowNegative={false} className="w-full text-base" blankOnZero placeholder="مثال: 3" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400 flex items-center gap-1"><span>رتبة الجذور</span><Tex math="\sqrt[n]{z}" /></div>
            <NumberInput value={rootN} onChange={setRootN} allowDecimal={false} allowNegative={false} className="w-full text-base" blankOnZero placeholder="مثال: 3" />
          </div>
        </div>

        <button
          onClick={handleSolve}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>التحويل إلى الأشكال المثلثية والأسية والجذور</span>
        </button>
        {error && <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">{error}</div>}
      </div>

      {s && (
        <div className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من حل العدد المركب؟"
            subtitle="اختر النتيجة المحددة لعرض برهانها وتفاصيلها أو اختر الحل الشامل:"
            selectedId={targetComplex}
            onSelect={setTargetComplex}
            options={[
              { id: 'summary', label: 'المقاييس (الجبري، الطويلة، الزاوية)' },
              { id: 'polar', label: 'الشكل المثلثي مع البرهان' },
              { id: 'euler', label: 'الشكل الأسي (أويلر) مع البرهان' },
              { id: 'powers', label: 'القوى (دستور دوموافر) مع البرهان' },
              { id: 'roots', label: 'الجذور النونية والرسم البياني' },
              { id: 'inv', label: 'مقلوب ومرافق العدد المركب' },
              { id: 'steps', label: 'جميع الخطوات والبراهين كاملة' }
            ]}
          />

          {/* Summary */}
          {(targetComplex === 'all' || targetComplex === 'summary') && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['\\text{Re}(z)', fmt(a), 'text-slate-100'],
                ['\\text{Im}(z)', fmt(b), 'text-slate-100'],
                ['|z|', fmt(s.modulus), 'text-emerald-300'],
                ['\\arg(z)', `${fmt(s.argumentDeg)}^{\\circ}`, 'text-cyan-300']
              ].map(([l, v, c]) => (
                <div key={l} className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center space-y-1">
                  <div className="text-[11px] text-slate-400"><Tex math={l} /></div>
                  <div className={`text-lg font-bold ${c}`}><Tex math={v} /></div>
                </div>
              ))}
            </div>
          )}

          {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'polar' || targetComplex === 'euler' || targetComplex === 'powers' || targetComplex === 'roots' || targetComplex === 'inv') && (
            <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-purple-300 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4" />
                <span>خطوات الحل والبراهين:</span>
              </div>

              {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'inv') && (
                <Card n={1} title="الشكل الجبري والمرافق" text="المرافق نحصل عليه بتغيير إشارة الجزء التخيلي:" math={`\\begin{aligned} z &= ${zTex(a, b)} \\\\[6pt] \\overline{z} &= ${zTex(a, -b)} \\end{aligned}`} />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps') && (
                <Card
                  n={2}
                  title="الطويلة"
                  text="نطبق القانون |z| = √(a² + b²):"
                  math={`\\begin{aligned} |z| &= \\sqrt{a^{2} + b^{2}} \\\\[6pt] &= \\sqrt{${pa(a)}^{2} + ${pa(b)}^{2}} \\\\[6pt] &= \\sqrt{${fmt(a * a + b * b)}} = ${fmt(s.modulus)} \\end{aligned}`}
                />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps') && (
                <Card
                  n={3}
                  title="الزاوية"
                  text="نحدد الزاوية θ من جيب التمام والجيب:"
                  math={`\\begin{aligned} \\cos\\theta &= \\dfrac{a}{|z|} = \\dfrac{${fmt(a)}}{${fmt(s.modulus)}}, \\quad \\sin\\theta = \\dfrac{b}{|z|} = \\dfrac{${fmt(b)}}{${fmt(s.modulus)}} \\\\[6pt] \\theta &= ${fmt(s.argumentRad)}\\ \\text{rad} = ${fmt(s.argumentDeg)}^{\\circ} \\end{aligned}`}
                />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'polar') && (
                <Card n={4} title="الشكل المثلثي" math={`z = ${polarRhs}`} proof={s.proofs?.polar} />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'euler') && (
                <Card n={5} title="الشكل الأسي (أويلر)" math={`z = ${expRhs}`} proof={s.proofs?.exponential} />
              )}

              {s.inverseLatex && (targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'inv') && (
                <Card n={6} title="مقلوب العدد" text="نضرب البسط والمقام في المرافق:" math={`\\dfrac{1}{z} = \\dfrac{\\overline{z}}{|z|^{2}} = ${s.inverseLatex.split('=').slice(1).join('=')}`} />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'powers') && (
                <Card
                  n={7}
                  title="القوى (دستور دوموافر)"
                  text="نطبق القانون zⁿ = |z|ⁿ (cos nθ + i sin nθ):"
                  proof={s.proofs?.powers}
                  math={`\\begin{aligned} ${(s.powerResults || []).map((p) => {
                    const rhs = p.latex.split('=').pop()!.trim();
                    return `z^{${p.n}} &= ${rhs}`;
                  }).join(' \\\\[6pt] ')} \\end{aligned}`}
                />
              )}

              {(targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'roots') && (
                <Card
                  n={8}
                  title="الجذور النونية"
                  text="لكل k من 0 إلى n − 1:"
                  proof={s.proofs?.roots}
                  math={`\\begin{aligned} w_{k} &= \\sqrt[n]{|z|}\\; e^{\\,i\\frac{\\theta + 2k\\pi}{n}} \\\\[6pt] ${(s.roots || []).map((r) => {
                    const rhs = r.latex.split('=').pop()!.trim();
                    return `w_{${r.k}} &= ${r.polar} = ${rhs}`;
                  }).join(' \\\\[6pt] ')} \\end{aligned}`}
                />
              )}

              {quad && (targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'euler' || targetComplex === 'polar') && (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-purple-950 border border-purple-700 text-purple-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">θ</span>
                    <span className="text-xs font-bold text-purple-300">دستور الإرجاع إلى الربع الأول (تحديد الربع قبل كتابة العمدة)</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs text-slate-300 leading-7">
                      العمدة تُحدَّد بعد الإشارة: نبدأ بالزايا المرجعية α في الربع الأول ثم نرجعها بحسب إشارات جيب التمام وجيب الزاوية. {quad.nameAr} هو موقع الشعاع.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px]" dir="ltr">
                      <Tex math={`\\tan\\alpha = \\dfrac{|b|}{|a|} = \\dfrac{${fmt(Math.abs(b))}}{${fmt(Math.abs(a))}} \\qquad \\alpha = ${quad.alphaTex}`} display />
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px] text-amber-200" dir="ltr">
                      <Tex math={quad.lawTex} display />
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 overflow-x-auto text-[15px] text-emerald-200" dir="ltr">
                      <Tex math={`\\arg(z) = ${quad.thetaTex}`} display />
                    </div>
                  </div>
                </div>
              )}

              {sqrtRes && (targetComplex === 'all' || targetComplex === 'steps' || targetComplex === 'roots') && (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">²</span>
                    <span className="text-xs font-bold text-emerald-300">الجذر التربيعي الجبري لعدد مركب (بطريقة الجملة الامتحانية)</span>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {sqrtRes.steps.map((stp, i) => (
                      <div key={i} className="rounded-lg bg-slate-900/70 border border-slate-800 p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                          <span className="text-[11px] font-bold text-emerald-300">{stp.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-6">{stp.text}</p>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800 overflow-x-auto text-[14px]" dir="ltr">
                          <Tex math={stp.latex} display />
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {sqrtRes.roots.map((rt, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-700/60 text-emerald-200 text-sm font-mono" dir="ltr">
                          w{i === 0 ? '₁' : '₂'} = {rt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {s.roots && s.roots.length > 0 && (targetComplex === 'all' || targetComplex === 'roots') && (
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 text-xs font-bold text-purple-300">
                    التمثيل البياني لصور الجذور في المستوي المركب
                  </div>
                  <div className="p-3 space-y-2">
                    <RootsPlot roots={s.roots} />
                    <p className="text-[11px] text-slate-400 text-center leading-6">
                      صور الجذور تقع على دائرة نصف قطرها <Tex math={`\\sqrt[${rootN}]{|z|}`} /> وتشكّل رؤوس مضلع منتظم عدد أضلاعه <Tex math={String(s.roots.length)} />.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
