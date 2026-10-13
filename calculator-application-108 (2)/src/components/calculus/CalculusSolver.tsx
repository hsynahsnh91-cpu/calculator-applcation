import React, { useRef, useState } from 'react';
import { computeDerivative, computeDefiniteIntegral, computeLimit } from '../../utils/calculusEngine';
import { CalculusMode, CalculusSolution, HistoryEntry } from '../../types';
import { KaTeXDisplay } from '../common/KaTeXDisplay';
import { Tex, RichText } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { NaturalMathField, NaturalMathFieldHandle } from '../common/NaturalMathField';
import { exprToLatex, buildVariationTableLatex } from '../../utils/calculusEngine';
import { Line } from 'react-chartjs-2';
import { Sparkles, Layers, TrendingUp, Compass, ChevronDown, ChevronUp, Delete, RotateCcw } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { CALCULUS_GUIDE, LIMITS_GUIDE } from '../../utils/sectionGuides';

interface CalculusSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  initialMode?: CalculusMode;
  modeOnly?: boolean;
}

const FUNCTION_PAD_GROUPS = [
  {
    title: 'الأرقام',
    keys: [
      { tex: '7', token: '7' }, { tex: '8', token: '8' }, { tex: '9', token: '9' },
      { tex: '4', token: '4' }, { tex: '5', token: '5' }, { tex: '6', token: '6' },
      { tex: '1', token: '1' }, { tex: '2', token: '2' }, { tex: '3', token: '3' },
      { tex: '0', token: '0' }, { tex: '.', token: '.' }
    ]
  },
  {
    title: 'العمليات والمتغيرات',
    keys: [
      { tex: 'x', token: 'x' }, { tex: '+', token: '+' }, { tex: '-', token: '-' },
      { tex: '\\times', token: '\\times' }, { tex: '\\div', token: '\\div' }, { tex: '\\left(\\square\\right)', token: '\\left(\\placeholder{}\\right)' },
      { tex: '\\pi', token: '\\pi' }, { tex: 'e', token: 'e' }
    ]
  },
  {
    title: 'الأسس والجذور',
    keys: [
      { tex: 'x^{2}', token: 'x^2' }, { tex: 'x^{3}', token: 'x^3' }, { tex: 'x^{\\square}', token: 'x^{\\placeholder{}}' },
      { tex: '\\sqrt{\\square}', token: '\\sqrt{\\placeholder{}}' },
      { tex: '\\sqrt[3]{\\square}', token: '\\sqrt[3]{\\placeholder{}}' },
      { tex: '\\left|\\square\\right|', token: '\\left|\\placeholder{}\\right|' },
      { tex: '\\dfrac{\\square}{\\square}', token: '\\frac{\\placeholder{}}{\\placeholder{}}' }
    ]
  },
  {
    title: 'النسب المثلثية',
    keys: [
      { tex: '\\sin', token: '\\sin(\\placeholder{})' }, { tex: '\\cos', token: '\\cos(\\placeholder{})' },
      { tex: '\\tan', token: '\\tan(\\placeholder{})' }, { tex: '\\sin^{-1}', token: '\\arcsin(\\placeholder{})' },
      { tex: '\\cos^{-1}', token: '\\arccos(\\placeholder{})' }, { tex: '\\tan^{-1}', token: '\\arctan(\\placeholder{})' },
      { tex: '\\sec', token: '\\sec(\\placeholder{})' }, { tex: '\\csc', token: '\\csc(\\placeholder{})' },
      { tex: '\\cot', token: '\\cot(\\placeholder{})' }, { tex: '\\sec^{-1}', token: '\\operatorname{asec}(\\placeholder{})' },
      { tex: '\\csc^{-1}', token: '\\operatorname{acsc}(\\placeholder{})' }, { tex: '\\cot^{-1}', token: '\\operatorname{acot}(\\placeholder{})' },
      { tex: '\\sinh', token: '\\sinh(\\placeholder{})' }, { tex: '\\cosh', token: '\\cosh(\\placeholder{})' },
      { tex: '\\tanh', token: '\\tanh(\\placeholder{})' }, { tex: '\\sinh^{-1}', token: '\\operatorname{asinh}(\\placeholder{})' },
      { tex: '\\cosh^{-1}', token: '\\operatorname{acosh}(\\placeholder{})' }, { tex: '\\tanh^{-1}', token: '\\operatorname{atanh}(\\placeholder{})' }
    ]
  },
  {
    title: 'الأسية واللوغاريتمية',
    keys: [
      { tex: '\\ln', token: '\\ln(\\placeholder{})' }, { tex: '\\log', token: '\\log(\\placeholder{})' },
      { tex: '\\log_{10}', token: '\\log_{10}(\\placeholder{})' }, { tex: 'e^{\\square}', token: 'e^{\\placeholder{}}' },
      { tex: '10^{\\square}', token: '10^{\\placeholder{}}' }, { tex: 'n!', token: '!' },
      { tex: '\\%', token: '\\%' }
    ]
  }
];

export const CalculusSolver: React.FC<CalculusSolverProps> = ({ onSaveHistory, initialMode = 'derivative', modeOnly = false }) => {
  const [calcMode, setCalcMode] = useState<CalculusMode>(initialMode);
  const [targetCalculus, setTargetCalculus] = useState<string>('all');

  // Input states
  const [expr, setExpr] = useState<string>('');
  const [showFunctionPad, setShowFunctionPad] = useState(false);
  const mathFieldRef = useRef<NaturalMathFieldHandle>(null);
  const [atX, setAtX] = useState<number>(0);
  const [atXEntered, setAtXEntered] = useState(false);
  const [intA, setIntA] = useState<number>(0);
  const [intB, setIntB] = useState<number>(0);
  const [limitTarget, setLimitTarget] = useState<string>('');
  const [useLHopital, setUseLHopital] = useState(false);

  // Current Solution.
  const [solution, setSolution] = useState<CalculusSolution | null>(null);
  const [variationTable, setVariationTable] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const insertExpressionToken = (token: string) => {
    soundHaptics.playClick();
    mathFieldRef.current?.insert(token);
  };

  const handleExpressionBackspace = () => { soundHaptics.playClick(); mathFieldRef.current?.backspace(); };
  const handleExpressionClear = () => { soundHaptics.playClick(); mathFieldRef.current?.clear(); setExpr(''); };

  const handleCompute = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);
    setErrorMsg(null);

    if (!expr.trim()) {
      setErrorMsg('أدخل عبارة الدالة أولاً.');
      return;
    }
    if (expr.includes('□')) {
      setErrorMsg('أكمل الخانات الرياضية الفارغة قبل الحساب.');
      return;
    }

    try {
      let sol: CalculusSolution;
      if (calcMode === 'derivative') {
        sol = computeDerivative(expr, atX);
      } else if (calcMode === 'integral') {
        sol = computeDefiniteIntegral(expr, intA, intB);
      } else {
        const targetVal = limitTarget === 'inf' || limitTarget === '+inf' ? 'infinity' : limitTarget === '-inf' ? '-infinity' : parseFloat(limitTarget) || 0;
        sol = computeLimit(expr, targetVal, useLHopital);
      }

      setSolution(sol);
      if (calcMode === 'derivative') {
        try {
          setVariationTable(buildVariationTableLatex(expr));
        } catch {
          setVariationTable(null);
        }
      }

      // Save History
      onSaveHistory({
        mode: calcMode === 'limits' ? 'limits' : 'calculus',
        title: calcMode === 'derivative' ? 'اشتقاق ومعادلة المماس' : calcMode === 'integral' ? 'تكامل محدد' : 'حساب نهاية',
        inputLatex: sol.functionLatex,
        resultLatex: sol.firstDerivativeLatex || (sol.integralValue ? sol.integralValue.definiteExactLatex || '' : sol.limitValue?.result || ''),
        resultDecimal: sol.tangentLine ? sol.tangentLine.equationLatex : undefined,
        steps: sol.steps.map(s => `${s.title}: ${s.explanation || ''} -> $${s.latex}$`)
      });

      burst(['#10b981', '#06b6d4', '#ec4899']);
    } catch (err: any) {
      soundHaptics.playError();
      setErrorMsg(err.message || 'خطأ في معالجة الدالة الرياضية');
    }
  };

  // Chart configuration for function & tangent line
  const chartConfig = solution?.plotPoints ? {
    labels: solution.plotPoints.map(p => p.x.toString()),
    datasets: [
      {
        label: 'منحنى الدالة f(x)',
        data: solution.plotPoints.map(p => p.fx),
        borderColor: '#10b981',
        backgroundColor: calcMode === 'integral' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.05)',
        fill: calcMode === 'integral',
        tension: 0.2,
        pointRadius: 0
      },
      ...(solution.plotPoints.some(p => p.tangent !== undefined) ? [
        {
          label: `المماس عند x₀ = ${atX}`,
          data: solution.plotPoints.map(p => p.tangent ?? null),
          borderColor: '#f59e0b',
          borderDash: [5, 5],
          tension: 0,
          pointRadius: 0
        }
      ] : [])
    ]
  } : null;

  return (
    <div className="space-y-5">
      {modeOnly && (
        <header className="pb-1 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100">{initialMode === 'limits' ? 'النهايات والتقارب' : 'الاشتقاق ومعادلة المماس'}</h1>
            <p className="text-xs text-slate-400 mt-1">{initialMode === 'limits' ? 'دراسة النهايات من الجهتين وعند اللانهاية، مع الخطوات وقاعدة لوبيتال.' : 'اشتقاق رمزي، نقاط حرجة، ومنحنى المماس.'}</p>
          </div>
          <GuideButton guide={initialMode === 'limits' ? LIMITS_GUIDE : CALCULUS_GUIDE} />
        </header>
      )}
      {/* Mode Tabs */}
      {!modeOnly && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-md">
        {[
          { mode: 'derivative', label: 'المشتقات ومعادلة المماس', sub: "f'(x), f''(x), Tangent" },
          { mode: 'integral', label: 'التكامل المحدد والمساحة', sub: '∫ f(x) dx [a, b]' },
          { mode: 'limits', label: 'دراسة النهايات والتقارب', sub: 'lim f(x) (x → a, ±∞)' }
        ].map((item) => (
          <button
            key={item.mode}
            onClick={() => {
              soundHaptics.playClick();
              setCalcMode(item.mode as CalculusMode);
            }}
            className={`p-3 rounded-xl text-center transition-all flex flex-col items-center justify-center ${
              calcMode === item.mode
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-950'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span className="text-sm font-bold">{item.label}</span>
            <span className="text-[11px] opacity-75 font-mono">{item.sub}</span>
          </button>
        ))}
      </div>}

      {/* Function Inputs Card */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        {/* Function text input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300">عبارة الدالة f(x):</label>
          <NaturalMathField
            ref={mathFieldRef}
            placeholder="مثال: x³ − 3x + 2"
            onChange={(engineExpression) => {
              setExpr(engineExpression);
              setErrorMsg(null);
            }}
          />

          {/* Collapsible function/operator pad shared by derivative and definite-integral modes */}
          {(calcMode === 'derivative' || calcMode === 'integral' || calcMode === 'limits') && (
            <div className="rounded-xl border border-emerald-800/60 bg-slate-950/50 overflow-hidden">
              <button
                type="button"
                aria-expanded={showFunctionPad}
                onClick={() => {
                  soundHaptics.playClick();
                  setShowFunctionPad((open) => !open);
                }}
                className="w-full min-h-9 flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-950/30 transition-colors touch-manipulation"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>لوحة الدوال والعمليات</span>
                  <span className="text-[10px] text-slate-500 font-normal">تُدرج عند المؤشر</span>
                </span>
                {showFunctionPad ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showFunctionPad && (
                <div className="p-2 space-y-2 border-t border-slate-800 animate-fadeIn">
                  {FUNCTION_PAD_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500">{group.title}</div>
                      <div className="grid grid-cols-6 sm:grid-cols-9 gap-1" dir="ltr">
                        {group.keys.map((key) => (
                          <button
                            key={`${group.title}-${key.token}`}
                            type="button"
                            onClick={() => insertExpressionToken(key.token)}
                            className="min-h-8 py-1 rounded-md bg-slate-900 hover:bg-emerald-950/50 active:bg-emerald-900/60 border border-slate-700 hover:border-emerald-700 text-emerald-200 flex items-center justify-center px-0.5 transition-colors touch-manipulation"
                          >
                            <Tex math={key.tex} className="text-[15px] leading-none" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* edit row: backspace + clear */}
                  <div className="grid grid-cols-2 gap-1 pt-0.5" dir="ltr">
                    <button
                      type="button"
                      onClick={handleExpressionBackspace}
                      className="min-h-8 rounded-md bg-rose-950/60 hover:bg-rose-900 active:bg-rose-800 border border-rose-800 text-rose-200 flex items-center justify-center gap-1 text-[11px] font-bold transition-colors touch-manipulation"
                    >
                      <Delete className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExpressionClear}
                      className="min-h-8 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 text-slate-200 flex items-center justify-center gap-1 text-[11px] font-bold transition-colors touch-manipulation"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>مسح الكل</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Parameters based on mode */}
        {calcMode === 'derivative' && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-300 block">نقطة التماس:</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800" dir="ltr">
                <Tex math="x_{0} =" className="text-lg text-slate-200" />
                <NumberInput value={atX} onChange={(value) => { setAtX(value); setAtXEntered(true); }} className="w-24 h-10 text-lg" blankOnZero={!atXEntered} placeholder="مثال: 1" />
              </div>
              <div className="flex items-center gap-1.5">
                {[-2, -1, 0, 1, 2].map((v) => (
                  <button
                    key={v}
                    onClick={() => { soundHaptics.playClick(); setAtX(v); setAtXEntered(true); }}
                    className={`w-9 h-9 rounded-lg border text-sm font-math transition-all ${atX === v ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'}`}
                    dir="ltr"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              معادلة المماس تُحسب عند النقطة <Tex math={`\\left(x_{0},\\ f(x_{0})\\right)`} /> من المنحنى.
            </p>
          </div>
        )}

        {calcMode === 'integral' && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 block">حدود التكامل:</span>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* bounds written exactly like in a textbook: upper bound above ∫, lower bound below */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950/70 border border-slate-800" dir="ltr">
                <div className="flex flex-col items-center gap-1">
                  <NumberInput value={intB} onChange={setIntB} className="w-[72px] h-9 text-base" blankOnZero placeholder="مثال: 2" />
                  <span className="text-5xl leading-none text-emerald-300 select-none" style={{ fontFamily: "'KaTeX_Size3', 'KaTeX_Main', serif" }}>∫</span>
                  <NumberInput value={intA} onChange={setIntA} className="w-[72px] h-9 text-base" blankOnZero placeholder="مثال: 0" />
                </div>
                <div className="text-lg text-slate-100 overflow-x-auto max-w-[180px] sm:max-w-[260px]">
                  <Tex math={`${exprToLatex(expr) ? `\\left(${exprToLatex(expr)}\\right)` : 'f(x)'}\\, dx`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs w-full sm:w-auto" dir="ltr">
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-slate-300">
                  <Tex math={`b = ${intB}`} />
                  <span className="block text-[10px] text-slate-500 mt-0.5" dir="rtl">الحد الأعلى</span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-slate-300">
                  <Tex math={`a = ${intA}`} />
                  <span className="block text-[10px] text-slate-500 mt-0.5" dir="rtl">الحد الأدنى</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {calcMode === 'limits' && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 block">القيمة التي يؤول إليها المتغير:</span>

            {/* x → [value]   with quick choices for the three kinds of limits */}
            <div className="flex flex-wrap items-center gap-2" dir="ltr">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <Tex math="x \longrightarrow" className="text-lg text-slate-200" />
                {limitTarget === 'inf' || limitTarget === '+inf' ? (
                  <Tex math="+\infty" className="text-xl text-cyan-300 w-24 text-center" />
                ) : limitTarget === '-inf' ? (
                  <Tex math="-\infty" className="text-xl text-cyan-300 w-24 text-center" />
                ) : (
                  <NumberInput value={parseFloat(limitTarget) || 0} onChange={(v) => setLimitTarget(String(v))} className="w-24 h-10 text-lg" blankOnZero={limitTarget === ''} placeholder="مثال: 0" />
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { soundHaptics.playClick(); setLimitTarget('0'); }}
                  className={`px-3 h-10 rounded-lg border text-sm transition-all ${!['inf', '+inf', '-inf'].includes(limitTarget) ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'}`}
                >
                  <Tex math="a" className="text-base" />
                  <span className="text-[10px] mr-1 ml-1" dir="rtl">عدد</span>
                </button>
                <button
                  onClick={() => { soundHaptics.playClick(); setLimitTarget('+inf'); }}
                  className={`px-3 h-10 rounded-lg border text-base transition-all ${limitTarget === 'inf' || limitTarget === '+inf' ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'}`}
                >
                  <Tex math="+\infty" />
                </button>
                <button
                  onClick={() => { soundHaptics.playClick(); setLimitTarget('-inf'); }}
                  className={`px-3 h-10 rounded-lg border text-base transition-all ${limitTarget === '-inf' ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'}`}
                >
                  <Tex math="-\infty" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              اختر عدداً حقيقياً لدراسة النهاية عند نقطة، أو <Tex math="\pm\infty" /> لدراسة السلوك عند اللانهاية والمستقيمات المقاربة.
            </p>
            <button
              type="button"
              aria-pressed={useLHopital}
              onClick={() => { soundHaptics.playClick(); setUseLHopital((v) => !v); }}
              className={`w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-colors ${useLHopital ? 'bg-amber-950/40 border-amber-700 text-amber-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
            >
              <span className="text-xs font-bold">تطبيق قاعدة لوبيتال على الصورة غير المحددة</span>
              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${useLHopital ? 'bg-amber-500' : 'bg-slate-700'}`}>
                <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${useLHopital ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            {useLHopital && <p className="text-[11px] text-amber-300/80 leading-5">يتحقق المحرك أولاً من أن الحالة 0/0 أو ∞/∞، ثم يشتق البسط والمقام تكرارياً. إذا لم تتحقق الشروط سيشرح سبب عدم انطباق القاعدة.</p>}
          </div>
        )}

        {/* Compute Button */}
        <button
          onClick={handleCompute}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>تنفيذ التحليل الرياضي وعرض المنحنى والخطوات</span>
        </button>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-400 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Solution Display */}
      {solution && !errorMsg && (
        <div className="space-y-4 animate-fadeIn">
          {calcMode === 'derivative' && (
            <WhatDoYouWant
              title="ماذا تريد أن تستعرض من نتائج الاشتقاق؟"
              subtitle="اختر ما تريد عرضه بالتحديد مع الخطوات والقواعد:"
              selectedId={targetCalculus}
              onSelect={setTargetCalculus}
              options={[
                { id: 'derivatives', label: 'المشتقة الأولى والثانية' },
                ...(variationTable ? [{ id: 'table', label: 'مخطط التغيرات الامتحاني' }] : []),
                { id: 'tangent', label: 'معادلة المماس (صورته وميله وتعويض)' },
                ...(solution.criticalPoints && solution.criticalPoints.length > 0 ? [{ id: 'critical', label: 'النقاط الحرجة والتقعر' }] : []),
                ...(chartConfig ? [{ id: 'plot', label: 'التمثيل البياني للدالة والمماس' }] : []),
                { id: 'steps', label: 'قواعد الاشتقاق والبرهان بالتفصيل' }
              ]}
            />
          )}

          {calcMode === 'limits' && (
            <WhatDoYouWant
              title="ماذا تريد أن تستعرض من دراسة النهاية؟"
              subtitle="اختر النتيجة المحددة أو الحل الشامل مع الخطوات ولوبيتال:"
              selectedId={targetCalculus}
              onSelect={setTargetCalculus}
              options={[
                { id: 'result', label: 'النتيجة + المقارب والوضع النسبي' },
                { id: 'steps', label: 'خطوات المنهاج: تحليل، اختزال، نهايات شهيرة' }
              ]}
            />
          )}

          {/* Main Results Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Derivative Results */}
            {calcMode === 'derivative' && (
              <>
                {(targetCalculus === 'all' || targetCalculus === 'derivatives') && (
                  <div className="md:col-span-2 bg-slate-900 p-4 rounded-2xl border border-emerald-500/30 shadow-lg space-y-3">
                    <span className="text-xs text-slate-400 font-semibold block">الدالة ومشتقتاها:</span>
                    <div dir="ltr" className="space-y-2">
                      <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto text-slate-200 text-lg">
                        <KaTeXDisplay math={`f(x) = ${solution.functionLatex}`} />
                      </div>
                      <div className="px-3 py-3 rounded-xl bg-emerald-950/30 border border-emerald-600/40 overflow-x-auto text-emerald-300 text-2xl">
                        <KaTeXDisplay math={`f'(x) = ${solution.firstDerivativeLatex || ''}`} allowCopy />
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto text-cyan-300 text-lg">
                        <KaTeXDisplay math={`f''(x) = ${solution.secondDerivativeLatex || ''}`} allowCopy />
                      </div>
                    </div>
                  </div>
                )}

                {(targetCalculus === 'all' || targetCalculus === 'table') && variationTable && (
                  <div className="md:col-span-2 bg-slate-900 p-4 rounded-2xl border border-emerald-500/25 shadow-lg space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-emerald-300">مخطط التغيرات (الجدول الامتحاني الكامل)</span>
                      <span className="text-[10px] text-slate-500">إشارات f′ + نهايات عند أطراف مجال التعريف</span>
                    </div>
                    <div dir="ltr" className="series-scroll overflow-x-auto touch-pan-x p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-emerald-100 text-base">
                      <Tex math={variationTable} display />
                    </div>
                  </div>
                )}

                {(targetCalculus === 'all' || targetCalculus === 'tangent') && (
                  <div className="md:col-span-2 bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
                    <span className="text-xs text-slate-400 font-semibold block">
                      معادلة المماس عند <Tex math={`x_{0} = ${atX}`} />
                    </span>
                    <div dir="ltr" className="px-3 py-3 rounded-xl bg-amber-950/20 border border-amber-600/30 overflow-x-auto text-amber-300 text-xl">
                      <KaTeXDisplay math={solution.tangentLine?.equationLatex || ''} allowCopy />
                    </div>
                    <span className="text-[12px] text-slate-400 block">
                      الميل (معامل التوجيه): <Tex math={`m = ${Number(solution.tangentLine?.slope.toFixed(4))}`} />
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Limits Result */}
            {calcMode === 'limits' && solution.limitValue && (targetCalculus === 'all' || targetCalculus === 'result') && (
              <div className="md:col-span-2 bg-slate-900 p-4 rounded-2xl border border-cyan-500/30 shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-semibold">النتيجة النهائية:</span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      solution.limitValue.kind === 'dne'
                        ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                        : solution.limitValue.kind === 'infinite'
                          ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                          : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {solution.limitValue.kind === 'dne' ? 'النهاية غير موجودة' : solution.limitValue.kind === 'infinite' ? 'النهاية لا نهائية' : 'النهاية موجودة'}
                  </span>
                </div>

                <div
                  dir="ltr"
                  className="px-3 py-3 rounded-xl bg-cyan-950/20 border border-cyan-600/30 overflow-x-auto text-cyan-200 whitespace-nowrap"
                  style={{ fontSize: (solution.functionLatex.length + solution.limitValue.result.length) > 60 ? '0.85rem' : (solution.functionLatex.length + solution.limitValue.result.length) > 35 ? '1rem' : '1.15rem' }}
                >
                  <KaTeXDisplay
                    math={`\\lim_{x \\to ${solution.limitValue.targetLatex ?? solution.limitValue.target}} \\left(${solution.functionLatex}\\right) = ${solution.limitValue.result}`}
                    allowCopy
                  />
                </div>

                {solution.limitValue.twoSided && (
                  <div dir="ltr" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="px-2 py-2 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto text-slate-200 text-center space-y-1">
                      <span className="block text-[10px] text-slate-500" dir="rtl">نهاية بقيم أصغر (x &lt; a)</span>
                      <Tex math={`\\lim_{x \\to ${solution.limitValue.targetLatex},\\; x < ${solution.limitValue.targetLatex}} f(x) = ${solution.limitValue.leftLatex}`} />
                    </div>
                    <div className="px-2 py-2 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto text-slate-200 text-center space-y-1">
                      <span className="block text-[10px] text-slate-500" dir="rtl">نهاية بقيم أكبر (x &gt; a)</span>
                      <Tex math={`\\lim_{x \\to ${solution.limitValue.targetLatex},\\; x > ${solution.limitValue.targetLatex}} f(x) = ${solution.limitValue.rightLatex}`} />
                    </div>
                  </div>
                )}

                {solution.limitValue.asymptoteLatex && (
                  <div dir="ltr" className="px-3 py-2.5 rounded-xl bg-violet-950/25 border border-violet-600/30 overflow-x-auto text-violet-200 text-base">
                    <span className="block text-[10px] text-violet-300/70 mb-1" dir="rtl">خلاصة المقارب (كما تُطلب في السلّم)</span>
                    <Tex math={solution.limitValue.asymptoteLatex} />
                  </div>
                )}

                {solution.limitValue.positionLatex && (
                  <div dir="ltr" className="px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto text-slate-200 text-[15px]">
                    <span className="block text-[10px] text-slate-500 mb-1" dir="rtl">الوضع النسبي للمنحنى والمقارب بدراسة إشارة f(x) − b</span>
                    <Tex math={solution.limitValue.positionLatex} />
                  </div>
                )}

                {solution.methodUsed && (
                  <p className="text-[11px] text-emerald-300/90 leading-6">
                    <span className="font-bold">الطريقة المعتمدة:</span> {solution.methodUsed}
                  </p>
                )}

                {solution.limitValue.note && <p className="text-xs text-slate-300 leading-6">{solution.limitValue.note}</p>}
              </div>
            )}
          </div>

          {/* Critical points & Extrema */}
          {calcMode === 'derivative' && solution.criticalPoints && solution.criticalPoints.length > 0 && (targetCalculus === 'all' || targetCalculus === 'critical') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <Compass className="w-4 h-4" />
                <span>النقاط الحرجة والقيم الحدية (المحلية):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {solution.criticalPoints.map((cp, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      cp.type === 'min' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      cp.type === 'max' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                      'bg-purple-950 text-purple-400 border border-purple-800'
                    }`}>
                      {cp.type === 'min' ? 'قيمة حدية صغرى' : cp.type === 'max' ? 'قيمة حدية عظمى' : 'نقطة انعطاف'}
                    </span>
                    <span className="font-mono text-slate-200">({cp.x}, {cp.y})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2D Plot */}
          {calcMode === 'derivative' && chartConfig && (targetCalculus === 'all' || targetCalculus === 'plot') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                  <span>التمثيل البياني للدالة والمماس:</span>
                </div>
              </div>
              <div className="h-64 w-full">
                <Line
                  data={chartConfig}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    plugins: {
                      legend: { labels: { color: '#94a3b8', font: { family: 'Cairo' } } }
                    },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Educational Step-by-Step Breakdown */}
          {(targetCalculus === 'all' || targetCalculus === 'steps') && (
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4" />
                <span>خطوات الحل والبرهان الكامل:</span>
              </div>

              <div className="space-y-3">
                {solution.steps.map((st, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center text-[10px]">
                        {i + 1}
                      </span>
                      <span><RichText text={st.title} /></span>
                    </div>
                    {st.explanation && <p className="text-xs text-slate-300 mr-7 leading-6"><RichText text={st.explanation} /></p>}
                    <div dir="ltr" className="mr-7 p-2.5 rounded-lg bg-slate-900 text-[15px] overflow-x-auto">
                      <KaTeXDisplay math={st.latex} block />
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

