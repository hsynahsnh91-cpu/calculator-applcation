import { copyToClipboard } from '../../utils/cn';
import React, { useMemo, useState } from 'react';
import katex from 'katex';
import { Copy, Check } from 'lucide-react';
import { soundHaptics } from '../../utils/soundHaptics';
import { cleanMathLatex } from './Tex';

interface KaTeXDisplayProps {
  math: string;
  block?: boolean;
  className?: string;
  allowCopy?: boolean;
  copyText?: string;
}

export const KaTeXDisplay: React.FC<KaTeXDisplayProps> = ({
  math,
  block = false,
  className = '',
  allowCopy = false,
  copyText
}) => {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    try {
      if (!math) return '';
      const sanitized = cleanMathLatex(math);
      const rendered = katex.renderToString(sanitized, {
        displayMode: block,
        throwOnError: false,
        strict: false
      });
      return rendered.includes('class="katex-error"') ? katex.renderToString('\\text{تعذّر عرض الصيغة الرياضية}', { strict: false }) : rendered;
    } catch {
      return katex.renderToString('\\text{تعذّر عرض الصيغة الرياضية}', { strict: false });
    }
  }, [math, block]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    soundHaptics.playClick();
    const textToCopy = copyText || math;
    if (!await copyToClipboard(textToCopy)) { soundHaptics.playError(); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group inline-flex items-center ${block ? 'w-full justify-center my-1' : ''} ${className}`}>
      <span
        dangerouslySetInnerHTML={{ __html: html }}
        dir="ltr"
        style={{ unicodeBidi: 'isolate' }}
        className="overflow-x-auto max-w-full text-inherit leading-relaxed"
      />
      {allowCopy && (
        <button
          onClick={handleCopy}
          title="نسخ الصيغة"
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1 shadow-sm"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

// Memoized so a parent re-render (e.g. every keystroke) does not re-render unchanged formulas
const Memoized = React.memo(KaTeXDisplay);
export default Memoized;
