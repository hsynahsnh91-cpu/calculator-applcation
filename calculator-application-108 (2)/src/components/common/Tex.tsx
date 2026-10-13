import React, { useMemo } from 'react';
import katex from 'katex';

// Global math sanitizer that ensures raw engine symbols like "pi" become \pi,
// infinity becomes \infty, and asterisks become proper mathematical multiplication.
export function cleanMathLatex(s: string): string {
  if (!s) return '';
  return s
    // Standalone pi / PI / Pi -> \pi
    .replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, '\\pi')
    // Standalone Infinity / infinity -> \infty
    .replace(/(?<![\\a-zA-Z])(?:Infinity|infinity)(?![a-zA-Z])/g, '\\infty')
    // Replace raw * with \cdot between variables/numbers, or \times
    .replace(/([0-9a-zA-Z])\*([0-9a-zA-Z\\{])/g, '$1 \\cdot $2')
    .replace(/\*/g, ' \\times ')
    // Fix operator name collisions
    .replace(/\\operatorname\{pi\}/g, '\\pi')
    .replace(/\\operatorname\{Infinity\}/g, '\\infty');
}

// Inline math renderer that is isolated from the surrounding RTL (Arabic) text
export const Tex: React.FC<{ math: string; className?: string; display?: boolean }> = ({ math, className = '', display = false }) => {
  const html = useMemo(() => {
    try {
      const sanitized = cleanMathLatex(math);
      return katex.renderToString(sanitized, { displayMode: display, throwOnError: false, strict: false });
    } catch {
      return cleanMathLatex(math);
    }
  }, [math, display]);

  return (
    <span
      dir="ltr"
      className={`${display ? 'block overflow-x-auto max-w-full py-1' : 'inline-block align-middle'} ${className}`}
      style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// Text with embedded $...$ math fragments => real typeset math, never raw symbols
export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const parts = text.split('$');
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          return <Tex key={i} math={p} className="mx-0.5" />;
        }
        // In plain Arabic/text parts, ensure any raw "pi" is shown as "π"
        const cleanPlain = p.replace(/(?<![\\a-zA-Z])(?:pi|PI|Pi)(?![a-zA-Z])/g, 'π');
        return <React.Fragment key={i}>{cleanPlain}</React.Fragment>;
      })}
    </span>
  );
};
