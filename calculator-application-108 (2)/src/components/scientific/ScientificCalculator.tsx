import React, { useState, useEffect, useCallback } from 'react';
import { AngleMode, HistoryEntry } from '../../types';
import { BoxNode, ActiveTarget, insertAtTarget, deleteAtTarget, generateId, nodesToMathjs, nodesToLatex, nodesToCleanLatex, collectTrigNodes } from '../../utils/naturalDisplay';
import { evaluateMathExpression, recognizeExact } from '../../utils/mathEngine';

// ---------- clean, scientific solution steps (no engine syntax like sin((30)*pi/180)) ----------
function exactOrDecimal(v: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  if (Math.abs(v - Math.round(v)) < 1e-10) return String(Math.round(v));
  const ex = recognizeExact(v);
  return ex ? ex.latex : String(Number(v.toPrecision(10)));
}

function buildCleanSteps(
  nodes: BoxNode[],
  angleMode: AngleMode,
  res: { decimalStr: string; latexStr: string; fractionStr: string | null }
): string[] {
  const steps: string[] = [];
  const expr = nodesToCleanLatex(nodes, angleMode);
  steps.push(`العبارة المدخلة: $${expr}$`);

  // angle conversion + exact value of every trigonometric ratio
  const trig = collectTrigNodes(nodes);
  const seen = new Set<string>();
  for (const t of trig) {
    try {
      const argVal = Number(evaluateMathExpression(nodesToMathjs(t.arg, angleMode), angleMode).result);
      if (!isFinite(argVal)) continue;
      const fnTex = `\\${t.name}`;
      const argTex = nodesToCleanLatex(t.arg, angleMode);
      const key = `${t.name}|${argVal}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rad = angleMode === 'DEG' ? (argVal * Math.PI) / 180 : angleMode === 'GRAD' ? (argVal * Math.PI) / 200 : argVal;
      const radTex = exactOrDecimal(rad);
      const valueRes = evaluateMathExpression(nodesToMathjs([t], angleMode), angleMode);
      const valTex = valueRes.fractionStr ? valueRes.latexStr : valueRes.decimalStr;
      const unit = angleMode === 'DEG' ? '^{\\circ}' : angleMode === 'GRAD' ? '^{\\mathrm{g}}' : '';
      const factor = angleMode === 'DEG' ? '\\dfrac{\\pi}{180}' : '\\dfrac{\\pi}{200}';

      if (angleMode === 'RAD') {
        steps.push(`قيمة النسبة المثلثية: $${fnTex}\\left(${argTex}\\right) = ${valTex}$`);
      } else {
        steps.push(
          `تحويل الزاوية إلى الراديان: $${exactOrDecimal(argVal)}${unit} = ${exactOrDecimal(argVal)} \\times ${factor} = ${radTex}$`
        );
        steps.push(`قيمة النسبة المثلثية: $${fnTex}\\left(${exactOrDecimal(argVal)}${unit}\\right) = ${fnTex}\\left(${radTex}\\right) = ${valTex}$`);
      }
    } catch {
      // argument still incomplete
    }
  }

  const isNum = !isNaN(parseFloat(res.decimalStr)) && !res.decimalStr.includes('i');
  if (res.fractionStr && isNum) {
    steps.push(`النتيجة بالشكل المضبوط: $${expr} = ${res.latexStr}$`);
    steps.push(`القيمة العشرية التقريبية: $${expr} \\approx ${res.decimalStr.replace(' × 10^', ' \\times 10^')}$`);
  } else {
    steps.push(`النتيجة: $${expr} = ${res.decimalStr.replace(' × 10^', ' \\times 10^').replace('∞', '\\infty')}$`);
  }
  return steps;
}
import { NaturalDisplay } from './NaturalDisplay';
import { KaTeXDisplay } from '../common/KaTeXDisplay';
import { Tex, RichText } from '../common/Tex';
import { soundHaptics } from '../../utils/soundHaptics';
import { Delete, RotateCcw, Sparkles, Copy, Check, Layers, ArrowLeftRight } from 'lucide-react';
import { burst } from '../../utils/perf';

interface ScientificCalculatorProps {
  angleMode: AngleMode;
  onAngleModeChange: (mode: AngleMode) => void;
  onSaveHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
}

type Slot = ActiveTarget['slot'];

// ---------- tree helpers (read-only) for smooth cursor navigation ----------
function slotsOf(node: BoxNode): { slot: Slot; list: BoxNode[] }[] {
  switch (node.type) {
    case 'fraction': return [{ slot: 'num', list: node.num }, { slot: 'den', list: node.den }];
    case 'power': return [{ slot: 'base', list: node.base }, { slot: 'exp', list: node.exp }];
    case 'sqrt': return [{ slot: 'content', list: node.content }];
    case 'nroot': return [{ slot: 'degree', list: node.degree }, { slot: 'content', list: node.content }];
    case 'function': return [{ slot: 'arg', list: node.arg }];
    case 'abs':
    case 'parens': return [{ slot: 'content', list: node.content }];
    case 'subscript': return [{ slot: 'base', list: node.base }, { slot: 'sub', list: node.sub }];
    default: return [];
  }
}

interface Located { node: BoxNode; parentId: string; parentSlot: Slot; index: number }

function locate(list: BoxNode[], id: string, parentId = 'root', parentSlot: Slot = 'root'): Located | null {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.id === id) return { node: n, parentId, parentSlot, index: i };
    for (const s of slotsOf(n)) {
      const r = locate(s.list, id, n.id, s.slot);
      if (r) return r;
    }
  }
  return null;
}

function getList(nodes: BoxNode[], t: ActiveTarget): BoxNode[] {
  if (t.nodeId === 'root') return nodes;
  const loc = locate(nodes, t.nodeId);
  if (!loc) return nodes;
  return slotsOf(loc.node).find((s) => s.slot === t.slot)?.list ?? [];
}

// ---------- key button ----------
type Tone = 'fn' | 'sym' | 'struct' | 'op' | 'num' | 'mem' | 'danger' | 'eq';
const TONES: Record<Tone, string> = {
  fn: 'bg-sky-950/60 hover:bg-sky-900/70 text-sky-200 border-sky-800/70',
  sym: 'bg-fuchsia-950/50 hover:bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-800/60',
  struct: 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-700/60',
  op: 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-700/60',
  num: 'bg-slate-800 hover:bg-slate-700 text-slate-50 border-slate-700',
  mem: 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/80',
  danger: 'bg-rose-950/70 hover:bg-rose-900 text-rose-200 border-rose-800',
  eq: 'bg-gradient-to-b from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-emerald-400/50 shadow-lg shadow-emerald-950/50'
};

const Key: React.FC<{
  onClick: () => void;
  tone?: Tone;
  className?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, tone = 'num', className = '', title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`h-11 sm:h-12 rounded-xl border font-bold flex items-center justify-center active:scale-95 transition-all select-none ${TONES[tone]} ${className}`}
  >
    {children}
  </button>
);

const RowTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-semibold text-slate-500 px-1 pt-1">{children}</div>
);

export const ScientificCalculator: React.FC<ScientificCalculatorProps> = ({
  angleMode,
  onAngleModeChange,
  onSaveHistory
}) => {
  const [nodes, setNodes] = useState<BoxNode[]>([]);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>({ nodeId: 'root', slot: 'root', index: 0 });

  const [resultDecimal, setResultDecimal] = useState<string | null>(null);
  const [resultFraction, setResultFraction] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [showSteps, setShowSteps] = useState<boolean>(false);
  const [showExactFraction, setShowExactFraction] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [isHyp, setIsHyp] = useState<boolean>(false);
  const [memoryVal, setMemoryVal] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState<boolean>(false);

  // Live evaluation — debounced so heavy evaluation runs after typing stops,
  // keeping every keystroke instant on a phone WebView.
  useEffect(() => {
    if (nodes.length === 0) {
      setResultDecimal(null);
      setResultFraction(null);
      setResultLatex(null);
      setSteps([]);
      setErrorMsg(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const mathExpr = nodesToMathjs(nodes, angleMode);
        if (mathExpr.trim() !== '') {
          const evalRes = evaluateMathExpression(mathExpr, angleMode);
          setResultDecimal(evalRes.decimalStr);
          setResultFraction(evalRes.fractionStr);
          setResultLatex(evalRes.latexStr);
          setSteps(buildCleanSteps(nodes, angleMode, evalRes));
          setErrorMsg(null);
        }
      } catch {
        // incomplete expression while typing
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [nodes, angleMode]);

  const insertConstruct = useCallback(
    (node: BoxNode, target: ActiveTarget) => {
      const { updatedNodes } = insertAtTarget(nodes, activeTarget, node);
      setNodes(updatedNodes);
      setActiveTarget(target);
    },
    [nodes, activeTarget]
  );

  const handleInsertChar = useCallback((char: string) => {
    soundHaptics.playClick();
    soundHaptics.vibrate(10);
    const charNode: BoxNode = { type: 'char', id: generateId(), char };
    const { updatedNodes, newTarget } = insertAtTarget(nodes, activeTarget, charNode);
    setNodes(updatedNodes);
    setActiveTarget(newTarget);
  }, [nodes, activeTarget]);

  const handleInsertFraction = useCallback(() => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const n: BoxNode = { type: 'fraction', id: generateId(), num: [], den: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'num', index: 0 });
  }, [insertConstruct]);

  // exponentValue: preset exponent (x², x³) ; baseChar: preset base (eˣ, 10ˣ)
  const handleInsertPower = useCallback((exponentValue?: string, baseChar?: string) => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const mk = (c: string): BoxNode => ({ type: 'char', id: generateId(), char: c });
    const n: BoxNode = {
      type: 'power',
      id: generateId(),
      base: baseChar ? baseChar.split('').map(mk) : [],
      exp: exponentValue ? exponentValue.split('').map(mk) : []
    };
    insertConstruct(n, { nodeId: n.id, slot: baseChar ? 'exp' : 'base', index: 0 });
  }, [insertConstruct]);

  const handleInsertSqrt = useCallback(() => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const n: BoxNode = { type: 'sqrt', id: generateId(), content: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'content', index: 0 });
  }, [insertConstruct]);

  const handleInsertNRoot = useCallback(() => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const n: BoxNode = { type: 'nroot', id: generateId(), degree: [], content: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'degree', index: 0 });
  }, [insertConstruct]);

  const handleInsertFunction = useCallback((fnName: string) => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const n: BoxNode = { type: 'function', id: generateId(), name: fnName, arg: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'arg', index: 0 });
  }, [insertConstruct]);

  const handleInsertAbs = useCallback(() => {
    soundHaptics.playOperator();
    soundHaptics.vibrate(15);
    const n: BoxNode = { type: 'abs', id: generateId(), content: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'content', index: 0 });
  }, [insertConstruct]);

  const handleInsertParens = useCallback(() => {
    soundHaptics.playClick();
    const n: BoxNode = { type: 'parens', id: generateId(), content: [] };
    insertConstruct(n, { nodeId: n.id, slot: 'content', index: 0 });
  }, [insertConstruct]);

  const handleDelete = useCallback(() => {
    soundHaptics.playClick();
    soundHaptics.vibrate(12);
    const { updatedNodes, newTarget } = deleteAtTarget(nodes, activeTarget);
    setNodes(updatedNodes);
    setActiveTarget(newTarget);
  }, [nodes, activeTarget]);

  const handleClear = useCallback(() => {
    soundHaptics.playClick();
    soundHaptics.vibrate(20);
    setNodes([]);
    setActiveTarget({ nodeId: 'root', slot: 'root', index: 0 });
    setResultDecimal(null);
    setResultFraction(null);
    setResultLatex(null);
    setErrorMsg(null);
  }, []);

  const handleCalculate = useCallback(() => {
    if (nodes.length === 0) return;
    try {
      soundHaptics.playEquals();
      soundHaptics.vibrate(30);
      const mathExpr = nodesToMathjs(nodes, angleMode);
      const evalRes = evaluateMathExpression(mathExpr, angleMode);
      setResultDecimal(evalRes.decimalStr);
      setResultFraction(evalRes.fractionStr);
      setResultLatex(evalRes.latexStr);
      const cleanSteps = buildCleanSteps(nodes, angleMode, evalRes);
      setSteps(cleanSteps);
      setErrorMsg(null);

      onSaveHistory({
        mode: 'scientific',
        title: 'عملية حسابية',
        inputLatex: nodesToLatex(nodes),
        resultLatex: evalRes.latexStr,
        resultDecimal: evalRes.decimalStr,
        steps: cleanSteps
      });

      if (nodes.length > 3) {
        burst(['#10b981', '#06b6d4', '#6366f1']);
      }
    } catch (err: any) {
      soundHaptics.playError();
      setErrorMsg(err.message || 'خطأ في الصيغة الحسابية');
    }
  }, [nodes, angleMode, onSaveHistory]);

  // Smooth navigation between boxes (numerator → denominator, base → exponent, exit radical ...)
  const handleNavigate = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    const t = activeTarget;
    const list = getList(nodes, t);

    if (dir === 'up' || dir === 'down') {
      if (t.slot === 'den' && dir === 'up') setActiveTarget({ ...t, slot: 'num', index: 0 });
      else if (t.slot === 'num' && dir === 'down') setActiveTarget({ ...t, slot: 'den', index: 0 });
      else if (t.slot === 'base' && dir === 'up') setActiveTarget({ ...t, slot: 'exp', index: 0 });
      else if (t.slot === 'exp' && dir === 'down') setActiveTarget({ ...t, slot: 'base', index: 0 });
      return;
    }

    const loc = t.nodeId === 'root' ? null : locate(nodes, t.nodeId);

    if (dir === 'right') {
      if (t.index < list.length) {
        const next = list[t.index];
        const inner = slotsOf(next);
        if (next.type !== 'char' && inner.length > 0) {
          setActiveTarget({ nodeId: next.id, slot: inner[0].slot, index: 0 });
        } else {
          setActiveTarget({ ...t, index: t.index + 1 });
        }
        return;
      }
      if (!loc) return;
      const slots = slotsOf(loc.node);
      const i = slots.findIndex((s) => s.slot === t.slot);
      if (i >= 0 && i < slots.length - 1) {
        setActiveTarget({ nodeId: loc.node.id, slot: slots[i + 1].slot, index: 0 });
      } else {
        setActiveTarget({ nodeId: loc.parentId, slot: loc.parentSlot, index: loc.index + 1 });
      }
      return;
    }

    // left
    if (t.index > 0) {
      const prev = list[t.index - 1];
      const inner = slotsOf(prev);
      if (prev.type !== 'char' && inner.length > 0) {
        const last = inner[inner.length - 1];
        setActiveTarget({ nodeId: prev.id, slot: last.slot, index: last.list.length });
      } else {
        setActiveTarget({ ...t, index: t.index - 1 });
      }
      return;
    }
    if (!loc) return;
    const slots = slotsOf(loc.node);
    const i = slots.findIndex((s) => s.slot === t.slot);
    if (i > 0) {
      setActiveTarget({ nodeId: loc.node.id, slot: slots[i - 1].slot, index: slots[i - 1].list.length });
    } else {
      setActiveTarget({ nodeId: loc.parentId, slot: loc.parentSlot, index: loc.index });
    }
  }, [activeTarget, nodes]);

  const handleMemory = (action: 'M+' | 'M-' | 'MR' | 'MC') => {
    soundHaptics.playClick();
    const currentNum = resultDecimal ? parseFloat(resultDecimal) : 0;
    if (action === 'M+') {
      setMemoryVal((p) => p + (isNaN(currentNum) ? 0 : currentNum));
      setHasMemory(true);
    } else if (action === 'M-') {
      setMemoryVal((p) => p - (isNaN(currentNum) ? 0 : currentNum));
      setHasMemory(true);
    } else if (action === 'MR') {
      const charNodes: BoxNode[] = memoryVal.toString().split('').map((c) => ({ type: 'char', id: generateId(), char: c }));
      const { updatedNodes, newTarget } = insertAtTarget(nodes, activeTarget, charNodes);
      setNodes(updatedNodes);
      setActiveTarget(newTarget);
    } else {
      setMemoryVal(0);
      setHasMemory(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key >= '0' && e.key <= '9') handleInsertChar(e.key);
      else if (['+', '-', '*', '/'].includes(e.key)) handleInsertChar(e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key);
      else if (e.key === '.') handleInsertChar('.');
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); handleCalculate(); }
      else if (e.key === 'Backspace') { e.preventDefault(); handleDelete(); }
      else if (e.key === 'Escape') handleClear();
      else if (e.key === 'ArrowLeft') handleNavigate('left');
      else if (e.key === 'ArrowRight') handleNavigate('right');
      else if (e.key === 'ArrowUp') handleNavigate('up');
      else if (e.key === 'ArrowDown') handleNavigate('down');
      else if (e.key === '^') handleInsertPower();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleInsertChar, handleCalculate, handleDelete, handleClear, handleNavigate, handleInsertPower]);

  const copyResult = () => {
    if (resultDecimal) {
      soundHaptics.playClick();
      navigator.clipboard.writeText(showExactFraction && resultFraction ? resultFraction : resultDecimal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const h = isHyp ? 'h' : '';

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(['DEG', 'RAD', 'GRAD'] as AngleMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => { soundHaptics.playClick(); onAngleModeChange(mode); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                angleMode === mode ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { soundHaptics.playClick(); setIsHyp(!isHyp); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
              isHyp
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-extrabold shadow-md'
                : 'bg-slate-800/80 text-cyan-400 border-cyan-500/30 hover:border-cyan-500/60'
            }`}
          >
            HYP
          </button>
          {hasMemory && (
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold">
              M: {Number(memoryVal.toFixed(3))}
            </span>
          )}
        </div>
      </div>

      <NaturalDisplay
        nodes={nodes}
        activeTarget={activeTarget}
        onSelectTarget={setActiveTarget}
        onNavigate={handleNavigate}
        onClear={handleClear}
        onEnter={handleCalculate}
        liveResult={resultDecimal}
      />

      {(resultDecimal || errorMsg) && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border border-emerald-500/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3 animate-fadeIn">
          {errorMsg ? (
            <div className="text-rose-400 text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-start gap-1 w-full md:w-auto">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>النتيجة الدقيقة:</span>
                  {resultFraction && (
                    <button
                      onClick={() => { soundHaptics.playClick(); setShowExactFraction(!showExactFraction); }}
                      className="inline-flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-emerald-400 border border-slate-700"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>{showExactFraction ? 'الكسر المضبوط' : 'الفاصلة العشرية'}</span>
                    </button>
                  )}
                </div>
                <div className="text-2xl md:text-3xl font-bold text-emerald-300" dir="ltr">
                  {showExactFraction && resultFraction && resultLatex ? (
                    <KaTeXDisplay math={resultLatex} />
                  ) : (
                    <span className="font-math">{resultDecimal}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                  onClick={copyResult}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 shadow-sm transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
                {steps.length > 0 && (
                  <button
                    onClick={() => { soundHaptics.playClick(); setShowSteps(!showSteps); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      showSteps
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : 'bg-slate-800/90 text-emerald-400 border-emerald-500/40 hover:bg-slate-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{showSteps ? 'إخفاء الخطوات' : 'خطوات الحل'}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showSteps && steps.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20 shadow-lg space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-slate-800 pb-2">
            <Layers className="w-4 h-4" />
            <span>خطوات التبسيط والحساب بالتفصيل:</span>
          </div>
          <div className="space-y-2">
            {steps.map((st, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 overflow-x-auto leading-relaxed">
                  <RichText text={st} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= KEYPAD ================= */}
      <div className="calculator-keypad bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-xl space-y-2" dir="ltr">
        {/* Memory */}
        <div className="grid grid-cols-4 gap-1.5">
          {([['MC', 'text-slate-300'], ['MR', 'text-slate-300'], ['M+', 'text-emerald-400'], ['M-', 'text-rose-400']] as const).map(([m, c]) => (
            <button
              key={m}
              onClick={() => handleMemory(m)}
              className={`h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold active:scale-95 transition-all ${c}`}
            >
              {m === 'M-' ? 'M−' : m}
            </button>
          ))}
        </div>

        {/* Row 1 : trigonometry */}
        <RowTitle>النسب المثلثية</RowTitle>
        <div className="grid grid-cols-6 gap-1.5">
          <Key tone="fn" onClick={() => handleInsertFunction(`sin${h}`)}><Tex math={`\\sin${h ? 'h' : ''}`} className="text-[13px]" /></Key>
          <Key tone="fn" onClick={() => handleInsertFunction(`cos${h}`)}><Tex math={`\\cos${h ? 'h' : ''}`} className="text-[13px]" /></Key>
          <Key tone="fn" onClick={() => handleInsertFunction(`tan${h}`)}><Tex math={`\\tan${h ? 'h' : ''}`} className="text-[13px]" /></Key>
          <Key tone="fn" onClick={() => handleInsertFunction(`asin${h}`)}><Tex math={`\\sin${h ? 'h' : ''}^{-1}`} className="text-[12px]" /></Key>
          <Key tone="fn" onClick={() => handleInsertFunction(`acos${h}`)}><Tex math={`\\cos${h ? 'h' : ''}^{-1}`} className="text-[12px]" /></Key>
          <Key tone="fn" onClick={() => handleInsertFunction(`atan${h}`)}><Tex math={`\\tan${h ? 'h' : ''}^{-1}`} className="text-[12px]" /></Key>
        </div>

        {/* Row 2 : symbols */}
        <RowTitle>الرموز والأقواس</RowTitle>
        <div className="grid grid-cols-7 gap-1.5">
          <Key tone="sym" onClick={() => handleInsertChar('π')} title="باي"><Tex math="\pi" className="text-lg" /></Key>
          <Key tone="sym" onClick={() => handleInsertChar('e')} title="العدد النيبيري"><Tex math="e" className="text-lg" /></Key>
          <Key tone="sym" onClick={() => handleInsertChar('i')} title="الوحدة التخيلية"><Tex math="i" className="text-lg" /></Key>
          <Key tone="sym" onClick={handleInsertParens} title="أقواس"><Tex math="(\,\square\,)" className="text-[13px]" /></Key>
          <Key tone="sym" onClick={handleInsertAbs} title="القيمة المطلقة"><Tex math="|\square|" className="text-[13px]" /></Key>
          <Key tone="sym" onClick={() => handleInsertChar('!')} title="العاملي"><Tex math="n!" className="text-[14px]" /></Key>
          <Key tone="sym" onClick={() => handleInsertChar('%')} title="نسبة مئوية"><Tex math="\%" className="text-[14px]" /></Key>
        </div>

        {/* Row 3 : roots / powers / logarithms */}
        <RowTitle>الجذور · الأسس · اللوغاريتمات · الكسور</RowTitle>
        <div className="grid grid-cols-8 gap-1.5">
          <Key tone="struct" onClick={handleInsertSqrt} title="جذر تربيعي"><Tex math="\sqrt{\square}" className="text-[12px]" /></Key>
          <Key tone="struct" onClick={handleInsertNRoot} title="جذر نوني"><Tex math="\sqrt[\square]{\square}" className="text-[11px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertPower('2')} title="مربع"><Tex math="x^{2}" className="text-[13px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertPower()} title="أس عام"><Tex math="x^{\square}" className="text-[12px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertPower(undefined, 'e')} title="الأسية الطبيعية"><Tex math="e^{\square}" className="text-[12px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertPower(undefined, '10')} title="قوى العشرة"><Tex math="10^{\square}" className="text-[11px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertFunction('ln')} title="لوغاريتم نيبيري"><Tex math="\ln" className="text-[13px]" /></Key>
          <Key tone="struct" onClick={() => handleInsertFunction('log')} title="لوغاريتم عشري"><Tex math="\log" className="text-[13px]" /></Key>
        </div>
        <div className="grid grid-cols-1">
          <Key tone="struct" onClick={handleInsertFraction} title="كسر اعتيادي" className="h-10">
            <Tex math="\dfrac{\square}{\square}" className="text-[13px]" />
            <span className="mr-2 ml-2 text-[11px] text-emerald-300/80 font-semibold" dir="rtl">كسر اعتيادي</span>
          </Key>
        </div>

        {/* Row 4 : the four operations, one horizontal row */}
        <RowTitle>العمليات الأربع</RowTitle>
        <div className="grid grid-cols-4 gap-1.5">
          <Key tone="op" onClick={() => handleInsertChar('+')} className="text-2xl"><Tex math="+" className="text-2xl" /></Key>
          <Key tone="op" onClick={() => handleInsertChar('-')} className="text-2xl"><Tex math="-" className="text-2xl" /></Key>
          <Key tone="op" onClick={() => handleInsertChar('×')} className="text-2xl"><Tex math="\times" className="text-2xl" /></Key>
          <Key tone="op" onClick={() => handleInsertChar('÷')} className="text-2xl"><Tex math="\div" className="text-2xl" /></Key>
        </div>

        {/* Row 5 : numeric pad */}
        <RowTitle>لوحة الأرقام</RowTitle>
        <div className="grid grid-cols-4 gap-1.5">
          {['7', '8', '9'].map((n) => (
            <Key key={n} tone="num" onClick={() => handleInsertChar(n)} className="text-xl font-math">{n}</Key>
          ))}
          <Key tone="danger" onClick={handleDelete} title="حذف"><Delete className="w-5 h-5" /></Key>

          {['4', '5', '6'].map((n) => (
            <Key key={n} tone="num" onClick={() => handleInsertChar(n)} className="text-xl font-math">{n}</Key>
          ))}
          <Key tone="danger" onClick={handleClear} title="مسح الكل" className="gap-1 text-sm">
            <RotateCcw className="w-4 h-4" />
            <span>AC</span>
          </Key>

          {['1', '2', '3'].map((n) => (
            <Key key={n} tone="num" onClick={() => handleInsertChar(n)} className="text-xl font-math">{n}</Key>
          ))}
          <Key tone="eq" onClick={handleCalculate} className="row-span-2 h-auto text-3xl font-math">=</Key>

          <Key tone="num" onClick={() => handleInsertChar('0')} className="col-span-2 text-xl font-math">0</Key>
          <Key tone="num" onClick={() => handleInsertChar('.')} className="text-2xl font-math">.</Key>
        </div>
      </div>
    </div>
  );
};
