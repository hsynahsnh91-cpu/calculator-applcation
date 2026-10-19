import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  const classes = ["ui-btn", `ui-btn-${variant}`, size === "sm" ? "ui-btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
