import type { AngleMode } from "../../types";
import { ClarificationError, type SolverContext } from "../types";
import {
  emptySpaceModel,
  isGeometryContext,
  type SpaceRequest,
  type SpaceVector,
  type SpaceModel,
  type SpaceOperation,
} from "../geometryTypes";
import { spaceNotation } from "../spaceNotation";
import { mathInstructionText, hasMathInstruction } from "../textbook";
import {
  read,
  vector,
  serial,
  sub,
  cross,
  zeroV,
  polynomial,
  affineParameter,
  planeFromEquation,
  sphereFromEquation,
  bounded,
} from "../../utils/spaceGeometryMath";

function tuple(
  text: string,
  start: number,
): { values: string[]; end: number } | undefined {
  while (/\s/.test(text[start] || "") && start < text.length) start++;
  const open = text[start],
    close = open === "(" ? ")" : open === "[" ? "]" : "";
  if (!close) return;
  let depth = 1,
    begin = start + 1;
  const values: string[] = [];
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (!depth) {
      values.push(text.slice(begin, i).trim());
      return { values, end: i + 1 };
    }
    if (depth === 1 && /[,،;؛]/.test(c)) {
      values.push(text.slice(begin, i).trim());
      begin = i + 1;
    }
  }
  throw new ClarificationError("أكمل الأقواس في الإحداثيات أو قائمة المعطيات.");
}
function v3(values: string[]): SpaceVector {
  if (values.length !== 3 || values.some((v) => !v))
    throw new ClarificationError(
      "كل نقطة أو شعاع في الفراغ له ثلاث مركبات؛ لا تفترض أن المركبة الناقصة صفر.",
    );
  return values.map((s) => bounded(read(s)).text()) as SpaceVector;
}
const clean = (s: string) => s.trim().replace(/[,،.\s]+$/g, "");
function numericPrefix(s: string): string {
  let depth = 0,
    i = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (!/[0-9A-Za-z+*/^().\s-]/.test(c)) break;
    if (c === "(") depth++;
    if (c === ")") {
      if (!depth) break;
      depth--;
    }
    if (/[\r\n]/.test(c) && depth === 0) break;
    if (/[A-Za-z]/.test(c) && !/[sqrtpieExyzts]/.test(c)) break;
  }
  return clean(s.slice(0, i));
}
function equationPrefix(s: string): string {
  let depth = 0,
    i = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (!/[0-9A-Za-z+*/^().=\s-]/.test(c)) break;
    if (c === "(") depth++;
    if (c === ")") {
      if (!depth) break;
      depth--;
    }
    if (/[\r\n]/.test(c) && !depth) break;
  }
  return clean(s.slice(0, i));
}
function assigned(text: string, labels: string): string | undefined {
  const patterns = [
    `(?<![A-Za-z_])(?:${labels})\\s*=\\s*`,
    `(?<![A-Za-z_])(?:${labels})\\s*(?:=|:|يساوي|هو)?\\s*`,
  ];
  for (const pattern of patterns)
    for (const m of text.matchAll(new RegExp(pattern, "g"))) {
      const value = numericPrefix(text.slice(m.index! + m[0].length));
      if (/^[+\-.0-9(]|^(?:sqrt|pi)\b/.test(value)) return value;
    }
  return undefined;
}
function list(text: string, labels: string): string[] | undefined {
  const m = new RegExp(`(?:${labels})\\s*(?:=|:)?\\s*`).exec(text);
  if (!m) return;
  return tuple(text, m.index + m[0].length)?.values;
}
const unique = (names: string[]) => [...new Set(names)];
function stripSpans(text: string, spans: { start: number; end: number }[]) {
  let out = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start))
    out = out.slice(0, span.start) + " " + out.slice(span.end);
  return out;
}
function selectNames(
  rest: string,
  map: Record<string, unknown>,
  fresh: string[],
  previous: string[] | undefined,
  pattern: RegExp,
  allowPrevious: boolean,
) {
  const names = unique([...rest.matchAll(pattern)].map((m) => m[1]));
  const named = names.filter((n) =>
    Object.prototype.hasOwnProperty.call(map, n),
  );
  return named.length
    ? named
    : fresh.length
      ? unique(fresh)
      : allowPrevious
        ? (previous || []).filter((n) =>
            Object.prototype.hasOwnProperty.call(map, n),
          )
        : [];
}
function verifyDuplicate<T>(
  map: Record<string, T>,
  fresh: string[],
  name: string,
  value: T,
) {
  if (
    fresh.includes(name) &&
    JSON.stringify(map[name]) !== JSON.stringify(value)
  )
    throw new ClarificationError(
      `ورد تعريفان مختلفان لـ ${name} في السؤال نفسه. حدّد القيمة المقصودة.`,
    );
  map[name] = value;
  fresh.push(name);
}
export function extractSpaceRequest(
  source: string,
  context: SolverContext,
  angleMode: AngleMode,
  definitionsOnly = false,
): SpaceRequest {
  const normalized = /كرة|مستوي|مستقيم/.test(source)
    ? source.replace(
        /(^|[^\p{L}])([سصع])(?=$|[^\p{L}])/gu,
        (_, before: string, v: string) =>
          before + ({ س: "x", ص: "y", ع: "z" } as Record<string, string>)[v],
      )
    : source;
  const text = spaceNotation(normalized),
    old = context.geometry;
  if (/\\(?:begin|end)\s*\{(?:cases|aligned|align\*?)\}/.test(text))
    throw new ClarificationError(
      "أكمل بداية التمثيل البارامتري ونهايته؛ لا نكمل تنسيقًا ناقصًا بالتخمين.",
    );
  const model: SpaceModel = {
    points: { ...old?.points },
    vectors: { ...old?.vectors },
    lines: { ...old?.lines },
    planes: { ...old?.planes },
  };
  const fresh = {
    points: [] as string[],
    vectors: [] as string[],
    lines: [] as string[],
    planes: [] as string[],
  };
  const spans: { start: number; end: number }[] = [];
  // Vector parametric form, retaining one shared parameter for all three coordinates.
  for (const m of text.matchAll(
    /\b([DLd][1-6]?)\s*:\s*\(\s*x\s*[,،;]\s*y\s*[,،;]\s*z\s*\)\s*=\s*/g,
  )) {
    const a = tuple(text, m.index! + m[0].length);
    if (!a) throw new ClarificationError("أكمل نقطة انطلاق المستقيم.");
    const tail = text.slice(a.end).match(/^\s*([+-])\s*([ts])\s*\*?\s*/);
    if (!tail)
      throw new ClarificationError(
        "اكتب المستقيم مثل D: (x,y,z)=(0,0,0)+t*(1,2,3).",
      );
    const b = tuple(text, a.end + tail[0].length);
    if (!b) throw new ClarificationError("أكمل شعاع اتجاه المستقيم.");
    const direction = v3(b.values);
    if (tail[1] === "-")
      direction.forEach((c, i) => (direction[i] = read(c).neg().text()));
    verifyDuplicate(model.lines, fresh.lines, m[1], {
      point: v3(a.values),
      direction,
    });
    spans.push({ start: m.index!, end: b.end });
  }
  // Coordinate systems x=a+ut, y=b+vt, z=c+wt (also after a LaTeX cases block).
  for (const m of text.matchAll(/\b([DLd][1-6]?)\s*:\s*(?=x\s*=)/g)) {
    if (spans.some((s) => m.index! >= s.start && m.index! < s.end)) continue;
    const start = m.index! + m[0].length;
    const next = text.slice(start).search(/\b[DLdPQR][1-6]?\s*:/);
    const block = text.slice(start, next < 0 ? text.length : start + next);
    const rows = [...block.matchAll(/\b([xyz])\s*=\s*([^,،;؛\n]+)/g)].slice(
      0,
      3,
    );
    if (rows.length !== 3 || new Set(rows.map((r) => r[1])).size !== 3)
      throw new ClarificationError(
        "المستقيم البارامتري يحتاج x وy وz مع وسيط واحد مشترك.",
      );
    const values = new Map(rows.map((r) => [r[1], numericPrefix(r[2])]));
    const polys = ["x", "y", "z"].map((k) => polynomial(values.get(k)!));
    const variables = new Set<string>();
    polys.forEach((p) =>
      p.forEach((_, key) => {
        if (key[3] !== "0") variables.add("t");
        if (key[4] !== "0") variables.add("s");
      }),
    );
    if (variables.size !== 1)
      throw new ClarificationError(
        "استعمل وسيطًا واحدًا مشتركًا للمركبات الثلاث، واتجاهًا غير معدوم.",
      );
    const parameter = [...variables][0],
      parts = ["x", "y", "z"].map((k) =>
        affineParameter(values.get(k)!, parameter),
      );
    verifyDuplicate(model.lines, fresh.lines, m[1], {
      point: parts.map((p) => bounded(p.constant).text()) as SpaceVector,
      direction: parts.map((p) => bounded(p.coefficient).text()) as SpaceVector,
    });
    const last = rows[2];
    spans.push({ start: m.index!, end: start + last.index! + last[0].length });
  }
  let rest = stripSpans(text, spans);
  // Points and vectors; names are case-sensitive, dimensionality is never filled in.
  const coordinateSpans: { start: number; end: number }[] = [];
  for (const m of rest.matchAll(
    /\b([A-Z]{2}|[A-Z][1-4]?|[uvwnabcr])\s*(?:=|:)?\s*(?=[(\[])/g,
  )) {
    const start = m.index! + m[0].length,
      t = tuple(rest, start);
    if (!t) continue;
    // P: (1/2)*x+...=0 is an equation with a parenthesized coefficient,
    // not a point P with a one-dimensional tuple.
    if (m[0].includes(":")) {
      const candidate = equationPrefix(rest.slice(start));
      if (candidate.includes("=") && /[xyz]/.test(candidate)) continue;
    }

    if (t.values.length !== 3) {
      if (t.values.length === 2) continue;
      throw new ClarificationError(
        "أدخل ثلاث إحداثيات لكل نقطة أو شعاع في الفراغ.",
      );
    }
    const value = v3(t.values),
      isVector = /^[a-z]$|^[A-Z]{2}$/.test(m[1]);
    verifyDuplicate(
      isVector ? model.vectors : model.points,
      isVector ? fresh.vectors : fresh.points,
      m[1],
      value,
    );
    coordinateSpans.push({ start: m.index!, end: t.end });
  }
  rest = stripSpans(rest, coordinateSpans);
  const planeSpans: { start: number; end: number }[] = [];
  for (const m of rest.matchAll(
    /\b(Pi[1-6]?|[PQR][1-6]?|alpha|beta)\s*:\s*/g,
  )) {
    const eq = equationPrefix(rest.slice(m.index! + m[0].length));
    if (!eq.includes("="))
      throw new ClarificationError("أكمل معادلة المستوي بعد اسمه.");
    const p = planeFromEquation(eq);
    verifyDuplicate(model.planes, fresh.planes, m[1], p);
    planeSpans.push({
      start: m.index!,
      end: m.index! + m[0].length + eq.length,
    });
  }
  rest = stripSpans(rest, planeSpans);
  let sphere: SpaceRequest["sphere"];
  // Anonymous equations retain their complete two sides, not sampled linear guesses.
  for (const m of rest.matchAll(/[A-Za-z0-9_+*/^().=\s-]+/g)) {
    const eq = clean(m[0]).replace(/^[:\s]+/, "");
    if (!eq.includes("=") || !/[xyz]/.test(eq)) continue;
    if (/\b[ts]\b|\d[ts]\b/.test(eq)) continue;
    if (/كرة/.test(text) && (/\^\s*\(?2/.test(eq) || /معادلة/.test(text))) {
      sphere = sphereFromEquation(eq);
      rest = rest.replace(m[0], " ");
    } else {
      const p = planeFromEquation(eq);
      const name = fresh.planes.length ? "Q" : "P";
      verifyDuplicate(model.planes, fresh.planes, name, p);
      rest = rest.replace(m[0], " ");
    }
  }
  const instruction = mathInstructionText(text),
    instructionAt = text.indexOf(instruction);
  const declarations =
    instructionAt > 0
      ? text.slice(0, instructionAt)
      : hasMathInstruction(text)
        ? ""
        : text;
  for (const m of declarations.matchAll(
    /\b([A-Z][1-4]?)\s+(?:هي\s+|هو\s+)?منتصف\s+(?:القطعة\s*)?[[(]?\s*([A-Z][1-4]?)\s*(?:و\s*)?([A-Z][1-4]?)(?:[)\]])?/g,
  )) {
    const [name, a, b] = m.slice(1);
    if (!model.points[a] || !model.points[b])
      throw new ClarificationError(
        `عرّف طرفي القطعة ${a}${b} قبل تعريف منتصفها.`,
      );
    verifyDuplicate(
      model.points,
      fresh.points,
      name,
      serial(
        vector(model.points[a]).map((v, i) =>
          v.add(read(model.points[b][i])).div(read("2")),
        ) as ReturnType<typeof vector>,
      ),
    );
  }
  if (definitionsOnly)
    return {
      operation: "plot",
      model,
      points: unique(fresh.points),
      vectors: unique(fresh.vectors),
      lines: unique(fresh.lines),
      planes: unique(fresh.planes),
      sphere,
    };
  rest = mathInstructionText(rest);
  const barycentric =
    /مركز (?:ال)?ابعاد|مركز (?:ال)?ثقل|مرجح|تلاقي.*متوسط|متوسط.*تلاقي/.test(
      rest,
    );
  const baryName = barycentric
    ? rest.match(
        /(?:مركز (?:ال)?ابعاد(?: المتناسبة)?|مركز (?:ال)?ثقل|مرجح(?: الجملة)?)\s+([A-Z][1-4]?)\b/,
      )?.[1]
    : undefined;
  // Requested AB/AC/AD vectors are built from the actual named points.
  for (const m of rest.matchAll(/\b([A-Z])([A-Z])\b/g))
    if (model.points[m[1]] && model.points[m[2]]) {
      const name = m[1] + m[2];
      model.vectors[name] = serial(
        sub(vector(model.points[m[2]]), vector(model.points[m[1]])),
      );
    }
  let outputName: string | undefined = baryName;
  const normOnly =
    /الطويلت|طويلتان|norms|normU|normV|(?:طويلة(?: الشعاع)?|طول)\s+[uv]\s*=/.test(
      text,
    );
  for (const m of rest.matchAll(/\b([A-Z]{2}|[A-Z][1-6]?|[uvwnabcr])\b/g)) {
    const name = m[1];
    if (
      Object.values(model).some((map) =>
        Object.prototype.hasOwnProperty.call(map, name),
      )
    )
      continue;
    if (normOnly && /^[uv]$/.test(name)) continue;
    if (
      name === "r" &&
      /كرة|اسطوان|مخروط/.test(text) &&
      /نصف قطر|\br\s*=/.test(text)
    )
      continue;
    if (name === baryName) {
      outputName = name;
      continue;
    }
    if (
      /^[abc]$/.test(name) &&
      !/شعاع|متجه|ارتباط|سلمي|نظير|معاكس|اجمع|اطرح/.test(rest)
    )
      continue;
    if (
      /^[PQR][1-6]?$/.test(name) &&
      /معادلة|اكتب.*مستوي/.test(rest) &&
      (fresh.points.length >= 3 ||
        (fresh.points.length >= 1 && fresh.vectors.length))
    ) {
      outputName = name;
      continue;
    }
    if (
      /^[DL][1-6]?$/.test(name) &&
      /مستقيم|بارامتري|تمثيل/.test(rest) &&
      (fresh.points.length >= 2 ||
        (fresh.points.length >= 1 && fresh.vectors.length))
    ) {
      outputName = name;
      continue;
    }
    if (name === "n" && fresh.planes.length && /ناظم/.test(rest)) continue;

    if (name === "R" && /(?:R\s*=|نصف قطر|نصف القطر|\bR\b\s*$)/.test(rest))
      continue;
    throw new ClarificationError(
      `ما معطيات ${name}؟ عرّفه بدل استعمال أول عنصر معطى أو نتيجة قديمة.`,
    );
  }
  if (
    /شعاع|متجه|طويلة|سلمي|ارتباط/.test(rest) &&
    /\b[a-z](?:_\{?\d+\}?|\d+)(?=$|[^A-Za-z0-9_])/.test(rest)
  )
    throw new ClarificationError(
      "اسم الشعاع ذي الفهرس غير معرّف هنا؛ استعمل الاسم اللاتيني المفرد المعطى أو عرّف مركباته، ولا نختار شعاعًا قديمًا بديلًا.",
    );
  const active = old?.active;
  const follow =
    !!old &&
    (old.operation === "plot" ||
      context.lastEngine === "geometryEngine" ||
      context.lastEngine === "geometryTools" ||
      /السابق|المعطاة|المعطى/.test(text));
  const hasNew =
    fresh.points.length +
      fresh.vectors.length +
      fresh.lines.length +
      fresh.planes.length >
      0 || !!sphere;
  let points = selectNames(
      rest,
      model.points,
      fresh.points,
      active?.points,
      /\b([A-Z][1-4]?)\b/g,
      follow && !hasNew,
    ),
    vectors = selectNames(
      rest,
      model.vectors,
      fresh.vectors,
      active?.vectors,
      /\b([uvwnabcr]|[A-Z]{2})\b/g,
      follow && !hasNew,
    ),
    lines = selectNames(
      rest,
      model.lines,
      fresh.lines,
      active?.lines,
      /\b([DLd][1-6]?)\b/g,
      follow && !hasNew,
    ),
    planes = selectNames(
      rest,
      model.planes,
      fresh.planes,
      active?.planes,
      /\b(Pi[1-6]?|[PQR][1-6]?|alpha|beta)\b/g,
      follow && !hasNew,
    );
  const namedSegments = [...rest.matchAll(/\b([A-Z])([A-Z])\b/g)].filter(
    (m) => model.points[m[1]] && model.points[m[2]],
  );
  if (
    namedSegments.length === 1 &&
    /شعاع|متجه|احداثيات|مركبات|طول|قطر|منصف|المسافة/.test(rest)
  )
    points = [namedSegments[0][1], namedSegments[0][2]];
  const request = (operation: SpaceOperation): SpaceRequest => {
    if (/معلم[^.\n]*غير\s*متعامد/.test(text) && operation !== "theory")
      throw new ClarificationError(
        "في المعلم غير المتعامد نحتاج جداءات أشعة الأساس أو مصفوفة غرام للصيغ المترية؛ لا أفترضها متعامدة.",
      );
    if (operation === "plot" && /اثبت|برهن|بين ان|تحقق/.test(rest))
      throw new ClarificationError(
        "هذا المطلوب يحتاج برهانًا أو تحققًا محددًا؛ عرض المعطيات وحده ليس حلًا له. حدّد العلاقة المراد فحصها.",
      );
    return { operation, outputName, model, points, vectors, lines, planes };
  };
  const withoutCoordinates = (operation: SpaceOperation) => {
    points = [];
    vectors = [];
    lines = [];
    planes = [];
    return request(operation);
  };
  // A named face in a point-plane height request is a definition, not three target points.
  const face = rest.match(/المستوي\s*\(?([A-Z]{3})\)?/);
  if (face) {
    const names = [...face[1]];
    if (names.some((n) => !model.points[n]))
      throw new ClarificationError("عرّف نقاط المستوي الثلاث جميعها.");
    const a = vector(model.points[names[0]]),
      n = cross(
        sub(vector(model.points[names[1]]), a),
        sub(vector(model.points[names[2]]), a),
      );
    if (zeroV(n))
      throw new ClarificationError(
        "نقاط القاعدة مستقيمة؛ لا تحدد مستويًا وحيدًا.",
      );
    const d = n.reduce((s, c, i) => s.add(c.mul(a[i])), read("0")).neg();
    model.planes.P = { normal: serial(n), offset: d.text() };
    planes = ["P"];
    points = points.filter((n) => !names.includes(n));
  }
  const solidName =
    /مكعب|متوازي (?:ال)?مستطيلات|اسطوان|مخروط|هرم|موشور/.test(text) ||
    (/كرة/.test(text) &&
      /حجم|مساحة|سطح/.test(rest) &&
      !/معادلة|قطرها.*[A-Z]{2}/.test(rest));
  if (/هرم/.test(rest)) {
    const area = assigned(
      text,
      "area(?![A-Za-z])|مساحة القاعدة|مساحة قاعدته|مساحة قاعدتها",
    );
    const height =
      assigned(text, "h(?![A-Za-z])|الارتفاع|ارتفاعه|ارتفاعها") ||
      (/ارتفاع.*(?:بعد|ارتفاع|مسافة).*السابق/.test(text)
        ? old?.lastScalarExpression
        : undefined);
    if (area) {
      if (!height)
        throw new ClarificationError(
          "أعط ارتفاع الهرم العمودي؛ مساحة القاعدة وحدها لا تكفي.",
        );
      return {
        ...withoutCoordinates("pyramid-volume"),
        pyramid: {
          area: bounded(read(area)).text(),
          height: bounded(read(height)).text(),
        },
      };
    }
    if (!/رباعي منتظم|قاعدة.*مربع|قاعدته.*مربع/.test(text))
      throw new ClarificationError(
        "ما مساحة قاعدة الهرم أو شكلها؟ لحساب الحجم أدخل مساحة القاعدة والارتفاع، ولا نفترض قاعدة مربعة.",
        [
          "احسب حجم هرم مساحة القاعدة area=6 والارتفاع h=3",
          "احسب حجم ومساحة هرم رباعي منتظم a=3 h=4",
        ],
      );
  }
  if (solidName && !/رباعي الوجوه|متوازي السطوح/.test(rest)) {
    const id: NonNullable<SpaceRequest["solid"]>["id"] = /مكعب/.test(text)
      ? "cube"
      : /متوازي (?:ال)?مستطيلات/.test(text)
        ? "cuboid"
        : /اسطوان/.test(text)
          ? "cylinder"
          : /مخروط/.test(text)
            ? "cone"
            : /هرم/.test(text)
              ? "pyramid"
              : /موشور/.test(text)
                ? "triangularPrism"
                : "sphere";
    const fields =
      id === "cube"
        ? ["a"]
        : id === "cuboid"
          ? ["a", "b", "c"]
          : id === "sphere"
            ? ["r"]
            : id === "pyramid"
              ? ["a", "h"]
              : id === "triangularPrism"
                ? ["area", "perimeter", "h"]
                : ["r", "h"];
    const labels: Record<string, string> = {
      a: "حرف(?:ه|ها)?|ضلع(?:ه|ها)?|طول(?:ه|ها)?",
      b: "عرض(?:ه|ها)?",
      c: "ارتفاع(?:ه|ها)?",
      r: "نصف قطر(?:ه|ها)?|نصف القطر",
      h: "ارتفاع(?:ه|ها)?|الارتفاع",
      area: "مساحة القاعدة",
      perimeter: "محيط القاعدة",
    };
    const dimensions: Record<string, string> = {};
    for (const k of fields) {
      const value =
        assigned(text, `${k}(?![A-Za-z])|${labels[k]}`) ??
        (follow && old?.solid?.id === id ? old.solid.dimensions[k] : undefined);
      if (!value)
        throw new ClarificationError(
          `أكمل ${k} للمجسم. لا يُفترض بُعد غير معطى.`,
        );
      dimensions[k] = bounded(read(value)).text();
    }
    return { ...withoutCoordinates("solid"), solid: { id, dimensions } };
  }
  if (
    /اشرح|قوانين|قواعد|دليل|ما هو|ماهي/.test(rest) &&
    !hasNew &&
    !/السابق|المعط/.test(rest)
  )
    return request("theory");
  if (
    /جملة|نظام/.test(rest) &&
    /مستقيم|تقاطع|وسيط/.test(rest) &&
    lines.length >= 2
  )
    return request("line-system");
  if (/مصفوف/.test(rest) && /حول|اكتب|مثل|جسر/.test(rest))
    return request("matrix");
  if (/كرة/.test(rest) || sphere) {
    if (sphere) return { ...request("sphere-equation"), sphere };
    if (/قطر/.test(rest) && points.length >= 2)
      return request("sphere-diameter");
    const centerName = text.match(
      /(?:مركزها|مركزه|مركز الكرة|المركز)\s*([A-Z][1-4]?)/,
    )?.[1];
    if (centerName) {
      if (!model.points[centerName])
        throw new ClarificationError("ما إحداثيات مركز الكرة؟");
      points = [centerName];
    }
    const radius = assigned(
      text,
      "r(?![A-Za-z])|R(?![A-Za-z])|نصف قطر(?:ها|ه)?|نصف القطر",
    );
    if (radius) {
      if (!/مركز/.test(text) && !(follow && old?.sphere && !hasNew))
        throw new ClarificationError(
          "حدّد مركز الكرة صراحةً؛ النقطة المعطاة لا تُفترض مركزًا لمجرد وجود نصف قطر.",
        );
      if (
        !centerName &&
        !fresh.points.length &&
        !(follow && old?.sphere && !hasNew)
      )
        throw new ClarificationError(
          "سمّ مركز الكرة أو أعط إحداثياته؛ لا أختار نقطة قديمة مركزًا تلقائيًا.",
        );
      if (
        !centerName &&
        points.length > 1 &&
        !(follow && old?.sphere && !hasNew)
      )
        throw new ClarificationError("أي نقطة هي مركز الكرة؟ سمّها صراحةً.");
      if (!points.length && follow && old?.sphere) {
        const name = "K";
        model.points[name] = old.sphere.center;
        points = [name];
      }
      if (!points.length)
        throw new ClarificationError(
          "أعط إحداثيات مركز الكرة، لا نصف القطر وحده.",
        );
      const r = bounded(read(radius));
      if (r.sign() < 0) throw new ClarificationError("نصف قطر الكرة غير سالب.");
      return {
        ...request("sphere"),
        radius: r.text(),
        sphere: {
          center: model.points[points[0]],
          radiusSquared: r.pow(2).text(),
        },
      };
    }
    if (follow && old?.sphere)
      return { ...request("sphere"), sphere: old.sphere };
    throw new ClarificationError(
      "اكتب مركز الكرة ونصف قطرها، أو طرفي قطر، أو معادلة الكرة كاملة.",
      [
        "جد معادلة الكرة مركزها K(1,2,3) ونصف قطرها r=2",
        "جد معادلة الكرة التي قطرها A(0,0,0) وB(2,0,0)",
      ],
    );
  }
  if (
    /مركز (?:ال)?ابعاد|مركز (?:ال)?ثقل|مرجح|باري|bary|اوزان|منتصف|تلاقي.*متوسط|مراكز الوجوه/.test(
      rest,
    )
  ) {
    const weighted: { name: string; weight: string }[] = [];
    for (const m of text.matchAll(/\(\s*[A-Z][1-4]?\s*[,،;؛]/g)) {
      const pair = tuple(text, m.index!);
      if (pair?.values.length === 2 && /^[A-Z][1-4]?$/.test(pair.values[0]))
        weighted.push({
          name: pair.values[0],
          weight: bounded(read(pair.values[1])).text(),
        });
    }
    if (weighted.length) {
      if (
        weighted.length < 2 ||
        weighted.length > 4 ||
        new Set(weighted.map((w) => w.name)).size !== weighted.length
      )
        throw new ClarificationError(
          "اكتب نقطتين إلى أربع نقاط مختلفة مع وزن واحد محدد لكل نقطة.",
        );
      for (const w of weighted)
        if (!model.points[w.name])
          throw new ClarificationError(
            `ما إحداثيات النقطة ${w.name} في الجملة المثقلة؟`,
          );
      points = weighted.map((w) => w.name);
    }
    const triangle = rest.match(/المثلث\s+([A-Z]{3})\b/);
    if (triangle && /متوسط|مركز (?:ال)?ثقل/.test(rest)) {
      const names = [...triangle[1]];
      if (new Set(names).size !== 3 || names.some((n) => !model.points[n]))
        throw new ClarificationError(
          "عرّف رؤوس المثلث الثلاثة المختلفة قبل طلب مركزه أو متوسطاته.",
        );
      points = names;
    }
    if (baryName) {
      if (weighted.some((w) => w.name === baryName))
        throw new ClarificationError(
          "اسم المركز المطلوب يطابق اسم إحدى نقاط الجملة؛ اختر اسمًا مختلفًا أو صغ تحققًا مستقلاً واضحًا.",
        );
      if (/^(?:اثبت|برهن|تحقق|بين ان)/.test(rest) && model.points[baryName])
        throw new ClarificationError(
          "للتحقق من مركز معطى، افصل الجملة المثقلة وإحداثيات النقطة المراد التحقق منها عن طلب الإنشاء؛ لا نستبدل النقطة المعطاة بمركز مفترض.",
        );
      points = points.filter((n) => n !== baryName);
      if (!points.length) points = fresh.points.filter((n) => n !== baryName);
    }
    const explicitPoints = [...rest.matchAll(/\b([A-Z][1-4]?)\b/g)].some(
      (m) => !!model.points[m[1]],
    );
    if (
      !fresh.points.length &&
      !explicitPoints &&
      old?.operation === "barycenter" &&
      old.inputs?.points.length
    )
      points = [...old.inputs.points];
    const weights =
      (weighted.length
        ? weighted.map((w) => w.weight)
        : list(text, "اوزان|weights|معاملات")) ??
      (/مركز (?:ال)?ثقل|متساوي|منتصف|متوسطات|مراكز الوجوه/.test(rest)
        ? points.map(() => "1")
        : follow && (!fresh.points.length || /الاوزان السابقة/.test(rest))
          ? old?.weights
          : undefined);
    if (!weights)
      throw new ClarificationError(
        "اكتب أوزان النقاط مثل الأوزان=[1,2,3]، أو حدّد أن المطلوب مركز الثقل بأوزان متساوية.",
      );
    return {
      ...request("barycenter"),
      weights: weights.map((s) => read(s).text()),
      showApplication: true,
    };
  }
  if (/حجم|رباعي الوجوه|متوازي السطوح/.test(rest))
    return request(
      /متوازي السطوح/.test(rest) ? "parallelepiped" : "tetrahedron",
    );
  if (/بعد|مسافة|ارتفاع|اسقاط|مسقط/.test(rest)) {
    if (planes.length) return request("distance-plane");
    if (lines.length) return request("distance-line");
    return request("distance");
  }
  if (/تقاطع|وضع|نسبية|متخالف|متوازي|متعامد|تعامد|توازي/.test(rest)) {
    if (lines.length && planes.length) return request("line-plane");
    if (planes.length >= 2) return request("planes");
    if (lines.length >= 2) return request("lines");
  }
  if (/استواء|مستوية|مستو(?:ي)? (?:واحد|1)|coplanar/.test(rest))
    return request("coplanar");
  if (/استقامة|مستقيم واحد|collinear/.test(rest)) return request("collinear");
  if (/ارتباط|مرتبط|استقلال|مستقلة?|مستقلين|اساس.*فراغ/.test(rest))
    return request("dependence");
  if (/سلمي|زاوية|تعامد/.test(rest)) {
    const norms = list(text, "طويلتان|الطويلتان|طويلتين|norms");
    const normU = assigned(text, "طويلة(?: الشعاع)? u|طول u|normU"),
      normV = assigned(text, "طويلة(?: الشعاع)? v|طول v|normV");
    if (norms || normU || normV) {
      const theta = assigned(text, "theta|زاوية(?:هما)?|الزاوية");
      if (!theta || (norms?.length !== 2 && (!normU || !normV)))
        throw new ClarificationError(
          "أدخل الطويلتين والزاوية ووحدتها؛ لا تفترض تعامدًا أو زاوية غير معطاة.",
        );
      const unit: AngleMode = /درجة|°|\bdeg\b/.test(text)
        ? "DEG"
        : /غراد|جراد|\bgrad\b/.test(text)
          ? "GRAD"
          : /راديان|\brad\b|\bpi\b/.test(text)
            ? "RAD"
            : angleMode;
      return {
        ...withoutCoordinates("geometric-dot"),
        geometricDot: {
          norms: (norms || [normU!, normV!]) as [string, string],
          angle: theta,
          unit,
        },
      };
    }
    return request("dot");
  }
  if (/منصف|محوري/.test(rest) && /مستوي/.test(rest)) return request("bisector");
  if (/ناظم/.test(rest) && planes.length && !/معادلة|اكتب.*مستوي/.test(rest))
    return request("normal");
  if (
    /مستقيم/.test(rest) &&
    /عمودي/.test(rest) &&
    planes.length &&
    points.length
  ) {
    model.vectors.n = model.planes[planes[0]].normal;
    vectors = ["n"];
    return request("line");
  }
  if (
    /مستوي/.test(rest) &&
    /عمودي/.test(rest) &&
    lines.length &&
    points.length
  ) {
    model.vectors.n = model.lines[lines[0]].direction;
    vectors = ["n"];
    return request("plane");
  }
  if (/مستوي/.test(rest) || (/ناظم/.test(rest) && points.length)) {
    const construction =
      points.length > 0 &&
      /معادلة|اكتب|جد|عين|اوجد/.test(rest) &&
      /مار|يمر|من النقطة|من النقط|من النقاط/.test(rest);
    if (construction && (!fresh.planes.length || /مواز/.test(rest))) {
      const explicitVector = [...rest.matchAll(/\b([uvwn]|[A-Z]{2})\b/g)].some(
        (m) => !!model.vectors[m[1]],
      );
      if (/مواز/.test(rest) && planes.length) {
        model.vectors.n = model.planes[planes[0]].normal;
        vectors = ["n"];
        outputName = outputName || "Q";
      } else {
        const desired = rest.match(/(?:ال|لل)?مستوي\s+([PQR][1-6]?)\b/)?.[1];
        outputName = outputName || desired;
        if (points.length >= 3 && !fresh.vectors.length && !explicitVector)
          vectors = [];
      }
      planes = [];
    }
    return request("plane");
  }
  if (/مستقيم|بارامتر|بارامتري|وسيطي|وسيط/.test(rest)) {
    if (lines.length >= 2) return request("lines");
    if (lines.length && planes.length) return request("line-plane");
    const explicitPoint = [...rest.matchAll(/\b([A-Z][1-4]?)\b/g)].some(
        (m) => !!model.points[m[1]],
      ),
      explicitVector = [...rest.matchAll(/\b([uvwn]|[A-Z]{2})\b/g)].some(
        (m) => !!model.vectors[m[1]],
      );
    if (
      lines.length &&
      !fresh.points.length &&
      !fresh.vectors.length &&
      !explicitPoint &&
      !explicitVector
    ) {
      points = [];
      vectors = [];
      return request("line");
    }
    if (!fresh.lines.length) {
      lines = [];
      outputName =
        outputName || rest.match(/(?:ال|لل)?مستقيم\s+([DLd][1-6]?)\b/)?.[1];
    }
    return request("line");
  }
  const algebra = rest
    .replace(/^(?:احسب|جد|اوجد|عين|اكتب|بسط)\s+/, "")
    .replace(/^(?:احداثيات|مركبات)\s+(?:الشعاع\s+)?/, "")
    .replace(/[؟?]$/, "")
    .trim();
  const binary = algebra.match(
    /^([uvwnabcr]|[A-Z]{2})\s*([+-])\s*([uvwnabcr]|[A-Z]{2})$/,
  );
  if (binary) {
    vectors = [binary[1], binary[3]];
    return {
      ...request("vector-arithmetic"),
      arithmetic: binary[2] === "+" ? "add" : "subtract",
    };
  }
  const scaled = algebra.match(
    /^([0-9+*/^().\s-]+)\s*\*?\s*([uvwnabcr]|[A-Z]{2})$/,
  );
  if (scaled) {
    vectors = [scaled[2]];
    return {
      ...request("vector-arithmetic"),
      arithmetic: "scale",
      coefficient: bounded(read(scaled[1].trim().replace(/\*$/, ""))).text(),
    };
  }
  if (/طول القطعة|طول\s+[A-Z]{2}/.test(rest) && points.length >= 2)
    return request("distance");
  if (
    /طويلة|طول الشعاع|معيار|norm/.test(rest) &&
    (/([uvwnabcr]|[A-Z]{2})\s*[+-]\s*([uvwnabcr]|[A-Z]{2})/.test(rest) ||
      /(?:\d|\))\s*\*?\s*([uvwnabcr]|[A-Z]{2})\b|([uvwnabcr]|[A-Z]{2})\s*\^/.test(
        rest,
      ))
  )
    throw new ClarificationError(
      "احسب الشعاع المركب أولًا ثم اطلب طويلة النتيجة؛ لا نعرض طويلة أول شعاع بدل طويلة التعبير المركب.",
    );
  if (
    /طويلة|طول الشعاع|معيار|norm/.test(rest) &&
    vectors.length &&
    !/طويلتان|الطويلتان|norms/.test(rest)
  )
    return request("norm");
  if (/شعاعي/.test(rest) && /جداء/.test(rest) && vectors.length >= 2)
    return { ...request("vector-arithmetic"), arithmetic: "cross" };
  if (
    /نظير|معاكس|عكس|جمع|مجموع|اجمع|فرق|اطرح|ضرب.*عدد|تضريب/.test(rest) &&
    vectors.length
  ) {
    const arithmetic = /نظير|معاكس|عكس/.test(rest)
      ? "opposite"
      : /فرق|اطرح/.test(rest)
        ? "subtract"
        : /ضرب.*عدد|تضريب/.test(rest)
          ? "scale"
          : "add";
    const coefficient =
      arithmetic === "scale" ? assigned(text, "k|المعامل|العدد") : undefined;
    if (arithmetic === "scale" && !coefficient)
      throw new ClarificationError("ما العدد الذي تريد ضرب الشعاع به؟");
    if (
      arithmetic === "subtract" &&
      /اطرح\s+(?:الشعاع\s*)?[uvwn]\s+من/.test(rest)
    )
      vectors = [...vectors].reverse();
    return { ...request("vector-arithmetic"), arithmetic, coefficient };
  }
  if (/شعاع|شعاعي|اشعة|متجه|احداثيات/.test(rest) && points.length >= 2)
    return request("vector");
  if (
    /ارسم|مثل|تمثيل|المعطيات|المجسم/.test(rest) ||
    (hasNew && !/احسب|جد|اكتب|اثبت|برهن|استنتج/.test(rest))
  )
    return request("plot");
  if (follow && /السابق|التفصيل|المسقط|الارتفاع/.test(rest)) {
    return {
      ...request(old.operation),
      weights: old.weights,
      sphere: old.sphere,
      solid: old.solid,
      geometricDot: old.geometricDot,
    };
  }
  throw new ClarificationError(
    "حدّد المطلوب الهندسي: شعاع، بعد، ارتباط، مركز أبعاد، مستوٍ، مستقيم أو كرة.",
    [
      "جد الشعاع AB حيث A(1,2,3) وB(4,6,3)",
      "جد بعد M(1,2,3) عن المستوي P: 2x-y+2z-5=0",
      "هل النقاط A(0,0,0) وB(1,0,0) وC(0,1,0) وD(1,1,0) مستوية؟",
    ],
  );
}
export const emptyGeometryInput = () => ({
  operation: "plot" as const,
  model: emptySpaceModel(),
  points: [],
  vectors: [],
  lines: [],
  planes: [],
});

/** Persist only typed declarations, without solving a question or harvesting its conclusion. */
export function prepareSpaceContext(
  source: string,
  context: SolverContext,
): SolverContext {
  const text = source
    .replace(/\b[A-Z]\s*=\s*\[\s*\[[\s\S]*?\]\s*\]/g, " ")
    .replace(/\b[A-Z]\s*=\s*\([^()]*[,،][^()]*[;؛][^()]*\)/g, " ");
  if (
    /عقدي|احتمال|صندوق|كيس|سحب|كرات|كرت/.test(text) ||
    /\bP\s*\(\s*[A-Z]/.test(text) ||
    /(?:^|\s)(?:القيم|التكرارات|البيانات)\s*[:=]/.test(text)
  )
    return context;
  const triples = [
    ...text.matchAll(/\b(?:[A-Z][1-4]?|[uvwnabcr])\s*(?:=|:)?\s*(?=[(\[])/g),
  ].some((m) => {
    try {
      return tuple(text, m.index! + m[0].length)?.values.length === 3;
    } catch {
      return false;
    }
  });
  if (!triples && !/\b(?:[DLdPQR][1-6]?|Pi[1-6]?|alpha|beta)\s*:/.test(text))
    return context;
  const r = extractSpaceRequest(text, context, "DEG", true);
  if (
    !r.points.length &&
    !r.vectors.length &&
    !r.lines.length &&
    !r.planes.length &&
    !r.sphere
  )
    return context;
  const model = r.model;
  for (const [key, max] of [
    ["points", 16],
    ["vectors", 12],
    ["lines", 6],
    ["planes", 6],
  ] as const) {
    const names = [
      ...new Set([...r[key], ...Object.keys(model[key]).reverse()]),
    ].slice(0, max);
    for (const name of Object.keys(model[key]))
      if (!names.includes(name)) delete model[key][name];
  }
  const active = {
    points: r.points,
    vectors: r.vectors,
    lines: r.lines,
    planes: r.planes,
  };
  const geometry = {
    ...model,
    operation: "plot" as const,
    active,
    inputs: active,
    sphere: r.sphere,
  };
  if (!isGeometryContext(geometry))
    throw new ClarificationError(
      "تجاوزت المعطيات الهندسية حدود عدد الأسماء أو طول الإحداثيات المحفوظة.",
    );
  return { ...context, geometry };
}
