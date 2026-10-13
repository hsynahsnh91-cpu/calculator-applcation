import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
import nerdamer from 'nerdamer';

export interface NaturalMathFieldHandle {
  insert: (latex: string) => void;
  backspace: () => void;
  clear: () => void;
  focus: () => void;
}

interface NaturalMathFieldProps {
  placeholder?: string;
  onChange: (engineExpression: string, latex: string) => void;
  className?: string;
}

function latexToEngine(latex: string): string {
  if (!latex.trim()) return '';
  try {
    const converted = nerdamer.convertFromLaTeX(latex) as unknown as { text: () => string };
    return converted.text();
  } catch {
    return '';
  }
}

// MathLive gives true editable fractions, radicals and exponent slots while the
// symbolic engine continues to receive a plain, validated expression.
export const NaturalMathField = forwardRef<NaturalMathFieldHandle, NaturalMathFieldProps>(
  ({ placeholder = 'اكتب الدالة هنا', onChange, className = '' }, ref) => {
    const host = useRef<HTMLDivElement>(null);
    const field = useRef<MathfieldElement | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
      if (!host.current) return;
      const mf = new MathfieldElement();
      mf.className = `natural-math-field ${className}`;
      mf.setAttribute('aria-label', placeholder);
      mf.placeholder = `\\text{${placeholder.replace(/[{}]/g, '')}}`;
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.smartFence = true;
      mf.smartMode = false;
      mf.value = '';

      const input = () => {
        const latex = mf.getValue('latex-without-placeholders');
        onChangeRef.current(latexToEngine(latex), mf.value);
      };
      mf.addEventListener('input', input);
      host.current.appendChild(mf);
      field.current = mf;
      return () => {
        mf.removeEventListener('input', input);
        mf.remove();
        field.current = null;
      };
    }, [className, placeholder]);

    useImperativeHandle(ref, () => ({
      insert: (latex: string) => {
        field.current?.focus();
        field.current?.insert(latex, { selectionMode: 'placeholder' });
      },
      backspace: () => {
        field.current?.focus();
        field.current?.executeCommand('deleteBackward');
      },
      clear: () => {
        field.current?.setValue('');
        onChangeRef.current('', '');
        field.current?.focus();
      },
      focus: () => field.current?.focus()
    }), []);

    return <div ref={host} className="w-full" />;
  }
);

NaturalMathField.displayName = 'NaturalMathField';
