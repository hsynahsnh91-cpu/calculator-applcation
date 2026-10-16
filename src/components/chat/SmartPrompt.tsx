import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { MathfieldElement } from "../common/NaturalMathField";
export interface SmartPromptHandle {
  value: () => string;
  setValue: (value: string) => void;
  insertText: (text: string) => void;
  insertMath: (latex: string) => void;
  clear: () => void;
  focus: () => void;
}
interface Props {
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}
export const SmartPrompt = forwardRef<SmartPromptHandle, Props>(
  ({ onChange, onSubmit, disabled = false }, ref) => {
    const host = useRef<HTMLDivElement>(null),
      saved = useRef<Range | null>(null);
    const callbacks = useRef({ onChange, onSubmit, disabled });
    callbacks.current = { onChange, onSubmit, disabled };
    const serialize = (node: Node): string => {
      if (
        node instanceof HTMLElement &&
        node.dataset.mathIsland !== undefined
      ) {
        const field = node.querySelector(
          "math-field",
        ) as MathfieldElement | null;
        return field?.value ? `\\(${field.value}\\)` : "";
      }
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node.nodeName === "BR") return "\n";
      const text = Array.from(node.childNodes).map(serialize).join("");
      return node !== host.current && ["DIV", "P"].includes(node.nodeName)
        ? `${text}\n`
        : text;
    };
    const value = () =>
      host.current
        ? serialize(host.current)
            .replace(/\u200b/g, "")
            .trimEnd()
        : "";
    const notify = () => {
      if (host.current) host.current.dataset.empty = String(!value().trim());
      callbacks.current.onChange(value());
    };
    const remember = () => {
      const selection = window.getSelection();
      if (
        selection?.rangeCount &&
        host.current?.contains(selection.anchorNode) &&
        !selection.anchorNode?.parentElement?.closest("math-field")
      )
        saved.current = selection.getRangeAt(0).cloneRange();
    };
    const rangeForInsert = () => {
      const selection = window.getSelection();
      if (!selection || !host.current) return null;
      let range: Range;
      if (saved.current && host.current.contains(saved.current.startContainer))
        range = saved.current.cloneRange();
      else {
        range = document.createRange();
        range.selectNodeContents(host.current);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
      return range;
    };
    const after = (island: HTMLElement) => {
      const text = document.createTextNode("\u200b");
      island.after(text);
      host.current?.focus();
      const range = document.createRange();
      range.setStart(text, 1);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      saved.current = range.cloneRange();
    };
    const island = (latex: string) => {
      const span = document.createElement("span");
      span.dataset.mathIsland = "";
      span.contentEditable = "false";
      span.className = "math-island";
      const field = new MathfieldElement();
      field.className = "inline-math-field";
      field.mathVirtualKeyboardPolicy = "manual";
      field.smartFence = true;
      field.smartSuperscript = true;
      field.setAttribute("aria-label", "تعبير رياضي قابل للتحرير");
      span.appendChild(field);
      field.value = latex;
      field.addEventListener("input", notify);
      field.addEventListener(
        "keydown",
        (event) => {
          if (event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            after(span);
            insertText(" ");
          } else if (
            event.key === "ArrowRight" &&
            field.position >= field.lastOffset
          ) {
            event.preventDefault();
            after(span);
          }
        },
        true,
      );
      return { span, field };
    };
    const insertMath = (latex: string) => {
      if (!host.current) return;
      const range = rangeForInsert();
      if (!range) return;
      range.deleteContents();
      const { span, field } = island(latex);
      range.insertNode(span);
      after(span);
      field.focus();
      field.setValue("");
      field.insert(latex, {
        selectionMode: /\\placeholder/.test(latex) ? "placeholder" : "after",
      });
      notify();
    };
    const appendFormatted = (
      text: string,
      container: DocumentFragment | HTMLElement,
    ) => {
      const pattern =
        /\\\(([\s\S]*?)\\\)|\$([^$]+)\$|([A-Za-z0-9]+)\^(?:\{([^}]+)\}|\(([^)]+)\)|(-?\d+(?:\.\d+)?|[A-Za-z]))/g;
      let start = 0;
      for (const match of text.matchAll(pattern)) {
        container.appendChild(
          document.createTextNode(text.slice(start, match.index)),
        );
        const latex =
          match[1] ??
          match[2] ??
          `${match[3]}^{${match[4] ?? match[5] ?? match[6]}}`;
        container.appendChild(island(latex).span);
        start = match.index! + match[0].length;
      }
      container.appendChild(document.createTextNode(text.slice(start)));
    };
    const insertText = (text: string) => {
      const range = rangeForInsert();
      if (!range) return;
      range.deleteContents();
      const fragment = document.createDocumentFragment();
      appendFormatted(text, fragment);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        const next = document.createRange();
        next.setStartAfter(last);
        next.collapse(true);
        saved.current = next;
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(next);
      }
      host.current?.focus();
      notify();
    };
    useImperativeHandle(ref, () => ({
      value,
      setValue: (text) => {
        if (!host.current) return;
        host.current.replaceChildren();
        appendFormatted(text, host.current);
        saved.current = null;
        host.current.focus();
        rangeForInsert();
        notify();
      },
      insertText,
      insertMath,
      clear: () => {
        host.current?.replaceChildren();
        saved.current = null;
        notify();
      },
      focus: () => host.current?.focus(),
    }));
    useEffect(() => {
      const element = host.current;
      if (!element) return;
      const key = (event: KeyboardEvent) => {
        if (event.isComposing) return;
        if (
          event.key === "Enter" &&
          event.shiftKey &&
          event.target !== element
        ) {
          event.preventDefault();
          event.stopPropagation();
          const parent = (event.target as HTMLElement).closest(
            "[data-math-island]",
          ) as HTMLElement | null;
          if (parent) {
            after(parent);
            insertText("\n");
          }
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          if (!callbacks.current.disabled) callbacks.current.onSubmit();
          return;
        }
        if (event.key === "^" && event.target === element) {
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
          const prefix = (range.startContainer.textContent ?? "").slice(
            0,
            range.startOffset,
          );
          const base = prefix.match(
            /([A-Za-z][A-Za-z0-9_]*|\d+(?:\.\d+)?|\([^()]*\))$/,
          )?.[0];
          if (base) {
            event.preventDefault();
            range.setStart(
              range.startContainer,
              range.startOffset - base.length,
            );
            saved.current = range.cloneRange();
            insertMath(`${base}^{\\placeholder{}}`);
          }
        }
      };
      const paste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text !== undefined) {
          event.preventDefault();
          remember();
          insertText(text);
        }
      };
      element.addEventListener("keydown", key, true);
      element.addEventListener("paste", paste);
      element.addEventListener("input", notify);
      element.addEventListener("keyup", remember);
      element.addEventListener("mouseup", remember);
      element.addEventListener("blur", remember, true);
      document.addEventListener("selectionchange", remember);
      return () => {
        element.removeEventListener("keydown", key, true);
        element.removeEventListener("paste", paste);
        element.removeEventListener("input", notify);
        element.removeEventListener("keyup", remember);
        element.removeEventListener("mouseup", remember);
        element.removeEventListener("blur", remember, true);
        document.removeEventListener("selectionchange", remember);
      };
    }, []);
    return (
      <div
        ref={host}
        className="smart-prompt"
        role="textbox"
        aria-label="بإمكانك طرح أي سؤال"
        aria-multiline="true"
        aria-placeholder="بإمكانك طرح أي سؤال"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-empty="true"
        data-placeholder="بإمكانك طرح أي سؤال"
        dir="auto"
        spellCheck={false}
      />
    );
  },
);
SmartPrompt.displayName = "SmartPrompt";
