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
import { polynomial, G } from "../../utils/spaceGeometryMath";
import { mathFragments } from "./index";
const fail = (s: string): never => {
  throw new ClarificationError(s);
};
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
  if (
    !/\[\s*\[|\\begin\{[pbvV]?matrix\}|مصفوف|\b[A-Z]\s*=\s*[[(][^\n]*[;؛]/.test(
      text,
    )
  )
    return context;
  const defs = matrixDefinitions(text);
  if (!defs.length) return context;
  const values = { ...context.matrices?.values };
  for (const d of defs) values[d.name] = d.cells;
  const matrices: MatrixContext = {
    values,
    active: defs[0].name,
    origin: "matrix",
  };
  if (!isMatrixContext(matrices))
    return fail("تجاوزت تعريفات المصفوفات حدود السياق المحفوظ.");
  return { ...context, matrices };
}
export function matrixDefinitionOnly(text: string): boolean {
  return (
    !hasMathInstruction(text) &&
    !/(?:^|[\s،؛])حول(?=\s)|افحص|اختبر|استقلال|قانون|احتمال|متغير|متحول|نوع|صنف|محدد|اثر|منقول|مقلوب|معكوس|غاوس|كرامر|رتبة/.test(
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
  if (/مدرج (?:ال)?تكراري|توزيع غاوسي/.test(text) && !/مصفوف/.test(text))
    return false;
  if (
    /مصفوف|محدد المصفوفة|غاوس(?:\s|-)*جوردان|ساروس|كرامر|طريقة غاوس|طريقة جاوس|كريمر|\b(?:det|tr|trace|adj|rank|rref)\s*\(|\[\s*\[|\\begin\{[pbvV]?matrix\}/.test(
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
      (/\b[A-Z]\s*(?:[+*\-^']|[A-Z]\b)|(?:^|\s)[-+]?\d+(?:\/\d+)?\s*\*?\s*[A-Z]\b/.test(
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
    /(^|[^\p{L}])([سصع])(?=$|[^\p{L}])/gu,
    (_, before: string, variable: string) =>
      before + ({ س: "x", ص: "y", ع: "z" } as Record<string, string>)[variable],
  );
  const equations = text
    .split(/[\n،؛;]/)
    .flatMap(mathFragments)
    .filter((s) => s.includes("="));
  if (!equations.length) return;
  if (equations.length < 2 || equations.length > 3)
    return fail("اكتب معادلتين أو ثلاث معادلات خطية، كل واحدة في سطر مستقل.");
  const expressions = equations.map((e) => {
    const sides = e.split("=");
    if (sides.length !== 2 || !sides[0] || !sides[1])
      return fail("أكمل طرفي كل معادلة في الجملة.");
    return polynomial(`(${sides[0]})-(${sides[1]})`);
  });
  const axes = ["10000", "01000", "00100"],
    names = ["x", "y", "z"];
  if (
    expressions.some((p) =>
      [...p.keys()].some((k) => k !== "00000" && !axes.includes(k)),
    )
  )
    return fail(
      "طريقة غاوس وكرامر هنا لجمل خطية في x وy وz فقط؛ الجملة المدخلة ليست خطية.",
    );
  const used = axes.filter((_, i) =>
    equations.some((e) =>
      new RegExp(`(?<![A-Za-z_])${names[i]}(?![A-Za-z_])`).test(e),
    ),
  );
  if (used.length !== equations.length)
    return fail(
      "عدد المعادلات يساوي عدد المجاهيل: اثنان أو ثلاثة. لا نضيف مجهولًا أو معادلة افتراضية.",
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
  const demand = mathInstructionText(demandSource).replace(/[،؛]/g, " ").trim();
  const operations: MatrixOperation[] = [];
  const add = (op: MatrixOperation) => {
    if (!operations.includes(op)) operations.push(op);
  };
  const names = [...demand.matchAll(/\b[A-Z]\b/g)].map((m) => m[0]);
  const name =
    names.find(
      (n) => n !== "I" && n !== "T" && !new RegExp(`\\b${n}\\s*=`).test(demand),
    ) ||
    active ||
    names[0] ||
    "A";
  const matrices: MatrixContext = {
    ...context.matrices,
    values,
    active,
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
      /[xyz][^=]*=/.test(demand) ||
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
        ![2, 3].includes(coefficients.length) ||
        coefficients[0].length !== coefficients.length ||
        rhs.length !== coefficients.length ||
        rhs[0].length !== 1
      )
        return fail(
          "للجملة AX=B نحتاج معاملات مربعة2×2 أو3×3 وطرفًا أيمن عمودًا بالطول نفسه.",
        );
      req.systemName = matrixEquation[1];
      system = {
        coefficients,
        constants: rhs.map((r) => r[0]),
        variables: ["x", "y", "z"].slice(0, coefficients.length),
      };
    } else system = systemFromText(text) || matrices.system;
    if (!system && values[name]) {
      const a = values[name];
      if (![2, 3].includes(a.length) || a[0].length !== a.length + 1)
        return fail(
          "لحل جملة من مصفوفة موسعة نحتاج مقاس 2×3 أو3×4، وآخر عمود هو الطرف الأيمن.",
        );
      system = {
        coefficients: a.map((r) => r.slice(0, -1)),
        constants: a.map((r) => r[r.length - 1]),
        variables: ["x", "y", "z"].slice(0, a.length),
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
  if (/نوع|صنف|تصنيف|صفرية|واحدية|مثلثية|قطرية|متماثلة|مربعة/.test(demand))
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
    /(?:بالعدد|بالثابت|بالمعامل)\s*([-+0-9.][0-9+*/().\s-]*)(?=$|[\u0600-\u06ff])/,
  );
  if (scalarMultiplier) {
    req.expression = `(${scalarMultiplier[1].trim()})*${name}`;
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
    /جمع|مجموع|اجمع|اطرح|طرح|فرق|جداء|حاصل\s*\*|(?:^|\s)ا\*|\b(?:AB|BA)\b/.test(
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
  const expansion = demand.match(
    /(?:سطر|صف|عمود)\s*(?:ال)?(اول|اولي|ثاني|ثانية|ثالث|ثالثة|رابع|رابعة|خامس|خامسة|سادس|سادسة|\d+)/,
  );
  if (expansion)
    req.expansion = {
      axis: /عمود/.test(expansion[0]) ? "column" : "row",
      index: /^\d+$/.test(expansion[1])
        ? Number(expansion[1]) - 1
        : ordinals["ال" + expansion[1]],
    };
  return req;
}
