import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useModalAccessibility } from "./GuideModal";
export function ToolModal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const ref = useModalAccessibility(true, onClose);
  return (
    <div className="chat-modal-layer" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`chat-modal ${wide ? "chat-modal-wide" : ""} ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            onClick={onClose}
            aria-label={`إغلاق ${title}`}
            className="icon-button"
          >
            <X size={19} />
          </button>
        </div>
        <div className="chat-modal-body">{children}</div>
      </div>
    </div>
  );
}
