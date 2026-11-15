import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, useId } from "react";
import styles from "./ui.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { label, error, hint, id, className, style, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${styles.fieldControl} ${className || ""}`.trim()}
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          width: "100%",
          boxSizing: "border-box",
          ...style,
        }}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
});

export const Input = TextInput;

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, children, className, style, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id || generatedId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`${styles.fieldControl} ${className || ""}`.trim()}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : undefined}
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          width: "100%",
          boxSizing: "border-box",
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span id={`${selectId}-error`} role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, id, className, style, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {label && (
        <label
          htmlFor={textareaId}
          style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={`${styles.fieldControl} ${className || ""}`.trim()}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          minHeight: 80,
          width: "100%",
          boxSizing: "border-box",
          ...style,
        }}
        {...props}
      />
      {error && (
        <span id={`${textareaId}-error`} role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
});
