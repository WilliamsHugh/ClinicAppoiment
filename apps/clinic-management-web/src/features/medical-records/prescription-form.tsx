import React from "react";
import { Button } from "../../components/ui/button";
import styles from "./medical-records-panel.module.css";

export interface PrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface PrescriptionItemErrors {
  medicineName?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
}

export interface PrescriptionFormProps {
  items: PrescriptionItem[];
  onChange: (items: PrescriptionItem[]) => void;
  disabled?: boolean;
  errors?: Record<number, PrescriptionItemErrors>;
}

export function PrescriptionForm({
  items,
  onChange,
  disabled = false,
  errors = {},
}: PrescriptionFormProps) {
  const handleItemChange = (
    index: number,
    field: keyof PrescriptionItem,
    value: string
  ) => {
    const updated = items.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange(updated);
  };

  const handleAddRow = () => {
    onChange([
      ...items,
      { medicineName: "", dosage: "", frequency: "", duration: "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    onChange(
      updated.length > 0
        ? updated
        : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
    );
  };

  return (
    <section className={styles.prescriptionSection} aria-labelledby="prescription-heading">
      <div className={styles.prescriptionHeader}>
        <div>
          <h3 id="prescription-heading" className={styles.prescriptionTitle}>
            Kê đơn thuốc
          </h3>
          <p className={styles.fieldHelp}>
            Nhập danh mục thuốc, liều dùng, tần suất và thời gian điều trị cho bệnh nhân
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAddRow}
          disabled={disabled}
        >
          + Thêm thuốc
        </Button>
      </div>

      <div className={styles.prescriptionRows}>
        {items.map((item, idx) => {
          const rowErrors = errors[idx] || {};
          return (
            <div key={idx} className={styles.prescriptionRow}>
              <div className={styles.prescriptionInputs}>
                <div>
                  <input
                    type="text"
                    className={`${styles.prescriptionInput} ${
                      rowErrors.medicineName ? styles.inputError : ""
                    }`.trim()}
                    placeholder="Tên thuốc (ví dụ: Paracetamol 500mg)"
                    value={item.medicineName}
                    disabled={disabled}
                    aria-label={`Tên thuốc hàng ${idx + 1}`}
                    aria-invalid={Boolean(rowErrors.medicineName)}
                    onChange={(e) =>
                      handleItemChange(idx, "medicineName", e.target.value)
                    }
                  />
                  {rowErrors.medicineName && (
                    <span className={styles.fieldError} role="alert">
                      {rowErrors.medicineName}
                    </span>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    className={`${styles.prescriptionInput} ${
                      rowErrors.dosage ? styles.inputError : ""
                    }`.trim()}
                    placeholder="Liều lượng (1 viên)"
                    value={item.dosage}
                    disabled={disabled}
                    aria-label={`Liều dùng hàng ${idx + 1}`}
                    aria-invalid={Boolean(rowErrors.dosage)}
                    onChange={(e) =>
                      handleItemChange(idx, "dosage", e.target.value)
                    }
                  />
                  {rowErrors.dosage && (
                    <span className={styles.fieldError} role="alert">
                      {rowErrors.dosage}
                    </span>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    className={`${styles.prescriptionInput} ${
                      rowErrors.frequency ? styles.inputError : ""
                    }`.trim()}
                    placeholder="Tần suất (2 lần/ngày)"
                    value={item.frequency}
                    disabled={disabled}
                    aria-label={`Tần suất dùng hàng ${idx + 1}`}
                    aria-invalid={Boolean(rowErrors.frequency)}
                    onChange={(e) =>
                      handleItemChange(idx, "frequency", e.target.value)
                    }
                  />
                  {rowErrors.frequency && (
                    <span className={styles.fieldError} role="alert">
                      {rowErrors.frequency}
                    </span>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    className={`${styles.prescriptionInput} ${
                      rowErrors.duration ? styles.inputError : ""
                    }`.trim()}
                    placeholder="Thời gian (5 ngày)"
                    value={item.duration}
                    disabled={disabled}
                    aria-label={`Thời gian dùng hàng ${idx + 1}`}
                    aria-invalid={Boolean(rowErrors.duration)}
                    onChange={(e) =>
                      handleItemChange(idx, "duration", e.target.value)
                    }
                  />
                  {rowErrors.duration && (
                    <span className={styles.fieldError} role="alert">
                      {rowErrors.duration}
                    </span>
                  )}
                </div>

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    aria-label={`Xóa thuốc ${
                      item.medicineName.trim() || `hàng ${idx + 1}`
                    }`}
                    onClick={() => handleRemoveRow(idx)}
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
