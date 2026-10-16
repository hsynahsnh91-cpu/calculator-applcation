import { ClarificationError, type SolverContext } from "../types";
import {
  isMatrixContext,
  type MatrixCells,
  type MatrixContext,
  type MatrixOperation,
  type MatrixRequest,
  type MatrixSystem,
} from "../matrixTypes";
import { mathInstructionText, hasMathInstruction } from "../textbook";
import { readMatrix, serializeMatrix } from "../../utils/matrixExact";
import { polynomial, G, read, bounded } from "../../utils/spaceGeometryMath";
import { mathFragments } from "./index";
const fail = (s: string): never => {
  throw new ClarificationError(s);
};
const namedUnary = String.raw`(?:(?:ال)?(?:محدد|اثر|منقول|مبدلة|معكوس|مقلوب|ملحقة|رتبة)(?:\s+(?:ال)?مصفوفة)?\s+[A-Z](?![A-Za-z0-9_])|(?:det|tr|trace|inv|adj|rank)\s*\(\s*[A-Z]\s*\))`;
/** Split only explicit, independently named unary demands, never an arithmetic AST. */
export function splitMatrixDemands(text: string): string[] {
  const demand = mathInstructionText(text),
    at = text.indexOf(demand);
  const plural = demand.match(
    /^(?:احسب|جد|اوجد|عين|اكتب)\s+(محدد(?:ي|ات)|اثر(?:ي|ا)|منقول(?:ي|ات)|معكوس(?:ي|ات)|مقلوب(?:ي|ات)|رتب)\s+(?:المصفوفتين|المصفوفات)\s+([A-Zو\s،,]+)[؟?]?$/,
  );
  if (plural) {
    const names = plural[2]
      .split(/\s*[,،]\s*|\s+و\s*/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (
      names.length >= 2 &&
      names.length <= 6 &&
      new Set(names).size === names.length &&
      names.every((n) => /^[A-Z]$/.test(n))
    ) {
      const unary = plural[1].startsWith("محدد")
        ? "محدد"
        : plural[1].startsWith("اثر")
          ? "اثر"
          : plural[1].startsWith("منقول")
            ? "منقول"
            : plural[1].startsWith("رتب")
              ? "رتبة"
              : "معكوس";
      return names.map(
        (n, i) =>
          `${i === 0 && at > 0 ? text.slice(0, at) : ""}احسب ${unary} المصفوفة ${n}`,
      );
    }
  }
  const arithmetic = demand.replace(/^(?:احسب|جد|اوجد|بسط)\s+/, "");
  if (!/[=\[\]]/.test(arithmetic) && /\s+و/.test(arithmetic)) {
    const expressions = arithmetic.split(/\s+و\s*/);
    if (
      expressions.length >= 2 &&
      expressions.length <= 12 &&
      expressions.every(
        (e) =>
          /^[A-Z0-9()+*/^'\s-]+$/.test(e) &&
          /[A-Z]/.test(e) &&
          /[+*^'/-]/.test(e),
      )
    )
      return expressions.map(
        (e, i) =>
          `${i === 0 && at > 0 ? text.slice(0, at) : ""}احسب ${e.trim()}`,
      );
  }
  if (
    !new RegExp(namedUnary).test(demand) ||
    /اثبت|برهن|بين ان|تحقق/.test(demand) ||
    /^(?:(?:احسب|جد|اوجد|اكتب)\s+)?[A-Z]\s*=/.test(demand)
  )
    return [text];
  const separator = new RegExp(
    String.raw`\s+و\s*(?:(?:احسب|جد|اوجد|اكتب)\s+)?(?=${namedUnary})`,
    "g",
  );
  const parts: string[] = [];
  let start = 0,
    scanned = 0,
    depth = 0;
  for (const m of text.matchAll(separator)) {
    while (scanned < m.index!) {
      const c = text[scanned++];
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
    }
    if (
      depth ||
      !new RegExp(namedUnary).test(
        mathInstructionText(text.slice(start, m.index)),
      )
    )
      continue;
    parts.push(text.slice(start, m.index).trim());
    start = m.index! + m[0].length;
    scanned = start;
  }
  parts.push(text.slice(start).trim());
  return parts;
}
function scalarFactor(text: string): string | undefined {
  const definitions = [...text.matchAll(/\bk\s*=\s*/g)];
  if (definitions.length > 1)
    return fail("تكرر تعريف العدد k؛ ما القيمة المقصودة؟");
  const m = definitions[0];
  if (!m) return;
  const source = text
    .slice(m.index! + m[0].length)
    .split(/[،؛;\n]/)[0]
    .split(/\s+(?=[\u0600-\u06ff])/)[0]
    .trim();
  if (!source) return fail("ما القيمة العددية للمعامل k؟");
  return bounded(read(source)).text();
}
interface Definition {
  start: number;
  end: number;
  name: string;
  cells: MatrixCells;
}
function closing(text: string, start: number): number {
  const stack: string[] = [];
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if ("([{".includes(c)) stack.push(c);
    else if (")]}".includes(c)) {
      if (
        ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[c] !==
        stack.pop()
      )
        return fail("أقواس عناصر المصفوفة غير متوازنة.");
      if (!stack.length) return i + 1;
    }
  }
  return fail("أكمل القوس الأخير للمصفوفة.");
}
function split(source: string, separator: RegExp): string[] {
  const out: string[] = [];
  let start = 0,
    depth = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (!depth && separator.test(c)) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out;
}
function cellsOf(source: string, latex = false): MatrixCells {
  let rows: string[];
  if (latex)
    rows = source
      .split(/\\\\/)
      .map((r) => r.trim())
      .filter(Boolean);
  else {
    let body = source.slice(1, -1).trim();
    if (body.startsWith("[")) {
      rows = split(body, /[,،;]/).map((r) => {
        if (!r.startsWith("[") || !r.endsWith("]"))
          return fail("ضع كل سطر في أقواس مستقلة، دون سطر ناقص.");
        return r.slice(1, -1);
      });
    } else {
      body = body.replace(/\r/g, "");
      rows = split(body, /[;؛\n]/);
    }
  }
  return rows.map((row) => {
    const comma = latex ? /&/ : /[,،]/;
    const cells = split(row, comma);
    return cells.length > 1 ? cells : split(row.trim(), /\s/).filter(Boolean);
  });
}
/** Read explicit array and textbook matrix notation; never JSON-eval or repair OCR. */
export function matrixDefinitions(text: string): Definition[] {
  const out: Definition[] = [];
  let at = 0;
  const nextName = () => "ABCDEFGHJKLMN"[out.length];
  while (at < text.length) {
    const rest = text.slice(at);
    const m = /\\begin\{([pbvV]?matrix)\}|\[\s*\[|\b([A-Z])\s*=\s*([[(])/.exec(
      rest,
    );
    if (!m) break;
    const index = at + m.index;
    let start = index,
      end: number,
      cells: MatrixCells,
      name = m[2];
    if (m[1]) {
      const tag = `\\end{${m[1]}}`,
        close = text.indexOf(tag, index + m[0].length);
      if (close < 0)
        return fail("أكمل نهاية المصفوفة المكتوبة بالتنسيق الرياضي.");
      end = close + tag.length;
      cells = cellsOf(text.slice(index + m[0].length, close), true);
    } else {
      const open = m[2] ? index + m[0].length - 1 : index;
      end = closing(text, open);
      cells = cellsOf(text.slice(open, end));
    }
    if (!name) {
      const label = /\b([A-Z])\s*=\s*$/.exec(text.slice(0, start));
      if (label) {
        name = label[1];
        start = label.index;
      }
    }
    name ||= nextName();
    if (!name || out.length >= 12)
      return fail("عرّف حتى12 مصفوفة مسماة في السؤال.");
    if (out.some((d) => d.name === name))
      return fail(`تكرر تعريف المصفوفة ${name}؛ ما التعريف المقصود؟`);
    // Preserve decimal lexemes, fractions and radicals before doing any numerical bridge.
    const exact = serializeMatrix(readMatrix(cells));
    out.push({ start, end, name, cells: exact });
    at = end;
  }
  // Explicit malformed array syntax cannot silently reuse an old context matrix.
  if (
    !out.length &&
    /\b[A-Z]\s*=\s*\[|\[\s*\[|\\begin\{[pbvV]?matrix\}/.test(text)
  )
    return fail(
      "لم تكتمل عناصر المصفوفة؛ اكتب مثل A=[[1,2],[3,4]] مع جميع الأقواس.",
    );
  return out;
}
export function prepareMatrixContext(
  text: string,
  context: SolverContext,
): SolverContext {
  if (/\b[XY]\s*=\s*\[/.test(text) && !/مصفوف/.test(text)) return context;
  const matrixSyntax =
    /\[\s*\[|\\begin\{[pbvV]?matrix\}|مصفوف|\b[A-Z]\s*=\s*[[(][^\n]*[;؛]/.test(
      text,
    );
  const systemSyntax =
    /جملة|نظام/.test(text) &&
    !/مستقيم|مستوي|شعاع|اشعة|نقطة|نقاط|عقدي|احتمال/.test(text);
  if (!matrixSyntax && !context.matrices && !systemSyntax) return context;
  const defs = matrixSyntax ? matrixDefinitions(text) : [],
    factor = scalarFactor(text),
    system = systemSyntax ? systemFromText(text) : undefined;
  if (!defs.length && factor === undefined && !system) return context;
  const values = { ...context.matrices?.values };
  for (const d of defs) values[d.name] = d.cells;
  const matrices: MatrixContext = {
    ...(defs.length ? {} : context.matrices),
    values,
    active: defs[0]?.name || context.matrices?.active,
    scalarFactor: factor ?? context.matrices?.scalarFactor,
    origin: defs.length
      ? "matrix"
      : system
        ? "system"
        : context.matrices?.origin,
    system: system ?? (defs.length ? undefined : context.matrices?.system),
  };
  if (!isMatrixContext(matrices))
    return fail("تجاوزت تعريفات المصفوفات حدود السياق المحفوظ.");
  return { ...context, matrices };
}
export function matrixDefinitionOnly(text: string): boolean {
  return (
    !hasMathInstruction(text) &&
    !/(?:^|[\s،؛])حول(?=\s)|افحص|اختبر|استقلال|قانون|احتمال|متغير|متحول|نوع|صنف|محدد|اثر|منقول|مقلوب|معكوس|غاوس|كرامر|رتبة|مصفوفة (?:ال)?وحدة/.test(
      text,
    ) &&
    /(?:\b[A-Z]\s*=\s*(?:\[|\(|\\begin))/.test(text)
  );
}
export function matrixIntent(text: string, context?: SolverContext): boolean {
  if (/حول|اكتب|مثل/.test(text) && /اشعة|متجه|جدول|تكرارات/.test(text)) {
    const before = text.search(/اشعة|متجه|جدول|تكرارات/),
      matrix = text.indexOf("مصفوف");
    if (matrix > before) return false;
  }
  if (
    /عشوائي|قانون الاحتمال|المتحول|المتغير|افحص استقلال المتحولين/.test(text) &&
    !/مصفوف|محدد|اثر/.test(text)
  )
    return false;
  if (
    /مدرج (?:ال)?تكراري|توزيع\s+(?:ال)?(?:غاوسي|جاوسي)/.test(text) &&
    !/مصفوف/.test(text)
  )
    return false;
  if (
    /مصفوف|محدد المصفوفة|غاوس(?:\s|-)*جوردان|ساروس|كرامر|طريقة غاوس|طريقة جاوس|(?:الحذف|حذف)\s+(?:ال)?(?:غاوسي|جاوسي)|كريمر|\b(?:det|tr|trace|adj|rank|rref)\s*\(|\[\s*\[|\\begin\{[pbvV]?matrix\}/.test(
      text,
    )
  )
    return true;
  if (/\b[A-Z]\s*=\s*\[[^\]]*[;\n]/.test(text)) return true;
  return (
    !!(context?.matrices || context?.matrix) &&
    !/عقدي|احتمال|حدث|صندوق|كيس|شعاع|نقطة|مستوي|تكامل|مشتق|متتالي/.test(text) &&
    (/منقول|مبدل|مقلوب|معكوس|اثر|محدد|رتبة|مدرج|ملحقة|مرافقة|واحدية|صفرية|مثلثية|قطرية|تبادلي|متبادل|غاوس|كرامر/.test(
      text,
    ) ||
      (/\b[A-Z]\s*(?:[+*\-^']|[A-Z]\b)|\bk\s*\*?\s*[A-Z]\b|[A-Z]\s*\*\s*k\b|(?:^|\s)[-+]?\d+(?:\/\d+)?\s*\*?\s*[A-Z]\b/.test(
        text,
      ) &&
        [...text.matchAll(/[A-Z]/g)].some((n) =>
          Object.prototype.hasOwnProperty.call(
            context.matrices?.values || {},
            n[0],
          ),
        )))
  );
}
function systemFromText(text: string): MatrixSystem | undefined {
  text = text.replace(
    /\\begin\{(cases|aligned)\}([\s\S]*?)\\end\{\1\}/g,
    (_, _environment: string, body: string) =>
      body.replace(/\\\\(?:\[[0-9.]+(?:pt|em|ex)\])?/g, "\n").replace(/&/g, ""),
  );
  if (/\\(?:begin|end)\{(?:cases|aligned)\}/.test(text))
    return fail("أكمل بداية جملة المعادلات ونهايتها في التنسيق الرياضي.");
  text = text.replace(
    /(^|[^\p{L}])([سصع])(?=$|[^\p{L}])/gu,
    (_, before: string, variable: string) =>
      before + ({ س: "x", ص: "y", ع: "z" } as Record<string, string>)[variable],
  );
  const equations = text
    .split(/[\n،؛;]/)
    .flatMap(mathFragments)
    .filter((s) => s.includes("="));
  if (!equations.length) return;
  if (equations.length < 2 || equations.length > 6)
    return fail(
      "اكتب من معادلتين إلى ست معادلات خطية في مجهولين أو ثلاثة، كل واحدة في سطر مستقل.",
    );
  const expressions = equations.map((e) => {
    const sides = e.split("=");
    if (sides.length !== 2 || !sides[0] || !sides[1])
      return fail("أكمل طرفي كل معادلة في الجملة.");
    return polynomial(`(${sides[0]})-(${sides[1]})`);
  });
  const axes = ["10000", "01000", "00100", "00010", "00001"],
    names = ["x", "y", "z", "t", "s"];
  if (
    expressions.some((p) =>
      [...p.keys()].some((k) => k !== "00000" && !axes.includes(k)),
    )
  )
    return fail(
      "نحتاج جملة خطية في مجهولين أو ثلاثة من x وy وz وt وs؛ توجد حدود غير خطية أو رموز غير مدعومة.",
    );
  const used = axes.filter((_, i) =>
    equations.some((e) =>
      new RegExp(`(?<![A-Za-z_])${names[i]}(?![A-Za-z_])`).test(e),
    ),
  );
  if (![2, 3].includes(used.length))
    return fail(
      "اختر مجهولين أو ثلاثة معلومَي الرموز؛ لا نضيف مجهولًا أو معادلة افتراضية. غاوس يقبل من معادلتين إلى ست، وكرامر يحتاج جملة مربعة.",
    );
  return {
    coefficients: expressions.map((p) =>
      used.map((a) => (p.get(a) || G.integer(0)).text()),
    ),
    constants: expressions.map((p) =>
      (p.get("00000") || G.integer(0)).neg().text(),
    ),
    variables: used.map((a) => names[axes.indexOf(a)]),
  };
}
const ordinals: Record<string, number> = {
  الاول: 0,
  الاولي: 0,
  الثاني: 1,
  الثانية: 1,
  الثالث: 2,
  الثالثة: 2,
  الرابع: 3,
  الرابعة: 3,
  الخامس: 4,
  الخامسة: 4,
  السادس: 5,
  السادسة: 5,
  السابع: 6,
  السابعة: 6,
  الثامن: 7,
  الثامنة: 7,
  التاسع: 8,
  التاسعة: 8,
  العاشر: 9,
  العاشرة: 9,
};
export function extractMatrixRequest(
  text: string,
  context: SolverContext,
): MatrixRequest {
  const proof = /اثبت|برهن|بين ان|تحقق/.test(mathInstructionText(text));
  const beforeDemand = text.slice(
    0,
    Math.max(0, text.indexOf(mathInstructionText(text))),
  );
  const definitions = matrixDefinitions(proof ? beforeDemand : text);
  const values = { ...context.matrices?.values };
  for (const d of definitions) values[d.name] = d.cells;
  let active = definitions[0]?.name || context.matrices?.active;
  if (!active && context.matrix) {
    active = "M";
    values.M = context.matrix.map((r) => r.map(String));
  }
  let demandSource = text;
  // Spans are replaced back-to-front so numbers inside a matrix cannot become operands.
  for (const d of [...definitions].reverse())
    demandSource =
      demandSource.slice(0, d.start) + d.name + demandSource.slice(d.end);
  const factor =
    scalarFactor(proof ? beforeDemand : text) ?? context.matrices?.scalarFactor;
  let demand = mathInstructionText(demandSource)
    .replace(/[،؛]/g, " ")
    .trim()
    .replace(/(?:الحذف|حذف)\s+(?:ال)?(?:غاوسي|جاوسي)/g, "طريقة غاوس");
  if (/\bk(?=\b|[A-Z])/.test(demand)) {
    if (factor === undefined)
      return fail("ما القيمة العددية للمعامل k الذي تريد ضرب المصفوفة به؟");
    demand = demand.replace(/\bk(?=\b|[A-Z])/g, `(${factor})`);
  }
  if (
    (proof || /^(?:(?:احسب|جد|اوجد|اكتب)\s+)?[A-Z]\s*=/.test(demand)) &&
    new RegExp(
      String.raw`\s+و\s*(?:(?:احسب|جد|اوجد|اكتب)\s+)?(?=${namedUnary})`,
    ).test(demand)
  )
    return fail(
      "افصل مساواة التحقق أو تعريف النتيجة عن الطلب الآخر؛ اكتب كل عبارة كاملة في سطر مستقل حتى لا نفترض المقصود.",
    );
  if (
    /محددي|اثري|منقولي|معكوسي|مقلوبي/.test(demand) &&
    /المصفوفتين|المصفوفات/.test(demand)
  )
    return fail(
      "اكتب كل عملية مع اسم مصفوفتها في طلب واضح، أو استعمل قائمة أسماء فقط بعد صيغة المثنى؛ لا نسقط بقية المصفوفات أو شروط الطلب.",
    );
  const operations: MatrixOperation[] = [];
  const add = (op: MatrixOperation) => {
    if (!operations.includes(op)) operations.push(op);
  };
  const names = [...demand.matchAll(/\b[A-Z]\b/g)].map((m) => m[0]);
  const namedOperand = demand
    .match(new RegExp(namedUnary))?.[0]
    .match(/[A-Z](?![A-Za-z0-9_])/)?.[0];
  const name =
    namedOperand ||
    names.find(
      (n) => n !== "I" && n !== "T" && !new RegExp(`\\b${n}\\s*=`).test(demand),
    ) ||
    active ||
    names[0] ||
    "A";
  if (/\b[A-Z](?:_\{?\d+\}?|\d+)(?=$|[^A-Za-z0-9_])/.test(demand))
    return fail(
      "أسماء المصفوفات هنا حرف لاتيني كبير واحد، مثل A أو B. اكتب الاسم المطلوب بوضوح؛ لا نستبدل الاسم ذي الفهرس بمصفوفة قديمة.",
    );
  const matrices: MatrixContext = {
    ...context.matrices,
    values,
    active,
    scalarFactor: factor,
    origin: definitions.length ? "matrix" : context.matrices?.origin,
  };
  const req: MatrixRequest = {
    context: matrices,
    name,
    operations,
    source: demand,
  };
  const matrixEquation = demand.match(/\b([A-Z])\s*\*?\s*X\s*=\s*([A-Z])\b/);
  if (
    /غاوس|جاوس|كرامر|كريمر/.test(demand) &&
    (/جملة|نظام|معادل|موسعة|السابق/.test(demand) ||
      /[xyzts][^=]*=/.test(demand) ||
      matrixEquation ||
      matrices.system)
  ) {
    let system: MatrixSystem | undefined;
    if (matrixEquation) {
      const coefficients = values[matrixEquation[1]],
        rhs = values[matrixEquation[2]];
      if (!coefficients || !rhs)
        return fail("عرّف مصفوفة المعاملات وعمود الطرف الأيمن للجملة AX=B.");
      if (
        coefficients.length < 2 ||
        ![2, 3].includes(coefficients[0].length) ||
        rhs.length !== coefficients.length ||
        rhs[0].length !== 1
      )
        return fail(
          "للجملة AX=B نحتاج عمودين أو ثلاثة للمجاهيل، ومن سطرين إلى ستة، وطرفًا أيمن عمودًا بالطول نفسه؛ كرامر يتطلب تساوي الأسطر والأعمدة.",
        );
      req.systemName = matrixEquation[1];
      system = {
        coefficients,
        constants: rhs.map((r) => r[0]),
        variables: ["x", "y", "z"].slice(0, coefficients[0].length),
      };
    } else
      system =
        systemFromText(text) ||
        (/موسعة/.test(demand) && values[name] ? undefined : matrices.system);
    if (!system && values[name]) {
      const a = values[name];
      if (a.length < 2 || ![3, 4].includes(a[0].length))
        return fail(
          "المصفوفة الموسعة لها من سطرين إلى ستة، وثلاثة أو أربعة أعمدة؛ آخر عمود هو الطرف الأيمن.",
        );
      system = {
        coefficients: a.map((r) => r.slice(0, -1)),
        constants: a.map((r) => r[r.length - 1]),
        variables: ["x", "y", "z"].slice(0, a[0].length - 1),
      };
    }
    if (!system)
      return fail(
        "ما معادلات الجملة؟ اكتب كل معادلة في سطر أو أدخل المصفوفة الموسعة.",
      );
    matrices.system = system;
    add(/كرامر|كريمر/.test(demand) ? "cramer" : "gauss");
    if (/كرامر|كريمر/.test(demand) && /غاوس|جاوس/.test(demand)) add("gauss");
    return req;
  }
  if (!values[name] && !/\b(?:AB|BA)\b/.test(demand))
    return fail(`ما عناصر المصفوفة ${name}؟ اكتبها مثل ${name}=[[1,2],[3,4]].`);
  if (values[name]) matrices.active = name;
  if (
    /نوع|صنف|تصنيف|صفرية|واحدية|مصفوفة (?:ال)?وحدة|مثلثية|قطرية|متماثلة|متناظرة|مربعة/.test(
      demand,
    )
  )
    add("types");
  if (/قياس|ابعاد|عدد (?:الاسطر|الصفوف|الاعمدة)/.test(demand))
    add("dimensions");
  if (/محدد|\bdet\s*\(|\|\s*[A-Z]\s*\|/.test(demand)) add("determinant");
  if (/اثر|\b(?:tr|trace)\s*\(/.test(demand)) add("trace");
  if (/منقول|مبدل|مدور|\^\(?[Tt]\)?|'/.test(demand)) add("transpose");
  if (/مقلوب|معكوس|قابلة للقلب|قابلة للعكس|\^\(?-1\)?/.test(demand))
    add("inverse");
  if (/ملحق|مرافق|\badj\s*\(/.test(demand)) add("adjugate");
  if (/رتبة|\brank\s*\(/.test(demand)) add("rank");
  if (/غاوس|جاوس|مدرج/.test(demand))
    add(/مختزل|جوردان|rref/.test(demand) ? "rref" : "echelon");
  if (/ذاتي/.test(demand)) add("eigen");
  if (/اشعة|متجه/.test(demand) && /حول|مثل|انقل/.test(demand)) add("vectors");
  if (/احصاء|بيانات|تكرارات/.test(demand) && /حول|انقل/.test(demand))
    add("statistics");
  const mathOnly = demand.match(
    /(?:\b([A-Z])\s*=\s*)?([+-]?(?:(?:det|tr|trace|adj|inv|sqrt)\s*\(|[0-9A-Z(])[A-Za-z0-9_+*/^'().\s-]*)(?=$|[\u0600-\u06ff])/,
  );
  const comparison = demand.match(
    /([A-Za-z0-9()+*/^'\s-]+)\s*(!=|≠|=)\s*([A-Za-z0-9()+*/^'\s-]+)(?=$|[\u0600-\u06ff])/,
  );
  const scalarMultiplier = demand.match(
    /(?:بالعدد|بالثابت|بالمعامل)\s*([A-Za-z0-9+*/^().\s-]+)(?=$|[\u0600-\u06ff])/,
  );
  if (scalarMultiplier) {
    req.expression = `(${bounded(read(scalarMultiplier[1].trim())).text()})*${name}`;
    operations.length = 0;
    add("expression");
    return req;
  }
  const noncommute = /تبادلي|متبادل/.test(demand);
  const expressionLike =
    !!mathOnly &&
    /[+*/^'-]|[A-Z]{2}|[0-9)]\s*[A-Z]|\b(?:det|tr|trace|adj|inv)\(/.test(
      mathOnly[2],
    );
  if (proof && (comparison || noncommute)) {
    req.comparison = comparison
      ? {
          left: comparison[1].trim(),
          right: comparison[3].trim(),
          equal: comparison[2] === "=",
        }
      : { left: "A*B", right: "B*A", equal: !/ليس|غير|لا/.test(demand) };
    operations.length = 0;
    add("compare");
  } else if (
    /جمع|مجموع|اجمع|اطرح|طرح|فرق|جداء|اضرب|حاصل الضرب|حاصل\s*\*|(?:^|\s)ا\*|\b(?:AB|BA)\b/.test(
      demand,
    ) ||
    /[A-Z][^\u0600-\u06ff]*[+*\-]/.test(demand) ||
    (!operations.length && expressionLike)
  ) {
    let expression = mathOnly?.[2]?.trim();
    if (
      !expression ||
      (!/[+*/^-]|[A-Z]{2}|[0-9)]\s*[A-Z]/.test(expression) &&
        !/\b(?:det|tr|trace|adj|inv)\(/.test(expression))
    ) {
      const operands = [
        ...new Set([...names, ...definitions.map((d) => d.name)]),
      ].filter((n) => n !== "I" && n !== "T");
      if (operands.length < 2)
        return fail(
          "ما المصفوفة الثانية؟ سمّ المصفوفتين وحدّد ترتيب الجداء، أو اكتب المعامل في k*A.",
        );
      expression = `${operands[0]}${/اطرح|طرح|فرق/.test(demand) ? "-" : /جمع|مجموع|اجمع/.test(demand) ? "+" : "*"}${operands[1]}`;
    }
    req.expression = expression;
    req.assign = mathOnly?.[1];
    // A composite expression is evaluated once, not as separate determinant/transpose requests.
    operations.length = 0;
    add("expression");
  }
  if (
    proof &&
    !req.comparison &&
    !operations.includes("types") &&
    !(
      operations.includes("inverse") &&
      /قابلة للقلب|قابلة للعكس|قابل للقلب|قابل للعكس/.test(demand)
    )
  )
    return fail(
      "هذا البرهان المصفوفي ليس ضمن المسارات المحددة؛ اكتب مساواة أو عدم مساواة بين عبارتين لمصفوفات معطاة، أو اطلب حساب العملية دون افتراض صحة النتيجة.",
    );
  if (!operations.length)
    return fail(
      "ما العملية المطلوبة على المصفوفة: نوعها، جمعها، جداؤها، محددها، أثرها، منقولها أم حل جملة؟",
    );
  if (/ساروس/.test(demand)) req.determinantMethod = "sarrus";
  else if (/نشر|توسع/.test(demand)) req.determinantMethod = "expansion";
  if (req.determinantMethod === "expansion") {
    const selected = demand.match(
      /(?:^|[^\p{L}])(?:ال)?(سطر|صف|عمود)(?=\s|\d)\s*([^\s،؛.]+)/u,
    );
    if (selected) {
      const ordinal = selected[2].replace(/^ال/, "");
      const dimension =
        selected[1] === "عمود" ? values[name][0].length : values[name].length;
      const index = /^\d+$/.test(ordinal)
        ? Number(ordinal) - 1
        : /^(?:اخير|اخيرة)$/.test(ordinal)
          ? dimension - 1
          : ordinals["ال" + ordinal];
      if (index === undefined)
        return fail(
          "حدّد رقم السطر أو العمود الذي تريد النشر بحسبه؛ لا نختار سطرًا بديلًا تلقائيًا.",
        );
      req.expansion = {
        axis: selected[1] === "عمود" ? "column" : "row",
        index,
      };
    } else if (/(?:سطر|صف|عمود)(?:\s|$)/.test(demand))
      return fail("ما رقم السطر أو العمود الذي تريد النشر بحسبه؟");
  }
  return req;
}
