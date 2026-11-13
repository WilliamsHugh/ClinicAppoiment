import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { Badge } from "../../components/ui";
import { resolveServiceStatus } from "./health";

export interface ServiceStatusBadgeProps {
  rawStatus?: string;
  size?: "sm" | "md";
}

export function ServiceStatusBadge({ rawStatus, size = "md" }: ServiceStatusBadgeProps) {
  const { category, label } = resolveServiceStatus(rawStatus);

  if (category === "healthy") {
    return (
      <Badge variant="success" size={size}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={size === "sm" ? 11 : 13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{label}</span>
        </span>
      </Badge>
    );
  }

  if (category === "degraded") {
    return (
      <Badge variant="warning" size={size}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={size === "sm" ? 11 : 13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{label}</span>
        </span>
      </Badge>
    );
  }

  if (category === "down") {
    return (
      <Badge variant="danger" size={size}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <XCircle size={size === "sm" ? 11 : 13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{label}</span>
        </span>
      </Badge>
    );
  }

  return (
    <Badge variant="neutral" size={size}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <HelpCircle size={size === "sm" ? 11 : 13} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span>{label}</span>
      </span>
    </Badge>
  );
}
