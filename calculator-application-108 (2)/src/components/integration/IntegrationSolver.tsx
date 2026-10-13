import React, { useRef, useState } from 'react';
import { HistoryEntry } from '../../types';
import { NumberInput } from '../common/NumberInput';
import { Tex, RichText } from '../common/Tex';
import { NaturalMathField, NaturalMathFieldHandle } from '../common/NaturalMathField';
import { MathKeyPad } from '../common/MathKeyPad';
import { soundHaptics } from '../../utils/soundHaptics';
import { burst } from '../../utils/perf';
import { IntegrationMode, IntegrationResult, SeriesResult, solveIntegral } from '../../utils/integrationEngine';
import { CheckCircle2, ChevronDown, ChevronUp, Info, LoaderCircle, Sigma, Sparkles } from 'lucide-react';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { INTEGRATION_GUIDE } from '../../utils/sectionGuides';

/** one typeset line inside the series card, always inside a scrollable box */
const SeriesBlock: React.FC<{ title: string; tex: string; tone?: 'plain' | 'result' }> = ({ title, tex, tone = 'plain' }) => (
  <div className="space-y-1 min-w-0">
    <span className="block text-[10px] font-semibold text-indigo-300/80">{title}</span>
    <div
      className={`series-scroll overflow-x-auto touch-pan-x rounded-lg p-2.5 ${
        tone === 'result' ? 'bg-indigo-950/40 border border-indigo-600/40' : 'bg-slate-950/80 border border-slate-800'
      }`}
      dir="ltr"
    >
      <Tex math={tex} className={tone === 'result' ? 'text-base text-indigo-100' : 'text-sm text-slate-200'} display />
    </div>
  </div>
);

/**
 * Specialized card shown only when the engine had to expand the integrand into an
 * infinite power series. It explains the choice and keeps every long formula inside
 * its own horizontally scrollable box so nothing overlaps on a phone.
 */
const SeriesCard: React.FC<{
  series: SeriesResult;
  variable: string;
  mode: IntegrationMode;
  lower: number;
  upper: number;
}> = ({ series, variable, mode, lower, upper }) => {
  const [showWhy, setShowWhy] = useState(false);
  const errorTex =
    series.relativeError !== null && series.relativeError !== undefined
      ? `${(series.relativeError * 100).toPrecision(2)}\\,\\%`
      : null;

  return (
    <div className="rounded-xl border border-indigo-700/50 bg-gradient-to-br from-indigo-950/40 to-slate-950/70 overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-indigo-800/40 bg-indigo-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
            <Sigma className="w-4 h-4 text-indigo-300" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-indigo-100">الحل باستخدام نشر المتسلسلات اللانهائية</h3>
            <p className="text-[10px] text-slate-400 truncate" dir="rtl">
              {series.label} · {series.termCount} حدّاً بعد التكامل
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={showWhy}
          onClick={() => {
            soundHaptics.playClick();
            setShowWhy((v) => !v);
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border shrink-0 touch-manipulation transition-colors ${
            showWhy ? 'bg-indigo-500 text-slate-950 border-indigo-300' : 'bg-indigo-950/60 text-indigo-200 border-indigo-700/60 hover:bg-indigo-900/60'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>لماذا هذه الطريقة؟</span>
          {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showWhy && (
        <div className="px-3 py-2.5 text-[11px] leading-6 text-indigo-100 bg-indigo-950/30 border-b border-indigo-800/40 animate-fadeIn">
          <RichText text={series.reason} />
        </div>
      )}

      <div className="p-3 space-y-2.5">
        <SeriesBlock title="المتسلسلة بصيغة المجموع" tex={series.sigmaTex} />
        <SeriesBlock title={`نشر الدالة حول الصفر (أول ${series.expansionCount} حدود غير صفرية)`} tex={series.integrandSeriesTex} />
        <SeriesBlock
          title={mode === 'definite' ? `تكامل الحدّات ثم التعويض بـ ${lower} و ${upper}` : 'الدالة الأصلية الناتجة عن المتسلسلة'}
          tex={mode === 'definite'
            ? `\\int_{${lower}}^{${upper}} \\left(${series.integrandSeriesTex}\\right) d${variable} \\approx ${series.exactSeriesTex ?? (series.decimalValue !== undefined ? Number(series.decimalValue.toPrecision(9)) : '\\cdots')}`
            : `F(${variable}) = ${series.integratedTex}`}
          tone="result"
        />

        {mode === 'definite' && series.decimalValue !== undefined && (
          <div className="series-scroll overflow-x-auto touch-pan-x rounded-lg p-2.5 bg-slate-950/80 border border-slate-800" dir="ltr">
            <Tex
              className="text-sm text-slate-200"
              display
              math={`\\begin{aligned} I &\\approx ${Number(series.decimalValue.toPrecision(9))}${
                series.referenceValue !== null && series.referenceValue !== undefined ? ` \\\\[6pt] \\text{مرجع عددي مستقل: } ${Number(series.referenceValue.toPrecision(9))}` : ''
              }${errorTex ? ` \\\\[6pt] \\text{الفرق النسبي: } ${errorTex}` : ''} \\end{aligned}`}
            />
          </div>
        )}

        <div className={`text-[11px] leading-6 rounded-lg p-2.5 border ${series.divergent ? 'text-rose-200 bg-rose-950/40 border-rose-800/60' : 'text-slate-300 bg-slate-950/60 border-slate-800'}`}>
          <RichText text={series.note} />
        </div>
      </div>
    </div>
  );
};

interface IntegrationSolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const INTEGRATION_VARIABLES = ['x', 't', 'u'];

const IntegralGraph: React.FC<{ result: IntegrationResult; lower: number; upper: number }> = ({ result, lower, upper }) => {
  const points = (result.plotPoints ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 2) return null;
  const W = 640, H = 220, padX = 28, padY = 18;
  const xs = points.map((p) => p.x);
  const ys = [...points.map((p) => p.y), 0];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY0 = Math.min(...ys), maxY0 = Math.max(...ys);
  const yPad = Math.max((maxY0 - minY0) * 0.12, 0.5);
  const minY = minY0 - yPad, maxY = maxY0 + yPad;
  const px = (x: number) => padX + (x - minX) / (maxX - minX || 1) * (W - padX * 2);
  const py = (y: number) => H - padY - (y - minY) / (maxY - minY || 1) * (H - padY * 2);
  const curve = points.map((p, i) => `${i ? 'L' : 'M'} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  const areaPoints = result.mode === 'definite'
    ? points.filter((p) => p.x >= Math.min(lower, upper) && p.x <= Math.max(lower, upper))
    : [];
  const area = areaPoints.length > 1
    ? `M ${px(areaPoints[0].x).toFixed(1)} ${py(0).toFixed(1)} ` + areaPoints.map((p) => `L ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ') + ` L ${px(areaPoints[areaPoints.length - 1].x).toFixed(1)} ${py(0).toFixed(1)} Z`
    : '';
  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2">
      <div className="text-xs font-bold text-emerald-300">منحنى الدالة {result.mode === 'definite' ? 'والمنطقة تحت المنحنى' : ''}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-h-[150px]" role="img" aria-label="الرسم البياني لدالة التكامل">
        <line x1={padX} y1={py(0)} x2={W - padX} y2={py(0)} stroke="#64748b" strokeWidth="1" />
        <line x1={px(0)} y1={padY} x2={px(0)} y2={H - padY} stroke="#475569" strokeWidth="1" />
        {area && <path d={area} fill="rgba(16,185,129,0.22)" stroke="none" />}
        {result.mode === 'definite' && <>
          <line x1={px(lower)} y1={padY} x2={px(lower)} y2={H - padY} stroke="#f59e0b" strokeDasharray="4 4" />
          <line x1={px(upper)} y1={padY} x2={px(upper)} y2={H - padY} stroke="#f59e0b" strokeDasharray="4 4" />
        </>}
        <path d={curve} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {result.mode === 'definite' && <div className="text-[10px] text-slate-500 text-center">المساحة المظللة تمثل التكامل الجبري، وقد تكون سالبة إذا كان المنحنى تحت محور x.</div>}
    </div>
  );
};

export const IntegrationSolver: React.FC<IntegrationSolverProps> = ({ onSaveHistory }) => {
  const [mode, setMode] = useState<IntegrationMode>('indefinite');
  const [targetIntegration, setTargetIntegration] = useState<string>('all');
  const [expression, setExpression] = useState('');
  const [exprLatex, setExprLatex] = useState('');
  const [variable, setVariable] = useState('x');
  const [lower, setLower] = useState(0);
  const [upper, setUpper] = useState(0);
  const [lowerEntered, setLowerEntered] = useState(false);
  const [upperEntered, setUpperEntered] = useState(false);
  const [result, setResult] = useState<IntegrationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<NaturalMathFieldHandle>(null);

  const handleSolve = () => {
    soundHaptics.playEquals();
    setError('');
    setResult(null);

    if (!expression.trim()) {
      setError('أدخل الدالة المراد تكاملها أولاً.');
      return;
    }
    if (mode === 'definite' && (!lowerEntered || !upperEntered)) {
      setError('أدخل الحد السفلي والحد العلوي للتكامل المحدد.');
      return;
    }

    setBusy(true);
    // Let the busy indicator paint before the symbolic engine starts.
    window.setTimeout(() => {
      try {
        const solved = solveIntegral({
          expression,
          variable,
          mode,
          method: 'automatic',
          lower,
          upper
        });
        setResult(solved);
        const finalLatex = mode === 'definite' ? (solved.exactValueLatex ?? String(solved.decimalValue)) : (solved.primitiveLatex ?? '');
        onSaveHistory({
          mode: 'integration',
          title: mode === 'definite' ? 'تكامل محدد' : 'تكامل غير محدد',
          inputLatex: solved.integrandLatex,
          resultLatex: finalLatex,
          resultDecimal: solved.decimalValue === undefined ? undefined : String(solved.decimalValue),
          steps: solved.steps.map((step) => `${step.title}: ${step.text} $${step.latex}$`)
        });
        burst(['#10b981', '#06b6d4', '#a78bfa'], 10);
      } catch (e) {
        soundHaptics.playError();
        setError(e instanceof Error ? e.message : 'تعذر حساب هذا التكامل.');
      } finally {
        setBusy(false);
      }
    }, 24);
  };

  const integrandTex = exprLatex.trim() ? `\\left(${exprLatex}\\right)` : 'f(x)';

  return (
    <div className="space-y-5">
      <header className="pb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Sigma className="w-6 h-6 text-emerald-400" /> التكامل
          </h1>
          <p className="text-xs text-slate-400 mt-1">محرك رمزي يختار تلقائياً القوانين أو التعويض أو التجزئة، ويستخدم حساباً عددياً تكيفياً للتكامل المحدد عند الحاجة.</p>
        </div>
        <GuideButton guide={INTEGRATION_GUIDE} />
      </header>

      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800">
        {([
          ['indefinite', 'تكامل غير محدد', '\\int f(x)\\,dx'],
          ['definite', 'تكامل محدد ومساحة', '\\int_{a}^{b} f(x)\\,dx']
        ] as const).map(([id, title, formula]) => (
          <button
            key={id}
            onClick={() => { soundHaptics.playClick(); setMode(id); setResult(null); }}
            className={`min-h-14 rounded-xl border px-2 py-2 flex flex-col items-center justify-center gap-1 transition-colors ${mode === id ? 'bg-emerald-600/90 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
          >
            <span className="text-xs font-bold">{title}</span>
            <Tex math={formula} />
          </button>
        ))}
      </div>

      <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
        {/* Integrand: same natural editor and symbol pad used by the derivative section */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">الدالة تحت التكامل f(x):</label>
          <NaturalMathField
            ref={fieldRef}
            placeholder="مثال: x² + 3x"
            onChange={(engineExpression, latex) => {
              setExpression(engineExpression);
              setExprLatex(latex);
              setError('');
            }}
          />
          <MathKeyPad
            onInsert={(token) => fieldRef.current?.insert(token)}
            onBackspace={() => fieldRef.current?.backspace()}
            onClear={() => {
              fieldRef.current?.clear();
              setExpression('');
              setExprLatex('');
            }}
            label="رموز ودوال التكامل"
          />
        </div>

        {/* Integration variable, typeset as a real integral */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-300">متغير التكامل</span>
            <div className="flex gap-1.5" dir="ltr">
              {INTEGRATION_VARIABLES.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => { soundHaptics.playClick(); setVariable(symbol); }}
                  className={`min-w-11 h-10 px-2 rounded-lg border flex items-center justify-center ${variable === symbol ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold' : 'bg-slate-900 text-slate-300 border-slate-700'}`}
                >
                  <Tex math={symbol} className="text-base" />
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto py-1" dir="ltr">
            <Tex display math={`\\int ${integrandTex}\\,\\mathrm{d}${variable}`} />
          </div>
          <p className="text-[10px] text-slate-500">طريقة التكامل يختارها المحرك تلقائياً؛ وتظهر قواعده وخطوات التحقق مع النتيجة.</p>
        </div>

        {mode === 'definite' && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-emerald-800/50 bg-emerald-950/10">
            <label className="space-y-1.5 text-xs text-slate-400"><span className="block">الحد السفلي a</span><NumberInput value={lower} onChange={(v) => { setLower(v); setLowerEntered(true); }} className="w-full h-10 text-base" blankOnZero placeholder="مثال: 0" /></label>
            <label className="space-y-1.5 text-xs text-slate-400"><span className="block">الحد العلوي b</span><NumberInput value={upper} onChange={(v) => { setUpper(v); setUpperEntered(true); }} className="w-full h-10 text-base" blankOnZero placeholder="مثال: 1" /></label>
          </div>
        )}

        <button onClick={handleSolve} disabled={busy} className="w-full min-h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-60 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 touch-manipulation">
          {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{busy ? 'يجري التكامل الرمزي...' : mode === 'definite' ? 'احسب التكامل المحدد' : 'أوجد الدالة الأصلية والبرهان'}</span>
        </button>

        {error && <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs leading-6"><RichText text={error} /></div>}
      </section>

      {result && (
        <section className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من حل التكامل؟"
            subtitle="اختر النتيجة المحددة لعرض تفاصيلها أو اختر الحل الشامل:"
            selectedId={targetIntegration}
            onSelect={setTargetIntegration}
            options={[
              { id: 'result', label: 'قيمة التكامل والدالة الأصلية' },
              ...(result.series ? [{ id: 'series', label: 'نشر المتسلسلات اللانهائية' }] : []),
              { id: 'graph', label: 'الرسم البياني وتظليل المساحة' },
              { id: 'steps', label: 'البرهان والخطوات وقواعد التكامل' }
            ]}
          />

          {(targetIntegration === 'all' || targetIntegration === 'result') && (
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/20 border border-emerald-500/30 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> نتيجة التكامل
                  {result.approximate && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-indigo-200 bg-indigo-950/60 border-indigo-700">
                      متسلسلة مقطوعة
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${result.verified ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800' : 'text-amber-300 bg-amber-950/50 border-amber-800'}`}>
                  {result.verified ? 'تحقق بالاشتقاق' : 'تحقق غير حاسم'}
                </span>
              </div>
              <div dir="ltr" className="series-scroll p-3 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto touch-pan-x text-emerald-200 text-lg sm:text-xl">
                {result.mode === 'definite' ? (
                  <Tex display math={`\\begin{aligned} I &= \\int_{${lower}}^{${upper}} ${result.integrandLatex}\\,d${variable} \\\\[8pt] ${result.numericalFallback || result.approximate ? '&\\approx' : '&='} ${result.exactValueLatex} ${result.numericalFallback || result.approximate ? '' : `\\\\[4pt] &\\approx ${result.decimalValue?.toPrecision(9)}`} \\end{aligned}`} />
                ) : (
                  <Tex display math={`\\int ${result.integrandLatex}\\,d${variable} ${result.approximate ? '\\approx' : '='} ${result.primitiveLatex}`} />
                )}
              </div>
              {result.numericalFallback && <p className="text-[11px] text-amber-300">القيمة المحددة حُسبت عددياً تكيفياً؛ لا يدّعي المحرك أنها صيغة مغلقة دقيقة.</p>}
              {result.warning && <div className="text-xs text-amber-200 bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5"><RichText text={result.warning} /></div>}
            </div>
          )}

          {(targetIntegration === 'all' || targetIntegration === 'graph') && (
            <IntegralGraph result={result} lower={lower} upper={upper} />
          )}

          {(targetIntegration === 'all' || targetIntegration === 'series' || targetIntegration === 'steps') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h2 className="text-sm font-bold text-slate-200">البرهان والخطوات</h2>

              {/* the series explanation leads the breakdown when the engine expanded the integrand */}
              {result.series && (targetIntegration === 'all' || targetIntegration === 'series') && (
                <SeriesCard series={result.series} variable={variable} mode={result.mode} lower={lower} upper={upper} />
              )}

              {(targetIntegration === 'all' || targetIntegration === 'steps') && result.steps.map((step, index) => (
                <div key={index} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2">
                  <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 text-[11px] font-bold flex items-center justify-center">{index + 1}</span><span className="text-xs font-bold text-emerald-300">{step.title}</span></div>
                  <p className="text-xs text-slate-400 leading-6"><RichText text={step.text} /></p>
                  <div className="series-scroll p-2 rounded-lg bg-slate-900 overflow-x-auto touch-pan-x" dir="ltr"><Tex math={step.latex} display /></div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
