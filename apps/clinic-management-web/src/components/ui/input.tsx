import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { label, error, hint, id, className, style, ...props },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

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
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          outline: "none",
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
  { label, error, id, children, style, ...props },
  ref
) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

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
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 500 }}>
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
  { label, error, id, style, ...props },
  ref
) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

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
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          border: error ? "1px solid var(--danger)" : "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.875rem",
          fontFamily: "inherit",
          outline: "none",
          minHeight: 80,
          width: "100%",
          boxSizing: "border-box",
          ...style,
        }}
        {...props}
      />
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
});
