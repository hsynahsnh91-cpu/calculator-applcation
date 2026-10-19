import type { ReactNode } from "react";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  let action: ReactNode = null;
  if (actionLabel && onAction) {
    action = (
      <Button type="button" onClick={onAction}>
        {actionLabel}
      </Button>
    );
  }
  return (
    <div className="ui-root ui-empty" role="status">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
