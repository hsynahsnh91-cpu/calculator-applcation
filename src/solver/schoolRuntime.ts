import {
  ClarificationError,
  type SolverContext,
  type SolverResult,
  type EngineId,
} from "./types";
import type { SchoolContext, SchoolPart } from "./schoolTypes";
import { isSchoolContext } from "./schoolTypes";
import { mathInstructionText, hasMathInstruction } from "./textbook";
import { normalizePrompt } from "./parser";
import {
  assigned,
  readColors,
  canonicalColor,
  extractProbabilityRequest,
} from "./extractors/probability";
import {
  exact,
  ONE,
  sum,
  probability,
  columns,
} from "../utils/probabilityExact";
const COLOR =
  "حمراء|احمر|حمر|حمرا|بيضاء|ابيض|بيض|بيضا|سوداء|اسود|خضراء|اخضر|زرقاء|ازرق|صفراء|اصفر";
const fail = (s: string) => new ClarificationError(s);
const selectedUrn = (text: string, order: string[]) =>
  text.match(
    /من\s+(?:ال)?(?:صندوق\s*(?:الاول|الثاني|الثالث)?\s*)?(U[1-8])\b/,
  )?.[1] ||
  (/من الصندوق الاول/.test(text)
    ? order[0]
    : /من الصندوق الثاني/.test(text)
      ? order[1]
      : undefined);
function scalarPrefix(text: string) {
  let depth = 0,
    end = 0;
  for (; end < text.length; end++) {
    const c = text[end];
    if (!/[A-Za-z0-9_+*/^().\s-]/.test(c)) break;
    if (c === "(") depth++;
    if (c === ")") {
      if (!depth) break;
      depth--;
    }
    if (c === "\n" && !depth) break;
  }
  return text
    .slice(0, end)
    .trim()
    .replace(/[.\s]+$/, "");
}
/** Validate and retain definitions, without manufacturing a solved preamble. */
export async function prepareSchoolContext(
  text: string,
  context: SolverContext,
): Promise<SolverContext> {
  const state: SchoolContext = {
    ...context.school,
    functions: { ...context.school?.functions },
    values: { ...context.school?.values },
  };
  context = { ...context, school: state };
  text = text.replace(/\bU_\{?([1-8])\}?/g, "U$1");
  const demand = mathInstructionText(text),
    at = text.indexOf(demand);
  let declarations =
    at > 0 ? text.slice(0, at) : hasMathInstruction(text) ? "" : text;
  const where = text.match(/(?:^|[\s،])حيث\s+([\s\S]+)/)?.[1];
  if (where) {
    const d = mathInstructionText(where),
      end = where.indexOf(d);
    declarations +=
      "\n" +
      (end > 0 ? where.slice(0, end) : hasMathInstruction(where) ? "" : where);
  }

  for (const m of declarations.matchAll(
    /\b([fgh])\s*\(\s*([a-z])\s*\)\s*=\s*/g,
  )) {
    const expression = scalarPrefix(declarations.slice(m.index! + m[0].length));
    if (!expression) throw fail("أكمل تعريف الدالة بعد علامة المساواة.");
    const { parseExpression } = await import("./math");
    parseExpression(expression, context.assignments, m[2]);
    state.functions![m[1]] = { expression, variable: m[2] };
    if (m[1] === "f" || !context.expression) {
      context.expression = expression;
      context.variable = m[2];
      delete context.derivative;
    }
  }
  if (/\bu_?\{?n\+1|\bu\(n\+1\)|متتالية/.test(declarations))
    state.sequence = declarations.slice(0, 1800);
  else if (/^\s*u_?[01]\s*=/.test(declarations) && state.sequence)
    state.sequence = (state.sequence + "\n" + declarations).slice(0, 1800);
  if (
    /\bz(?:_[A-Z]|[1-9])\s*=/.test(declarations) ||
    (/\bz\s*=/.test(declarations) &&
      (!/[PQR]\s*:|مستوي|مستقيم|[xy][^،\n]*=/.test(declarations) ||
        /عقدي|\bi\b/.test(declarations)))
  ) {
    const { extractComplexRequest } = await import("./extractors/complex");
    const { complexValue } = await import("../utils/complexMath");
    const input = extractComplexRequest(declarations, context),
      values: Record<string, string> = {};
    const names = [
      ...new Set(
        [...declarations.matchAll(/\b(z(?:_[A-Z]|[1-9])?)\s*=/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    for (const name of [...names, ...Object.keys(input.values).reverse()]) {
      if (Object.keys(values).length >= 12) break;
      const source = input.values[name];
      if (source) {
        const value = complexValue(source).expression;
        if (value.length > 900) throw fail("تعريف العدد أطول من حد السياق.");
        values[name] = value;
      }
    }
    context.complex = { ...context.complex, values };
  }
  const boxMatches = [...declarations.matchAll(/\b(U[1-8])\s*:\s*/g)];
  if (boxMatches.length) {
    const urns: NonNullable<SchoolContext["urns"]> = {};
    const order: string[] = [];
    for (let i = 0; i < boxMatches.length; i++) {
      const m = boxMatches[i],
        chunk = declarations
          .slice(m.index! + m[0].length, boxMatches[i + 1]?.index)
          .split(/نختار|اختيار|المطلوب/)[0],
        colors = readColors(chunk);
      if (!colors.length) throw fail(`ما محتويات ${m[1]} بأعدادها وألوانها؟`);
      if (
        colors.some((c) => !Number.isSafeInteger(c.count) || c.count < 0) ||
        !colors.some((c) => c.count > 0)
      )
        throw fail("محتويات الصندوق أعداد صحيحة غير سالبة ومجموعها موجب.");
      if (urns[m[1]])
        throw fail(`تكرر تعريف الصندوق ${m[1]}؛ حدّد تعريفًا واحدًا.`);
      urns[m[1]] = { colors };
      order.push(m[1]);
    }
    state.urns = urns;
    state.urnOrder = order;
    delete state.weights;
    delete state.observation;
    delete state.randomVariable;
    delete state.activeUrn;
    context.probability = undefined;
    const explicit = order.map((id) =>
      assigned(declarations, `احتمال اختيار ${id}`),
    );
    const common = assigned(declarations, "احتمال اختيار كل صندوق");
    if (explicit.every(Boolean))
      state.weights = explicit.map((w) => probability(w!).text());
    else if (explicit.some(Boolean))
      throw fail("ما أوزان اختيار جميع الصناديق؟");
    else if (common)
      state.weights = order.map(() => probability(common).text());
    else if (
      /عشوائيا\s+(?:احدا?\s+الصندوقين|احدا?\s+الصناديق)|بالتساوي|متساوي(?:ة)? الاحتمال/.test(
        declarations,
      )
    )
      state.weights = order.map(() => `1/${order.length}`);
    if (state.weights && !sum(state.weights.map(probability)).eq(ONE))
      throw fail("مجموع احتمالات اختيار الصناديق لا يساوي1؛ راجع المعطيات.");
  }
  if (/تجربة جديدة|نعيد\s+(?:ال)?كرة/.test(declarations)) {
    state.experiment = (state.experiment || 0) + 1;
    delete state.randomVariable;
    delete state.activeUrn;
    context.probability = undefined;
  }
  const urnId = /اذا علم|ما احتمال|بشرط/.test(declarations)
    ? undefined
    : selectedUrn(declarations, state.urnOrder || []);
  if (urnId) {
    if (!state.urns?.[urnId]) throw fail(`ما محتويات الصندوق ${urnId}؟`);
    state.activeUrn = urnId;
  }
  if (/كيس|الالوان\s*=/.test(declarations) && readColors(declarations).length) {
    delete state.activeUrn;
    delete state.randomVariable;
    delete state.observation;
  }
  const variable = declarations.match(
    new RegExp(
      `\\b([XY])\\b[^؛;\\n]{0,160}?عدد\\s+(?:ال)?كرات\\s+(?:ال)?(${COLOR})`,
    ),
  );
  if (variable)
    state.randomVariable = {
      symbol: variable[1] as "X" | "Y",
      color: canonicalColor(variable[2]),
      urn: state.activeUrn,
      experiment: state.experiment || 0,
    };
  if (!boxMatches.length && /\bP\s*\([^)]*\)\s*=/.test(declarations))
    delete state.observation;
  const observed = declarations.match(
    new RegExp(`\\b([A-Z])\\s*:\\s*[^؛;\\n]{0,80}?(${COLOR})`),
  );
  if (observed)
    state.observation = {
      symbol: observed[1],
      color: canonicalColor(observed[2]),
    };
  if (
    state.activeUrn &&
    state.urns?.[state.activeUrn] &&
    /سحب|نسحب/.test(declarations)
  ) {
    const count = /كرتان|كرتين/.test(declarations)
      ? 2
      : /(?:كرة\s*1|1\s*كرة|كرة واحدة)/.test(declarations)
        ? 1
        : Number(declarations.match(/(?:نسحب|سحب)\s*(\d+)/)?.[1]);
    const mode = /معا|ان واحد/.test(declarations)
      ? "simultaneous"
      : /دون (?:ال)?اعادة/.test(declarations)
        ? "successive_without_rep"
        : /مع (?:ال)?اعادة/.test(declarations)
          ? "successive_with_rep"
          : count === 1
            ? "simultaneous"
            : undefined;
    if (count && mode) {
      const model: import("./probabilityTypes").UrnModel = {
        colors: state.urns[state.activeUrn].colors,
        count,
        mode,
        target: state.randomVariable?.color,
      };
      const { validateUrn } = await import("../utils/probabilityUrn");
      validateUrn(model);
      context.probability = { active: "urn", urn: model };
    }
  }
  if (!isSchoolContext(state))
    throw fail("تعريفات المسألة تجاوزت حدود السياق المحفوظ.");
  return context;
}
function variableLabel(out: SolverResult, symbol: "X" | "Y"): SolverResult {
  if (symbol === "X") return out;
  const rename = (s: string) => s.replace(/\bX\b/g, "Y");
  out.finalLatex = rename(out.finalLatex);
  out.steps = out.steps.map((s) => ({ ...s, latex: rename(s.latex) }));
  out.visuals = out.visuals.map((v) =>
    v.kind === "table" ? { ...v, latex: rename(v.latex) } : v,
  );
  if (out.contextPatch?.probability?.law)
    out.contextPatch.probability.law.symbol = "Y";
  return out;
}
function base(engine: EngineId): SolverResult {
  return {
    id: `school-${Math.random().toString(36).slice(2)}`,
    engine,
    engines: [engine],
    mode: "probability",
    title: "",
    finalLatex: "",
    steps: [],
    visuals: [],
    verification: { passed: false, method: "لم يُجر فحص مستقل بعد." },
  };
}
/** Named urns are translated into existing exact models, never into stored answers. */
export async function runSchoolProbability(
  text: string,
  context: SolverContext,
): Promise<SolverResult | undefined> {
  const s = context.school,
    order = s?.urnOrder || [];
  text = text.split(/(?:^|[\s،])حيث\s+/)[0];
  if (/كيس|الالوان\s*=|\bq\s*=\s*\[|\bp\s*=\s*\[/.test(text)) return undefined;
  if (!s?.activeUrn && order.length < 2) return undefined;
  const { solveProbabilityRequest } = await import(
    "../utils/probabilityWorkbench"
  );
  if (
    s?.activeUrn &&
    context.probability?.active === "urn" &&
    /قيم|قانون|[EV]\s*\(|توقع|امل|تباين/.test(text)
  ) {
    const rv = s.randomVariable;
    if (!rv || rv.experiment !== (s.experiment || 0))
      throw fail("أي لون يعدّه المتغير العشوائي في التجربة الجديدة؟");
    if (
      context.probability.law &&
      /[EV]\s*\(|امل|توقع|تباين|انحراف/.test(text)
    ) {
      const { colorLaw } = await import("../utils/probabilityUrn");
      const expected = {
        ...colorLaw(context.probability.urn!, rv.color),
        symbol: rv.symbol,
      };
      if (
        JSON.stringify(expected) === JSON.stringify(context.probability.law)
      ) {
        const request = extractProbabilityRequest(text, {
          ...context,
          probability: { ...context.probability, active: "law" },
        });
        if (request.kind === "law") {
          const out = {
            ...base("probabilityEngine"),
            ...solveProbabilityRequest(request, context),
          };
          out.steps.unshift({
            title: "استعمال القانون المثبت في الطلب السابق",
            latex: `${rv.symbol}(\\Omega)=\\{${expected.values.map((x) => exact(x).tex()).join(",")}\\}`,
            text: "استعملنا احتمالات القانون المحفوظ، بعد فحص مطابقتها لنموذج التجربة الحالي؛ لم نعد اشتقاقها في الحل المعروض.",
          });
          return out;
        }
      }
    }
    const request = extractProbabilityRequest(
      `احسب قانون احتمال عدد الكرات من اللون ${rv.color} ${text}`,
      context,
    );
    if (request.kind === "urn") {
      request.query.type = "law";
      request.query.color = rv.color;
    }
    const out = {
      ...base("probabilityEngine"),
      ...solveProbabilityRequest(request, context),
    };
    if (
      /قيم|مجموعة القيم/.test(text) &&
      !/قانون|امل|توقع|[EV]\s*\(/.test(text)
    ) {
      const law = out.contextPatch?.probability?.law;
      if (!law) throw fail("لم يتكون قانون للمتغير بعد.");
      out.finalLatex = `${rv.symbol}(\\Omega)=\\{${law.values.map((x) => exact(x).tex()).join(",")}\\}`;
      out.title = "قيم المتغير العشوائي";
      out.decimal = undefined;
      out.steps = out.steps.filter(
        (st) => !/امل|تباين|العزم|انحراف/.test(st.title),
      );
    } else if (
      /اكتب.*قانون/.test(text) &&
      !/امل|توقع|تباين|[EV]\s*\(/.test(text)
    ) {
      const law = out.contextPatch?.probability?.law;
      if (law) {
        out.finalLatex = columns(
          [
            [
              `P(${rv.symbol}=x_i)`,
              ...law.probabilities.map((x) => exact(x).tex()),
            ],
          ],
          ["x_i", ...law.values.map((x) => exact(x).tex())],
        );
        out.decimal = undefined;
        out.steps = out.steps.filter(
          (st) => !/امل|تباين|العزم|انحراف/.test(st.title),
        );
      }
    }
    return variableLabel(out, rv.symbol);
  }
  if (order.length < 2 || !s?.urns || !/احتمال|P\s*\(/.test(text)) return;
  if (/\bP\s*\([^)]*\)\s*=/.test(text)) return;
  const explicitlyNamed = /\bU[1-8]\b|الصندوق الاول|الصندوق الثاني/.test(text);
  if (
    context.probability &&
    context.probability.active !== "mixture" &&
    !explicitlyNamed
  )
    return;
  if (
    !explicitlyNamed &&
    !/كرة|الكرة|المسحوبة|اللون|الملاحظة|بايز/.test(text) &&
    !new RegExp(COLOR).test(text) &&
    !(
      s.observation &&
      new RegExp(`P\\s*\\(\\s*${s.observation.symbol}\\s*\\)`).test(text)
    )
  )
    return;

  // A separate selected-box draw is not the preceding random-box experiment.
  if (s.activeUrn) return;
  const named =
    text.match(/\bU[1-8]\b/)?.[0] ||
    (/الصندوق الاول/.test(text)
      ? order[0]
      : /الصندوق الثاني/.test(text)
        ? order[1]
        : undefined);
  const posterior = /اذا علم|شرط|P\([^)]*\|/.test(text);
  const found = text.match(new RegExp(COLOR))?.[0],
    color = found ? canonicalColor(found) : s.observation?.color;
  if (!color) throw fail("ما لون الكرة أو الحدث الذي تريد احتماله؟");
  if (!s.weights)
    throw fail(
      "ما احتمالات اختيار الصناديق؟ لا يفترض تساوي الاختيار دون عبارة تبرره.",
    );
  if (posterior && !named)
    throw fail("أي صندوق تريد احتماله بعد معرفة لون الكرة؟");
  const model = {
    weights: s.weights,
    conditionals: order.map((id) => {
      const colors = s.urns![id].colors,
        n = colors.reduce((v, c) => v + c.count, 0),
        k = colors
          .filter((c) => c.name === color)
          .reduce((v, c) => v + c.count, 0);
      return `${k}/${n}`;
    }),
    labels: order,
  };
  const out = {
    ...base("probabilityEngine"),
    ...solveProbabilityRequest(
      {
        kind: "mixture",
        model,
        posterior: posterior ? order.indexOf(named!) + 1 : undefined,
      },
      context,
    ),
  };
  const symbol = color === "حمراء" ? "R" : color === "بيضاء" ? "W" : "B";
  const rename = (latex: string) =>
    latex
      .replace(
        /H_\{(\d+)\}/g,
        (_, i) => `U_{${order[Number(i) - 1]?.slice(1) || i}}`,
      )
      .replace(/H_i/g, "U_i")
      .replace(/\bB\b/g, symbol);
  out.finalLatex = rename(out.finalLatex);
  out.steps = out.steps.map((st) => ({ ...st, latex: rename(st.latex) }));
  const relabelTree = (
    node: import("./types").TreeNode,
  ): import("./types").TreeNode => ({
    ...node,
    label: node.label.replace(/\bB\b/g, symbol),
    children: node.children?.map(relabelTree),
  });
  out.visuals = out.visuals.map((v) =>
    v.kind === "tree" ? { ...v, root: relabelTree(v.root) } : v,
  );
  out.steps.unshift({
    title: "المعطى وتعريف الأحداث",
    text: `${order.join(" و")}: اختيار الصندوق المسمى؛ ${symbol}: سحب كرة من اللون ${color}.`,
    latex: `\\begin{aligned}${order.map((id, i) => `P(U_{${id.slice(1)}})=${probability(model.weights[i]).tex()},\\quad P(${symbol}\\mid U_{${id.slice(1)}})=${probability(model.conditionals[i]).tex()}`).join("\\\\")}\\end{aligned}`,
  });

  out.title = posterior
    ? "احتمال الصندوق بعد معرفة اللون — بايز"
    : "احتمال اللون — قانون الاحتمال الكلي";
  out.contextPatch = {
    ...out.contextPatch,
    school: { ...s, observation: { color, symbol } },
  };
  return out;
}
export function schoolUnimplemented(text: string) {
  if (
    /اثبت|بين ان|برهن/.test(text) &&
    !/بالتدريج|\bv_n\b|مستقل|استقامة|استواء|مستوية|مرتبط|تعامد|متعامد|ناظم|مماس|تماس|تلاقي|مركز الثقل|مركز الابعاد|التجميع|حل(?:ا)? وحيد|حلا وحيدا|وجود حل وحيد/.test(
      text,
    )
  )
    throw fail(
      "هذا البرهان ليس ضمن مسارات الاستدلال المدرسية المدعومة؛ هل تريد حساب المقدار أو صياغة المطلوب المحدد بدل اعتبار النتيجة المعطاة معطى جديدًا؟",
    );

  if (/معادلة تفاضلية|معادلات تفاضلية|y\s*'\s*=/.test(text))
    throw fail(
      "لا يدعم التطبيق حاليًا حل المعادلات التفاضلية؛ هل تريد بدلًا منها اشتقاق تابع معطى؟",
    );
  if (
    /متراجحة|متراجحات|متجاور|استمرار.*اجزاء|استمرار.*دون|دراسة كاملة|دراسة شاملة/.test(
      text,
    )
  )
    throw fail(
      "هذا النوع من الدراسة العامة غير مدعوم كاملًا؛ ما الجزء المحدد ومعطياته الذي تريد حسابه؟",
    );
}
export const partInfo = (part: SchoolPart) => ({
  label: part.label,
  title: part.title.slice(0, 1000),
  intent: part.intent,
  showDecimal: /تقريب|عشري|عدديا/.test(normalizePrompt(part.text)),
});
