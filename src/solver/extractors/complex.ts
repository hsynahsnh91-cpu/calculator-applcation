import { mathInstructionText } from "../textbook";
import { math, canonical, parseExpression } from "../math";
import { mathFragments } from "./index";
import { ClarificationError, type SolverContext } from "../types";
import type { ComplexRequest } from "../complexTypes";

const LABEL = /\b(z(?:_[A-Z]|[1-9])?|omega|theta|power|[abcdnkrw])\s*=\s*/g;
const clean = (value: string) =>
  value
    .trim()
    .replace(/^[,،:]+|[,،.\s]+$/g, "")
    .trim();
function prefix(source: string): string {
  let depth = 0,
    end = 0;
  for (; end < source.length; end++) {
    const c = source[end];
    if (/[^A-Za-z0-9_+*/^().°\s,\-]/.test(c)) break;
    if (c === "(") depth++;
    if (c === ")") {
      if (!depth) break;
      depth--;
    }
    if (c === "," && !depth) break;
  }
  return clean(source.slice(0, end));
}
function afterKeyword(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match ? prefix(text.slice(match.index! + match[0].length)) : undefined;
}
function substitute(source: string, values: Record<string, string>): string {
  let output = source;
  const tooLong = () =>
    new ClarificationError(
      "المعطيات متداخلة أو طويلة جدًا. اكتب الأعداد بصورة مستقلة.",
    );
  if (output.length > 1800) throw tooLong();
  for (let pass = 0; pass < 4; pass++) {
    let length = output.length;
    const next = output.replace(
      /\b(?:z(?:_[A-Z]|[1-9])?|omega|[abcdw])\b/g,
      (key) => {
        if (!values[key]) return key;
        length += values[key].length + 2 - key.length;
        if (length > 1800) throw tooLong();
        return `(${values[key]})`;
      },
    );
    if (next === output) return output;
    output = next;
  }
  if (output.length > 1800)
    throw new ClarificationError(
      "المعطيات متداخلة أو طويلة جدًا. اكتب الأعداد بصورة مستقلة.",
    );
  return output;
}
function integer(
  value: string | undefined,
  message: string,
  limit = 1e12,
): number | undefined {
  if (!value) return undefined;
  const result: unknown = parseExpression(value).evaluate();
  if (
    typeof result !== "number" ||
    !Number.isSafeInteger(result) ||
    Math.abs(result) > limit
  )
    throw new ClarificationError(message);
  return result;
}

export function extractComplexRequest(
  text: string,
  context: SolverContext,
): ComplexRequest {
  const original = text;
  text = text
    .replace(/ω|\\omega\b/g, "omega")
    .replace(/θ|\\theta\b/g, "theta")
    .replace(/\bz_\{?([1-9])\}?/g, "z$1")
    .replace(/\bz([A-Z])\b/g, "z_$1")
    .replace(/\b(cos|sin)\s+theta\b/g, "$1(theta)")
    .replace(
      /\b(cos|sin)\s*\^\s*\(?(\d+)\)?\s*\(?\s*(theta|x)\s*\)?/g,
      "$1($3)^$2",
    )
    .replace(/ا\*/g, "اضرب")
    .replace(/ال\*/g, "الضرب");
  const values: Record<string, string> = { ...context.complex?.values };
  const parameters: Record<string, string> = {};
  const definitions = [...text.matchAll(LABEL)];
  const given: string[] = [];
  for (let index = 0; index < definitions.length; index++) {
    const match = definitions[index];
    const end = definitions[index + 1]?.index ?? text.length;
    const value = prefix(text.slice(match.index! + match[0].length, end));
    if (!value)
      throw new ClarificationError(`أكمل قيمة ${match[1]} بعد علامة المساواة.`);
    if (["theta", "k", "n", "power", "r"].includes(match[1]))
      parameters[match[1]] = value;
    else {
      const resolved = substitute(value, {
        ...(context.assignments &&
          Object.fromEntries(
            Object.entries(context.assignments).map(([k, v]) => [k, String(v)]),
          )),
        ...values,
      });
      // Validate numeric expressions before adding them to the shared context.
      canonical(resolved, context.assignments);
      values[match[1]] = resolved;
      given.push(match[1]);
    }
  }
  for (const match of text.matchAll(
    /\b([A-Z])\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g,
  )) {
    values[`z_${match[1]}`] = `(${match[2]})+(${match[3]})*i`;
    given.push(`z_${match[1]}`);
  }
  const newPointKeys = given.filter((key) => /^z_[A-Z]$/.test(key));
  if (!newPointKeys.length && /مسافة|طول القطعة|زاوية|عمدة النسبة/.test(text)) {
    const numbered = given.filter((key) => /^z[1-9]$/.test(key));
    if (numbered.length >= 2)
      numbered.slice(0, 3).forEach((key, index) => {
        const pointKey = `z_${"ABC"[index]}`;
        values[pointKey] = values[key];
        newPointKeys.push(pointKey);
      });
  }
  const referencedPoints = [
    ...new Set([...text.matchAll(/\bz_([A-Z])\b/g)].map((match) => match[1])),
  ]
    .map((name) => `z_${name}`)
    .filter((key) => values[key]);
  let pointKeys = newPointKeys.length
    ? newPointKeys
    : referencedPoints.length
      ? referencedPoints
      : (context.complex?.pointNames
          ?.map((name) => `z_${name}`)
          .filter((key) => values[key]) ??
        Object.keys(values).filter((key) => /^z_[A-Z]$/.test(key)));
  const namedSegment = /مسافة|طول|زاوية|شعاع/.test(text)
    ? text.match(/\b([A-Z]{2,3})\b/)?.[1]
    : undefined;
  if (namedSegment) {
    pointKeys = [...new Set([...namedSegment])].map((name) => `z_${name}`);
    if (pointKeys.some((key) => !values[key]))
      throw new ClarificationError(
        `عرّف لاحقات نقاط ${namedSegment} جميعها أولًا.`,
      );
  }
  const points = pointKeys.map((key) => ({
    name: key.slice(2),
    expression: values[key],
  }));
  const current = context.complex?.current;
  let rest = text;
  for (let index = definitions.length - 1; index >= 0; index--) {
    const match = definitions[index];
    const value = prefix(
      text.slice(
        match.index! + match[0].length,
        definitions[index + 1]?.index ?? text.length,
      ),
    );
    rest =
      rest.slice(0, match.index!) +
      " " +
      rest.slice(match.index! + match[0].length + value.length);
  }
  rest = rest.replace(/\b[A-Z]\s*\([^()]*,[^()]*\)/g, " ");
  rest = mathInstructionText(rest);
  text = rest;
  const formNames = [
    ...new Set(
      [...rest.matchAll(/\b(z(?:_[A-Z]|[1-9])?|omega|[abcdw])\b/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  const requestedForm: ComplexRequest["form"] = /اشكال|الثلاث|كل.*صيغ/.test(
    text,
  )
    ? "all"
    : /(?:^|[^\p{L}])(?:ال|بال)?اسي(?:ة|ا)?(?=$|[^\p{L}])/u.test(text) ||
        /\bexponenti(?:al|el(?:le)?)\b/i.test(text)
      ? "exponential"
      : /مثلثي|trigonometri/i.test(text)
        ? "trigonometric"
        : /جبري|algebraic/i.test(text)
          ? "algebraic"
          : undefined;

  const measure: ComplexRequest["measure"] = requestedForm
    ? undefined
    : /عمدة(?!.*نسبة)|\barg\s*\(/.test(rest)
      ? "argument"
      : /طويلة|مقياس|\babs\s*\(|\|\s*z(?:_[A-Z]|[1-9])?\s*\|/.test(rest)
        ? "modulus"
        : undefined;
  if (measure)
    rest = rest
      .replace(/\b(?:arg|abs)\s*\(\s*(z(?:_[A-Z]|[1-9])?)\s*\)/g, "$1")
      .replace(/\|\s*(z(?:_[A-Z]|[1-9])?)\s*\|/g, "$1");
  const fragments = mathFragments(rest)
    .map(clean)
    .filter((part) => !part.includes("=") && !/^(?:n|theta|power)$/.test(part));
  if (!fragments.length) {
    const namedNumber = afterKeyword(rest, /العدد\s*(?:العقدي\s*)?/);
    const literals = rest.match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
    if (namedNumber && /^[+-]?\d+(?:\.\d+)?$/.test(namedNumber))
      fragments.push(namedNumber);
    else if (literals.length === 1 && !/قوة|قوته|اس\s|زاوية|زاويه/.test(rest))
      fragments.push(literals[0]);
  }
  const choose = (): string | undefined =>
    (requestedForm && formNames.length === 1
      ? (values[formNames[0]] ?? formNames[0])
      : undefined) ??
    (fragments[0] ? substitute(fragments[0], values) : undefined) ??
    (given.includes("z")
      ? values.z
      : given.find((key) => !["b", "omega"].includes(key))
        ? values[given.find((key) => !["b", "omega"].includes(key))!]
        : undefined) ??
    current ??
    (!/انسحاب|تحاكي|دوران|ازاحة/.test(text) && given.length
      ? values[given[0]]
      : undefined);
  const roots = /جذور|جذر|تربيعي|تكعيبي/.test(text);
  const transform = /انسحاب|ازاحة/.test(text)
    ? "translation"
    : /تحاكي|تمدد/.test(text)
      ? "homothety"
      : /دوران|تدوير/.test(text)
        ? "rotation"
        : undefined;
  const euler = /اويلر|اولر/.test(text);
  const demoivre = /د[يو]\s*موا?فر|ديموافر/.test(text);
  const symbolicTrig =
    /(?:theta|x)\b/.test(text) &&
    /cos|sin/.test(text) &&
    !parameters.theta &&
    !definitions.some((match) => match[1] === "z") &&
    (demoivre || euler || /بسط|تبسيط|وسع|خطية/.test(text));
  const request: ComplexRequest = {
    operation: "forms",
    values,
    points,
    form: requestedForm,
    measure,
  };
  if (symbolicTrig) {
    request.operation = "trig";
    request.variable = /theta\b/.test(text) ? "theta" : "x";
    const variable = request.variable;
    const multiple = text.match(
      new RegExp(`(cos|sin)\\(\\s*(\\d+)\\s*\\*?\\s*${variable}\\s*\\)`),
    );
    const trigPower = text.match(
      new RegExp(
        `(cos|sin)\\(\\s*${variable}\\s*\\)\\s*\\^\\s*\\(?(-?\\d+)\\)?`,
      ),
    );
    const outerPower = text.match(/\)\s*\^\s*\(?(-?\d+)\)?/);
    request.exponent = integer(
      multiple?.[2] ?? trigPower?.[2] ?? parameters.n ?? outerPower?.[1],
      "اختر رتبة صحيحة من 1 إلى 12 للتبسيط المثلثي.",
      12,
    );
    if (!request.exponent || request.exponent < 1)
      throw new ClarificationError(
        "حدّد القوة أو مضاعف الزاوية؛ مثلًا cos(3theta) أو sin(theta)^3.",
        [
          "بسط cos(3theta) وsin(3theta) بديموافر",
          "بسط cos(theta)^3 باستخدام أويلر",
        ],
      );
    request.trigKind = trigPower ? "power" : "multiple";
    request.trigFunction =
      text.includes("cos") && text.includes("sin")
        ? "both"
        : text.includes("cos")
          ? "cos"
          : "sin";
    const orders = [
      ...text.matchAll(
        new RegExp(
          `(?:cos|sin)\\(\\s*(\\d+)\\s*\\*?\\s*${variable}\\s*\\)|(?:cos|sin)\\(\\s*${variable}\\s*\\)\\s*\\^\\s*\\(?(-?\\d+)\\)?`,
          "g",
        ),
      ),
    ].map((m) => Number(m[1] ?? m[2]));
    if (new Set(orders).size > 1)
      throw new ClarificationError(
        "للتبسيط برتبتين مختلفتين، اكتب كل عبارة في طلب مستقل مفصول بـ «ثم».",
      );
    return request;
  }
  if (transform) {
    request.operation = transform;
    request.expression = given.includes("z") ? values.z : choose();
    const aroundOrigin = /مبدا|الاصل|مركزه\s*0/.test(text);
    if (
      aroundOrigin &&
      given.includes("omega") &&
      math.simplify(values.omega).toString() !== "0"
    )
      throw new ClarificationError(
        "ذُكر المبدأ ومركز غير صفري معًا؛ حدّد مركز التحويل المقصود.",
      );
    request.center = aroundOrigin ? "0" : values.omega;
    if (aroundOrigin) values.omega = "0";
    request.displacement = values.b;
    request.coefficient = parameters.k;
    request.angle =
      parameters.theta ??
      afterKeyword(text, /(?:بزاوية|بزاويه|زاويته|زاوية|زاويه)\s*/);
    request.angleUnit = /°|درجة|\bdeg\b/i.test(text)
      ? "DEG"
      : /غراد|جراد|\bgrad\b/i.test(text)
        ? "GRAD"
        : /راديان|\brad\b/i.test(text)
          ? "RAD"
          : undefined;
    if (!given.includes("z") && !current && /قانون|صيغة|اشرح/.test(text)) {
      request.operation = "theorem";
      request.theorem = transform;
      return request;
    }
    if (!request.expression)
      throw new ClarificationError("ما العدد الذي تريد تحويل صورته؟ اكتب z=…", [
        `طبق ${transform === "rotation" ? "دورانًا" : transform === "homothety" ? "تحاكيًا" : "انسحابًا"} على z=1+i ${transform === "rotation" ? "حول المبدأ بزاوية 90°" : transform === "homothety" ? "مركزه omega=0 ونسبته k=2" : "شعاعه b=2-i"}`,
      ]);
    if (transform === "translation" && !request.displacement)
      throw new ClarificationError("ما لاحقة شعاع الانسحاب؟ اكتب b=…", [
        `انسحاب z=${request.expression} بشعاع b=2-i`,
      ]);
    if (transform !== "translation" && !request.center)
      throw new ClarificationError(
        "ما لاحقة مركز التحويل؟ اكتب omega=… أو «حول المبدأ».",
        [`${original} حول المبدأ`],
      );
    if (transform === "homothety" && !request.coefficient)
      throw new ClarificationError("ما النسبة الحقيقية للتحاكي؟ اكتب k=…", [
        `${original} k=2`,
      ]);
    if (transform === "rotation" && !request.angle)
      throw new ClarificationError(
        "ما زاوية الدوران ووحدتها؟ اكتب theta=90° أو theta=pi/2.",
        [`${original} theta=90°`],
      );
    return request;
  }
  if (
    /اشرح|قانون|صيغة/.test(text) &&
    points.length < 2 &&
    /مسافة|زاوية|عمدة النسبة/.test(text)
  ) {
    request.operation = "theorem";
    request.theorem = /مسافة/.test(text) ? "distance" : "angle";
    return request;
  }
  if (/مسافة|طول القطعة|طول\s*[A-Z]{2}/.test(text) && points.length >= 2) {
    if (points.length > 2)
      throw new ClarificationError(
        "أي نقطتين تقصد؟ حدّد القطعة مثل AB أو AC بدل اختيار نقطتين من المجموعة دون إذنك.",
      );
    request.operation = "distance";
    return request;
  }
  if (
    /زاوية|عمدة النسبة|عمدة.*نسبة/.test(text) &&
    (points.length >= 2 || given.length >= 2)
  ) {
    request.operation = "angle";
    request.vertex = text.match(/(?:زاوية|زاويه)\s*([A-Z]{3})/)?.[1];
    const ratio = text.match(
      /\(\s*z_([A-Z])\s*-\s*z_([A-Z])\s*\)\s*\/\s*\(\s*z_([A-Z])\s*-\s*z_([A-Z])\s*\)/,
    );
    if (ratio && ratio[2] === ratio[4])
      request.vertex = ratio[3] + ratio[2] + ratio[1];

    request.unsigned = /غير موجه|غير الموجه/.test(text);
    if (
      points.length >= 3 &&
      !request.vertex &&
      !/AB\s*[,،]\s*AC|AB.*AC/.test(text)
    )
      throw new ClarificationError(
        "أي زاوية تريد؟ حدّد رأسها: BAC أو ABC أو ACB.",
        ["BAC", "ABC", "ACB"].map(
          (name) =>
            `احسب زاوية ${name} في المستوي العقدي ${points.map((point) => `z_${point.name}=${point.expression}`).join("، ")}`,
        ),
      );
    request.vertex ??= points.length >= 3 ? "BAC" : undefined;
    request.expression = points[0]?.expression ?? values[given[0]];
    request.second = points[1]?.expression ?? values[given[1]];
    return request;
  }
  if (
    /مسافة|طول القطعة|زاوية|عمدة النسبة/.test(text) &&
    !euler &&
    points.length < 2
  )
    throw new ClarificationError(
      "اكتب لاحقات النقطتين مثل z_A=1+2i وz_B=4+6i.",
      ["احسب المسافة بين z_A=1+2i وz_B=4+6i"],
    );
  let expression = choose();
  if (expression && parameters.n)
    expression = expression.replace(/\bn\b/g, `(${parameters.n})`);
  const requestedPower = integer(
    parameters.power ??
      (!roots ? parameters.n : undefined) ??
      afterKeyword(text, /(?:قوة|قوته|اس)\s+/),
    "اكتب أسًا صحيحًا لا تتجاوز قيمته المطلقة 10^12.",
  );
  let power = requestedPower;
  if (expression && !roots && !/حول|شكل|مرافق|مقلوب|طويلة/.test(text)) {
    let node = math.parse(expression);
    while (math.isParenthesisNode(node)) node = node.content;
    let base = math.isOperatorNode(node) ? node.args[0] : undefined;
    while (base && math.isParenthesisNode(base)) base = base.content;
    if (
      math.isOperatorNode(node) &&
      node.op === "^" &&
      !(base && math.isSymbolNode(base) && base.name === "e")
    ) {
      power = integer(
        node.args[1].toString(),
        "اكتب أسًا صحيحًا لا تتجاوز قيمته المطلقة 10^12.",
      );
      expression = node.args[0].toString();
    }
  }
  if (roots) {
    request.operation = "roots";
    request.rootN =
      integer(
        parameters.n ?? afterKeyword(text, /رتبة\s*/),
        "رتبة الجذر عدد صحيح موجب حتى 32.",
        32,
      ) ?? (/تربيعي/.test(text) ? 2 : /تكعيبي/.test(text) ? 3 : undefined);
    if (!request.rootN || request.rootN < 1)
      throw new ClarificationError("ما رتبة الجذور المطلوبة؟ اكتب n=3 مثلًا.", [
        "جد الجذور التكعيبية للعدد العقدي 1+i",
      ]);
  } else if (power !== undefined) {
    request.operation = "power";
    request.exponent = power;
  } else if (/مرافق/.test(text)) request.operation = "conjugate";
  else if (/مقلوب/.test(text)) request.operation = "inverse";
  else if (/تمثيل|مثله|(?:^|\s)مثل\s|ارسم|نقط|شعاع|متجه/.test(text))
    request.operation = "point";
  else if (
    /اجمع|جمع|مجموع|اطرح|طرح|اضرب|الضرب|جداء|اقسم|قسمة|العمليات/.test(text)
  ) {
    request.operation = "arithmetic";
    const mentioned = [...rest.matchAll(/\b(z(?:_[A-Z]|[1-9])?|[abcdw])\b/g)]
      .map((m) => m[1])
      .filter((key) => values[key]);
    const operands =
      [...new Set(mentioned)].length >= 2
        ? [...new Set(mentioned)]
        : given.filter((key) => !/^z_[A-Z]$/.test(key));
    request.expression = operands[0]
      ? values[operands[0]]
      : fragments[0]
        ? substitute(fragments[0], values)
        : current;
    request.second = operands[1]
      ? values[operands[1]]
      : fragments[1]
        ? substitute(fragments[1], values)
        : undefined;
    const ops: ComplexRequest["operator"][] = [];
    if (/اجمع|جمع|مجموع/.test(text)) ops.push("+");
    if (/اطرح|طرح/.test(text)) ops.push("-");
    if (/اضرب|الضرب|جداء/.test(text)) ops.push("*");
    if (/اقسم|قسمة/.test(text)) ops.push("/");
    request.operator = ops.length === 1 ? ops[0] : undefined;
    if (
      request.operator === "-" &&
      /اطرح\s*\b(?:z(?:_[A-Z]|[1-9])?|[abcdw])\b\s*من/.test(rest)
    )
      [request.expression, request.second] = [
        request.second,
        request.expression,
      ];
    if (!request.second) {
      const node = request.expression ? math.parse(request.expression) : null;
      if (
        node &&
        math.isOperatorNode(node) &&
        ["+", "-", "*", "/"].includes(node.op) &&
        node.args.length === 2
      ) {
        request.expression = node.args[0].toString();
        request.second = node.args[1].toString();
        request.operator = node.op as ComplexRequest["operator"];
      }
    }
    if (!request.expression || !request.second)
      throw new ClarificationError(
        "اكتب العددين المطلوبين مثل z1=3+2i وz2=1-i.",
        ["احسب العمليات الجبرية للعددين z1=3+2i وz2=1-i"],
      );
    return request;
  } else if (euler) request.operation = "euler";
  if (!expression && euler && parameters.theta) {
    expression = `exp(i*(${parameters.theta}))`;
  }
  if (!expression && power !== undefined)
    throw new ClarificationError(
      "اكتب العدد العقدي الذي تريد رفعه إلى هذه القوة، مثل z=1+i.",
    );
  if (!expression && euler && parameters.r)
    throw new ClarificationError(
      "ما قيمة الزاوية؟ اكتب theta=60° مثلًا لتطبيق أويلر على الطويلة المعطاة.",
    );
  if (!expression && (euler || demoivre)) {
    request.operation = "theorem";
    request.theorem = euler ? "euler" : "demoivre";
    return request;
  }
  if (!expression && points.length && !context.complex?.ambiguous) {
    expression = points[0].expression;
  }
  if (!expression && context.complex?.ambiguous)
    throw new ClarificationError(
      "للنتيجة السابقة عدة أعداد أو جذور؛ حدّد العدد الذي تريد متابعة العمل عليه بدل اختيار واحد دون إذنك.",
    );
  if (!expression)
    throw new ClarificationError(
      "ما العدد العقدي الذي تريد العمل عليه؟ اكتب z=3+4i مثلًا.",
      ["اكتب الأشكال الثلاثة للعدد العقدي z=3+4i"],
    );
  request.expression = expression;
  if (request.operation === "forms") {
    request.targetName =
      formNames.length === 1
        ? formNames[0]
        : given.includes("z")
          ? "z"
          : given.length === 1
            ? given[0]
            : undefined;
    if (requestedForm && formNames.length > 1) {
      request.formTargets = formNames.map((name) => {
        if (!values[name])
          throw new ClarificationError(
            `ما قيمة ${name}؟ عرّفه قبل تحويل الشكل.`,
          );
        return { name, expression: values[name] };
      });
    }
    if (/استنتج|استدل|اعتمادا/.test(text) && context.complex?.current) {
      const prior = context.complex;
      const source = Object.entries(prior.values).find(
        ([name, value]) =>
          name !== "z" &&
          name !== request.targetName &&
          value === prior.current,
      );
      // A freshly redefined alias must never label a stale previous value.
      const sourceName = source?.[0] ?? "z";
      if (!given.includes(sourceName))
        request.deriveFrom = {
          name: sourceName,
          expression: prior.current!,
        };
    }
  }
  request.usePoints = /نقط|نقاط|شعاع\s*[A-Z]{2}|\bz_[A-Z]\b/.test(text);
  request.angle = parameters.theta;
  if (euler) request.coefficient = parameters.r;
  if (euler && parameters.theta) {
    request.angleUnit = /°|درجة/.test(parameters.theta + text)
      ? "DEG"
      : /راديان|\brad\b/.test(text)
        ? "RAD"
        : undefined;
    request.expression = undefined;
  }
  return request;
}
