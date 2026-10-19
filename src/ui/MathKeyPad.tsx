import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Delete, RotateCcw, Sparkles } from 'lucide-react';
import { Tex } from './Tex';
import { soundHaptics } from '../shared/utils/soundHaptics';

export interface MathKey {
  tex: string;
  token: string;
}

// Same groups and symbols as the derivative pad, shared by every section that edits a function.
export const MATH_KEY_GROUPS: { title: string; keys: MathKey[] }[] = [
  {
    title: 'الأرقام',
    keys: [
      { tex: '7', token: '7' }, { tex: '8', token: '8' }, { tex: '9', token: '9' },
      { tex: '4', token: '4' }, { tex: '5', token: '5' }, { tex: '6', token: '6' },
      { tex: '1', token: '1' }, { tex: '2', token: '2' }, { tex: '3', token: '3' },
      { tex: '0', token: '0' }, { tex: '.', token: '.' }
    ]
  },
  {
    title: 'العمليات والمتغيرات',
    keys: [
      { tex: 'x', token: 'x' }, { tex: '+', token: '+' }, { tex: '-', token: '-' },
      { tex: '\\times', token: '\\times' }, { tex: '\\div', token: '\\div' }, { tex: '\\left(\\square\\right)', token: '\\left(\\placeholder{}\\right)' },
      { tex: '\\pi', token: '\\pi' }, { tex: 'e', token: 'e' }
    ]
  },
  {
    title: 'الأسس والجذور',
    keys: [
      { tex: 'x^{2}', token: 'x^2' }, { tex: 'x^{3}', token: 'x^3' }, { tex: 'x^{\\square}', token: 'x^{\\placeholder{}}' },
      { tex: '\\sqrt{\\square}', token: '\\sqrt{\\placeholder{}}' },
      { tex: '\\sqrt[3]{\\square}', token: '\\sqrt[3]{\\placeholder{}}' },
      { tex: '\\left|\\square\\right|', token: '\\left|\\placeholder{}\\right|' },
      { tex: '\\dfrac{\\square}{\\square}', token: '\\frac{\\placeholder{}}{\\placeholder{}}' }
    ]
  },
  {
    title: 'النسب المثلثية',
    keys: [
      { tex: '\\sin', token: '\\sin(\\placeholder{})' }, { tex: '\\cos', token: '\\cos(\\placeholder{})' },
      { tex: '\\tan', token: '\\tan(\\placeholder{})' }, { tex: '\\sin^{-1}', token: '\\arcsin(\\placeholder{})' },
      { tex: '\\cos^{-1}', token: '\\arccos(\\placeholder{})' }, { tex: '\\tan^{-1}', token: '\\arctan(\\placeholder{})' },
      { tex: '\\sec', token: '\\sec(\\placeholder{})' }, { tex: '\\csc', token: '\\csc(\\placeholder{})' },
      { tex: '\\cot', token: '\\cot(\\placeholder{})' }, { tex: '\\sec^{-1}', token: '\\operatorname{asec}(\\placeholder{})' },
      { tex: '\\csc^{-1}', token: '\\operatorname{acsc}(\\placeholder{})' }, { tex: '\\cot^{-1}', token: '\\operatorname{acot}(\\placeholder{})' },
      { tex: '\\sinh', token: '\\sinh(\\placeholder{})' }, { tex: '\\cosh', token: '\\cosh(\\placeholder{})' },
      { tex: '\\tanh', token: '\\tanh(\\placeholder{})' }, { tex: '\\sinh^{-1}', token: '\\operatorname{asinh}(\\placeholder{})' },
      { tex: '\\cosh^{-1}', token: '\\operatorname{acosh}(\\placeholder{})' }, { tex: '\\tanh^{-1}', token: '\\operatorname{atanh}(\\placeholder{})' }
    ]
  },
  {
    title: 'الأسية واللوغاريتمية',
    keys: [
      { tex: '\\ln', token: '\\ln(\\placeholder{})' }, { tex: '\\log', token: '\\log(\\placeholder{})' },
      { tex: '\\log_{10}', token: '\\log_{10}(\\placeholder{})' }, { tex: 'e^{\\square}', token: 'e^{\\placeholder{}}' },
      { tex: '10^{\\square}', token: '10^{\\placeholder{}}' }, { tex: 'n!', token: '!' },
      { tex: '\\%', token: '\\%' }
    ]
  }
];

interface MathKeyPadProps {
  onInsert: (token: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  defaultOpen?: boolean;
  label?: string;
}

export const MathKeyPad: React.FC<MathKeyPadProps> = ({
  onInsert,
  onBackspace,
  onClear,
  defaultOpen = false,
  label = 'لوحة الدوال والعمليات'
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="rounded-xl border border-emerald-800/60 bg-slate-950/50 overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          soundHaptics.playClick();
          setOpen((o) => !o);
        }}
        className="w-full min-h-9 flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-950/30 transition-colors touch-manipulation"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{label}</span>
          <span className="text-[10px] text-slate-500 font-normal">تُدرج عند المؤشر</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="p-2 space-y-2 border-t border-slate-800 animate-fadeIn">
          {MATH_KEY_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-500">{group.title}</div>
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-1" dir="ltr">
                {group.keys.map((key) => (
                  <button
                    key={`${group.title}-${key.token}`}
                    type="button"
                    onClick={() => onInsert(key.token)}
                    className="min-h-8 py-1 rounded-md bg-slate-900 hover:bg-emerald-950/50 active:bg-emerald-900/60 border border-slate-700 hover:border-emerald-700 text-emerald-200 flex items-center justify-center px-0.5 transition-colors touch-manipulation"
                  >
                    <Tex math={key.tex} className="text-[15px] leading-none" />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-1 pt-0.5" dir="ltr">
            <button
              type="button"
              onClick={() => {
                soundHaptics.playClick();
                onBackspace();
              }}
              className="min-h-8 rounded-md bg-rose-950/60 hover:bg-rose-900 active:bg-rose-800 border border-rose-800 text-rose-200 flex items-center justify-center gap-1 text-[11px] font-bold transition-colors touch-manipulation"
            >
              <Delete className="w-3.5 h-3.5" />
              <span>حذف</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundHaptics.playClick();
                onClear();
              }}
              className="min-h-8 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 text-slate-200 flex items-center justify-center gap-1 text-[11px] font-bold transition-colors touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مسح الكل</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
