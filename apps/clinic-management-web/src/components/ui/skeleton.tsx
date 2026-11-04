import React from "react";
import styles from "./ui.module.css";

export interface SkeletonProps {
  height?: string | number;
  width?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ height = 20, width = "100%", borderRadius, className, style }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className || ""}`.trim()}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        borderRadius: borderRadius || undefined,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  columns?: number;
  className?: string;
  headers?: string[];
}

export function SkeletonTable({ rows = 5, cols, columns = 4, className, headers }: SkeletonTableProps) {
  const colCount = headers ? headers.length : (cols ?? columns);
  return (
    <div role="region" aria-label="Đang tải bảng dữ liệu" aria-busy="true" className={className}>
      <table className={styles.skeletonTable}>
        <thead>
          <tr>
            {headers
              ? headers.map((headerText, i) => (
                  <th key={i} style={{ color: "var(--muted)", fontWeight: 600, fontSize: "0.8125rem", textAlign: "left" }}>
                    {headerText}
                  </th>
                ))
              : Array.from({ length: colCount }).map((_, c) => (
                  <th key={c}>
                    <Skeleton height={18} width="70%" />
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: colCount }).map((_, c) => (
                <td key={c}>
                  <Skeleton height={16} width={c === 0 ? "85%" : "60%"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`${styles.skeletonCard} ${className || ""}`.trim()} aria-hidden="true">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Skeleton width={44} height={44} borderRadius="50%" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} width="40%" />
        </div>
      </div>
      <Skeleton height={14} width="90%" style={{ marginTop: 8 }} />
      <Skeleton height={14} width="75%" />
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton height={20} width={80} borderRadius="var(--radius-sm)" />
        <Skeleton height={28} width={90} borderRadius="var(--radius-md)" />
      </div>
    </div>
  );
}

export function SkeletonList({ items = 4, className }: { items?: number; className?: string }) {
  return (
    <div className={`${styles.skeletonList} ${className || ""}`.trim()} aria-hidden="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className={styles.skeletonCard} style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton height={18} width="35%" />
            <Skeleton height={18} width={70} borderRadius="var(--radius-full)" />
          </div>
          <Skeleton height={14} width="65%" style={{ marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({
  title = true,
  tableRows = 6,
  tableCols = 5,
}: {
  title?: boolean;
  tableRows?: number;
  tableCols?: number;
}) {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      {title && (
        <header className="page-heading">
          <Skeleton height={14} width={100} style={{ marginBottom: 6 }} />
          <Skeleton height={28} width={260} style={{ marginBottom: 8 }} />
          <Skeleton height={16} width="50%" />
        </header>
      )}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          marginTop: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
          <Skeleton height={36} width={280} borderRadius="var(--radius-md)" />
          <div style={{ display: "flex", gap: 10 }}>
            <Skeleton height={36} width={110} borderRadius="var(--radius-md)" />
            <Skeleton height={36} width={110} borderRadius="var(--radius-md)" />
          </div>
        </div>
        <SkeletonTable rows={tableRows} cols={tableCols} />
      </div>
    </div>
  );
}
