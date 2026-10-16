import { useId, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Tex } from "../common/Tex";
import type { SpaceVisual } from "../../solver/types";
type V = [number, number, number];
const label = (name: string) =>
  name
    .replace(/^alpha/, "α")
    .replace(/^beta/, "β")
    .replace(/^Pi/, "Π")
    .replace(/[1-6]$/g, (n) => "₀₁₂₃₄₅₆"[Number(n)]);
const add = (a: V, b: V): V => a.map((n, i) => n + b[i]) as V;
const scale = (a: V, k: number): V => a.map((n) => n * k) as V;
const sub = (a: V, b: V): V => add(a, scale(b, -1));
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => scale(a, 1 / (Math.hypot(...a) || 1));
interface Wire {
  points: V[];
  closed?: boolean;
  dashed?: boolean;
  color?: string;
  arrow?: boolean;
  label?: string;
}
function solidWires(s: NonNullable<SpaceVisual["solid"]>): Wire[] {
  const d = s.dimensions,
    edge = (p: V[], links: [number, number][]) =>
      links.map(([i, j]) => ({ points: [p[i], p[j]] }));
  if (s.id === "sphere") return circles([0, 0, 0], d.r);
  if (s.id === "cylinder" || s.id === "cone") {
    const circle = (z: number) =>
      Array.from(
        { length: 33 },
        (_, i): V => [
          d.r * Math.cos((i * Math.PI) / 16),
          d.r * Math.sin((i * Math.PI) / 16),
          z,
        ],
      );
    const wires: Wire[] = [{ points: circle(0), closed: true }];
    if (s.id === "cylinder") wires.push({ points: circle(d.h), closed: true });
    for (let i = 0; i < 8; i++) {
      const t = (i * Math.PI) / 4;
      wires.push({
        points: [
          [d.r * Math.cos(t), d.r * Math.sin(t), 0],
          s.id === "cone"
            ? [0, 0, d.h]
            : [d.r * Math.cos(t), d.r * Math.sin(t), d.h],
        ],
      });
    }
    return wires;
  }
  if (s.id === "pyramid") {
    const a = d.a,
      p: V[] = [
        [0, 0, 0],
        [a, 0, 0],
        [a, a, 0],
        [0, a, 0],
        [a / 2, a / 2, d.h],
      ];
    return edge(p, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
  }
  if (s.id === "triangularPrism") {
    const a = Math.sqrt(d.area * 2),
      p: V[] = [
        [0, 0, 0],
        [a, 0, 0],
        [0, a, 0],
        [0, 0, d.h],
        [a, 0, d.h],
        [0, a, d.h],
      ];
    return edge(p, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
      [0, 3],
      [1, 4],
      [2, 5],
    ]);
  }
  const a = d.a,
    b = s.id === "cube" ? a : d.b,
    c = s.id === "cube" ? a : d.c,
    p: V[] = [
      [0, 0, 0],
      [a, 0, 0],
      [a, b, 0],
      [0, b, 0],
      [0, 0, c],
      [a, 0, c],
      [a, b, c],
      [0, b, c],
    ];
  return edge(p, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]);
}
function circles(c: V, r: number): Wire[] {
  return [0, 1, 2].map((axis) => ({
    points: Array.from({ length: 49 }, (_, i) => {
      const p: [number, number, number] = [...c];
      p[(axis + 1) % 3] += r * Math.cos((i * Math.PI) / 24);
      p[(axis + 2) % 3] += r * Math.sin((i * Math.PI) / 24);
      return p;
    }),
    closed: true,
    color: "#9dafe8",
  }));
}
export default function SpaceFigure({ visual }: { visual: SpaceVisual }) {
  const id = useId().replace(/:/g, ""),
    [yaw, setYaw] = useState(-38),
    [pitch, setPitch] = useState(24);
  const drawing = useMemo(() => {
    const wires: Wire[] = visual.solid ? solidWires(visual.solid) : [],
      refs: V[] = [
        [0, 0, 0],
        ...visual.points.map((p) => p.position),
        ...(visual.lines || []).map((l) => l.point),
      ];
    if (visual.sphere) {
      refs.push(
        visual.sphere.center,
        add(visual.sphere.center, [visual.sphere.radius, 0, 0]),
        sub(visual.sphere.center, [visual.sphere.radius, 0, 0]),
      );
      wires.push(...circles(visual.sphere.center, visual.sphere.radius));
    }
    for (const p of visual.planes || []) {
      const n = p.normal,
        norm2 = n.reduce((s, c) => s + c * c, 0);
      if (norm2 > 0) refs.push(scale(n, -p.offset / norm2));
    }
    refs.push(...wires.flatMap((w) => w.points));
    const radius = Math.max(...refs.map((p) => Math.hypot(...p))) || 1;
    const axisLength = radius * 1.12;
    const planes = (visual.planes || []).map((p) => {
      const c = scale(
        p.normal,
        -p.offset / p.normal.reduce((s, n) => s + n * n, 0),
      );
      const normal = unit(p.normal),
        basis: V = Math.abs(normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0],
        u = scale(unit(cross(normal, basis)), radius * 0.65),
        v = scale(unit(cross(normal, u)), radius * 0.65);
      return {
        label: p.label,
        points: [
          add(add(c, u), v),
          add(sub(c, u), v),
          sub(sub(c, u), v),
          add(sub(c, v), u),
        ],
      };
    });
    for (const l of visual.lines || []) {
      const u = scale(unit(l.direction), radius * 0.85);
      wires.push({
        points: [sub(l.point, u), add(l.point, u)],
        label: l.label,
        color: "#9facf0",
      });
    }
    for (const s of visual.segments || []) {
      const a = visual.points[s.from],
        b = visual.points[s.to];
      if (a && b)
        wires.push({
          points: [a.position, b.position],
          arrow: s.arrow,
          dashed: s.dashed,
          color: "#76d9c7",
        });
    }
    const project = (p: V): [number, number] => {
      const y = (yaw * Math.PI) / 180,
        t = (pitch * Math.PI) / 180,
        x = p[0] * Math.cos(y) - p[1] * Math.sin(y),
        z = p[0] * Math.sin(y) + p[1] * Math.cos(y);
      return [x, z * Math.sin(t) - p[2] * Math.cos(t)];
    };
    const axes: V[] = [
      [axisLength, 0, 0],
      [0, axisLength, 0],
      [0, 0, axisLength],
    ];
    const projected = [
      ...refs,
      ...wires.flatMap((w) => w.points),
      ...planes.flatMap((p) => p.points),
      ...axes,
    ].map(project);
    const minX = Math.min(...projected.map((p) => p[0])),
      maxX = Math.max(...projected.map((p) => p[0])),
      minY = Math.min(...projected.map((p) => p[1])),
      maxY = Math.max(...projected.map((p) => p[1]));
    const W = 460,
      H = 320,
      pad = 42,
      s = Math.min(
        (W - 2 * pad) / (maxX - minX || 1),
        (H - 2 * pad) / (maxY - minY || 1),
      );
    const xy = (p: V): [number, number] => {
      const q = project(p);
      return [
        W / 2 + (q[0] - (minX + maxX) / 2) * s,
        H / 2 + (q[1] - (minY + maxY) / 2) * s,
      ];
    };
    const path = (points: V[], closed = false) =>
      points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${xy(p)
              .map((v) => v.toFixed(2))
              .join(",")}`,
        )
        .join(" ") + (closed ? " Z" : "");
    return { wires, planes, axes, xy, path };
  }, [visual, yaw, pitch]);
  const p0 = drawing.xy([0, 0, 0]);
  return (
    <figure className="answer-visual space-figure" data-testid="space-figure">
      <figcaption>{visual.title}</figcaption>
      <svg
        viewBox="0 0 460 320"
        role="img"
        aria-label={visual.title + " — إسقاط ثلاثي الأبعاد"}
        style={{ direction: "ltr" }}
      >
        <defs>
          <marker
            id={id}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#76d9c7" />
          </marker>
        </defs>
        {drawing.planes.map((p, i) => (
          <g key={i}>
            <path
              d={drawing.path(p.points, true)}
              fill={["#71cbb5", "#879de1"][i % 2]}
              fillOpacity=".12"
              stroke="#668d9f"
              strokeWidth="1.1"
            />
            <text
              x={drawing.xy(p.points[0])[0]}
              y={drawing.xy(p.points[0])[1] - 8}
              fill="#a7bdd5"
              fontSize="16"
              className="svg-math"
            >
              {label(p.label)}
            </text>
          </g>
        ))}
        {drawing.axes.map((p, i) => {
          const q = drawing.xy(p);
          return (
            <g key={i}>
              <line
                x1={p0[0]}
                y1={p0[1]}
                x2={q[0]}
                y2={q[1]}
                stroke={["#7a8da5", "#7784a5", "#8d7b9e"][i]}
                strokeDasharray="4 5"
              />
              <text
                x={q[0] + 7}
                y={q[1] + 5}
                fill="#9aaec3"
                fontSize="16"
                className="svg-math"
              >
                {"xyz"[i]}
              </text>
            </g>
          );
        })}
        {drawing.wires.map((w, i) => (
          <g key={i}>
            <path
              d={drawing.path(w.points, w.closed)}
              fill="none"
              stroke={w.color || "#76d9c7"}
              strokeWidth="1.8"
              strokeDasharray={w.dashed ? "5 5" : undefined}
              markerEnd={w.arrow ? `url(#${id})` : undefined}
            />
            {w.label && (
              <text
                x={drawing.xy(w.points[0])[0] + 8}
                y={drawing.xy(w.points[0])[1] - 8}
                fill="#c4d4ed"
                fontSize="16"
                className="svg-math"
              >
                {label(w.label)}
              </text>
            )}
          </g>
        ))}
        {visual.points.map((p, i) => {
          const q = drawing.xy(p.position);
          return (
            <g key={i}>
              <circle cx={q[0]} cy={q[1]} r="4.5" fill="#b4eadf" />
              <text
                x={q[0] + 8}
                y={q[1] - 9}
                fill="#e2ebf2"
                fontSize="16"
                className="svg-math"
              >
                {label(p.label)}
              </text>
              <title>{`${p.label} (${p.position.join(", ")})`}</title>
            </g>
          );
        })}
      </svg>
      <p className="space-figure-note">
        إسقاط توضيحي قابل للتدوير؛ العلاقات تُثبت بالحساب، لا بمظهر الرسم.
      </p>
      <details className="space-rotation">
        <summary>تدوير الرسم وتفاصيل الإحداثيات</summary>
        <div className="space-view-controls">
          <label>
            الدوران الأفقي
            <input
              aria-label="الدوران الأفقي للرسم"
              type="range"
              min="-180"
              max="180"
              value={yaw}
              onChange={(e) => setYaw(Number(e.target.value))}
            />
          </label>
          <label>
            الميل الرأسي
            <input
              aria-label="الميل الرأسي للرسم"
              type="range"
              min="-75"
              max="75"
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="suggestion-button"
            onClick={() => {
              setYaw(-38);
              setPitch(24);
            }}
          >
            <RotateCcw size={14} />
            إعادة المنظور
          </button>
        </div>
        {!!visual.points.length && (
          <div className="space-coordinate-table">
            <table>
              <caption>إحداثيات العناصر المعروضة</caption>
              <thead>
                <tr>
                  <th>العنصر</th>
                  <th>الإحداثيات</th>
                </tr>
              </thead>
              <tbody>
                {visual.points.map((p, i) => (
                  <tr key={i}>
                    <th>{label(p.label)}</th>
                    <td>
                      <Tex
                        math={
                          p.latex ||
                          `(${p.position.map((n) => Number(n.toPrecision(8))).join(",")})`
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </figure>
  );
}
