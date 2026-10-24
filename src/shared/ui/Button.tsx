import type { ButtonHTMLAttributes } from "react";
import s from "./Button.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "default" | "primary" | "ghost";
  readonly size?: "md" | "sm";
}

export function Button({ variant = "default", size = "md", className, type = "button", ...rest }: Props) {
  const classes = [s.button, variant !== "default" && s[variant], size === "sm" && s.small, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
