import React, { useState } from 'react';
import {
  factorial,
  permutations,
  combinations,
  solveUrnExperiment,
  solveBinomialDistribution,
  solveNormalDistribution,
  computeDescriptiveStats,
  numToLatex,
  randomVariableOfDraw,
  UrnResult,
  UrnColor,
  DrawMode
} from '../../utils/probabilityEngine';

// Maps a typed colour name (Arabic or English) to a real display colour
const COLOR_MAP: { keys: string[]; bg: string; text: string; border: string; dot: string }[] = [
  { keys: ['بيض', 'أبيض', 'ابيض', 'white'], bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-300', dot: '#f1f5f9' },
  { keys: ['سود', 'أسود', 'اسود', 'black'], bg: 'bg-slate-950', text: 'text-slate-100', border: 'border-slate-500', dot: '#0f172a' },
  { keys: ['حمر', 'أحمر', 'احمر', 'red'], bg: 'bg-rose-600', text: 'text-white', border: 'border-rose-400', dot: '#e11d48' },
  { keys: ['خضر', 'أخضر', 'اخضر', 'green'], bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-400', dot: '#059669' },
  { keys: ['زرق', 'أزرق', 'ازرق', 'blue'], bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-400', dot: '#2563eb' },
  { keys: ['صفر', 'أصفر', 'اصفر', 'yellow'], bg: 'bg-yellow-400', text: 'text-slate-900', border: 'border-yellow-300', dot: '#facc15' },
  { keys: ['برتقال', 'orange'], bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-300', dot: '#f97316' },
  { keys: ['بنفسج', 'purple', 'violet'], bg: 'bg-violet-600', text: 'text-white', border: 'border-violet-400', dot: '#7c3aed' },
  { keys: ['وردي', 'زهري', 'pink'], bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-300', dot: '#ec4899' },
  { keys: ['بني', 'brown'], bg: 'bg-amber-800', text: 'text-white', border: 'border-amber-600', dot: '#92400e' },
  { keys: ['رمادي', 'gray', 'grey'], bg: 'bg-gray-500', text: 'text-white', border: 'border-gray-300', dot: '#6b7280' },
  { keys: ['ذهبي', 'gold'], bg: 'bg-amber-400', text: 'text-slate-900', border: 'border-amber-300', dot: '#fbbf24' },
  { keys: ['سماوي', 'cyan', 'فيروزي'], bg: 'bg-cyan-500', text: 'text-slate-900', border: 'border-cyan-300', dot: '#06b6d4' }
];
const FALLBACK = { bg: 'bg-slate-800', text: 'text-slate-100', border: 'border-slate-600', dot: '#334155' };
function colorStyle(name: string) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return FALLBACK;
  return COLOR_MAP.find((c) => c.keys.some((k) => n.includes(k))) ?? FALLBACK;
}

const DRAW_MODES: { id: DrawMode; title: string; sub: string; formula: string }[] = [
  { id: 'simultaneous', title: 'سحب في آن واحد أو معاً', sub: 'الترتيب غير مهم', formula: '\\binom{n}{p}' },
  { id: 'successive_without_rep', title: 'سحب تتالي دون إعادة', sub: 'تراتيب — الترتيب مهم', formula: 'A_{n}^{p}' },
  { id: 'successive_with_rep', title: 'سحب تتالي مع إعادة', sub: 'تباديل — الترتيب مهم', formula: 'n^{p}' }
];
import { ProbabilitySubmode, HistoryEntry, DescriptiveStatsResult } from '../../types';
import { Tex, RichText } from '../common/Tex';
import { NumberInput } from '../common/NumberInput';
import { soundHaptics } from '../../utils/soundHaptics';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineController,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// BarElement was missing: the bar charts (binomial / descriptive statistics) crashed into a blank page
ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineController, PointElement, LineElement, Tooltip, Legend, Filler);
import { Sparkles, Dice5, TrendingUp, BarChart3, Box, Target, Plus, X, ChevronDown } from 'lucide-react';
import { burst } from '../../utils/perf';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';
import { PROBABILITY_GUIDE } from '../../utils/sectionGuides';

interface ProbabilitySolverProps {
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

const Field: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({ label, color = 'text-slate-400', children }) => (
  <div className="space-y-1.5 min-w-0">
    <div className={`text-xs font-bold min-h-[20px] flex items-center ${color}`}>
      <Tex math={label} className="text-[13px]" />
    </div>
    {children}
  </div>
);

const StatCard: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'text-emerald-300' }) => (
  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center space-y-1 min-w-0">
    <div className="text-[11px] text-slate-400"><Tex math={label} /></div>
    <div className={`text-lg font-bold font-math ${color}`} dir="ltr">{value}</div>
  </div>
);

const chartScales = {
  x: { grid: { color: 'rgba(255,255,255,0.05)' } },
  y: { grid: { color: 'rgba(255,255,255,0.05)' } }
};

// short animation: full Chart.js animations stutter in a phone WebView
const chartAnim = { duration: 250 };

export const ProbabilitySolver: React.FC<ProbabilitySolverProps> = ({ onSaveHistory }) => {
  const [submode, setSubmode] = useState<ProbabilitySubmode>('urn_balls');
  const [targetProbability, setTargetProbability] = useState<string>('all');

  // Combinatorics
  const [combN, setCombN] = useState<number>(0);
  const [combK, setCombK] = useState<number>(0);
  const [combResult, setCombResult] = useState<{ n: number; k: number; nFact: number; pnk: number; cnk: number; nk: number } | null>(null);

  // Urn — any number of colours
  const [urnColors, setUrnColors] = useState<UrnColor[]>([{ name: '', count: 0 }]);
  const [drawCount, setDrawCount] = useState<number>(0);
  const [drawMode, setDrawMode] = useState<DrawMode>('simultaneous');
  const [urnResult, setUrnResult] = useState<UrnResult | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Binomial
  const [binN, setBinN] = useState<number>(0);
  const [binP, setBinP] = useState<number>(0);
  const [binK, setBinK] = useState<number>(0);
  const [binResult, setBinResult] = useState<ReturnType<typeof solveBinomialDistribution> | null>(null);

  // Normal
  const [normMu, setNormMu] = useState<number>(0);
  const [normSigma, setNormSigma] = useState<number>(0);
  const [normX, setNormX] = useState<number>(0);
  const [normResult, setNormResult] = useState<ReturnType<typeof solveNormalDistribution> | null>(null);

  // Stats
  const [rawStatsInput, setRawStatsInput] = useState<string>('');
  const [statsResult, setStatsResult] = useState<DescriptiveStatsResult | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSolve = () => {
    soundHaptics.playEquals();
    soundHaptics.vibrate(25);
    setErrorMsg(null);

    try {
      if (submode === 'combinatorics') {
        if (!Number.isInteger(combN) || !Number.isInteger(combK)) throw new Error('يجب أن يكون n و k عددين صحيحين');
        if (combK > combN) throw new Error('يجب أن يكون k أصغر من أو يساوي n');
        if (combN > 170) throw new Error('القيمة كبيرة جداً: أكبر قيمة مسموح بها هي n = 170');
        const r = {
          n: combN,
          k: combK,
          nFact: factorial(combN),
          pnk: permutations(combN, combK),
          cnk: combinations(combN, combK),
          nk: Math.pow(combN, combK)
        };
        // every value is rendered through numToLatex, so an unrenderable number is caught here
        [r.nFact, r.pnk, r.cnk, r.nk].forEach((v) => numToLatex(v));
        setCombResult(r);
        onSaveHistory({
          mode: 'probability',
          title: `التحليل التوافقي (n=${combN}, k=${combK})`,
          inputLatex: `n = ${combN},\\ k = ${combK}`,
          resultLatex: `\\binom{${combN}}{${combK}} = ${numToLatex(r.cnk)},\\ A_{${combN}}^{${combK}} = ${numToLatex(r.pnk)}`,
          resultDecimal: `C=${r.cnk}, A=${r.pnk}`
        });
      } else if (submode === 'urn_balls') {
        const res = solveUrnExperiment(urnColors, drawCount, drawMode);
        setUrnResult(res);
        setOpenGroups({});
        onSaveHistory({
          mode: 'probability',
          title: `سحب كرات (${res.drawModeTitle})`,
          inputLatex: res.omegaFormulaLatex,
          resultLatex: res.events.slice(0, 4).map((p) => p.probabilityFracLatex).join(' ,\\; '),
          resultDecimal: `Card(Ω)=${res.omegaCount}`
        });
      } else if (submode === 'binomial') {
        const res = solveBinomialDistribution(binN, binP, binK);
        setBinResult(res);
        onSaveHistory({
          mode: 'probability',
          title: `التوزيع الثنائي B(${binN}, ${binP})`,
          inputLatex: `\\mathcal{B}(${binN}, ${binP})`,
          resultLatex: res.pk ? res.pk.latex : `E(X) = ${res.mean}`,
          resultDecimal: `E(X)=${res.mean}, V(X)=${res.variance.toFixed(4)}`
        });
      } else if (submode === 'normal') {
        const res = solveNormalDistribution(normMu, normSigma, normX);
        setNormResult(res);
        onSaveHistory({
          mode: 'probability',
          title: `التوزيع الطبيعي N(${normMu}, ${normSigma}²)`,
          inputLatex: `\\mathcal{N}(${normMu}, ${normSigma}^{2})`,
          resultLatex: res.singleX?.latex || '',
          resultDecimal: `P(X <= ${normX}) = ${res.singleX?.pLess}`
        });
      } else {
        const nums = rawStatsInput.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).split(/[\s,;،]+/).map((v) => parseFloat(v)).filter((v) => !isNaN(v));
        const res = computeDescriptiveStats(nums);
        setStatsResult(res);
        onSaveHistory({
          mode: 'probability',
          title: 'إحصاء وصفي للمجموعة',
          inputLatex: `N = ${res.n}`,
          resultLatex: `\\bar{x} = ${res.mean},\\ \\text{Med} = ${res.median},\\ s = ${res.stdDevSample}`,
          resultDecimal: `Mean: ${res.mean}, StdDev: ${res.stdDevSample}`
        });
      }

      burst(['#10b981', '#f59e0b', '#ec4899']);
    } catch (err: any) {
      soundHaptics.playError();
      setErrorMsg(err.message || 'خطأ في معالجة الحسابات');
    }
  };

  const tabs = [
    { mode: 'urn_balls', label: 'سحب الكرات', icon: Box },
    { mode: 'combinatorics', label: 'التباديل والتوافيق', icon: Target },
    { mode: 'binomial', label: 'التوزيع الثنائي', icon: Dice5 },
    { mode: 'normal', label: 'التوزيع الطبيعي', icon: TrendingUp },
    { mode: 'stats', label: 'الإحصاء الوصفي', icon: BarChart3 }
  ];
  const inCls = 'w-full text-base';
  const [rvColor, setRvColor] = useState<number>(0);
  const [showRvLaw, setShowRvLaw] = useState<boolean>(false);
  const rv = urnResult ? randomVariableOfDraw(urnResult.colors, drawCount, drawMode, rvColor) : null;
  const rvActive = targetProbability === 'all' || targetProbability === 'rv';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <Dice5 className="w-5 h-5 text-emerald-400" /> الاحتمالات والإحصاء
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">تجارب سحب الكرات، التحليل التوافقي، التوزيعات الاحتمالية والإحصاء الوصفي</p>
        </div>
        <GuideButton guide={PROBABILITY_GUIDE} />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-md">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.mode}
              onClick={() => { soundHaptics.playClick(); setSubmode(item.mode as ProbabilitySubmode); setErrorMsg(null); }}
              className={`p-3 rounded-xl text-center transition-all flex flex-col items-center justify-center gap-1 ${
                submode === item.mode
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-950'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Inputs */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        {submode === 'urn_balls' && (
          <div className="space-y-4">
            <div className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Box className="w-4 h-4 text-emerald-400" />
              <span>تكوين الصندوق ونوع السحب:</span>
            </div>

            {/* Colour cards: name on top (card recolours itself), count below, removable */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {urnColors.map((c, i) => {
                const st = colorStyle(c.name);
                return (
                  <div key={i} className={`relative rounded-xl border-2 ${st.border} ${st.bg} p-2 space-y-1.5 shadow-md transition-colors`}>
                    {urnColors.length > 1 && (
                      <button
                        onClick={() => { soundHaptics.playClick(); setUrnColors(urnColors.filter((_, j) => j !== i)); }}
                        title="حذف اللون"
                        className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md border border-rose-300/60"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <input
                      type="text"
                      value={c.name}
                      placeholder="مثال: أحمر"
                      onChange={(e) => setUrnColors(urnColors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className={`w-full text-center text-xs font-bold bg-black/10 ${st.text} placeholder:opacity-60 rounded-lg px-2 py-1.5 outline-none border border-white/20 focus:border-white/60`}
                    />
                    <NumberInput
                      className="w-full text-base bg-slate-950/90"
                      allowDecimal={false}
                      allowNegative={false}
                      value={c.count}
                      onChange={(v) => setUrnColors(urnColors.map((x, j) => (j === i ? { ...x, count: v } : x)))}
                      blankOnZero
                      placeholder="مثال: 3"
                    />
                  </div>
                );
              })}

              {urnColors.length < 8 && (
                <button
                  onClick={() => { soundHaptics.playClick(); setUrnColors([...urnColors, { name: '', count: 0 }]); }}
                  className="rounded-xl border-2 border-dashed border-emerald-600/60 hover:border-emerald-400 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-300 flex flex-col items-center justify-center gap-1 min-h-[88px] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-xs font-bold">إضافة لون</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>المجموع:</span>
              <span className="font-math text-emerald-300 text-sm" dir="ltr">{urnColors.reduce((s, c) => s + (c.count || 0), 0)}</span>
              <span>كرة</span>
            </div>

            <Field label="\text{عدد الكرات المسحوبة}\ (p)">
              <NumberInput className="w-full sm:w-40 text-base" allowDecimal={false} allowNegative={false} value={drawCount} onChange={setDrawCount} blankOnZero placeholder="مثال: 2" />
            </Field>

            {/* Draw mode: designed option cards instead of a plain <select> */}
            <div className="space-y-1.5">
              <div className="text-xs text-slate-400">طريقة السحب:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DRAW_MODES.map((dm) => {
                  const active = drawMode === dm.id;
                  return (
                    <button
                      key={dm.id}
                      onClick={() => { soundHaptics.playClick(); setDrawMode(dm.id); }}
                      className={`relative p-3 rounded-xl border text-right transition-all flex items-center gap-3 ${
                        active
                          ? 'bg-gradient-to-l from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-md shadow-emerald-950'
                          : 'bg-slate-950/70 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-white' : 'border-slate-500'}`}>
                        {active && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold">{dm.title}</span>
                        <span className={`block text-[10px] ${active ? 'text-emerald-100' : 'text-slate-500'}`}>{dm.sub}</span>
                      </span>
                      <span className={`px-2 py-1 rounded-lg text-sm ${active ? 'bg-white/15' : 'bg-slate-900 border border-slate-800'}`}>
                        <Tex math={dm.formula} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {submode === 'combinatorics' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="\text{عدد العناصر الكلي}\ (n)"><NumberInput className={inCls} allowDecimal={false} allowNegative={false} value={combN} onChange={setCombN} blankOnZero placeholder="مثال: 6" /></Field>
            <Field label="\text{عدد العناصر المختارة}\ (k)"><NumberInput className={inCls} allowDecimal={false} allowNegative={false} value={combK} onChange={setCombK} blankOnZero placeholder="مثال: 3" /></Field>
          </div>
        )}

        {submode === 'binomial' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="\text{المحاولات}\ (n)"><NumberInput className={inCls} allowDecimal={false} allowNegative={false} value={binN} onChange={setBinN} blankOnZero placeholder="مثال: 10" /></Field>
            <Field label="\text{احتمال النجاح}\ (p)"><NumberInput className={inCls} allowNegative={false} value={binP} onChange={setBinP} blankOnZero placeholder="مثال: 0.4" /></Field>
            <Field label="\text{عدد النجاحات}\ (k)"><NumberInput className={inCls} allowDecimal={false} allowNegative={false} value={binK} onChange={setBinK} blankOnZero placeholder="مثال: 4" /></Field>
          </div>
        )}

        {submode === 'normal' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="\text{المتوسط}\ (\mu)"><NumberInput className={inCls} value={normMu} onChange={setNormMu} blankOnZero placeholder="مثال: 100" /></Field>
            <Field label="\text{الانحراف}\ (\sigma)"><NumberInput className={inCls} allowNegative={false} value={normSigma} onChange={setNormSigma} blankOnZero placeholder="مثال: 15" /></Field>
            <Field label="\text{القيمة}\ (x)"><NumberInput className={inCls} value={normX} onChange={setNormX} blankOnZero placeholder="مثال: 115" /></Field>
          </div>
        )}

        {submode === 'stats' && (
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 block">أدخل القيم مفصولة بفواصل أو مسافات:</label>
            <textarea
              rows={3}
              value={rawStatsInput}
              onChange={(e) => setRawStatsInput(e.target.value)}
              placeholder="مثال: 12, 15, 14, 10"
              lang="en"
              dir="ltr"
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-math focus:border-emerald-500 outline-none"
            />
          </div>
        )}

        <button
          onClick={handleSolve}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>حساب الاحتمالات الدقيقة</span>
        </button>

        {errorMsg && <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-400 text-xs font-semibold">{errorMsg}</div>}
      </div>

      {/* ---------------- Urn results ---------------- */}
      {submode === 'urn_balls' && urnResult && (
        <div className="space-y-4 animate-fadeIn">
          <WhatDoYouWant
            title="ماذا تريد أن تستعرض من نتائج تجربة السحب؟"
            subtitle="اختر النتيجة المحددة لعرضها مع البرهان أو اختر الحل الشامل:"
            selectedId={targetProbability}
            onSelect={setTargetProbability}
            options={[
              { id: 'omega', label: 'الكون الكلي للإمكانيات Ω وتكوين الصندوق' },
              { id: 'events', label: 'جميع الأحداث الاحتمالية وبراهينها' },
              { id: 'rv', label: 'المتغير العشوائي X: جدول القانون، E(X)، V(X)، σ(X)' }
            ]}
          />

          {/* Sample space + box composition */}
          {(targetProbability === 'all' || targetProbability === 'omega') && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-3">
              <span className="text-xs text-slate-400 font-semibold block">الكون الكلي للإمكانيات — {urnResult.drawModeTitle}:</span>
              <div className="text-lg font-bold text-emerald-300 overflow-x-auto" dir="ltr"><Tex math={urnResult.omegaFormulaLatex} /></div>
              <div className="flex flex-wrap items-center gap-2">
                {urnResult.colors.map((c, i) => {
                  const st = colorStyle(c.name);
                  return (
                    <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${st.border} ${st.bg} ${st.text} text-[11px] font-bold`}>
                      <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ background: st.dot }} />
                      {c.name}
                      <span className="font-math" dir="ltr">× {c.count}</span>
                    </span>
                  );
                })}
                <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-950 border border-emerald-900 text-[11px] font-bold text-emerald-400">
                  المجموع: <span className="font-math mx-1" dir="ltr">{urnResult.totalBalls}</span>
                </span>
                <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-bold text-slate-300">
                  عدد الأحداث: <span className="font-math mx-1" dir="ltr">{urnResult.events.length}</span>
                </span>
              </div>
            </div>
          )}

          {/* Events grouped by colour / joint / distribution / order — each group collapsible */}
          {/* المتغير العشوائي X: قانون الاحتمالية كما يطلبه السلّم */}
          {rvActive && rv && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-violet-500/40 shadow-lg space-y-3 animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-violet-300" />
                  <span className="text-sm font-bold text-violet-200">المتغير العشوائي X وعدد الكرات من اللون المختار</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-950/70 border border-violet-700 text-violet-200">{rv.lawName}</span>
              </div>

              <p className="text-[11px] text-slate-300 leading-6">
                ليكن <Tex math="X" /> المتغير العشوائي الذي يدل على عدد الكرات <span className="text-violet-200 font-bold">{rv.colorName}</span> المسحوبة. قيم X الممكنة هي أعداد صحيحة من 0 إلى <span className="font-math" dir="ltr">{Math.min(drawCount, urnResult.colors[Math.min(rvColor, urnResult.colors.length - 1)]?.count ?? 0)}</span>.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {urnResult.colors.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { soundHaptics.playClick(); setRvColor(i); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${rvColor === i ? 'bg-violet-500 text-slate-950 border-violet-300' : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'}`}
                  >
                    {c.name || `لون ${i + 1}`}
                  </button>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto series-scroll touch-pan-x" dir="ltr">
                <Tex math={rv.tableTex} display className="text-base text-violet-100" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: 'الأمل الرياضي E(X)', tex: rv.eTex, tone: 'text-emerald-200' },
                  { label: 'التباين V(X)', tex: rv.evTex, tone: 'text-cyan-200' },
                  { label: 'الانحراف المعياري σ(X)', tex: rv.sigmaTex, tone: 'text-amber-200' }
                ].map((box) => (
                  <div key={box.label} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 min-w-0">
                    <span className="text-[10px] text-slate-400 block">{box.label}</span>
                    <div className={`overflow-x-auto text-[13px] ${box.tone}`} dir="ltr"><Tex math={box.tex} /></div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {rv.checks.map((ck, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-emerald-300">{ck.title}</span>
                    <p className="text-[11px] text-slate-400 leading-5">{ck.text}</p>
                    <div className="p-2 rounded-lg bg-slate-900 overflow-x-auto text-[13px]" dir="ltr"><Tex math={ck.latex} /></div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { soundHaptics.playClick(); setShowRvLaw((v) => !v); }}
                className="w-full min-h-10 px-3 rounded-xl border border-violet-700/60 bg-violet-950/30 text-violet-200 text-[11px] font-bold flex items-center justify-between touch-manipulation"
              >
                <span>قانون الصياغة P(X = k) (كما يُكتب في الامتحان)</span>
                {showRvLaw ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showRvLaw && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-violet-800/50 overflow-x-auto series-scroll touch-pan-x" dir="ltr">
                  <Tex math={rv.lawTex} display className="text-base text-violet-100" />
                </div>
              )}
            </div>
          )}

          {(targetProbability === 'all' || targetProbability === 'events') && Array.from(new Set(urnResult.events.map((e) => e.group))).map((group, gi) => {
            const list = urnResult.events.filter((e) => e.group === group);
            const open = openGroups[group] ?? gi < 2;
            const colorName = group.startsWith('كرات ') ? group.slice(5) : '';
            const st = colorName ? colorStyle(colorName) : null;
            return (
              <div key={group} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-lg overflow-hidden">
                <button
                  onClick={() => { soundHaptics.playClick(); setOpenGroups({ ...openGroups, [group]: !open }); }}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-800/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                    {st ? <span className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ background: st.dot }} /> : <Dice5 className="w-4 h-4" />}
                    <span>{group}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-math" dir="ltr">{list.length}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fadeIn">
                    {list.map((p) => (
                      <div key={p.id} className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2 min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="w-6 h-6 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[11px] font-bold font-math shrink-0">{p.id}</span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-100 block">{p.eventTitle.replace(/^[A-Z]: /, '')}</span>
                            <p className="text-[11px] text-slate-400 leading-5"><RichText text={p.description} /></p>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 overflow-x-auto" dir="ltr">
                          <Tex math={p.stepLatex} className="text-[15px] text-emerald-300" />
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">الحالات الملائمة: <span className="font-math text-slate-300" dir="ltr">{p.favorableCount}</span></span>
                          <span className="font-math text-slate-300" dir="ltr">≈ {Number((p.probabilityDec * 100).toFixed(3))}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- Combinatorics results ---------------- */}
      {submode === 'combinatorics' && combResult && (
        <div className="space-y-3 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard label="n!" value={<Tex math={`${combResult.n}! = ${numToLatex(combResult.nFact)}`} />} />
            <StatCard color="text-cyan-300" label="A_{n}^{k}" value={<Tex math={`A_{${combResult.n}}^{${combResult.k}} = ${numToLatex(combResult.pnk)}`} />} />
            <StatCard color="text-purple-300" label="\binom{n}{k}" value={<Tex math={`\\binom{${combResult.n}}{${combResult.k}} = ${numToLatex(combResult.cnk)}`} />} />
            <StatCard color="text-amber-300" label="n^{k}" value={<Tex math={`${combResult.n}^{${combResult.k}} = ${numToLatex(combResult.nk)}`} />} />
          </div>
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg overflow-x-auto">
            <Tex
              display
              math={`\\begin{aligned} A_{n}^{k} &= \\dfrac{n!}{(n-k)!} \\\\[6pt] \\binom{n}{k} &= \\dfrac{n!}{k!\\,(n-k)!} = \\dfrac{A_{n}^{k}}{k!} \\end{aligned}`}
            />
          </div>
        </div>
      )}

      {/* ---------------- Binomial results ---------------- */}
      {submode === 'binomial' && binResult && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="E(X) = n\,p" value={Number(binResult.mean.toFixed(4))} />
            <StatCard color="text-cyan-300" label="V(X) = n\,p\,q" value={Number(binResult.variance.toFixed(4))} />
            <StatCard color="text-purple-300" label="\sigma(X)" value={Number(binResult.stdDev.toFixed(4))} />
          </div>

          {binResult.pk && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/30 shadow-lg space-y-2 overflow-x-auto">
              <span className="text-xs text-slate-400 font-bold block">الاحتمال النقطي:</span>
              <Tex math={binResult.pk.latex} display />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm">
                  <Tex math={`P(X \\leq ${binResult.pk.k}) = ${binResult.table[binResult.pk.k].cdf}`} />
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm">
                  <Tex math={`P(X \\geq ${binResult.pk.k}) = ${Number((1 - (binResult.pk.k > 0 ? binResult.table[binResult.pk.k - 1].cdf : 0)).toFixed(6))}`} />
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
            <div className="text-xs font-bold text-emerald-400">مخطط التوزيع الاحتمالي:</div>
            <div className="h-56 w-full" dir="ltr">
              <Bar
                data={{
                  labels: binResult.table.map((t) => String(t.k)),
                  datasets: [{ label: 'P(X=k)', data: binResult.table.map((t) => t.pmf), backgroundColor: binResult.table.map((t) => (t.k === binK ? '#10b981' : '#334155')), borderRadius: 6 }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, locale: 'en-US', animation: chartAnim, plugins: { legend: { display: false } }, scales: chartScales }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Normal results ---------------- */}
      {submode === 'normal' && normResult && (
        <div className="space-y-4 animate-fadeIn">
          {normResult.singleX && (
            <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/30 shadow-lg space-y-2 overflow-x-auto">
              <span className="text-xs text-emerald-400 font-bold block">الاحتمال التراكمي وتحويل المتغير المعياري Z:</span>
              <Tex math={normResult.singleX.latex} display />
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm">
                <Tex math={`P(X \\geq ${normResult.singleX.x}) = ${normResult.singleX.pGreater}`} />
              </div>
            </div>
          )}

          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
            <div className="text-xs font-bold text-emerald-400">منحنى التوزيع الطبيعي (منحنى الجرس):</div>
            <div className="h-56 w-full" dir="ltr">
              <Line
                data={{
                  labels: normResult.curvePoints.map((p) => String(p.x)),
                  datasets: [{ label: 'f(x)', data: normResult.curvePoints.map((p) => p.density), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', fill: true, tension: 0.3, pointRadius: 0 }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, locale: 'en-US', animation: chartAnim, plugins: { legend: { display: false } }, scales: { x: { ...chartScales.x, ticks: { maxTicksLimit: 8 } }, y: chartScales.y } }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Stats results ---------------- */}
      {submode === 'stats' && statsResult && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="N" value={statsResult.n} color="text-slate-100" />
            <StatCard label="\bar{x}" value={statsResult.mean} />
            <StatCard label="\text{Med}" value={statsResult.median} color="text-cyan-300" />
            <StatCard label="s" value={statsResult.stdDevSample} color="text-purple-300" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Q_{1}" value={statsResult.q1} color="text-amber-300" />
            <StatCard label="Q_{3}" value={statsResult.q3} color="text-amber-300" />
            <StatCard label="IQR" value={statsResult.iqr} color="text-amber-300" />
            <StatCard label="\sigma^{2}" value={statsResult.variancePop} color="text-rose-300" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="\min" value={statsResult.min} color="text-slate-200" />
            <StatCard label="\max" value={statsResult.max} color="text-slate-200" />
            <StatCard label="\text{Mode}" value={statsResult.mode.length ? statsResult.mode.join(' , ') : '—'} color="text-slate-200" />
          </div>
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg space-y-2">
            <div className="text-xs font-bold text-emerald-400">المدرج التكراري:</div>
            <div className="h-56 w-full" dir="ltr">
              <Bar
                data={{ labels: statsResult.histogram.map((h) => h.bin), datasets: [{ label: 'count', data: statsResult.histogram.map((h) => h.count), backgroundColor: '#10b981', borderRadius: 6 }] }}
                options={{ responsive: true, maintainAspectRatio: false, locale: 'en-US', animation: chartAnim, plugins: { legend: { display: false } }, scales: chartScales }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
