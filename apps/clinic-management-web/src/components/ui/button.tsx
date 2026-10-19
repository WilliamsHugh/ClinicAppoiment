import React, { ButtonHTMLAttributes, forwardRef } from "react";
import styles from "./ui.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, children, className, ...props },
  ref
) {
  const variantClass =
    variant === "secondary"
      ? styles.buttonSecondary
      : variant === "outline"
      ? styles.buttonOutline
      : variant === "danger"
      ? styles.buttonDanger
      : variant === "ghost"
      ? styles.buttonGhost
      : styles.buttonPrimary;

  const sizeClass = size === "sm" ? styles.buttonSm : size === "lg" ? styles.buttonLg : styles.buttonMd;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${styles.button} ${variantClass} ${sizeClass} ${loading ? styles.buttonDisabled : ""} ${
        className || ""
      }`.trim()}
      {...props}
    >
      {loading && <span className={styles.btnSpinner} aria-hidden="true" />}
      {children}
    </button>
  );
});
