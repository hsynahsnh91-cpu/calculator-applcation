import type { WorkStep, V3, Plane } from './geometryEngine.js';
export type SolidId = 'cube' | 'cuboid' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'triangularPrism';
export interface SolidMetric { label: string; value: number; latex: string }
const fmt = (n: number) => String(Number(n.toPrecision(8)));
const sq = (n: number) => n * n;
const cube = (n: number) => n * n * n;

export function solidSolution(id: SolidId, d: Record<string, number>): { metrics: SolidMetric[]; steps: WorkStep[] } {
  if (Object.values(d).some((value) => !Number.isFinite(value))) throw new Error('أبعاد المجسم يجب أن تكون أعدادًا منتهية.');
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


export function projectPointOntoPlane(point: V3, plane: Plane): V3 {
 const norm2 = plane.a ** 2 + plane.b ** 2 + plane.c ** 2;
 if (norm2 === 0) throw new Error('ناظم المستوي معدوم.');
 const t = (plane.a * point[0] + plane.b * point[1] + plane.c * point[2] + plane.d) / norm2;
 return [point[0] - t * plane.a, point[1] - t * plane.b, point[2] - t * plane.c];
}
