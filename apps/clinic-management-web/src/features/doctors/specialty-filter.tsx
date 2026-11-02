import React from "react";
import type { Specialty } from "./doctor-api";

export interface SpecialtyFilterProps {
  specialties: Specialty[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SpecialtyFilter({
  specialties,
  value,
  onChange,
  disabled = false,
}: SpecialtyFilterProps) {
  return (
    <label>
      Chuyên khoa
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Tất cả</option>
        {specialties
          .filter((item) => item.isActive)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
    </label>
  );
}
