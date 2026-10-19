import React from "react";
import styles from "./ui.module.css";

export interface SkeletonProps {
  height?: string | number;
  width?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ height = 20, width = "100%", borderRadius, className }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className || ""}`.trim()}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        borderRadius: borderRadius || undefined,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div role="region" aria-label="Đang tải bảng dữ liệu" aria-busy="true">
      <table className={styles.skeletonTable}>
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, c) => (
              <th key={c}>
                <Skeleton height={18} width="70%" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
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
