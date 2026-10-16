import React from 'react';
import { BoxNode, ActiveTarget } from '../../utils/naturalDisplay';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';
import { soundHaptics } from '../../utils/soundHaptics';
import { Tex } from '../common/Tex';

interface NaturalDisplayProps {
  nodes: BoxNode[];
  activeTarget: ActiveTarget;
  onSelectTarget: (target: ActiveTarget) => void;
  onNavigate: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onClear: () => void;
  onEnter: () => void;
  liveResult?: string | null;
}

// Pretty names for functions
const FN_LABEL: Record<string, string> = {
  asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹',
  asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹'
};

// A single character cell — memoized so typing re-renders only what changed
const CharNode: React.FC<{ c: string }> = React.memo(({ c }) => {
  if (c === '*' || c === '×') return <span className="font-math text-xl text-amber-400 mx-1">×</span>;
  if (c === '/' || c === '÷') return <span className="font-math text-xl text-amber-400 mx-1">÷</span>;
  if (c === '+') return <span className="font-math text-xl text-amber-400 mx-1">+</span>;
  if (c === '-') return <span className="font-math text-xl text-amber-400 mx-1">−</span>;
  if (c === 'π') return <span className="font-math-italic text-[22px] text-fuchsia-300 px-[1px]">π</span>;
  if (c === 'e') return <span className="font-math-italic text-[22px] text-fuchsia-300 px-[1px]">e</span>;
  if (c === 'i') return <span className="font-math-italic text-[22px] text-fuchsia-300 px-[1px]">i</span>;
  if (c === '!' || c === '%') return <span className="font-math text-xl text-slate-200">{c}</span>;
  if (/[a-z]/i.test(c)) return <span className="font-math-italic text-[22px] text-cyan-300">{c}</span>;
  return <span className="font-math text-[22px] text-slate-100">{c}</span>;
});

// A true radical sign: drawn with SVG so it stretches with the content height
const RadicalSign: React.FC = React.memo(() => (
  <svg
    viewBox="0 0 14 30"
    preserveAspectRatio="none"
    className="w-[14px] shrink-0 self-stretch text-emerald-300"
    aria-hidden="true"
  >
    <path
      d="M0.8 17.5 L3.6 15.4 L7.4 27.5 L13.6 1 L14 1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
));

export const NaturalDisplay: React.FC<NaturalDisplayProps> = ({
  nodes,
  activeTarget,
  onSelectTarget,
  onNavigate,
  liveResult
}) => {
  const renderSlot = (list: BoxNode[], parentId: string, slotName: ActiveTarget['slot'], small = false) => {
    const isActiveSlot = activeTarget.nodeId === parentId && activeTarget.slot === slotName;
    const isEmpty = list.length === 0;

    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          soundHaptics.playClick();
          onSelectTarget({ nodeId: parentId, slot: slotName, index: list.length });
        }}
        className={`inline-flex items-center justify-center cursor-text rounded-[5px] transition-all ${
          small ? 'min-w-[16px] min-h-[18px] px-0.5' : 'min-w-[20px] min-h-[28px] px-1'
        } ${
          isActiveSlot
            ? 'math-box-active bg-emerald-950/60 border border-emerald-500'
            : isEmpty
              ? 'border border-dashed border-slate-500 bg-slate-800/30'
              : 'border border-transparent hover:border-slate-600'
        }`}
      >
        {isEmpty ? (
          isActiveSlot ? <span className="inline-block w-0.5 h-4 bg-emerald-400 animate-pulse" /> : <span className="inline-block w-2 h-3" />
        ) : (
          list.map((node, idx) => (
            <React.Fragment key={node.id || idx}>
              {isActiveSlot && activeTarget.index === idx && <span className="inline-block w-0.5 h-5 bg-emerald-400 animate-pulse" />}
              {renderNode(node)}
            </React.Fragment>
          ))
        )}
        {isActiveSlot && !isEmpty && activeTarget.index === list.length && (
          <span className="inline-block w-0.5 h-5 bg-emerald-400 animate-pulse ml-0.5" />
        )}
      </span>
    );
  };

  const renderRadical = (node: Extract<BoxNode, { type: 'sqrt' | 'nroot' }>) => (
    <span className="inline-flex items-stretch mx-1 align-middle">
      {node.type === 'nroot' && (
        <span className="self-start -mr-[3px] mt-0 z-10">{renderSlot(node.degree, node.id, 'degree', true)}</span>
      )}
      <RadicalSign />
      <span className="border-t-2 border-emerald-300 flex items-center pl-1 pr-0.5 pt-0.5">
        {renderSlot(node.content, node.id, 'content')}
      </span>
    </span>
  );

  const renderNode = (node: BoxNode): React.ReactNode => {
    switch (node.type) {
      case 'char':
        return <CharNode c={node.char} />;
      case 'fraction':
        return (
          <span className="inline-flex flex-col items-center align-middle mx-1">
            <span className="pb-0.5 border-b-2 border-slate-300 w-full flex justify-center">{renderSlot(node.num, node.id, 'num', true)}</span>
            <span className="pt-0.5 w-full flex justify-center">{renderSlot(node.den, node.id, 'den', true)}</span>
          </span>
        );
      case 'power':
        return (
          <span className="inline-flex items-start mx-0.5">
            {renderSlot(node.base, node.id, 'base')}
            <span className="-translate-y-2 -ml-0.5">{renderSlot(node.exp, node.id, 'exp', true)}</span>
          </span>
        );
      case 'sqrt':
      case 'nroot':
        return renderRadical(node);
      case 'function':
        return (
          <span className="inline-flex items-center mx-0.5">
            <span className="font-math text-lg text-sky-300 mr-0.5">{FN_LABEL[node.name] || node.name}</span>
            <span className="font-math text-2xl text-slate-400 leading-none">(</span>
            {renderSlot(node.arg, node.id, 'arg')}
            <span className="font-math text-2xl text-slate-400 leading-none">)</span>
          </span>
        );
      case 'abs':
        return (
          <span className="inline-flex items-center mx-0.5">
            <span className="font-math text-2xl text-amber-400 leading-none">|</span>
            {renderSlot(node.content, node.id, 'content')}
            <span className="font-math text-2xl text-amber-400 leading-none">|</span>
          </span>
        );
      case 'parens':
        return (
          <span className="inline-flex items-center mx-0.5">
            <span className="font-math text-2xl text-slate-400 leading-none">(</span>
            {renderSlot(node.content, node.id, 'content')}
            <span className="font-math text-2xl text-slate-400 leading-none">)</span>
          </span>
        );
      case 'subscript':
        return (
          <span className="inline-flex items-end mx-0.5">
            {renderSlot(node.base, node.id, 'base')}
            <span className="translate-y-1.5">{renderSlot(node.sub, node.id, 'sub', true)}</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl p-4 flex flex-col justify-between min-h-[160px] overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(16,185,129,0.55)] animate-ping" />
          <span className="text-emerald-400 font-semibold">شاشة العرض الطبيعي</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800" dir="ltr">
          {([
            ['left', ChevronLeft, 'يسار'],
            ['up', ChevronUp, 'أعلى (البسط / الأس)'],
            ['down', ChevronDown, 'أسفل (المقام)'],
            ['right', ChevronRight, 'يمين']
          ] as const).map(([dir, Icon, title]) => (
            <button
              key={dir}
              onClick={() => { soundHaptics.playClick(); onNavigate(dir); }}
              title={title}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div
        onClick={() => {
          soundHaptics.playClick();
          onSelectTarget({ nodeId: 'root', slot: 'root', index: nodes.length });
        }}
        className="flex-1 flex items-center flex-wrap gap-y-2 py-3 px-2 overflow-x-auto min-h-[70px] select-none"
        dir="ltr"
        role="math"
        aria-label="العبارة الرياضية"
      >
        {nodes.length === 0 ? (
          <span className="text-slate-600 text-base flex items-center gap-1 italic" dir="rtl">
            <span>انقر لإدخال العمليات الرياضية أو الأرقام...</span>
            <span className="inline-block w-2.5 h-5 bg-emerald-500/60 animate-pulse rounded-sm" />
          </span>
        ) : (
          nodes.map((node, idx) => (
            <React.Fragment key={node.id || idx}>
              {activeTarget.nodeId === 'root' && activeTarget.index === idx && <span className="inline-block w-0.5 h-6 bg-emerald-400 animate-pulse" />}
              {renderNode(node)}
            </React.Fragment>
          ))
        )}
        {activeTarget.nodeId === 'root' && activeTarget.index === nodes.length && nodes.length > 0 && (
          <span className="inline-block w-0.5 h-6 bg-emerald-400 animate-pulse ml-1" />
        )}
      </div>

      {liveResult && (
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 mt-2">
          <span className="text-xs text-slate-500 font-medium">النتيجة المباشرة:</span>
          <div className="flex items-center gap-2">
            <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-math text-xl font-bold text-emerald-400" dir="ltr"><Tex math={liveResult} /></span>
          </div>
        </div>
      )}
    </div>
  );
};
