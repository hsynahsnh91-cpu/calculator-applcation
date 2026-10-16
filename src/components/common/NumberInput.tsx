import React, { useEffect, useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  blankOnZero?: boolean;
}

// Converts Arabic-Indic / Persian digits to Latin digits (0-9)
function toLatinDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066B\u060C]/g, '.')
    .replace(/\u2212/g, '-');
}

// Always shows Latin digits regardless of browser / page language
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  className = '',
  allowDecimal = true,
  allowNegative = true,
  placeholder,
  blankOnZero = false
}) => {
  const [text, setText] = useState<string>(() => blankOnZero && value === 0 ? '' : String(value));

  useEffect(() => {
    const parsed = parseFloat(text);
    if (parsed !== value && !(text === '' && value === 0) && !(text === '-' && value === 0)) {
      setText(blankOnZero && value === 0 ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, blankOnZero]);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    let t = toLatinDigits(e.target.value);
    const pattern = allowDecimal
      ? allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/
      : allowNegative ? /^-?\d*$/ : /^\d*$/;
    if (!pattern.test(t)) return;
    if (t.length > 14) t = t.slice(0, 14);
    setText(t);
    const n = parseFloat(t);
    onChange(isNaN(n) ? 0 : n);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      lang="en"
      dir="ltr"
      value={text}
      placeholder={placeholder}
      onChange={handle}
      onFocus={(e) => e.target.select()}
      className={`bg-slate-950 border border-slate-700 text-slate-100 text-center outline-none focus:border-emerald-500 rounded-xl px-2 py-2 min-w-0 ${className}`}
      style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif", fontVariantNumeric: 'lining-nums' }}
    />
  );
};
