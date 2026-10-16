import { useId, useMemo, useRef, useState } from "react";
import { ArrowUp, FlaskConical } from "lucide-react";
import { Tex, RichText } from "../common/Tex";
import type { MatrixCells, MatrixContext } from "../../solver/matrixTypes";
import { normalizePrompt } from "../../solver/parser";
import { readMatrix, matrixLatex } from "../../utils/matrixExact";
const T = String.raw;
const categories = [
  ["types", "أنواع المصفوفات"],
  ["algebra", "العمليات الجبرية"],
  ["determinants", "المحدد والمعكوس"],
  ["systems", "الجمل الخطية"],
  ["bridges", "الربط بالأقسام"],
] as const;
type Category = (typeof categories)[number][0];
const operations = {
  types: [
    ["types", "نوع المصفوفة وقياسها"],
    ["transpose", "منقول المصفوفة"],
  ],
  algebra: [
    ["add", "جمع مصفوفتين"],
    ["subtract", "طرح مصفوفتين"],
    ["scale", "الضرب بعدد حقيقي"],
    ["product", "جداء مصفوفتين — بالترتيب"],
    ["compare", "فحص تبديل ترتيب الجداء"],
    ["trace", "أثر المصفوفة"],
    ["power", "قوة صحيحة للمصفوفة"],
  ],
  determinants: [
    ["determinant", "محدد المصفوفة"],
    ["inverse", "معكوس المصفوفة"],
    ["adjugate", "المصفوفة الملحقة"],
    ["echelon", "طريقة غاوس — المصفوفة المدرجة"],
    ["rref", "غاوس–جوردان — المدرجة المختزلة"],
    ["rank", "الرتبة الجبرية"],
    ["eigen", "القيم الذاتية — تقريب إضافي"],
  ],
  systems: [
    ["gauss", "حل الجملة بطريقة غاوس"],
    ["cramer", "حل الجملة بطريقة كرامر"],
  ],
  bridges: [
    ["vectors", "أسطر المصفوفة إلى أشعة الفراغ"],
    ["statistics", "كل العناصر إلى بيانات إحصائية"],
  ],
} satisfies Record<Category, string[][]>;
const defaults: Record<string, MatrixCells> = {
  A: [
    ["1", "2"],
    ["3", "4"],
  ],
  B: [
    ["1", "0"],
    ["0", "1"],
  ],
};
const literal = (a: MatrixCells) =>
  `[${a.map((r) => `[${r.join(",")}]`).join(",")}]`;
const rule: Record<string, string> = {
  types:
    "قد تنتمي المصفوفة إلى أكثر من نوع: مصفوفة الوحدة قطرية ومثلثية عليا وسفلى أيضًا.",
  transpose:
    "يتبدّل العنصر في السطر i والعمود j إلى السطر j والعمود i؛ يتبادل عدد الأسطر والأعمدة.",
  add: "يشترط نفس عدد الأسطر ونفس عدد الأعمدة، ثم نجمع العناصر المتناظرة.",
  subtract:
    "يشترط نفس القياس تمامًا، ثم نطرح العناصر المتناظرة مع حفظ ترتيب المصفوفتين.",
  scale:
    "العدد الحقيقي يضرب جميع العناصر دون استثناء. تقبل الخانات الكسور مثل 1/3 والجذور مثل √2.",
  product:
    "عدد أعمدة الأولى يساوي عدد أسطر الثانية. الجداء سطر بعمود، وليس عنصرًا بعنصر، ولا يكون تبديليًا عمومًا.",
  compare:
    "نحسب الجداءين للمصفوفتين المعطاتين ونقارن العناصر. قد يتساويان في مثال خاص؛ لا نفرض عدم التبديل دائمًا.",
  trace:
    "أثر المصفوفة هو مجموع عناصر القطر الرئيسي، ويخص المصفوفات المربعة فقط.",
  determinant:
    "المحدد للمصفوفات المربعة فقط. في 2×2: جداء القطر الرئيسي ناقص جداء القطر الثانوي. ساروس تخص 3×3 فقط.",
  inverse:
    "يوجد المعكوس إذا وفقط إذا كان المحدد غير معدوم. الملحقة هي منقول مصفوفة العوامل المرافقة.",
  adjugate:
    "نحسب عوامل المرافقة بإشاراتها ثم ننقل مصفوفتها. الملحقة موجودة حتى عندما لا يوجد معكوس.",
  echelon:
    "نستعمل مبادلة سطرين، أو ضرب سطر بعدد غير معدوم، أو جمع مضاعف سطر إلى آخر؛ تظهر العمليات الفعلية بعد طلب الحل.",
  rref: "نُصفّر تحت المحاور وفوقها ونجعل كل محور واحدًا، دون اعتبار قيمة صغيرة مساوية للصفر.",
  rank: "الرتبة الجبرية عدد المحاور، أما القياس فهو عدد الأسطر × عدد الأعمدة؛ هذان مفهومان مختلفان.",
  power:
    "أس صحيح من −1 إلى12. الأس −1 للمعكوس بشرط وجوده، والأس صفر يعطي مصفوفة الوحدة من القياس نفسه.",
  eigen:
    "هذه أداة عددية تقريبية إضافية، لا نتيجة مدرسية دقيقة أو ادعاء بتغطية الكتاب الرسمي.",
  gauss:
    "أدخل معاملات المجاهيل والطرف الأيمن؛ نبني المصفوفة الموسعة ونسجل العمليات السطرية ونفحص الحل بالتعويض.",
  cramer:
    "نحسب المحدد العام ثم نستبدل عمود كل مجهول بالطرف الأيمن. إذا كان المحدد صفرًا نميز حالة الجملة بغاوس ولا نقسم عليه.",
  vectors:
    "تحتاج ثلاثة أعمدة للإحداثيات. تُنقل الكسور والجذور كما هي، ويمكن متابعة الطول والجداء والارتباط في المحادثة أو لوحة الهندسة.",
  statistics:
    "كل عنصر مشاهدة في البيانات مع حفظ تكرار ظهوره؛ لا نفترض أن العمود الثاني تكرارات أو أوزانًا.",
};
const reference = [
  ["المربعة", "يتساوى عدد الأسطر والأعمدة.", "m=n"],
  [
    "الواحدية — مصفوفة الوحدة",
    "مربعة: عناصر القطر الرئيسي 1، والباقي أصفار.",
    T`I_n=(\delta_{ij})`,
  ],
  ["الصفرية", "جميع العناصر أصفار، وقد تكون مستطيلة.", "a_{ij}=0"],
  [
    "المثلثية العليا",
    "جميع العناصر تحت القطر الرئيسي أصفار.",
    "i>j\\implies a_{ij}=0",
  ],
  [
    "المثلثية السفلى",
    "جميع العناصر فوق القطر الرئيسي أصفار.",
    "i<j\\implies a_{ij}=0",
  ],
  [
    "منقول المصفوفة — المبدلة",
    "المنقول عملية، وليس نوعًا مستقلًا؛ نستبدل الأسطر بالأعمدة.",
    "(A^T)_{ij}=A_{ji}",
  ],
];
export default function MatrixBoard({
  context,
  onInsert,
  onSolve,
  busy = false,
}: {
  context?: MatrixContext;
  onInsert: (question: string) => void;
  onSolve: (question: string) => void;
  busy?: boolean;
}) {
  const id = useId(),
    refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | null>(null),
    [operation, setOperation] = useState("types");
  const [values, setValues] = useState<Record<string, MatrixCells>>(() => ({
    ...defaults,
    ...context?.values,
  }));
  const [name, setName] = useState(context?.active || "A"),
    [second, setSecond] = useState(context?.active === "B" ? "A" : "B");
  const [k, setK] = useState(context?.scalarFactor || "2"),
    [exponent, setExponent] = useState("2"),
    [order, setOrder] = useState("AB");
  const [method, setMethod] = useState("automatic"),
    [axis, setAxis] = useState("row"),
    [index, setIndex] = useState("1");
  const [system, setSystem] = useState<MatrixCells>(
    context?.system?.coefficients || [
      ["1", "1"],
      ["1", "-1"],
    ],
  );
  const [variables, setVariables] = useState(
    context?.system?.variables || ["x", "y"],
  );
  const [constants, setConstants] = useState(
      context?.system?.constants || ["3", "1"],
    ),
    [exampleIndex, setExampleIndex] = useState(0);
  const paired = ["add", "subtract", "product", "compare"].includes(operation);
  const choose = (c: Category) => {
    setCategory((old) => (old === c ? null : c));
    setOperation(operations[c][0][0]);
  };
  const update = (n: string, row: number, col: number, value: string) =>
    setValues((all) => ({
      ...all,
      [n]: all[n].map((r, i) =>
        i !== row ? r : r.map((c, j) => (j === col ? value : c)),
      ),
    }));
  const resize = (n: string, rows: number, columns: number) =>
    setValues((all) => ({
      ...all,
      [n]: Array.from({ length: rows }, (_, i) =>
        Array.from({ length: columns }, (_, j) => all[n]?.[i]?.[j] ?? "0"),
      ),
    }));
  const select = (n: string, setter: (n: string) => void, label: string) => (
    <label className="matrix-field">
      <span>{label}</span>
      <select
        value={n}
        aria-label={label}
        onChange={(e) => setter(e.target.value)}
      >
        {Object.keys(values).map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
  const grid = (n: string) => (
    <fieldset className="matrix-card" key={n}>
      <legend>
        المصفوفة <Tex math={n} />
      </legend>
      <div className="matrix-dimensions">
        {(["rows", "columns"] as const).map((dimension) => (
          <label className="matrix-field" key={dimension}>
            <span>{dimension === "rows" ? "الأسطر" : "الأعمدة"}</span>
            <select
              aria-label={`${dimension === "rows" ? "عدد أسطر" : "عدد أعمدة"} ${n}`}
              value={
                dimension === "rows" ? values[n].length : values[n][0].length
              }
              onChange={(e) =>
                resize(
                  n,
                  dimension === "rows"
                    ? Number(e.target.value)
                    : values[n].length,
                  dimension === "columns"
                    ? Number(e.target.value)
                    : values[n][0].length,
                )
              }
            >
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="matrix-grid-scroll">
        <div
          className="matrix-input-grid"
          dir="ltr"
          style={{
            gridTemplateColumns: `repeat(${values[n][0].length}, minmax(48px,1fr))`,
          }}
        >
          {values[n].flatMap((r, i) =>
            r.map((c, j) => (
              <input
                key={`${i}-${j}`}
                dir="ltr"
                value={c}
                maxLength={100}
                aria-label={`المصفوفة ${n}، السطر ${i + 1}، العمود ${j + 1}`}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => update(n, i, j, e.target.value)}
              />
            )),
          )}
        </div>
      </div>
      <details
        className="matrix-preview"
        onToggle={(e) => {
          const open = e.currentTarget.open;
          setPreviews((all) =>
            open ? [...new Set([...all, n])] : all.filter((v) => v !== n),
          );
        }}
      >
        <summary>عرض المصفوفة بخط رياضي</summary>
        {previews.includes(n) && <MatrixPreview cells={values[n]} name={n} />}
      </details>
    </fieldset>
  );
  const prepared = useMemo(() => {
    if (!category) return { question: "", error: "" };
    try {
      if (category === "systems") {
        const n = system.length;
        const a = system.map((r) => r.map(normalizePrompt));
        readMatrix(a);
        if (operation === "cramer" && system.length !== variables.length)
          throw Error(
            "كرامر يحتاج عدد المعادلات مساويًا لعدد المجاهيل؛ اختر غاوس لهذه الجملة غير المربعة.",
          );
        const b = constants.slice(0, n).map((s) => {
          readMatrix([[normalizePrompt(s)]]);
          return normalizePrompt(s);
        });
        return {
          question:
            `حل الجملة بطريقة ${operation === "cramer" ? "كرامر" : "غاوس"}:\n` +
            a
              .map(
                (r, i) =>
                  `${r.map((v, j) => `(${v})*${variables[j]}`).join("+")}=${b[i]}`,
              )
              .join("\n"),
          error: "",
        };
      }
      const a = readMatrix(values[name].map((r) => r.map(normalizePrompt))),
        b = paired
          ? readMatrix(values[second].map((r) => r.map(normalizePrompt)))
          : undefined;
      if (paired && name === second)
        throw Error(
          "اختر اسمين مختلفين للمصفوفتين؛ يمكن تساوي قيمهما دون تكرار تعريف الاسم.",
        );
      if (
        ["add", "subtract"].includes(operation) &&
        (a.length !== b!.length || a[0].length !== b![0].length)
      )
        throw Error("الجمع والطرح يحتاجان تطابق عدد الأسطر والأعمدة معًا.");
      const first = order === "BA" ? b : a,
        next = order === "BA" ? a : b;
      if (operation === "product" && first![0].length !== next!.length)
        throw Error("لإتمام الجداء، عدد أعمدة الأولى يساوي عدد أسطر الثانية.");
      if (
        operation === "compare" &&
        (a[0].length !== b!.length || b![0].length !== a.length)
      )
        throw Error("لفحص الجداءين يجب أن يكون كل من AB وBA معرفًا.");
      if (
        [
          "trace",
          "determinant",
          "inverse",
          "adjugate",
          "power",
          "eigen",
        ].includes(operation) &&
        a.length !== a[0].length
      )
        throw Error(
          "هذه العملية لمصفوفة مربعة فقط؛ اختر عدد أسطر يساوي عدد الأعمدة.",
        );
      if (operation === "determinant" && method === "sarrus" && a.length !== 3)
        throw Error("طريقة ساروس تخص مقاس 3×3 فقط.");
      if (operation === "scale") readMatrix([[normalizePrompt(k)]]);
      if (
        operation === "power" &&
        (!/^-?\d+$/.test(exponent) ||
          Number(exponent) < -1 ||
          Number(exponent) > 12)
      )
        throw Error("الأس صحيح من −1 إلى12.");
      if (operation === "vectors" && a[0].length !== 3)
        throw Error("الجسر الهندسي يحتاج ثلاثة أعمدة للإحداثيات.");
      let demand = {
        types: `صنف المصفوفة ${name}`,
        transpose: `جد منقول المصفوفة ${name}`,
        add: `احسب ${name}+${second}`,
        subtract: `احسب ${name}-${second}`,
        product: `احسب ${order === "BA" ? second + "*" + name : name + "*" + second}`,
        compare: `تحقق هل ${name}*${second}=${second}*${name}`,
        scale: `احسب (${normalizePrompt(k)})*${name}`,
        power: `احسب ${name}^(${exponent})`,
        trace: `احسب أثر المصفوفة ${name}`,
        determinant: `احسب محدد المصفوفة ${name}`,
        inverse: `جد معكوس المصفوفة ${name}`,
        adjugate: `احسب المصفوفة الملحقة للمصفوفة ${name}`,
        echelon: `طبق طريقة غاوس على المصفوفة ${name}`,
        rref: `جد المصفوفة المدرجة المختزلة بغاوس جوردان للمصفوفة ${name}`,
        rank: `جد الرتبة الجبرية للمصفوفة ${name}`,
        eigen: `احسب القيم الذاتية للمصفوفة ${name}`,
        vectors: `حول أسطر المصفوفة ${name} إلى أشعة`,
        statistics: `حول كل عناصر المصفوفة ${name} إلى بيانات إحصائية`,
      }[operation];
      if (!demand) throw Error("اختر عملية المصفوفات أولًا.");
      if (operation === "determinant") {
        if (method === "sarrus") demand += " بطريقة ساروس";
        if (method === "expansion") {
          if (!/^[1-6]$/.test(index) || Number(index) > a.length)
            throw Error("رقم سطر أو عمود النشر ضمن قياس المصفوفة.");
          demand += ` بالنشر حسب ${axis === "row" ? "السطر" : "العمود"} ${index}`;
        }
      }
      return {
        question: `لتكن المصفوفة ${name}=${literal(values[name])}${paired ? ` و${second}=${literal(values[second])}` : ""}${operation === "scale" ? ` وk=${k}` : ""}، ${demand}`,
        error: "",
      };
    } catch (e) {
      return {
        question: "",
        error: e instanceof Error ? e.message : "أكمل المعطيات.",
      };
    }
  }, [
    category,
    operation,
    values,
    name,
    second,
    k,
    exponent,
    order,
    method,
    axis,
    index,
    system,
    constants,
    variables,
    paired,
  ]);
  function example() {
    const odd = exampleIndex % 2 === 1;
    setExampleIndex((i) => i + 1);
    setName("A");
    setSecond("B");
    setMethod("automatic");
    setIndex("1");
    if (category === "systems") {
      setSystem(
        odd
          ? [
              ["1", "1", "1"],
              ["1", "-1", "0"],
              ["0", "1", "-1"],
            ]
          : [
              ["1", "1"],
              ["1", "-1"],
            ],
      );
      setConstants(odd ? ["6", "-1", "-1"] : ["3", "1"]);
      setVariables(odd ? ["x", "y", "z"] : ["x", "y"]);
      return;
    }
    let a = odd
      ? [
          ["2", "0"],
          ["1", "3"],
        ]
      : defaults.A;
    let b = odd
      ? [
          ["1", "2"],
          ["0", "1"],
        ]
      : defaults.B;
    if (operation === "product" && !odd) {
      a = [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ];
      b = [
        ["1", "2"],
        ["3", "4"],
        ["5", "6"],
      ];
    }
    if (operation === "determinant")
      a = odd
        ? [
            ["2", "1", "0"],
            ["0", "3", "1"],
            ["1", "0", "2"],
          ]
        : [
            ["1", "2", "3"],
            ["0", "4", "5"],
            ["1", "0", "6"],
          ];
    if (operation === "types")
      a = odd
        ? [
            ["1", "2"],
            ["0", "3"],
          ]
        : defaults.B;
    if (operation === "vectors")
      a = odd
        ? [
            ["1", "0", "0"],
            ["2", "0", "0"],
          ]
        : [
            ["1", "0", "0"],
            ["0", "1", "0"],
          ];
    setValues((v) => ({ ...v, A: a, B: b }));
    setK(odd ? "1/2" : "2");
  }
  return (
    <div className="matrix-board" data-testid="matrix-board">
      <p className="matrix-intro">
        اختر خانة لفتح أدواتها. لا تُعرض نتيجة عند فتح القسم أو تغيير المثال؛
        الحل بعد الضغط على «حل في المحادثة» فقط.
      </p>
      <div
        className="matrix-categories"
        role="tablist"
        aria-label="أدوات المصفوفات"
      >
        {categories.map(([c, title], i) => (
          <button
            type="button"
            role="tab"
            id={`${id}-${c}`}
            key={c}
            ref={(e) => {
              refs.current[i] = e;
            }}
            aria-selected={category === c}
            aria-expanded={category === c}
            aria-controls={`${id}-panel`}
            tabIndex={category === c || (!category && i === 0) ? 0 : -1}
            onClick={() => choose(c)}
            onKeyDown={(e) => {
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? categories.length - 1
                    : e.key === "ArrowLeft"
                      ? (i + 1) % categories.length
                      : e.key === "ArrowRight"
                        ? (i - 1 + categories.length) % categories.length
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                setCategory(categories[next][0]);
                setOperation(operations[categories[next][0]][0][0]);
                refs.current[next]?.focus();
              }
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {!category && (
        <p className="tool-disclosure-hint">
          اختر نوع العملية من الخانات أعلاه لإظهار حقولها فقط.
        </p>
      )}
      {category && (
        <section
          className="matrix-operation-panel"
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-${category}`}
        >
          <div className="matrix-operation-row">
            <label className="matrix-field">
              <span>المطلوب</span>
              <select
                value={operation}
                aria-label="عملية المصفوفات"
                onChange={(e) => setOperation(e.target.value)}
              >
                {operations[category].map(([key, title]) => (
                  <option key={key} value={key}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <button className="space-example" type="button" onClick={example}>
              <FlaskConical size={15} />
              تحميل مثال {(exampleIndex % 2) + 1}
            </button>
          </div>
          <h3 className="matrix-operation-title">
            {operations[category].find(([key]) => key === operation)?.[1]}
          </h3>
          <p className="matrix-rule">{rule[operation]}</p>
          {category === "systems" ? (
            <>
              <label className="matrix-field">
                <span>عدد المجاهيل</span>
                <select
                  aria-label="عدد مجاهيل الجملة"
                  value={variables.length}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setVariables((old) =>
                      old.length === n ? old : ["x", "y", "z"].slice(0, n),
                    );
                    setSystem((old) =>
                      Array.from({ length: n }, (_, i) =>
                        Array.from({ length: n }, (_, j) => old[i]?.[j] ?? "0"),
                      ),
                    );
                    setConstants((old) =>
                      Array.from({ length: n }, (_, i) => old[i] ?? "0"),
                    );
                  }}
                >
                  <option value={2}>مجهولان</option>
                  <option value={3}>ثلاثة مجاهيل</option>
                </select>
              </label>
              <label className="matrix-field">
                <span>عدد المعادلات — غاوس يفحصها جميعًا</span>
                <select
                  aria-label="عدد معادلات الجملة"
                  value={system.length}
                  onChange={(e) => {
                    const rows = Number(e.target.value);
                    setSystem((old) =>
                      Array.from({ length: rows }, (_, i) =>
                        Array.from(
                          { length: variables.length },
                          (_, j) => old[i]?.[j] ?? "0",
                        ),
                      ),
                    );
                    setConstants((old) =>
                      Array.from({ length: rows }, (_, i) => old[i] ?? "0"),
                    );
                  }}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="matrix-system-grid">
                {system.map((r, i) => (
                  <fieldset className="matrix-card" key={i}>
                    <legend>المعادلة {i + 1}</legend>
                    <div className="matrix-system-row">
                      {r.map((v, j) => (
                        <label className="matrix-field" key={j}>
                          <span>
                            معامل <Tex math={variables[j]} />
                          </span>
                          <input
                            value={v}
                            dir="ltr"
                            maxLength={100}
                            aria-label={`المعادلة ${i + 1}، معامل ${variables[j]}`}
                            onChange={(e) =>
                              setSystem((old) =>
                                old.map((row, a) =>
                                  row.map((c, b) =>
                                    a === i && b === j ? e.target.value : c,
                                  ),
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <label className="matrix-field">
                        <span>الطرف الأيمن</span>
                        <input
                          value={constants[i]}
                          dir="ltr"
                          maxLength={100}
                          aria-label={`الطرف الأيمن للمعادلة ${i + 1}`}
                          onChange={(e) =>
                            setConstants((old) =>
                              old.map((c, a) => (a === i ? e.target.value : c)),
                            )
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="matrix-names">
                {select(name, setName, "المصفوفة الأولى")}
                {paired && select(second, setSecond, "المصفوفة الثانية")}
              </div>
              <div className={paired ? "matrix-pair" : ""}>
                {grid(name)}
                {paired && second !== name && grid(second)}
              </div>
              {operation === "scale" && (
                <label className="matrix-field">
                  <span>
                    العدد الحقيقي <Tex math="k" />
                  </span>
                  <input
                    dir="ltr"
                    value={k}
                    maxLength={100}
                    aria-label="معامل ضرب المصفوفة"
                    onChange={(e) => setK(e.target.value)}
                  />
                </label>
              )}
              {operation === "power" && (
                <label className="matrix-field">
                  <span>الأس الصحيح</span>
                  <input
                    dir="ltr"
                    value={exponent}
                    aria-label="أس المصفوفة"
                    maxLength={3}
                    onChange={(e) => setExponent(e.target.value)}
                  />
                </label>
              )}
              {operation === "product" && (
                <label className="matrix-field">
                  <span>ترتيب الجداء</span>
                  <select
                    aria-label="ترتيب جداء المصفوفتين"
                    value={order}
                    onChange={(e) => setOrder(e.target.value)}
                  >
                    <option value="AB">
                      {name} × {second}
                    </option>
                    <option value="BA">
                      {second} × {name}
                    </option>
                  </select>
                </label>
              )}
              {operation === "determinant" && (
                <>
                  <label className="matrix-field">
                    <span>طريقة حساب المحدد</span>
                    <select
                      aria-label="طريقة حساب المحدد"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="automatic">قاعدة 2×2 أو النشر</option>
                      <option value="sarrus">طريقة ساروس — 3×3 فقط</option>
                      <option value="expansion">النشر بحسب سطر أو عمود</option>
                    </select>
                  </label>
                  {method === "expansion" && (
                    <div className="matrix-dimensions">
                      <label className="matrix-field">
                        <span>اتجاه النشر</span>
                        <select
                          value={axis}
                          aria-label="اتجاه نشر المحدد"
                          onChange={(e) => setAxis(e.target.value)}
                        >
                          <option value="row">سطر</option>
                          <option value="column">عمود</option>
                        </select>
                      </label>
                      <label className="matrix-field">
                        <span>رقم السطر أو العمود</span>
                        <select
                          aria-label="رقم سطر أو عمود النشر"
                          value={index}
                          onChange={(e) => setIndex(e.target.value)}
                        >
                          {values[name].map((_, i) => (
                            <option key={i} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <details className="matrix-reference">
            <summary>القواعد والتعريفات المرتبطة</summary>
            {category === "types" ? (
              reference.map(([title, description, formula]) => (
                <section key={title}>
                  <h4>{title}</h4>
                  <p>{description}</p>
                  <Tex math={formula} />
                </section>
              ))
            ) : (
              <RichText
                text={
                  category === "algebra"
                    ? T`يشترط في الجمع والطرح تساوي القياس. في الجداء \(A_{m\times p} B_{p\times n}=C_{m\times n}\). لا يلزم \(AB=BA\)، وقد يكون أحد الجداءين غير معرف. أثر المصفوفة مجموع عناصر القطر فقط.`
                    : category === "determinants"
                      ? T`المعكوس \(A^{-1}=\frac{1}{|A|}\operatorname{adj}(A)\) عندما \(|A|\ne0\). الملحقة منقول مصفوفة العوامل المرافقة. ساروس ليست قاعدة للمقاسات الأكبر من3.`
                      : rule[operation]
                }
              />
            )}
          </details>
          {prepared.error && (
            <p className="matrix-error" role="alert">
              {prepared.error}
            </p>
          )}
          <div className="matrix-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!!prepared.error || busy || !prepared.question}
              onClick={() => onSolve(prepared.question)}
            >
              <ArrowUp size={16} />
              حل في المحادثة
            </button>
            <button
              className="suggestion-button"
              type="button"
              disabled={!!prepared.error || !prepared.question}
              onClick={() => onInsert(prepared.question)}
            >
              إدراج في السؤال
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
function MatrixPreview({ cells, name }: { cells: MatrixCells; name: string }) {
  try {
    return (
      <Tex
        display
        math={`${name}=${matrixLatex(readMatrix(cells.map((r) => r.map(normalizePrompt))))}`}
      />
    );
  } catch {
    return (
      <p className="matrix-rule">أكمل جميع العناصر لعرض المعطيات بخط رياضي.</p>
    );
  }
}
