import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, Plus, Shuffle, Trash2 } from "lucide-react";
import { Tex, RichText } from "../common/Tex";
import type {
  ProbabilityContext,
  ProbabilityComparison,
  UrnModel,
  UrnQuery,
} from "../../solver/probabilityTypes";
import { calculateUrn } from "../../utils/probabilityUrn";
import {
  Rational,
  probability,
  approximate,
} from "../../utils/probabilityExact";
import {
  PROBABILITY_COLORS,
  probabilityColor,
  displayBalls,
} from "../../utils/probabilityPresentation";

const tabs = [
  ["urn", "السحب"],
  ["events", "الأحداث"],
  ["law", "المتحولات"],
  ["distributions", "التوزيعات"],
  ["statistics", "الإحصاء"],
] as const;
type Tab = (typeof tabs)[number][0];
const modeLabels: Record<UrnModel["mode"], string> = {
  simultaneous: "السحب معًا دون إعادة",
  successive_without_rep: "السحب متتاليًا دون إعادة",
  successive_with_rep: "السحب متتاليًا مع إعادة",
};
const comparatorLabels: Record<ProbabilityComparison, string> = {
  eq: "بالضبط",
  ge: "أو أكثر",
  lt: "أقل من",
  le: "أو أقل",
  gt: "أكثر من",
};
const comparatorSymbols: Record<ProbabilityComparison, string> = {
  eq: "=",
  ge: ">=",
  lt: "<",
  le: "<=",
  gt: ">",
};
const eventLabels: Record<UrnQuery["type"], string> = {
  color: "عدد كرات اللون المحدد",
  different: "لونان على الأقل",
  same: "كلها من لون واحد",
  "all-distinct": "كلها مختلفة الألوان",
  law: "قانون عدد كرات اللون",
  "all-events": "تراكيب الألوان",
  count: "الفضاء العيني فقط",
  ordered: "لونا الأولى والثانية",
  composition: "تركيب ألوان محدد",
};
const list = (s: string) => {
  const text = s.trim();
  if (text[0] !== "[" || !text.endsWith("]")) return text;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") depth--;
    if (depth === 0 && i < text.length - 1) return text;
  }
  return depth === 0 ? text.slice(1, -1) : text;
};
function initialTab(context?: ProbabilityContext): Tab {
  return context?.active === "events" || context?.active === "mixture"
    ? "events"
    : context?.active === "law" || context?.active === "joint"
      ? "law"
      : context?.active === "statistics"
        ? "statistics"
        : context?.active === "binomial" || context?.active === "normal"
          ? "distributions"
          : "urn";
}
function Field({
  label,
  value,
  onChange,
  area = false,
  placeholder = "",
  rtl = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  placeholder?: string;
  rtl?: boolean;
}) {
  return (
    <label className="probability-field">
      <span>{label}</span>
      {area ? (
        <textarea
          dir={rtl ? "rtl" : "ltr"}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={2200}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          dir={rtl ? "rtl" : "ltr"}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={700}
          placeholder={placeholder}
          autoComplete="off"
        />
      )}
    </label>
  );
}
export default function ProbabilityBoard({
  context,
  onInsert,
  onSolve,
  busy = false,
}: {
  context?: ProbabilityContext;
  onInsert: (question: string) => void;
  onSolve: (question: string) => void;
  busy?: boolean;
}) {
  const id = useId(),
    tabRefs = useRef<(HTMLButtonElement | null)[]>([]),
    [tab, setTab] = useState<Tab>(() => initialTab(context));
  const [colors, setColors] = useState(() =>
    (
      context?.urn?.colors || [
        { name: "حمراء", count: 3 },
        { name: "بيضاء", count: 5 },
      ]
    ).map((c) => ({ ...c, count: String(c.count) })),
  );
  const [mode, setMode] = useState<UrnModel["mode"]>(
      context?.urn?.mode || "simultaneous",
    ),
    [draw, setDraw] = useState(String(context?.urn?.count || 2));
  const [target, setTarget] = useState(
    Math.max(
      0,
      context?.urn?.colors.findIndex((c) => c.name === context.urn?.target) ??
        0,
    ),
  );
  const [event, setEvent] = useState<UrnQuery["type"]>(
      context?.urnQuery?.type || "color",
    ),
    [k, setK] = useState(String(context?.urnQuery?.k ?? 1)),
    [comparison, setComparison] = useState<ProbabilityComparison>(
      context?.urnQuery?.comparison || "ge",
    );
  const [firstColor, setFirstColor] = useState(
      context?.urnQuery?.sequence?.[0] || colors[0].name,
    ),
    [secondColor, setSecondColor] = useState(
      context?.urnQuery?.sequence?.[1] || colors[1]?.name || colors[0].name,
    );
  const [conditionalOn, setConditionalOn] = useState<
    "none" | "first" | "second"
  >(context?.urnQuery?.conditionalOn || "none");
  const [compositionCounts, setCompositionCounts] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (context?.urnQuery?.composition || []).map((c) => [
        c.color,
        String(c.count),
      ]),
    ),
  );
  const [shuffle, setShuffle] = useState(0),
    [guide, setGuide] = useState(false);
  const [eventsMode, setEventsMode] = useState(
      context?.active === "mixture" ? "mixture" : "events",
    ),
    [pa, setPa] = useState(context?.events?.A || "1/2"),
    [pb, setPb] = useState(context?.events?.B || "1/3"),
    [pab, setPab] = useState(context?.events?.["A&B"] || "1/6");
  const [eventOp, setEventOp] = useState("union"),
    [assumption, setAssumption] = useState("given");
  const [weights, setWeights] = useState(
      context?.mixture?.weights.join(",") || "1/3,2/3",
    ),
    [conditionals, setConditionals] = useState(
      context?.mixture?.conditionals.join(",") || "1/2,1/4",
    ),
    [bayes, setBayes] = useState(false),
    [branch, setBranch] = useState("1");
  const [lawMode, setLawMode] = useState(
      context?.active === "joint" ? "joint" : "single",
    ),
    [x, setX] = useState(
      context?.joint?.x.join(",") || context?.law?.values.join(",") || "0,1,2",
    ),
    [px, setPx] = useState(
      context?.law?.probabilities.join(",") || "1/4,1/2,1/4",
    ),
    [y, setY] = useState(context?.joint?.y.join(",") || "0,1"),
    [joint, setJoint] = useState(
      context?.joint?.matrix
        .map((row) => "[" + row.join(",") + "]")
        .join(",") || "[1/4,1/4],[1/4,1/4]",
    );
  const [distribution, setDistribution] = useState(
      context?.active === "normal" ? "normal" : "binomial",
    ),
    [n, setN] = useState(String(context?.binomial?.n ?? 10)),
    [p, setP] = useState(context?.binomial?.p || "1/2"),
    [distributionColor, setDistributionColor] = useState("حمراء"),
    [mu, setMu] = useState(String(context?.normal?.mu ?? 0)),
    [sigma, setSigma] = useState(String(context?.normal?.sigma ?? 1)),
    [normalX, setNormalX] = useState("1");
  const [data, setData] = useState(
      context?.statistics?.exactValues?.join(",") ||
        context?.statistics?.values.join(",") ||
        "1,2,3,4,5",
    ),
    [frequencies, setFrequencies] = useState(
      context?.statistics?.frequencies?.join(",") || "",
    ),
    [statsMatrix, setStatsMatrix] = useState(false);
  const model = useMemo<UrnModel>(
    () => ({
      colors: colors.map((c) => ({
        name: c.name.trim(),
        count: c.count.trim() ? Number(c.count) : NaN,
      })),
      mode,
      count: draw.trim() ? Number(draw) : NaN,
      target: colors[target]?.name.trim(),
    }),
    [colors, mode, draw, target],
  );
  const query = useMemo<UrnQuery>(
    () => ({
      type: event,
      color: model.target,
      k: k.trim() ? Number(k) : NaN,
      comparison,
      ...(event === "ordered"
        ? {
            sequence: [firstColor, secondColor],
            conditionalOn: conditionalOn === "none" ? undefined : conditionalOn,
          }
        : {}),
      ...(event === "composition"
        ? {
            composition: model.colors.map((c) => ({
              color: c.name,
              count: Number(compositionCounts[c.name] || 0),
            })),
          }
        : {}),
    }),
    [
      event,
      model.colors,
      model.target,
      k,
      comparison,
      firstColor,
      secondColor,
      conditionalOn,
      compositionCounts,
    ],
  );
  const preview = useMemo(() => {
    try {
      if (colors.some((c) => !/^[-\p{L}\p{N} _]{1,30}$/u.test(c.name.trim())))
        throw new Error(
          "استخدم اسم لون قصيرًا من الحروف والأرقام، دون علامات أو فواصل.",
        );
      const result = calculateUrn(model, query, {
        verify: false,
        visuals: false,
      });
      return { result, error: "" };
    } catch (error) {
      return {
        result: undefined,
        error: error instanceof Error ? error.message : "راجع بيانات التجربة.",
      };
    }
  }, [model, query, colors]);
  const balls = useMemo(() => {
    void shuffle;
    return displayBalls(model.colors);
  }, [model.colors, shuffle]);
  const color = probabilityColor(model.target || "", target);
  let distributionP: number | undefined,
    distributionError = "";
  try {
    distributionP = probability(p).number();
    if (
      !Number.isSafeInteger(Number(n)) ||
      Number(n) < 0 ||
      Number(n) > 1000 ||
      !n.trim()
    )
      throw new Error("n عدد صحيح من ٠ إلى ١٠٠٠.");
  } catch (error) {
    distributionError = error instanceof Error ? error.message : "راجع n وp.";
  }
  const updateColor = (
    index: number,
    patch: Partial<(typeof colors)[number]>,
  ) => {
    const old = colors[index].name;
    if (patch.name !== undefined) {
      if (firstColor === old) setFirstColor(patch.name);
      if (secondColor === old) setSecondColor(patch.name);
      setCompositionCounts((current) => ({
        ...current,
        [patch.name!]: current[old] || "0",
      }));
    }
    setColors((current) =>
      current.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };
  const removeColor = (index: number) => {
    const remaining = colors.filter((_, i) => i !== index),
      removed = colors[index].name;
    if (firstColor === removed) setFirstColor(remaining[0].name);
    if (secondColor === removed)
      setSecondColor(remaining[1]?.name || remaining[0].name);
    setColors(remaining);
    setTarget((current) =>
      current === index ? 0 : current > index ? current - 1 : current,
    );
  };
  function question() {
    if (tab === "urn") {
      const base = `تجربة سحب: الألوان=[${model.colors.map((c) => `${c.name}:${c.count}`).join(",")}]، r=${model.count}، ${modeLabels[mode]}، `;
      const ask =
        event === "ordered"
          ? conditionalOn === "first"
            ? `احسب احتمال أن تكون الثانية ${secondColor} بشرط أن تكون الأولى ${firstColor}`
            : conditionalOn === "second"
              ? `احسب احتمال أن تكون الأولى ${firstColor} بشرط أن تكون الثانية ${secondColor}`
              : `احسب احتمال أن تكون الأولى ${firstColor} والثانية ${secondColor}`
          : event === "composition"
            ? `احسب احتمال الحصول على ${model.colors.map((c) => `${compositionCounts[c.name] || 0} كرات ${c.name}`).join(" و")}`
            : event === "color"
              ? `احسب احتمال X${comparatorSymbols[comparison]}${k}، اللون المطلوب=${model.target}`
              : event === "law"
                ? `احسب قانون احتمال عدد الكرات من اللون ${model.target}`
                : event === "same"
                  ? "احسب احتمال أن تكون كلها من نفس اللون"
                  : event === "different"
                    ? "احسب احتمال ألا تكون كلها من لون واحد"
                    : event === "all-distinct"
                      ? "احسب احتمال أن تكون جميع الكرات مختلفة الألوان"
                      : event === "count"
                        ? "جد الفضاء العيني"
                        : "جد جميع الاحتمالات";
      return base + ask;
    }
    if (tab === "events") {
      if (eventsMode === "mixture")
        return `${bayes ? "بايز" : "الاحتمال الكلي"} q=[${list(weights)}]، p=[${list(conditionals)}]${bayes ? `، احسب P(H${branch}|B)` : ""}`;
      const base =
        `P(A)=${pa}، P(B)=${pb}، ` +
        (assumption === "given"
          ? `P(A∩B)=${pab}، `
          : assumption === "independent"
            ? "الحدثان مستقلان، "
            : "الحدثان متنافيان، ");
      return (
        base +
        ({
          union: "احسب الاتحاد",
          intersection: "احسب التقاطع",
          conditional: "احسب P(A|B)",
          complement: "احسب متمم A",
          independence: "افحص استقلال الحدثين",
        }[eventOp] || "احسب الاتحاد")
      );
    }
    if (tab === "law")
      return lawMode === "joint"
        ? `X=[${list(x)}]، Y=[${list(y)}]، J=[${list(joint)}]، افحص استقلال المتحولين`
        : `المتحول العشوائي X=[${list(x)}]، p=[${list(px)}]، احسب قانون الاحتمال والأمل والعزم الثاني والتباين والانحراف المعياري`;
    if (tab === "statistics")
      return (
        (frequencies.trim()
          ? `القيم=[${list(data)}]، التكرارات=[${list(frequencies)}]`
          : `البيانات [${list(data)}]`) +
        `، ${statsMatrix ? "حول جدول التكرارات إلى مصفوفة" : "احسب الإحصاء الوصفي والمدرج التكراري"}`
      );
    return distribution === "binomial"
      ? `التوزيع الثنائي n=${n} p=${p}، احسب P(X${comparatorSymbols[comparison]}${k})`
      : `التوزيع الطبيعي mu=${mu} sigma=${sigma}، احسب P(X${comparatorSymbols[comparison === "gt" || comparison === "ge" ? "ge" : "le"]}${normalX})`;
  }
  const error =
    tab === "urn"
      ? preview.error
      : tab === "distributions" && distribution === "binomial"
        ? distributionError
        : "";
  const bound = (
    <div className="probability-bound">
      <Field label="حد العدد k" value={k} onChange={setK} />
      <label className="probability-field">
        <span>مقارنة العدد</span>
        <select
          aria-label="مقارنة العدد"
          value={comparison}
          onChange={(e) =>
            setComparison(e.target.value as ProbabilityComparison)
          }
        >
          {Object.entries(comparatorLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  return (
    <div className="probability-board" data-testid="probability-board">
      <p className="probability-lead">
        اضبط المعطيات هنا، وأكمل الحل في المحادثة نفسها.
      </p>
      <div
        className="probability-tabs"
        role="tablist"
        aria-label="أدوات الاحتمالات والإحصاء"
      >
        {tabs.map(([key, label], index) => (
          <button
            type="button"
            key={key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            id={`${id}-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowLeft"
                  ? (index + 1) % tabs.length
                  : e.key === "ArrowRight"
                    ? (index + tabs.length - 1) % tabs.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : undefined;
              if (next !== undefined) {
                e.preventDefault();
                setTab(tabs[next][0]);
                tabRefs.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="probability-panel"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === "urn" && (
          <>
            <div
              className="urn-stage"
              style={{ "--target-color": color } as CSSProperties}
            >
              <div className="urn-stage-heading">
                <span>محتوى الصندوق</span>
                <button
                  type="button"
                  onClick={() => setShuffle((v) => v + 1)}
                  aria-label="إعادة ترتيب الكرات عشوائيًا"
                  title="تغيير أماكن العرض فقط"
                >
                  <Shuffle size={16} />
                </button>
              </div>
              <div
                className="urn-bowl"
                role="img"
                aria-label={`تمثيل كرات الصندوق: ${model.colors.map((c) => `${c.name} ${c.count}`).join("، ")}`}
                data-shuffle={shuffle}
              >
                {balls.map((ball, i) => (
                  <i
                    key={i}
                    data-color={model.colors[ball.color]?.name}
                    style={{
                      background: probabilityColor(
                        model.colors[ball.color]?.name || "",
                        ball.color,
                      ),
                      transform: `translateY(${ball.offset}px) rotate(${ball.rotation}deg)`,
                    }}
                  />
                ))}
              </div>
              <p className="urn-preview-note">
                {(preview.result?.space.n || 0) > 80
                  ? "معاينة نسبية حتى ٨٠ كرة؛ الأعداد الحقيقية في الخانات أدناه."
                  : "الترتيب عشوائي للعرض فقط؛ لا يغيّر الحساب."}
              </p>
            </div>
            <div className="urn-color-fields">
              {colors.map((c, index) => (
                <div className="urn-color-row" key={index}>
                  <i style={{ background: probabilityColor(c.name, index) }} />
                  <label>
                    <span className="sr-only">اسم اللون {index + 1}</span>
                    <input
                      aria-label={`اسم اللون ${index + 1}`}
                      value={c.name}
                      maxLength={30}
                      onChange={(e) =>
                        updateColor(index, { name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">عدد كرات {c.name}</span>
                    <input
                      aria-label={`عدد كرات ${c.name}`}
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      inputMode="numeric"
                      value={c.count}
                      onChange={(e) =>
                        updateColor(index, { count: e.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`حذف اللون ${c.name}`}
                    disabled={colors.length === 1}
                    onClick={() => removeColor(index)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="probability-add"
              type="button"
              disabled={colors.length >= 8}
              onClick={() => {
                const next = PROBABILITY_COLORS.find(
                  (c) => !colors.some((old) => old.name === c.name),
                );
                setColors((v) => [
                  ...v,
                  { name: next?.name || `لون ${v.length + 1}`, count: "1" },
                ]);
              }}
            >
              <Plus size={14} />
              إضافة لون
            </button>
            <div className="probability-grid">
              <Field
                label="عدد الكرات المسحوبة r"
                value={draw}
                onChange={setDraw}
              />
              <label className="probability-field">
                <span>نمط السحب</span>
                <select
                  aria-label="نمط السحب"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as UrnModel["mode"])}
                >
                  <option value="simultaneous">معًا</option>
                  <option value="successive_without_rep">
                    متتاليًا دون إعادة
                  </option>
                  <option value="successive_with_rep">متتاليًا مع إعادة</option>
                </select>
              </label>
            </div>
            <p
              className="probability-mode-note"
              data-testid="drawing-explanation"
            >
              {mode === "simultaneous"
                ? "توافيق: دون ترتيب ودون تكرار."
                : mode === "successive_without_rep"
                  ? "تراتيب: نراعي ترتيب السحبات، دون تكرار الكرة."
                  : "قوة: نراعي الترتيب، ويمكن تكرار الكرة."}
            </p>
            {preview.result && (
              <div className="probability-space">
                <span>الفضاء العيني</span>
                <Tex
                  className="probability-math"
                  math={preview.result.space.step.latex}
                />
              </div>
            )}
            <div className="probability-grid">
              <label className="probability-field">
                <span>الحدث المطلوب</span>
                <select
                  aria-label="الحدث المطلوب"
                  value={event}
                  onChange={(e) => setEvent(e.target.value as UrnQuery["type"])}
                >
                  {Object.entries(eventLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="probability-field">
                <span>اللون المطلوب</span>
                <select
                  aria-label="اللون المطلوب"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                >
                  {colors.map((c, i) => (
                    <option value={i} key={i}>
                      {c.name || `اللون ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {preview.result && (
              <div
                className="probability-target"
                data-testid="target-probability"
                style={{ "--target-color": color } as CSSProperties}
              >
                <i />
                <span>احتمال {model.target} في سحبة واحدة</span>
                <Tex
                  className="probability-math"
                  math={`p=${new Rational(model.colors[target].count, preview.result.space.n).tex()}`}
                />
              </div>
            )}
            {event === "color" && (
              <>
                {bound}
                <p className="probability-event-description">
                  {comparison === "lt" || comparison === "gt"
                    ? `${comparison === "lt" ? "أقل من" : "أكثر من"} ${k} من كرات اللون ${model.target}`
                    : `${comparison === "eq" ? "بالضبط " : ""}${k} من كرات اللون ${model.target}${comparison === "ge" ? " أو أكثر" : comparison === "le" ? " أو أقل" : ""}`}
                </p>
              </>
            )}
            {event === "ordered" && (
              <>
                <div className="probability-grid">
                  {(["first", "second"] as const).map((position) => (
                    <label className="probability-field" key={position}>
                      <span>
                        {position === "first" ? "لون الأولى" : "لون الثانية"}
                      </span>
                      <select
                        aria-label={
                          position === "first" ? "لون الأولى" : "لون الثانية"
                        }
                        value={position === "first" ? firstColor : secondColor}
                        onChange={(e) =>
                          (position === "first"
                            ? setFirstColor
                            : setSecondColor)(e.target.value)
                        }
                      >
                        {colors.map((c, i) => (
                          <option key={i}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="probability-field">
                  <span>الشرط المرصود</span>
                  <select
                    aria-label="الشرط المرصود"
                    value={conditionalOn}
                    onChange={(e) =>
                      setConditionalOn(e.target.value as typeof conditionalOn)
                    }
                  >
                    <option value="none">لا شرط — وقوع اللونين بالترتيب</option>
                    <option value="first">الأولى معلومة — نطلب الثانية</option>
                    <option value="second">الثانية معلومة — نطلب الأولى</option>
                  </select>
                </label>
              </>
            )}
            {event === "composition" && (
              <div className="probability-grid">
                {colors.map((c, i) => (
                  <Field
                    key={i}
                    label={`المطلوب من ${c.name}`}
                    value={compositionCounts[c.name] || "0"}
                    onChange={(value) =>
                      setCompositionCounts((current) => ({
                        ...current,
                        [c.name]: value,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            {preview.result?.p && (
              <div
                className="probability-live"
                aria-live="polite"
                data-testid="live-event-probability"
              >
                <span>احتمال الحدث</span>
                <Tex
                  className="probability-math"
                  math={preview.result.finalLatex}
                />
              </div>
            )}
          </>
        )}
        {tab === "events" && (
          <>
            <label className="probability-field">
              <span>نوع الحساب</span>
              <select
                aria-label="نوع حساب الأحداث"
                value={eventsMode}
                onChange={(e) => setEventsMode(e.target.value)}
              >
                <option value="events">أحداث وشرطي واستقلال</option>
                <option value="mixture">شجرة واحتمال كلي وبايز</option>
              </select>
            </label>
            {eventsMode === "events" ? (
              <>
                <div className="probability-grid">
                  <Field label="احتمال A" value={pa} onChange={setPa} />
                  <Field label="احتمال B" value={pb} onChange={setPb} />
                </div>
                <label className="probability-field">
                  <span>المعلومة عن العلاقة</span>
                  <select
                    aria-label="المعلومة عن العلاقة"
                    value={assumption}
                    onChange={(e) => setAssumption(e.target.value)}
                  >
                    <option value="given">احتمال التقاطع معلوم</option>
                    <option value="independent">الاستقلال معطى صراحة</option>
                    <option value="disjoint">التنافي معطى صراحة</option>
                  </select>
                </label>
                {assumption === "given" && (
                  <Field
                    label="احتمال تقاطع A وB"
                    value={pab}
                    onChange={setPab}
                  />
                )}
                <label className="probability-field">
                  <span>المطلوب</span>
                  <select
                    aria-label="عملية الأحداث"
                    value={eventOp}
                    onChange={(e) => setEventOp(e.target.value)}
                  >
                    <option value="union">الاتحاد</option>
                    <option value="intersection">التقاطع</option>
                    <option value="conditional">A بشرط B</option>
                    <option value="complement">متمم A</option>
                    <option value="independence">فحص الاستقلال</option>
                  </select>
                </label>
                <p className="probability-help">
                  التنافي ليس استقلالًا. لن تُفترض العلاقة إذا لم تُعطَ معطيات
                  كافية.
                </p>
              </>
            ) : (
              <>
                <Field
                  label="أوزان الفروع q"
                  value={weights}
                  onChange={setWeights}
                />
                <Field
                  label="احتمالات B داخل الفروع p"
                  value={conditionals}
                  onChange={setConditionals}
                />
                <label className="probability-check">
                  <input
                    type="checkbox"
                    checked={bayes}
                    onChange={(e) => setBayes(e.target.checked)}
                  />
                  احتمال الفرع بعد وقوع B — بايز
                </label>
                {bayes && (
                  <Field
                    label="رقم الفرع H"
                    value={branch}
                    onChange={setBranch}
                  />
                )}
                <p className="probability-help">
                  مجموع q يجب أن يساوي ١. لكل فرعٍ احتمال B ومتممه؛ نضرب على
                  المسار، ثم نجمع المسارات المتنافية.
                </p>
              </>
            )}
          </>
        )}
        {tab === "law" && (
          <>
            <label className="probability-field">
              <span>نوع القانون</span>
              <select
                aria-label="نوع قانون المتحول"
                value={lawMode}
                onChange={(e) => {
                  setLawMode(e.target.value);
                  if (e.target.value === "joint" && x === "0,1,2") setX("0,1");
                }}
              >
                <option value="single">متحول واحد وعزومه</option>
                <option value="joint">قانون مشترك وفحص الاستقلال</option>
              </select>
            </label>
            <Field label="قيم X" value={x} onChange={setX} />
            {lawMode === "single" ? (
              <Field label="احتمالات قيم X" value={px} onChange={setPx} />
            ) : (
              <>
                <Field label="قيم Y" value={y} onChange={setY} />
                <Field
                  label="صفوف الجدول المشترك J"
                  value={joint}
                  onChange={setJoint}
                  area
                />
              </>
            )}
            <p className="probability-help">
              جدول كامل مجموع احتمالاته ١. تظهر القيم ذات الاحتمال الموجب فقط في{" "}
              <Tex className="probability-math" math={"X(\\Omega)"} />. تُحسب{" "}
              <Tex
                className="probability-math"
                math={"E(X), E(X^2), V(X), \\sigma_X"}
              />{" "}
              وتُعرض خطواتها.
            </p>
          </>
        )}
        {tab === "distributions" && (
          <>
            <label className="probability-field">
              <span>القانون</span>
              <select
                aria-label="نوع التوزيع"
                value={distribution}
                onChange={(e) => setDistribution(e.target.value)}
              >
                <option value="binomial">ثنائي الحدين</option>
                <option value="normal">طبيعي</option>
              </select>
            </label>
            {distribution === "binomial" ? (
              <>
                <div className="probability-grid">
                  <Field label="عدد المحاولات n" value={n} onChange={setN} />
                  <Field label="احتمال الحدث p" value={p} onChange={setP} />
                </div>
                <label className="probability-field">
                  <span>لون الحدث في العرض</span>
                  <select
                    aria-label="لون الحدث في العرض"
                    value={distributionColor}
                    onChange={(e) => setDistributionColor(e.target.value)}
                  >
                    {PROBABILITY_COLORS.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                  </select>
                </label>
                {distributionP !== undefined && (
                  <div
                    className="probability-p-meter"
                    style={
                      {
                        "--target-color": probabilityColor(distributionColor),
                      } as CSSProperties
                    }
                  >
                    <div className="probability-p-label">
                      <span>الحدث</span>
                      <Tex
                        className="probability-math"
                        math={`p=${probability(p).tex()}`}
                      />
                      <span>متممه</span>
                      <Tex
                        className="probability-math"
                        math={`1-p=${ONE_MINUS(distributionP)}`}
                      />
                    </div>
                    <div
                      className="probability-p-track"
                      role="img"
                      aria-label={`احتمال الحدث ${approximate(distributionP)}، لون ${distributionColor}`}
                    >
                      <i style={{ width: `${distributionP * 100}%` }} />
                    </div>
                    <input
                      aria-label="تعديل p بالمنزلق"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={distributionP}
                      onChange={(e) => setP(e.target.value)}
                    />
                  </div>
                )}
                {bound}
                <p className="probability-help">
                  «أو أكثر» و«أقل» يحددان الحد المطلوب، ولا يغيّران p. المحاولات
                  مستقلة وp ثابت في هذا النموذج.
                </p>
              </>
            ) : (
              <>
                <div className="probability-grid">
                  <Field label="المتوسط mu" value={mu} onChange={setMu} />
                  <Field
                    label="الانحراف المعياري sigma"
                    value={sigma}
                    onChange={setSigma}
                  />
                </div>
                <Field
                  label="حد القيمة x"
                  value={normalX}
                  onChange={setNormalX}
                />
                <label className="probability-field">
                  <span>الطرف</span>
                  <select
                    aria-label="طرف الاحتمال الطبيعي"
                    value={
                      comparison === "gt" || comparison === "ge" ? "ge" : "le"
                    }
                    onChange={(e) =>
                      setComparison(e.target.value as ProbabilityComparison)
                    }
                  >
                    <option value="le">أقل أو يساوي</option>
                    <option value="ge">أكبر أو يساوي</option>
                  </select>
                </label>
                <p className="probability-help">
                  الرسم هنا منحنى كثافة، لا مدرج تكراري. مساحة المجال تعطي
                  الاحتمال، واحتمال نقطة واحدة يساوي صفرًا.
                </p>
              </>
            )}
          </>
        )}
        {tab === "statistics" && (
          <>
            <Field label="قيم البيانات" value={data} onChange={setData} area />
            <Field
              label="التكرارات (اختياري)"
              value={frequencies}
              onChange={setFrequencies}
              placeholder="اتركها فارغة للبيانات الخام"
            />
            <label className="probability-check">
              <input
                type="checkbox"
                checked={statsMatrix}
                onChange={(e) => setStatsMatrix(e.target.checked)}
              />
              ربط جدول التكرارات بأدوات المصفوفات
            </label>
            <p className="probability-help">
              المتوسط والوسيط والمنوال والتباين والمدرج التكراري. نفرّق بين
              تباين وصفي يقسم على N، وتباين عينة يقسم على N−1. جسر المصفوفات حتى
              ٦ قيم مميزة.
            </p>
          </>
        )}
      </div>
      <button
        className="probability-guide-toggle"
        type="button"
        aria-expanded={guide}
        onClick={() => setGuide((v) => !v)}
      >
        مراجعة القواعد الأساسية{" "}
        <span aria-hidden="true">{guide ? "−" : "+"}</span>
      </button>
      {guide && (
        <div className="probability-guide">
          <RichText
            text={String.raw`ابدأ بالفضاء العيني. في الحالات المتساوية الاحتمال: \(P(A)=n(A)/n(\Omega)\). المتمم \(1-P(A)\)، والاتحاد \(P(A)+P(B)-P(A\cap B)\). الشرطي يحتاج شرطًا غير مستحيل. في الشجرة، مجموع الفروع الخارجة ١ ونضرب على المسار. قانون المتحول جدول كامل مجموع احتمالاته ١.`}
          />
        </div>
      )}
      {error && (
        <p className="probability-error" role="alert">
          {error}
        </p>
      )}
      <div className="probability-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!!error || busy}
          onClick={() => onSolve(question())}
        >
          <ArrowUp size={16} />
          حل في المحادثة
        </button>
        <button
          type="button"
          className="suggestion-button"
          disabled={!!error}
          onClick={() => onInsert(question())}
        >
          إدراج في السؤال
        </button>
      </div>
    </div>
  );
}
function ONE_MINUS(p: number) {
  return approximate(Math.max(0, 1 - p));
}
