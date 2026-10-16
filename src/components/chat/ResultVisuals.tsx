import { useId } from "react";
import type {
  CurveVisual,
  HistogramVisual,
  ComplexVisual,
  SolverResult,
  TreeNode,
  Visual,
} from "../../solver/types";
import { Tex, RichText } from "../common/Tex";
import { SectionErrorBoundary } from "../common/SectionErrorBoundary";
export interface ResultViewProps {
  result: SolverResult;
}
function Curve({ visual }: { visual: CurveVisual }) {
  const id = useId().replace(/:/g, "");
  const all = visual.series.flatMap((series) =>
    series.points.filter(
      (point) => point.y !== null && Number.isFinite(point.y),
    ),
  );
  if (all.length < 2)
    return (
      <p className="text-sm text-slate-400">
        لا توجد نقاط حقيقية كافية لرسم هذا المجال.
      </p>
    );
  const W = 680,
    H = 290,
    pad = 34;
  const minX = Math.min(...all.map((p) => p.x)),
    maxX = Math.max(...all.map((p) => p.x));
  const values = all.map((p) => p.y!).sort((a, b) => a - b);
  const lo = Math.min(0, values[Math.floor(values.length * 0.02)]),
    hi = Math.max(
      0,
      values[Math.min(values.length - 1, Math.floor(values.length * 0.98))],
    );
  const margin = Math.max((hi - lo) * 0.12, 0.5),
    minY = lo - margin,
    maxY = hi + margin;
  const px = (x: number) =>
      pad + ((x - minX) / (maxX - minX || 1)) * (W - 2 * pad),
    py = (y: number) =>
      H - pad - ((y - minY) / (maxY - minY || 1)) * (H - 2 * pad);
  const tick = (n: number) =>
    Math.abs(n) > 1e4 || (Math.abs(n) < 0.001 && n !== 0)
      ? n.toExponential(1)
      : String(Number(n.toFixed(2)));
  return (
    <figure className="answer-visual">
      <figcaption>{visual.title}</figcaption>
      <svg
        className="w-full"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={visual.title}
        style={{ direction: "ltr" }}
      >
        <defs>
          <clipPath id={id}>
            <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
          </clipPath>
        </defs>
        {Array.from({ length: 6 }, (_, i) => {
          const x = pad + (i * (W - 2 * pad)) / 5,
            y = pad + (i * (H - 2 * pad)) / 5;
          return (
            <g key={i} stroke="#ffffff09">
              <line x1={x} y1={pad} x2={x} y2={H - pad} />
              <line x1={pad} y1={y} x2={W - pad} y2={y} />
              <text
                x={x}
                y={H - 12}
                fill="#94a3b8"
                stroke="none"
                fontSize="11"
                textAnchor="middle"
              >
                {tick(minX + (i * (maxX - minX)) / 5)}
              </text>
              <text
                x={pad - 7}
                y={y + 4}
                fill="#94a3b8"
                stroke="none"
                fontSize="11"
                textAnchor="end"
              >
                {tick(maxY - (i * (maxY - minY)) / 5)}
              </text>
            </g>
          );
        })}
        <g stroke="#64748b" strokeWidth="1">
          <line x1={pad} y1={py(0)} x2={W - pad} y2={py(0)} />
          {minX <= 0 && maxX >= 0 && (
            <line x1={px(0)} y1={pad} x2={px(0)} y2={H - pad} />
          )}
        </g>
        <g clipPath={`url(#${id})`}>
          {visual.series.map((series, index) => {
            let drawing = false;
            const path = series.points
              .map((point) => {
                if (point.y === null) {
                  drawing = false;
                  return "";
                }
                const move = drawing ? "L" : "M";
                drawing = true;
                return `${move}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`;
              })
              .join(" ");
            const color =
              series.color || ["#71e7cf", "#a5b4fc", "#fbbf24"][index % 3];
            return (
              <g key={index}>
                {!series.dots && (
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                  />
                )}
                {series.dots &&
                  series.points
                    .filter((point) => point.y !== null)
                    .map((point, i) => (
                      <circle
                        key={i}
                        cx={px(point.x)}
                        cy={py(point.y!)}
                        r="3.7"
                        fill={color}
                      />
                    ))}
              </g>
            );
          })}
        </g>
        <text
          x={W - 14}
          y={Math.max(20, Math.min(H - 12, py(0) - 7))}
          fill="#94a3b8"
          className="svg-math"
        >
          x
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-400">
        {visual.series.map((series, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-2"
            style={{ direction: "ltr" }}
          >
            <i
              className="h-1.5 w-4 rounded-full"
              style={{
                background:
                  series.color || ["#71e7cf", "#a5b4fc", "#fbbf24"][index % 3],
              }}
            />
            {series.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
function Histogram({ visual }: { visual: HistogramVisual }) {
  const W = 680,
    H = 300,
    left = 56,
    right = 20,
    top = 25,
    bottom = 70,
    plot = W - left - right,
    base = H - bottom;
  const max = Math.max(1e-300, ...visual.bins.map((b) => b.value)),
    step = plot / visual.bins.length;
  const color = visual.color || "#71cbb7",
    tick = (n: number) => Number(n.toPrecision(3)).toString();
  return (
    <figure className="answer-visual probability-histogram">
      <figcaption>{visual.title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={visual.title}
        style={{ direction: "ltr" }}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const y = top + ((base - top) * i) / 4;
          return (
            <g key={i}>
              <line x1={left} x2={W - right} y1={y} y2={y} stroke="#ffffff0e" />
              <text
                x={left - 9}
                y={y + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="11"
                className="svg-math"
              >
                {tick(max * (1 - i / 4))}
              </text>
            </g>
          );
        })}
        <line x1={left} x2={W - right} y1={base} y2={base} stroke="#64748b" />
        {visual.bins.map((bin, i) => {
          const h = (bin.value / max) * (base - top),
            gap = visual.discrete ? Math.max(1, step * 0.2) : 0;
          return (
            <g key={i}>
              <rect
                x={left + i * step + gap / 2}
                y={base - h}
                width={Math.max(0.2, step - gap)}
                height={h}
                fill={color}
                opacity=".82"
              >
                <title>{`${bin.label}: ${tick(bin.value)}`}</title>
              </rect>
              {(visual.bins.length <= 12 ||
                i % Math.ceil(visual.bins.length / 8) === 0) && (
                <text
                  x={left + (i + 0.5) * step}
                  y={base + 24}
                  textAnchor="middle"
                  fill="#a6b0bf"
                  fontSize="11"
                  className="svg-math"
                >
                  {bin.label.length > 18
                    ? bin.label.slice(0, 16) + "…"
                    : bin.label}
                </text>
              )}
            </g>
          );
        })}
        <text x={left} y={H - 12} fill="#94a3b8" fontSize="12">
          {visual.discrete ? "القيم / الاحتمال" : "الفئات / التكرار"}
        </text>
      </svg>
      {visual.note && <p className="visual-note">{visual.note}</p>}
      <details className="histogram-data">
        <summary>قراءة بيانات الرسم</summary>
        <div className="histogram-data-scroll">
          <table>
            <thead>
              <tr>
                <th>{visual.discrete ? "القيمة" : "الفئة"}</th>
                <th>{visual.discrete ? "الاحتمال" : "التكرار"}</th>
              </tr>
            </thead>
            <tbody>
              {visual.bins.map((bin, i) => (
                <tr key={i}>
                  <td dir="ltr">{bin.label}</td>
                  <td>
                    <Tex math={String(Number(bin.value.toPrecision(10)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
function Branch({ node }: { node: TreeNode }) {
  return (
    <li>
      <div className="tree-node">
        <span>{node.label}</span>
        <Tex
          math={
            node.probability.includes("/")
              ? `\\frac{${node.probability.split("/")[0]}}{${node.probability.split("/")[1]}}`
              : node.probability
          }
        />
      </div>
      {!!node.children?.length && (
        <ul>
          {node.children.map((child, index) => (
            <Branch node={child} key={index} />
          ))}
        </ul>
      )}
    </li>
  );
}
function Draw({ visual }: { visual: Visual }) {
  if (visual.kind === "curve") return <Curve visual={visual} />;
  if (visual.kind === "histogram") return <Histogram visual={visual} />;
  if (visual.kind === "table")
    return (
      <figure className="answer-visual">
        <figcaption>{visual.title}</figcaption>
        <Tex display math={visual.latex} />
      </figure>
    );
  if (visual.kind === "formula-cards")
    return (
      <figure className="answer-visual">
        <figcaption>{visual.title}</figcaption>
        <div className="complex-form-grid">
          {visual.cards.map((card, index) => (
            <article className="complex-form-card" key={index}>
              <h4>
                <span>{index + 1}</span>
                {card.label}
              </h4>
              <Tex display math={card.latex} />
              {card.caption && (
                <RichText
                  text={card.caption}
                  className="complex-form-caption"
                />
              )}
            </article>
          ))}
        </div>
      </figure>
    );
  if (visual.kind === "tree")
    return (
      <figure className="answer-visual">
        <figcaption>{visual.title}</figcaption>
        <div className="overflow-x-auto">
          <ul className="probability-tree">
            <Branch node={visual.root} />
          </ul>
        </div>
      </figure>
    );
  return <ComplexPlane visual={visual} />;
}
function ComplexPlane({ visual }: { visual: ComplexVisual }) {
  const arrowId = useId().replace(/:/g, "");
  const size = 320,
    pad = 30,
    scale =
      Math.max(
        1,
        ...(visual.circle
          ? [
              Math.abs(visual.circle.re) + visual.circle.radius,
              Math.abs(visual.circle.im) + visual.circle.radius,
            ]
          : []),
        ...visual.points.flatMap((point) => [
          Math.abs(point.re),
          Math.abs(point.im),
        ]),
      ) * 1.35;
  const xy = (v: number) => size / 2 + (v / scale) * (size / 2 - pad);
  return (
    <figure className="answer-visual">
      <figcaption>{visual.title}</figcaption>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto max-w-[340px] w-full"
        role="img"
        aria-label={visual.title}
        style={{ direction: "ltr" }}
      >
        <defs>
          <marker
            id={arrowId}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="#71e7cf" />
          </marker>
        </defs>
        {visual.connections?.map((line, index) => {
          const a = visual.points[line.from],
            b = visual.points[line.to];
          if (!a || !b) return null;
          return (
            <g key={`edge-${index}`}>
              <line
                x1={xy(a.re)}
                y1={xy(-a.im)}
                x2={xy(b.re)}
                y2={xy(-b.im)}
                stroke="#71e7cf"
                strokeWidth="1.6"
                markerEnd={line.arrow ? `url(#${arrowId})` : undefined}
              />
              {line.label && (
                <text
                  x={(xy(a.re) + xy(b.re)) / 2 + 7}
                  y={(xy(-a.im) + xy(-b.im)) / 2 - 8}
                  fill="#a5b4fc"
                  className="svg-math"
                  fontSize="12"
                >
                  {line.label}
                </text>
              )}
            </g>
          );
        })}
        {visual.circle && (
          <circle
            cx={xy(visual.circle.re)}
            cy={xy(-visual.circle.im)}
            r={(visual.circle.radius / scale) * (size / 2 - pad)}
            fill="none"
            stroke="#71e7cf44"
            strokeDasharray="3 5"
          />
        )}
        <g stroke="#64748b">
          <line
            x1={pad - 10}
            y1={size / 2}
            x2={size - pad + 10}
            y2={size / 2}
          />
          <line
            x1={size / 2}
            y1={pad - 10}
            x2={size / 2}
            y2={size - pad + 10}
          />
        </g>
        <text
          x={size - pad}
          y={size / 2 - 9}
          fill="#a5b4fc"
          className="svg-math"
        >
          Re
        </text>
        <text x={size / 2 + 9} y={pad} fill="#a5b4fc" className="svg-math">
          Im
        </text>
        <text x={size / 2 - 14} y={size / 2 + 16} fill="#94a3b8" fontSize="12">
          0
        </text>
        {visual.points.map((point, index) => (
          <g key={index}>
            {!visual.connections && (
              <line
                x1={size / 2}
                y1={size / 2}
                x2={xy(point.re)}
                y2={xy(-point.im)}
                stroke="#71e7cf"
                strokeDasharray="4 4"
                opacity=".45"
              />
            )}
            <circle cx={xy(point.re)} cy={xy(-point.im)} r="5" fill="#71e7cf" />
            <text
              x={xy(point.re) + 8}
              y={xy(-point.im) - 9}
              fill="#f1f5f9"
              className="svg-math"
              fontSize="13"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function ResultVisuals({ result }: ResultViewProps) {
  return (
    <div className="space-y-4">
      {result.visuals.map((visual, index) => (
        <SectionErrorBoundary
          key={index}
          label={visual.title}
          resetKey={result.id}
        >
          <Draw visual={visual} />
        </SectionErrorBoundary>
      ))}
    </div>
  );
}
