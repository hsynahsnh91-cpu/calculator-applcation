import React, { useState } from 'react';
import { NumberInput } from '../common/NumberInput';
import { Tex, RichText } from '../common/Tex';
import { soundHaptics } from '../../utils/soundHaptics';
import {
  V3, Plane, Outcome, Tone, WorkStep, PlaneResult, LineResult,
  linearDependence2, linearDependence3, vectorOps,
  planeFromThreePoints, planeFromNormal, planeFromDirections, planeFromCoefficients, perpendicularBisectorPlane,
  distancePointPlane, lineFromPointDirection, lineFromTwoPoints, distancePointLine,
  relationPlanes, relationLinePlane, relationLines, tetrahedronVolume, parallelepipedVolume
} from '../../utils/geometryEngine';
import { Box, Boxes, Compass, GitCompare, Layers3, Route, Ruler, Sparkles } from 'lucide-react';
import { GuideButton } from '../common/GuideModal';
import { WhatDoYouWant } from '../common/WhatDoYouWant';

type SolidId = 'cube' | 'cuboid' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'triangularPrism';
type GeometryTab = 'solids' | 'vectors' | 'planes' | 'lines' | 'relations' | 'volumes';
type PlaneMethod = 'three' | 'normal' | 'directions' | 'coeffs' | 'bisector';
type LineMethod = 'dir' | 'points' | 'planes';
type RelMode = 'planes' | 'linePlane' | 'lines';
type VolMode = 'tetra' | 'para';

interface SolidMetric { label: string; value: number; latex: string }

const fmt = (n: number) => String(Number(n.toPrecision(8)));
const sq = (n: number) => n * n;
const cube = (n: number) => n * n * n;

const SOLIDS: { id: SolidId; title: string; icon: string; fields: { id: string; title: string; symbol: string }[] }[] = [
  { id: 'cube', title: 'مكعب', icon: 'cube', fields: [{ id: 'a', title: 'طول الحرف', symbol: 'a' }] },
  { id: 'cuboid', title: 'متوازي مستطيلات', icon: 'box', fields: [{ id: 'a', title: 'الطول', symbol: 'a' }, { id: 'b', title: 'العرض', symbol: 'b' }, { id: 'c', title: 'الارتفاع', symbol: 'c' }] },
  { id: 'sphere', title: 'كرة', icon: 'sphere', fields: [{ id: 'r', title: 'نصف القطر', symbol: 'r' }] },
  { id: 'cylinder', title: 'أسطوانة', icon: 'cylinder', fields: [{ id: 'r', title: 'نصف القطر', symbol: 'r' }, { id: 'h', title: 'الارتفاع', symbol: 'h' }] },
  { id: 'cone', title: 'مخروط', icon: 'cone', fields: [{ id: 'r', title: 'نصف القطر', symbol: 'r' }, { id: 'h', title: 'الارتفاع', symbol: 'h' }] },
  { id: 'pyramid', title: 'هرم رباعي منتظم', icon: 'pyramid', fields: [{ id: 'a', title: 'حرف القاعدة المربعة', symbol: 'a' }, { id: 'h', title: 'الارتفاع العمودي', symbol: 'h' }] },
  { id: 'triangularPrism', title: 'موشور قائم', icon: 'prism', fields: [{ id: 'area', title: 'مساحة القاعدة', symbol: 'A' }, { id: 'perimeter', title: 'محيط القاعدة', symbol: 'P' }, { id: 'h', title: 'طول الموشور', symbol: 'h' }] }
];

function solidSolution(id: SolidId, d: Record<string, number>): { metrics: SolidMetric[]; steps: WorkStep[] } {
  const metrics: SolidMetric[] = [];
  const steps: WorkStep[] = [];
  const add = (label: string, value: number, latex: string) => metrics.push({ label, value, latex });
  const line = (title: string, explanation: string, latex: string) => steps.push({ title, explanation, latex });

  if (id === 'cube') {
    const a = d.a;
    if (a <= 0) throw new Error('يجب أن يكون طول الحرف موجباً.');
    add('الحجم', cube(a), `V = a^{3} = ${fmt(a)}^{3} = ${fmt(cube(a))}`);
    add('المساحة الكلية', 6 * sq(a), `S = 6a^{2} = 6(${fmt(a)})^{2} = ${fmt(6 * sq(a))}`);
    add('المساحة الجانبية', 4 * sq(a), `S_{\\text{جانبية}} = 4a^{2} = ${fmt(4 * sq(a))}`);
    add('قطر المكعب', a * Math.sqrt(3), `d = a\\sqrt{3} = ${fmt(a)}\\sqrt{3} \\approx ${fmt(a * Math.sqrt(3))}`);
    line('المكعب', 'للمكعب ستة أوجه مربعة متطابقة، وقطره الفراغي يتبع فيثاغورس ثلاثي الأبعاد.', 'V = a^{3},\\quad S = 6a^{2},\\quad d = a\\sqrt{3}');
  } else if (id === 'cuboid') {
    const { a, b, c } = d;
    if (a <= 0 || b <= 0 || c <= 0) throw new Error('أبعاد متوازي المستطيلات يجب أن تكون موجبة.');
    const v = a * b * c;
    const area = 2 * (a * b + a * c + b * c);
    const diag = Math.sqrt(sq(a) + sq(b) + sq(c));
    add('الحجم', v, `V = abc = ${fmt(a)}\\cdot${fmt(b)}\\cdot${fmt(c)} = ${fmt(v)}`);
    add('المساحة الكلية', area, `S = 2(ab + ac + bc) = ${fmt(area)}`);
    add('القطر الفراغي', diag, `d = \\sqrt{a^{2}+b^{2}+c^{2}} = \\sqrt{${fmt(sq(a) + sq(b) + sq(c))}} \\approx ${fmt(diag)}`);
    line('متوازي المستطيلات', 'الحجم هو حاصل ضرب الأبعاد الثلاثة، والقطر يُحسب بفيثاغورس في الأبعاد الثلاثة.', 'V = abc,\\quad S = 2(ab+ac+bc),\\quad d = \\sqrt{a^{2}+b^{2}+c^{2}}');
  } else if (id === 'sphere') {
    const r = d.r;
    if (r <= 0) throw new Error('نصف القطر يجب أن يكون موجباً.');
    const v = 4 * Math.PI * cube(r) / 3;
    const area = 4 * Math.PI * sq(r);
    add('الحجم', v, `V = \\dfrac{4}{3}\\pi r^{3} = \\dfrac{4}{3}\\pi(${fmt(r)})^{3} \\approx ${fmt(v)}`);
    add('المساحة السطحية', area, `S = 4\\pi r^{2} = 4\\pi(${fmt(r)})^{2} \\approx ${fmt(area)}`);
    add('القطر', 2 * r, `d = 2r = ${fmt(2 * r)}`);
    line('الكرة', 'المسافة من مركز الكرة إلى سطحها ثابتة وتساوي r.', 'V = \\dfrac{4}{3}\\pi r^{3},\\quad S = 4\\pi r^{2}');
  } else if (id === 'cylinder') {
    const { r, h } = d;
    if (r <= 0 || h <= 0) throw new Error('نصف القطر والارتفاع يجب أن يكونا موجبين.');
    const v = Math.PI * sq(r) * h;
    const lateral = 2 * Math.PI * r * h;
    const area = lateral + 2 * Math.PI * sq(r);
    add('الحجم', v, `V = \\pi r^{2}h = \\pi(${fmt(r)})^{2}(${fmt(h)}) \\approx ${fmt(v)}`);
    add('المساحة الجانبية', lateral, `S_{\\text{جانبية}} = 2\\pi rh \\approx ${fmt(lateral)}`);
    add('المساحة الكلية', area, `S = 2\\pi r(h+r) \\approx ${fmt(area)}`);
    add('قطر القاعدة', 2 * r, `d = 2r = ${fmt(2 * r)}`);
    line('الأسطوانة', 'الحجم يساوي مساحة القاعدة الدائرية مضروبة في الارتفاع، والمساحة الكلية تشمل القاعدتين والسطح الجانبي.', 'V = \\pi r^{2}h,\\quad S_{\\text{جانبية}} = 2\\pi rh,\\quad S = 2\\pi r(h+r)');
  } else if (id === 'cone') {
    const { r, h } = d;
    if (r <= 0 || h <= 0) throw new Error('نصف القطر والارتفاع يجب أن يكونا موجبين.');
    const l = Math.sqrt(sq(r) + sq(h));
    const v = Math.PI * sq(r) * h / 3;
    const lateral = Math.PI * r * l;
    const area = lateral + Math.PI * sq(r);
    add('الارتفاع المائل', l, `\\ell = \\sqrt{r^{2}+h^{2}} = \\sqrt{${fmt(sq(r) + sq(h))}} \\approx ${fmt(l)}`);
    add('الحجم', v, `V = \\dfrac{1}{3}\\pi r^{2}h \\approx ${fmt(v)}`);
    add('المساحة الجانبية', lateral, `S_{\\text{جانبية}} = \\pi r\\ell \\approx ${fmt(lateral)}`);
    add('المساحة الكلية', area, `S = \\pi r(r+\\ell) \\approx ${fmt(area)}`);
    line('المخروط القائم', 'الارتفاع المائل والارتفاع العمودي ونصف قطر القاعدة تشكل مثلثاً قائم الزاوية.', '\\ell^{2}=r^{2}+h^{2},\\quad V=\\dfrac{1}{3}\\pi r^{2}h,\\quad S=\\pi r(r+\\ell)');
  } else if (id === 'pyramid') {
    const { a, h } = d;
    if (a <= 0 || h <= 0) throw new Error('حرف القاعدة والارتفاع يجب أن يكونا موجبين.');
    const slant = Math.sqrt(sq(h) + sq(a / 2));
    const v = sq(a) * h / 3;
    const lateral = 2 * a * slant;
    const area = sq(a) + lateral;
    add('الارتفاع المائل للوجه', slant, `\\ell = \\sqrt{h^{2}+\\left(\\dfrac{a}{2}\\right)^{2}} \\approx ${fmt(slant)}`);
    add('الحجم', v, `V = \\dfrac{1}{3}a^{2}h = ${fmt(v)}`);
    add('المساحة الجانبية', lateral, `S_{\\text{جانبية}} = 2a\\ell = ${fmt(lateral)}`);
    add('المساحة الكلية', area, `S = a^{2}+2a\\ell = ${fmt(area)}`);
    line('الهرم الرباعي المنتظم', 'الارتفاع المائل يقاس على الوجه، ويُستخرج من مثلث قائم ارتفاعه h ونصف قاعدته a/2.', 'V=\\dfrac{1}{3}a^{2}h,\\quad \\ell=\\sqrt{h^{2}+\\left(\\dfrac{a}{2}\\right)^{2}}');
  } else {
    const { area, perimeter, h } = d;
    if (area <= 0 || perimeter <= 0 || h <= 0) throw new Error('مساحة القاعدة ومحيطها وطول الموشور يجب أن تكون موجبة.');
    const v = area * h;
    const lateral = perimeter * h;
    const total = lateral + 2 * area;
    add('الحجم', v, `V = A_{\\text{قاعدة}}h = ${fmt(area)}\\cdot${fmt(h)} = ${fmt(v)}`);
    add('المساحة الجانبية', lateral, `S_{\\text{جانبية}} = P_{\\text{قاعدة}}h = ${fmt(perimeter)}\\cdot${fmt(h)} = ${fmt(lateral)}`);
    add('المساحة الكلية', total, `S = P_{\\text{قاعدة}}h + 2A_{\\text{قاعدة}} = ${fmt(total)}`);
    line('الموشور القائم', 'حجم أي موشور يساوي مساحة القاعدة مضروبة في طول الموشور.', 'V=A_{\\text{قاعدة}}h,\\quad S_{\\text{جانبية}}=P_{\\text{قاعدة}}h');
  }
  return { metrics, steps };
}

const SolidDrawing: React.FC<{ id: SolidId }> = ({ id }) => {
  const stroke = '#6ee7b7';
  const faint = '#64748b';
  const common = { stroke, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 240 150" className="w-full h-36" role="img" aria-label="رسم توضيحي للمجسم">
      <defs><linearGradient id="geo-fill" x1="0" x2="1"><stop offset="0" stopColor="#10b981" stopOpacity=".18"/><stop offset="1" stopColor="#06b6d4" stopOpacity=".04"/></linearGradient></defs>
      {id === 'sphere' ? <><ellipse cx="120" cy="76" rx="68" ry="56" fill="url(#geo-fill)" {...common}/><ellipse cx="120" cy="76" rx="27" ry="56" stroke={faint} strokeDasharray="4 4" fill="none"/><path d="M52 76H188M120 76L175 42" fill="none" {...common}/><circle cx="120" cy="76" r="3" fill={stroke}/></> : null}
      {id === 'cube' || id === 'cuboid' ? <><path d="M57 48L133 48L133 112L57 112Z M57 48L91 26L166 26L133 48 M133 48L166 26L166 89L133 112 M57 112L91 90L166 89 M91 26L91 90" fill="url(#geo-fill)" {...common}/><path d="M57 48L91 26M91 26V90" stroke={faint} strokeDasharray="4 4" fill="none"/></> : null}
      {id === 'cylinder' ? <><path d="M55 42V106M185 42V106M55 42C55 22 185 22 185 42C185 62 55 62 55 42ZM55 106C55 126 185 126 185 106" fill="url(#geo-fill)" {...common}/><path d="M55 106C55 86 185 86 185 106" stroke={faint} strokeDasharray="4 4" fill="none"/><path d="M120 42H185M120 42L145 33" fill="none" {...common}/></> : null}
      {id === 'cone' ? <><path d="M120 22L55 108M120 22L185 108M55 108C55 88 185 88 185 108C185 128 55 128 55 108Z" fill="url(#geo-fill)" {...common}/><path d="M55 108C55 88 185 88 185 108" stroke={faint} strokeDasharray="4 4" fill="none"/><path d="M120 22V108M120 108H185" stroke={faint} strokeDasharray="4 4" fill="none"/></> : null}
      {id === 'pyramid' ? <><path d="M120 22L49 109L120 132L191 109Z M120 22L120 132 M120 22L191 109" fill="url(#geo-fill)" {...common}/><path d="M49 109L120 86L191 109" stroke={faint} strokeDasharray="4 4" fill="none"/></> : null}
      {id === 'triangularPrism' ? <><path d="M52 108L83 50L115 108Z M125 95L156 37L188 95Z M52 108L125 95M83 50L156 37M115 108L188 95" fill="url(#geo-fill)" {...common}/><path d="M52 108L83 50L115 108" stroke={faint} strokeDasharray="4 4" fill="none"/></> : null}
      <text x="120" y="145" textAnchor="middle" fill="#94a3b8" fontSize="10">رسم هندسي توضيحي غير مقياسي</text>
    </svg>
  );
};

const TONE: Record<Tone, string> = {
  ok: 'border-emerald-700/70 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-700/70 bg-amber-950/40 text-amber-300',
  bad: 'border-rose-700/70 bg-rose-950/40 text-rose-300',
  info: 'border-cyan-700/70 bg-cyan-950/40 text-cyan-300'
};

const BTN = 'w-full min-h-12 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-blue-950/30 flex items-center justify-center gap-2 touch-manipulation';

const CoordinateInputs: React.FC<{ label: string; value: V3; onChange: (v: V3) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-1.5 min-w-0">
    <div className="text-xs font-bold text-slate-400 overflow-x-auto"><Tex math={label} /></div>
    <div className="grid grid-cols-3 gap-1.5" dir="ltr">
      {value.map((x, i) => (
        <NumberInput
          key={i}
          value={x}
          onChange={(n) => onChange(value.map((old, j) => (j === i ? n : old)) as V3)}
          className="w-full h-10 text-sm px-0.5"
          blankOnZero
          placeholder={`مثال: ${i + 1}`}
        />
      ))}
    </div>
  </div>
);

const CoefInputs: React.FC<{ value: number[]; onChange: (v: number[]) => void; labels: string[] }> = ({ value, onChange, labels }) => (
  <div className="grid grid-cols-4 gap-2" dir="ltr">
    {value.map((x, i) => (
      <label key={i} className="space-y-1 text-[11px] text-slate-400 min-w-0">
        <span className="block text-center"><Tex math={labels[i]} /></span>
        <NumberInput
          value={x}
          onChange={(n) => onChange(value.map((old, j) => (j === i ? n : old)))}
          className="w-full h-10 text-sm px-0.5"
          blankOnZero
          placeholder={i === 3 ? 'مثال: -3' : `مثال: ${i + 1}`}
        />
      </label>
    ))}
  </div>
);

function Pills<T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className={`grid gap-2 grid-cols-2 ${items.length >= 5 ? 'sm:grid-cols-5' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => { soundHaptics.playClick(); onChange(it.id); }}
          className={`min-h-11 px-2 rounded-xl border text-[11px] font-bold touch-manipulation ${value === it.id ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

const Steps: React.FC<{ steps: WorkStep[] }> = ({ steps }) => (
  <div className="space-y-3">
    {steps.map((step, i) => (
      <article key={i} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</span>
          <h3 className="text-xs font-bold text-slate-200">{step.title}</h3>
        </div>
        {step.explanation && <p className="text-[11px] text-slate-400 leading-6"><RichText text={step.explanation} /></p>}
        <div className="p-2 rounded-lg bg-slate-900 overflow-x-auto" dir="ltr"><Tex math={step.latex} display /></div>
      </article>
    ))}
  </div>
);

const OutcomeView: React.FC<{ o: Outcome; title: string }> = ({ o, title }) => (
  <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn min-w-0">
    <h2 className="text-sm font-bold text-cyan-300">{title}</h2>
    <div className={`rounded-xl border p-3 space-y-2 ${TONE[o.tone]}`}>
      <div className="text-sm font-bold leading-6">{o.verdict}</div>
      {o.verdictLatex && <div className="overflow-x-auto text-slate-100" dir="ltr"><Tex math={o.verdictLatex} display /></div>}
    </div>
    {o.metrics.length > 0 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {o.metrics.map((m) => (
          <div key={m.label} className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1 min-w-0">
            <span className="text-[11px] text-slate-400">{m.label}</span>
            <div className="overflow-x-auto" dir="ltr"><Tex math={m.latex} /></div>
          </div>
        ))}
      </div>
    )}
    {o.steps.length > 0 && <Steps steps={o.steps} />}
  </section>
);

const toPlane = (c: number[]): Plane => ({ a: c[0], b: c[1], c: c[2], d: c[3] });

import { GEOMETRY_GUIDE } from '../../utils/sectionGuides';

export const GeometrySolver: React.FC = () => {
  const [tab, setTab] = useState<GeometryTab>('solids');
  const [error, setError] = useState('');

  // What do you want selectors
  const [targetSolids, setTargetSolids] = useState<string>('all');
  const [targetVectors, setTargetVectors] = useState<string>('all');
  const [targetPlanes, setTargetPlanes] = useState<string>('all');
  const [targetLines, setTargetLines] = useState<string>('all');
  const [targetRelations, setTargetRelations] = useState<string>('all');
  const [targetVolumes, setTargetVolumes] = useState<string>('all');

  // ---- solids
  const [solid, setSolid] = useState<SolidId>('cube');
  const [dimensions, setDimensions] = useState<Record<string, number>>({ a: 0 });
  const [solidResult, setSolidResult] = useState<ReturnType<typeof solidSolution> | null>(null);
  const selected = SOLIDS.find((s) => s.id === solid)!;

  // ---- vectors
  const [u, setU] = useState<V3>([0, 0, 0]);
  const [v, setV] = useState<V3>([0, 0, 0]);
  const [w, setW] = useState<V3>([0, 0, 0]);
  const [pP, setPP] = useState<V3>([0, 0, 0]);
  const [pQ, setPQ] = useState<V3>([0, 0, 0]);
  const [vecRes, setVecRes] = useState<{ lin2: Outcome; lin3: Outcome; ops: Outcome } | null>(null);

  // ---- planes
  const [planeMethod, setPlaneMethod] = useState<PlaneMethod>('three');
  const [pA, setPA] = useState<V3>([0, 0, 0]);
  const [pB, setPB] = useState<V3>([0, 0, 0]);
  const [pC, setPC] = useState<V3>([0, 0, 0]);
  const [pN, setPN] = useState<V3>([0, 0, 0]);
  const [pU, setPUdir] = useState<V3>([0, 0, 0]);
  const [pV, setPVdir] = useState<V3>([0, 0, 0]);
  const [coef, setCoef] = useState<number[]>([0, 0, 0, 0]);
  const [pDist, setPDist] = useState<V3>([0, 0, 0]);
  const [planeRes, setPlaneRes] = useState<PlaneResult | null>(null);
  const [planeDist, setPlaneDist] = useState<Outcome | null>(null);

  // ---- lines
  const [lineMethod, setLineMethod] = useState<LineMethod>('dir');
  const [lA, setLA] = useState<V3>([0, 0, 0]);
  const [lU, setLU] = useState<V3>([0, 0, 0]);
  const [lB, setLB] = useState<V3>([0, 0, 0]);
  const [lC, setLC] = useState<V3>([0, 0, 0]);
  const [lCoef1, setLCoef1] = useState<number[]>([0, 0, 0, 0]);
  const [lCoef2, setLCoef2] = useState<number[]>([0, 0, 0, 0]);
  const [lineRes, setLineRes] = useState<LineResult | null>(null);
  const [lineDist, setLineDist] = useState<Outcome | null>(null);

  // ---- relations
  const [relMode, setRelMode] = useState<RelMode>('planes');
  const [rCoef1, setRCoef1] = useState<number[]>([0, 0, 0, 0]);
  const [rCoef2, setRCoef2] = useState<number[]>([0, 0, 0, 0]);
  const [rLA, setRLA] = useState<V3>([0, 0, 0]);
  const [rLU, setRLU] = useState<V3>([0, 0, 0]);
  const [rLB, setRLB] = useState<V3>([0, 0, 0]);
  const [rLV, setRLV] = useState<V3>([0, 0, 0]);
  const [relRes, setRelRes] = useState<Outcome | null>(null);

  // ---- volumes
  const [volMode, setVolMode] = useState<VolMode>('tetra');
  const [vA, setVA] = useState<V3>([0, 0, 0]);
  const [vB, setVB] = useState<V3>([0, 0, 0]);
  const [vC, setVC] = useState<V3>([0, 0, 0]);
  const [vD, setVD] = useState<V3>([0, 0, 0]);
  const [vU, setVU] = useState<V3>([0, 0, 0]);
  const [vV, setVV] = useState<V3>([0, 0, 0]);
  const [vW, setVW] = useState<V3>([0, 0, 0]);
  const [volRes, setVolRes] = useState<Outcome | null>(null);

  const handleSolid = () => {
    soundHaptics.playEquals();
    setError('');
    try { setSolidResult(solidSolution(solid, dimensions)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر حساب المجسم.'); }
  };

  const handleVectors = () => {
    soundHaptics.playEquals();
    setError('');
    setVecRes({ lin2: linearDependence2(u, v), lin3: linearDependence3(u, v, w), ops: vectorOps(u, v, pP, pQ) });
  };

  const handlePlane = () => {
    soundHaptics.playEquals();
    setError('');
    let res: PlaneResult;
    if (planeMethod === 'three') res = planeFromThreePoints(pA, pB, pC);
    else if (planeMethod === 'bisector') res = perpendicularBisectorPlane(pA, pB);
    else if (planeMethod === 'normal') res = planeFromNormal(pA, pN);
    else if (planeMethod === 'directions') res = planeFromDirections(pA, pU, pV);
    else res = planeFromCoefficients(coef[0], coef[1], coef[2], coef[3]);
    setPlaneRes(res);
    setPlaneDist(res.plane ? distancePointPlane(pDist, res.plane) : null);
  };

  const handleLine = () => {
    soundHaptics.playEquals();
    setError('');
    let res: LineResult;
    if (lineMethod === 'dir') res = lineFromPointDirection(lA, lU);
    else if (lineMethod === 'points') res = lineFromTwoPoints(lA, lB);
    else {
      // the line is the intersection of two planes: reuse the plane-relation engine
      const rel = relationPlanes(toPlane(lCoef1), toPlane(lCoef2));
      res = { line: rel.line, outcome: rel.outcome };
    }
    setLineRes(res);
    setLineDist(res.line ? distancePointLine(lC, res.line.P, res.line.u) : null);
  };

  const handleRelation = () => {
    soundHaptics.playEquals();
    setError('');
    if (relMode === 'planes') setRelRes(relationPlanes(toPlane(rCoef1), toPlane(rCoef2)).outcome);
    else if (relMode === 'linePlane') setRelRes(relationLinePlane({ P: rLA, u: rLU }, toPlane(rCoef1)));
    else setRelRes(relationLines({ P: rLA, u: rLU }, { P: rLB, u: rLV }));
  };

  const handleVolume = () => {
    soundHaptics.playEquals();
    setError('');
    setVolRes(volMode === 'tetra' ? tetrahedronVolume(vA, vB, vC, vD) : parallelepipedVolume(vU, vV, vW));
  };

  const switchTab = (id: GeometryTab) => {
    soundHaptics.playClick();
    setTab(id);
    setError('');
  };

  return (
    <div className="space-y-5">
      <header className="pb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Box className="w-6 h-6 text-cyan-400" /> الهندسة الفراغية
          </h1>
          <p className="text-xs text-slate-400 mt-1">المجسمات، المتجهات في الفضاء، المستويات والمستقيمات، الأوضاع النسبية، والحجوم، مع خطوات كاملة قابلة للمراجعة.</p>
        </div>
        <GuideButton guide={GEOMETRY_GUIDE} />
      </header>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800">
        {([
          ['solids', 'المجسمات', Box], ['vectors', 'المتجهات', Compass], ['planes', 'المستويات', Layers3],
          ['lines', 'المستقيمات', Route], ['relations', 'الأوضاع النسبية', GitCompare], ['volumes', 'الحجوم', Boxes]
        ] as const).map(([id, title, Icon]) => (
          <button key={id} onClick={() => switchTab(id)} className={`min-h-12 rounded-xl border flex flex-col sm:flex-row gap-1 items-center justify-center text-[11px] sm:text-xs font-bold px-1 touch-manipulation ${tab === id ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
            <Icon className="w-4 h-4" />{title}
          </button>
        ))}
      </div>

      {/* ===================== solids ===================== */}
      {tab === 'solids' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
              <span className="font-bold block text-cyan-300">إرشادات حساب مقاييس المجسمات الهندسية:</span>
              اختر نوع المجسم من القائمة أدناه، ثم أدخل أبعاده الهندسية. سيقوم المحرك بحساب الحجم والمساحة الكلية والمساحة الجانبية والأقطار مع كتابة القوانين الرياضية المعتمدة والتعويض المباشر.
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SOLIDS.map((item) => (
                <button key={item.id} onClick={() => { soundHaptics.playClick(); setSolid(item.id); setDimensions(Object.fromEntries(SOLIDS.find((s) => s.id === item.id)!.fields.map((f) => [f.id, 0]))); setSolidResult(null); setError(''); }} className={`min-h-10 px-2 rounded-lg border text-[11px] font-bold ${solid === item.id ? 'bg-cyan-600/80 border-cyan-400 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>
                  {item.title}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-3 py-2"><SolidDrawing id={solid} /></div>
              <div className="grid grid-cols-2 gap-3">
                {selected.fields.map((field) => (
                  <label key={field.id} className="space-y-1.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1">{field.title} <Tex math={field.symbol} /></span>
                    <NumberInput value={dimensions[field.id] ?? 0} onChange={(value) => setDimensions((old) => ({ ...old, [field.id]: value }))} className="w-full h-11 text-base" allowNegative={false} blankOnZero placeholder={`مثال: ${field.id === 'h' ? 5 : 3}`} />
                  </label>
                ))}
              </div>
            </div>

            <button onClick={handleSolid} className={BTN}><Sparkles className="w-4 h-4" /> احسب خصائص المجسم</button>
          </section>

          {solidResult && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من مقاييس المجسم؟"
                subtitle="اختر النتيجة المحددة لعرضها مع البرهان والقوانين، أو اختر الحل الشامل:"
                selectedId={targetSolids}
                onSelect={setTargetSolids}
                options={[
                  { id: 'metrics', label: 'المقاييس المحسوبة (الحجم والمساحات)' },
                  { id: 'steps', label: 'قوانين المجسم والتعويض بالخطوات' }
                ]}
              />

              {(targetSolids === 'all' || targetSolids === 'metrics') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {solidResult.metrics.map((m) => (
                    <div key={m.label} className="bg-slate-900 p-3 rounded-xl border border-cyan-900/60 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400">{m.label}</span>
                      <div className="text-cyan-200 overflow-x-auto" dir="ltr"><Tex math={m.latex} /></div>
                    </div>
                  ))}
                </div>
              )}
              {(targetSolids === 'all' || targetSolids === 'steps') && (
                <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
                  <h2 className="text-sm font-bold text-cyan-300">قوانين المجسم والتعويض</h2>
                  <Steps steps={solidResult.steps} />
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== vectors ===================== */}
      {tab === 'vectors' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1.5">
              <span className="font-bold block text-cyan-300">إرشادات إدخال المتجهات والنقاط في الفضاء ثلاثي الأبعاد:</span>
              <p>• <strong>المتجهان الأساسيان u و v:</strong> يُستخدمان لدراسة الارتباط الخطي (التوازي)، الجداء السلمي، الجداء المتجهي، الزاوية بينهما، ومساحة متوازي الأضلاع والمثلث.</p>
              <p>• <strong>المتجه الثالث w (اختياري):</strong> يُستخدم مع u و v لدراسة استوائية 3 متجهات والجداء المختلط [u, v, w] وحجم متوازي السطوح.</p>
              <p>• <strong>النقطتان P و Q:</strong> لحساب المتجه الواصل PQ والمسافة الإقليدية بينهما وإحداثيات منتصف القطعة M.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-cyan-300 block border-b border-slate-800 pb-1.5">
                  1. المتجهان الأساسيان في الفضاء:
                </span>
                <CoordinateInputs label="\vec{u}(x_1, y_1, z_1)" value={u} onChange={setU} />
                <CoordinateInputs label="\vec{v}(x_2, y_2, z_2)" value={v} onChange={setV} />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-cyan-300 block border-b border-slate-800 pb-1.5">
                  2. المتجه الثالث والنقاط الإضافية:
                </span>
                <CoordinateInputs label="\vec{w}(x_3, y_3, z_3)\ \text{(لدراسة 3 متجهات)}" value={w} onChange={setW} />
                <CoordinateInputs label="P(x_P, y_P, z_P)" value={pP} onChange={setPP} />
                <CoordinateInputs label="Q(x_Q, y_Q, z_Q)" value={pQ} onChange={setPQ} />
              </div>
            </div>
            <button onClick={handleVectors} className={BTN}><Sparkles className="w-4 h-4" /> ابدأ التحليل واستخراج النتائج</button>
          </section>

          {vecRes && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من حل المتجهات؟"
                subtitle="اختر النتيجة المحددة لعرض برهانها وخطواتها بالتفصيل:"
                selectedId={targetVectors}
                onSelect={setTargetVectors}
                options={[
                  { id: 'lin2', label: 'الارتباط الخطي لـ u و v (التوازي)' },
                  { id: 'lin3', label: 'الارتباط الخطي لثلاثة أشعة (u, v, w)' },
                  { id: 'ops', label: 'الجداء السلمي والمتجهي والزاوية والمسافة' }
                ]}
              />

              {(targetVectors === 'all' || targetVectors === 'lin2') && (
                <OutcomeView o={vecRes.lin2} title="الارتباط الخطي لمتجهين" />
              )}
              {(targetVectors === 'all' || targetVectors === 'lin3') && (
                <OutcomeView o={vecRes.lin3} title="الارتباط الخطي لثلاثة متجهات (الجداء المختلط)" />
              )}
              {(targetVectors === 'all' || targetVectors === 'ops') && (
                <OutcomeView o={vecRes.ops} title="الجداء السلمي والمتجهي والزاوية والمسافة PQ" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== planes ===================== */}
      {tab === 'planes' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <Pills<PlaneMethod>
              value={planeMethod}
              onChange={setPlaneMethod}
              items={[
                { id: 'three', label: 'ثلاث نقاط' },
                { id: 'normal', label: 'نقطة وناظم' },
                { id: 'directions', label: 'نقطة ومستقيمان' },
                { id: 'coeffs', label: 'المعادلة العامة' },
                { id: 'bisector', label: 'مستوي محوري لقطعة' }
              ]}
            />

            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
              <span className="font-bold block text-cyan-300">إرشادات تعيين معادلة المستوي في الفضاء:</span>
              {planeMethod === 'three' && 'أدخل إحداثيات ثلاث نقاط A, B, C ليست على استقامة واحدة لتعيين المستوي المار بها بواسطة الناظم n = AB × AC.'}
              {planeMethod === 'normal' && 'أدخل إحداثيات نقطة A ومتجه الناظم n(a,b,c) العمودي على المستوي لتطبيق a(x - x_A) + b(y - y_A) + c(z - z_A) = 0.'}
              {planeMethod === 'directions' && 'أدخل نقطة A ومتجهي توجيه u و v واقعين في المستوي وغير متوازيين؛ الناظم هو n = u × v.'}
              {planeMethod === 'coeffs' && 'أدخل معاملات المعادلة العامة للمستوي ax + by + cz + d = 0 لدراسة ناظمه وحساب المسافات.'}
              {planeMethod === 'bisector' && 'أدخل طرفي القطعة المستقيمة A و B لاستخراج معادلة المستوي المحوري المار من منتصفها M والعمودي على المتجه AB.'}
            </div>

            {planeMethod === 'bisector' && (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto" dir="ltr">
                  <Tex math="M=\dfrac{A+B}{2},\qquad \vec{n}=\overrightarrow{AB}" className="text-base" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CoordinateInputs label="A(x_A,y_A,z_A)" value={pA} onChange={setPA} />
                  <CoordinateInputs label="B(x_B,y_B,z_B)" value={pB} onChange={setPB} />
                </div>
              </div>
            )}
            {planeMethod === 'three' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={pA} onChange={setPA} />
                <CoordinateInputs label="B(x_B,y_B,z_B)" value={pB} onChange={setPB} />
                <CoordinateInputs label="C(x_C,y_C,z_C)" value={pC} onChange={setPC} />
              </div>
            )}
            {planeMethod === 'normal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={pA} onChange={setPA} />
                <CoordinateInputs label="\vec{n}(a,b,c)" value={pN} onChange={setPN} />
              </div>
            )}
            {planeMethod === 'directions' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={pA} onChange={setPA} />
                <CoordinateInputs label="\vec{u}(a_{1},b_{1},c_{1})" value={pU} onChange={setPUdir} />
                <CoordinateInputs label="\vec{v}(a_{2},b_{2},c_{2})" value={pV} onChange={setPVdir} />
              </div>
            )}
            {planeMethod === 'coeffs' && (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto" dir="ltr"><Tex math="\Pi:\; ax+by+cz+d=0" className="text-lg" /></div>
                <CoefInputs value={coef} onChange={setCoef} labels={['a', 'b', 'c', 'd']} />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-500">لحساب بُعد نقطة عن المستوي الناتج:</div>
              <CoordinateInputs label="M(x_0,y_0,z_0)" value={pDist} onChange={setPDist} />
            </div>

            <button onClick={handlePlane} className={BTN}><Ruler className="w-4 h-4" /> استخرج معادلة المستوي</button>
          </section>

          {planeRes && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من نتائج المستوي؟"
                subtitle="اختر النتيجة المحددة لعرضها مع البرهان الكامل أو الحل الشامل:"
                selectedId={targetPlanes}
                onSelect={setTargetPlanes}
                options={[
                  { id: 'plane', label: 'معادلة المستوي العامة والناظم والبرهان' },
                  ...(planeDist ? [{ id: 'dist', label: 'بُعد النقطة M عن المستوي' }] : [])
                ]}
              />

              {(targetPlanes === 'all' || targetPlanes === 'plane') && (
                <OutcomeView o={planeRes.outcome} title="معادلة المستوي" />
              )}
              {planeDist && (targetPlanes === 'all' || targetPlanes === 'dist') && (
                <OutcomeView o={planeDist} title="بُعد النقطة عن المستوي" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== lines ===================== */}
      {tab === 'lines' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <Pills<LineMethod>
              value={lineMethod}
              onChange={setLineMethod}
              items={[
                { id: 'dir', label: 'نقطة ومتجه توجيه' },
                { id: 'points', label: 'نقطتان' },
                { id: 'planes', label: 'تقاطع مستويين' }
              ]}
            />

            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
              <span className="font-bold block text-cyan-300">إرشادات تعيين التمثيل الوسيطي للمستقيم:</span>
              {lineMethod === 'dir' && 'أدخل نقطة A ومتجه التوجيه u(a,b,c) لكتابة التمثيل الوسيطي M = A + t·u حيث t ∈ ℝ.'}
              {lineMethod === 'points' && 'أدخل نقطتين مختلفتين A و B؛ متجه التوجيه هو AB = B - A.'}
              {lineMethod === 'planes' && 'أدخل معادلتي مستويين متقاطعين؛ سيقوم المحرك بحساب متجه التوجيه u = n₁ × n₂ ونقطة تقاطع مشتركة وتوليد التمثيل الوسيطي.'}
            </div>

            {lineMethod === 'dir' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={lA} onChange={setLA} />
                <CoordinateInputs label="\vec{u}(a,b,c)" value={lU} onChange={setLU} />
              </div>
            )}
            {lineMethod === 'points' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={lA} onChange={setLA} />
                <CoordinateInputs label="B(x_B,y_B,z_B)" value={lB} onChange={setLB} />
              </div>
            )}
            {lineMethod === 'planes' && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 overflow-x-auto" dir="ltr">
                  <Tex math="L=\Pi_{1}\cap\Pi_{2},\qquad \vec{u}=\vec{n}_{1}\times\vec{n}_{2}" className="text-base" />
                </div>
                <div className="text-xs font-bold text-slate-300">المستوي الأول Π₁</div>
                <CoefInputs value={lCoef1} onChange={setLCoef1} labels={['a_{1}', 'b_{1}', 'c_{1}', 'd_{1}']} />
                <div className="text-xs font-bold text-slate-300">المستوي الثاني Π₂</div>
                <CoefInputs value={lCoef2} onChange={setLCoef2} labels={['a_{2}', 'b_{2}', 'c_{2}', 'd_{2}']} />
              </div>
            )}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-500">لحساب بُعد نقطة خارج المستقيم:</div>
              <CoordinateInputs label="C(x_C,y_C,z_C)" value={lC} onChange={setLC} />
            </div>
            <button onClick={handleLine} className={BTN}><Route className="w-4 h-4" /> استخرج التمثيل الوسيطي</button>
          </section>

          {lineRes && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من حل المستقيم؟"
                subtitle="اختر النتيجة المحددة لعرض برهانها وخطواتها بالتفصيل:"
                selectedId={targetLines}
                onSelect={setTargetLines}
                options={[
                  { id: 'line', label: 'التمثيل الوسيطي للمستقيم وتوجيهه' },
                  ...(lineDist ? [{ id: 'dist', label: 'بُعد النقطة C عن المستقيم' }] : [])
                ]}
              />

              {(targetLines === 'all' || targetLines === 'line') && (
                <OutcomeView o={lineRes.outcome} title="التمثيل الوسيطي للمستقيم" />
              )}
              {lineDist && (targetLines === 'all' || targetLines === 'dist') && (
                <OutcomeView o={lineDist} title="بُعد النقطة عن المستقيم" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== relations ===================== */}
      {tab === 'relations' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <Pills<RelMode>
              value={relMode}
              onChange={setRelMode}
              items={[
                { id: 'planes', label: 'مستويان' },
                { id: 'linePlane', label: 'مستقيم ومستوٍ' },
                { id: 'lines', label: 'مستقيمان' }
              ]}
            />

            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
              <span className="font-bold block text-cyan-300">إرشادات دراسة الأوضاع النسبية في الفضاء:</span>
              {relMode === 'planes' && 'أدخل معادلتي المستويين لمقارنة الناظمين وبيان هل هما متوازيان، متطابقان، أم متقاطعان وفق مستقيم مشترك.'}
              {relMode === 'linePlane' && 'أدخل التمثيل الوسيطي للمستقيم ومعادلة المستوي؛ يتحقق المحرك أولاً من التعامد كحالة خاصة، ثم التقاطع في نقطة أو التوازي أو الاحتواء.'}
              {relMode === 'lines' && 'أدخل تمثيلي المستقيمين؛ يفحص المحرك هل هما متقاطعان في نقطة (مع حساب الوسيطين t و s معاً والتعويض المزدوج)، متوازيان، منطبقان، أم متخالفان مع حساب البعد d(L1, L2).'}
            </div>

            {relMode === 'planes' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300">المستوي الأول Π₁</div>
                <CoefInputs value={rCoef1} onChange={setRCoef1} labels={['a_{1}', 'b_{1}', 'c_{1}', 'd_{1}']} />
                <div className="text-xs font-bold text-slate-300">المستوي الثاني Π₂</div>
                <CoefInputs value={rCoef2} onChange={setRCoef2} labels={['a_{2}', 'b_{2}', 'c_{2}', 'd_{2}']} />
              </div>
            )}
            {relMode === 'linePlane' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CoordinateInputs label="A(x_A,y_A,z_A)" value={rLA} onChange={setRLA} />
                  <CoordinateInputs label="\vec{u}(a,b,c)" value={rLU} onChange={setRLU} />
                </div>
                <div className="text-xs font-bold text-slate-300">المستوي Π</div>
                <CoefInputs value={rCoef1} onChange={setRCoef1} labels={['a', 'b', 'c', 'd']} />
              </div>
            )}
            {relMode === 'lines' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CoordinateInputs label="A(x_A,y_A,z_A)" value={rLA} onChange={setRLA} />
                <CoordinateInputs label="\vec{u}(a_{1},b_{1},c_{1})" value={rLU} onChange={setRLU} />
                <CoordinateInputs label="B(x_B,y_B,z_B)" value={rLB} onChange={setRLB} />
                <CoordinateInputs label="\vec{v}(a_{2},b_{2},c_{2})" value={rLV} onChange={setRLV} />
              </div>
            )}

            <button onClick={handleRelation} className={BTN}><GitCompare className="w-4 h-4" /> حدّد الوضع النسبي</button>
          </section>

          {relRes && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من دراسة الوضع النسبي؟"
                subtitle="اختر النتيجة المحددة أو الحل الشامل مع البرهان:"
                selectedId={targetRelations}
                onSelect={setTargetRelations}
                options={[
                  { id: 'verdict', label: 'الوضع النسبي والنتيجة النهائية' },
                  { id: 'steps', label: 'خطوات التحقق والتعويض والبرهان' }
                ]}
              />

              <OutcomeView o={relRes} title="دراسة الوضع النسبي" />
            </div>
          )}
        </div>
      )}

      {/* ===================== volumes ===================== */}
      {tab === 'volumes' && (
        <div className="space-y-4">
          <section className="bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <Pills<VolMode>
              value={volMode}
              onChange={setVolMode}
              items={[
                { id: 'tetra', label: 'رباعي وجوه ABCD' },
                { id: 'para', label: 'متوازي سطوح' }
              ]}
            />
            {volMode === 'tetra' ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
                  <span className="font-bold block text-cyan-300">إرشادات حساب حجم رباعي الوجوه ABCD:</span>
                  أدخل إحداثيات الرؤوس الأربعة في الفضاء الإقليدي. سيقوم المحرك بحساب متجهات الأحرف الثلاثة المنطلقة من الرأس A:
                  AB و AC و AD، ثم حساب الجداء المختلط [AB, AC, AD]، وتطبيق القانون V = (1/6)|[AB, AC, AD]| مع بيان هل النقاط مستوية أم تشكل رباعي وجوه حقيقي.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CoordinateInputs label="A(x_A,y_A,z_A)" value={vA} onChange={setVA} />
                  <CoordinateInputs label="B(x_B,y_B,z_B)" value={vB} onChange={setVB} />
                  <CoordinateInputs label="C(x_C,y_C,z_C)" value={vC} onChange={setVC} />
                  <CoordinateInputs label="D(x_D,y_D,z_D)" value={vD} onChange={setVD} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 leading-6 space-y-1">
                  <span className="font-bold block text-cyan-300">إرشادات حساب حجم متوازي السطوح:</span>
                  أدخل مركبات المتجهات الثلاثة u و v و w المنطلقة من رأس واحد. سيقوم المحرك بحساب الجداء المختلط [u, v, w] وتطبيق القانون V = |[u, v, w]|، وحساب حجم رباعي الوجوه المقابل V&apos; = V / 6.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <CoordinateInputs label="\vec{u}" value={vU} onChange={setVU} />
                  <CoordinateInputs label="\vec{v}" value={vV} onChange={setVV} />
                  <CoordinateInputs label="\vec{w}" value={vW} onChange={setVW} />
                </div>
              </div>
            )}
            <button onClick={handleVolume} className={BTN}><Boxes className="w-4 h-4" /> احسب الحجم</button>
          </section>

          {volRes && (
            <div className="space-y-4 animate-fadeIn">
              <WhatDoYouWant
                title="ماذا تريد أن تستعرض من حساب الحجوم؟"
                subtitle="اختر النتيجة المحددة لعرض برهانها أو الحل الكامل:"
                selectedId={targetVolumes}
                onSelect={setTargetVolumes}
                options={[
                  { id: 'volume', label: 'قيمة الحجم النهائي V والنتيجة' },
                  { id: 'steps', label: 'خطوات الجداء المختلط والبرهان والقوانين' }
                ]}
              />

              <OutcomeView o={volRes} title={volMode === 'tetra' ? 'حساب حجم رباعي الوجوه ABCD' : 'حساب حجم متوازي السطوح'} />
            </div>
          )}
        </div>
      )}

      {error && <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">{error}</div>}
      <p className="text-[10px] text-slate-500 text-center">الحسابات مبنية على الجبر الشعاعي الدقيق؛ الزوايا والقيم الشهيرة تُعرض بصيغتها المضبوطة. تحقّق من معطيات المسألة قبل اعتماد النتيجة.</p>
    </div>
  );
};
