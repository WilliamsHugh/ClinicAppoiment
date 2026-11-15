import React from "react";
import { TextInput } from "../../components/ui/input";
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
  readOnly?: boolean;
  errors?: Record<number, PrescriptionItemErrors>;
}

export function PrescriptionForm({
  items,
  onChange,
  disabled = false,
  readOnly = false,
  errors = {},
}: PrescriptionFormProps) {
  const isLocked = disabled || readOnly;

  const handleItemChange = (
    index: number,
    field: keyof PrescriptionItem,
    value: string
  ) => {
    if (isLocked) return;
    const updated = items.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange(updated);
  };

  const handleAddRow = () => {
    if (isLocked) return;
    onChange([
      ...items,
      { medicineName: "", dosage: "", frequency: "", duration: "" },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (isLocked) return;
    const updated = items.filter((_, idx) => idx !== index);
    onChange(
      updated.length > 0
        ? updated
        : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
    );
  };

  const filledItems = readOnly
    ? items.filter((p) => p.medicineName.trim() !== "")
    : items;

  return (
    <section className={styles.prescriptionSection} aria-labelledby="prescription-heading">
      <div className={styles.prescriptionHeader}>
        <div>
          <h3 id="prescription-heading" className={styles.prescriptionTitle}>
            Kê đơn thuốc {readOnly && "(Chỉ đọc)"}
          </h3>
          <p className={styles.fieldHelp}>
            {readOnly
              ? "Danh mục thuốc và liều dùng đã được bác sĩ chốt theo bệnh án"
              : "Nhập danh mục thuốc, liều dùng, tần suất và thời gian điều trị cho bệnh nhân"}
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddRow}
            disabled={disabled}
          >
            + Thêm thuốc
          </Button>
        )}
      </div>

      {readOnly && filledItems.length === 0 ? (
        <p className={styles.fieldHelp}>
          Không có đơn thuốc chỉ định cho ca khám này.
        </p>
      ) : (
        <div className={styles.prescriptionRows}>
          {filledItems.map((item, idx) => {
            const rowErrors = errors[idx] || {};
            return (
              <div key={idx} className={styles.prescriptionRow}>
                <div
                  className={styles.prescriptionInputs}
                >
                  <div>
                    <TextInput
                      id={`prescription-medicineName-${idx}`}
                      label="Tên thuốc"
                      error={readOnly ? undefined : rowErrors.medicineName}
                      type="text"
                      className={`${styles.prescriptionInput} ${
                        rowErrors.medicineName ? styles.inputError : ""
                      }`.trim()}
                      placeholder="Tên thuốc (ví dụ: Paracetamol 500mg)"
                      value={item.medicineName}
                      disabled={disabled}
                      readOnly={readOnly}
                      aria-label={`Tên thuốc hàng ${idx + 1}`}
                      aria-invalid={Boolean(rowErrors.medicineName)}
                      onChange={(e) =>
                        handleItemChange(idx, "medicineName", e.target.value)
                      }
                    />

                  </div>

                  <div>
                    <TextInput
                      id={`prescription-dosage-${idx}`}
                      label="Liều lượng"
                      error={readOnly ? undefined : rowErrors.dosage}
                      type="text"
                      className={`${styles.prescriptionInput} ${
                        rowErrors.dosage ? styles.inputError : ""
                      }`.trim()}
                      placeholder="Liều lượng (1 viên)"
                      value={item.dosage}
                      disabled={disabled}
                      readOnly={readOnly}
                      aria-label={`Liều dùng hàng ${idx + 1}`}
                      aria-invalid={Boolean(rowErrors.dosage)}
                      onChange={(e) =>
                        handleItemChange(idx, "dosage", e.target.value)
                      }
                    />

                  </div>

                  <div>
                    <TextInput
                      id={`prescription-frequency-${idx}`}
                      label="Tần suất"
                      error={readOnly ? undefined : rowErrors.frequency}
                      type="text"
                      className={`${styles.prescriptionInput} ${
                        rowErrors.frequency ? styles.inputError : ""
                      }`.trim()}
                      placeholder="Tần suất (2 lần/ngày)"
                      value={item.frequency}
                      disabled={disabled}
                      readOnly={readOnly}
                      aria-label={`Tần suất dùng hàng ${idx + 1}`}
                      aria-invalid={Boolean(rowErrors.frequency)}
                      onChange={(e) =>
                        handleItemChange(idx, "frequency", e.target.value)
                      }
                    />

                  </div>

                  <div>
                    <TextInput
                      id={`prescription-duration-${idx}`}
                      label="Thời gian"
                      error={readOnly ? undefined : rowErrors.duration}
                      type="text"
                      className={`${styles.prescriptionInput} ${
                        rowErrors.duration ? styles.inputError : ""
                      }`.trim()}
                      placeholder="Thời gian (5 ngày)"
                      value={item.duration}
                      disabled={disabled}
                      readOnly={readOnly}
                      aria-label={`Thời gian dùng hàng ${idx + 1}`}
                      aria-invalid={Boolean(rowErrors.duration)}
                      onChange={(e) =>
                        handleItemChange(idx, "duration", e.target.value)
                      }
                    />

                  </div>

                  {!readOnly && (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
