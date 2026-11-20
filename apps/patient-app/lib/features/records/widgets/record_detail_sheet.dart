import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../record_models.dart';
import 'prescription_section.dart';

class RecordDetailSheet extends StatelessWidget {
  const RecordDetailSheet({
    required this.record,
    super.key,
  });

  final MedicalRecord record;

  @override
  Widget build(BuildContext context) {
    final isFinal = record.status.toUpperCase() == 'FINAL';
    final isDraft = record.status.toUpperCase() == 'DRAFT';
    final badgeBg = isFinal
        ? ClinicColors.successLight
        : (isDraft ? ClinicColors.warningLight : ClinicColors.surfaceSubtle);
    final badgeFg = isFinal
        ? ClinicColors.successDark
        : (isDraft ? ClinicColors.warningDark : ClinicColors.muted);
    final badgeBorder = isFinal
        ? ClinicColors.success.withValues(alpha: 0.25)
        : (isDraft
            ? ClinicColors.warning.withValues(alpha: 0.25)
            : ClinicColors.border);

    return SafeArea(
      top: false,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.76,
        minChildSize: 0.5,
        maxChildSize: 0.94,
        builder: (_, controller) => Container(
          decoration: const BoxDecoration(
            color: ClinicColors.card,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: SingleChildScrollView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: ClinicColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'Chi tiết kết quả khám',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: ClinicColors.ink,
                          ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: badgeBorder),
                      ),
                      child: Text(
                        record.localizedStatus,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: badgeFg,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: ClinicColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: ClinicColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _MetaLine(
                        icon: Icons.medical_services_outlined,
                        label: 'Bác sĩ phụ trách',
                        value: record.displayDoctorLabel,
                      ),
                      const SizedBox(height: 8),
                      _MetaLine(
                        icon: Icons.schedule_outlined,
                        label: 'Thời gian ghi nhận (giờ VN)',
                        value: record.displayDateTime,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                _ClinicalBlock(
                  label: 'Chẩn đoán',
                  value: record.diagnosis ?? 'Chưa ghi nhận',
                ),
                _ClinicalBlock(
                  label: 'Triệu chứng',
                  value: record.symptoms ?? 'Chưa ghi nhận',
                ),
                _ClinicalBlock(
                  label: 'Phác đồ điều trị',
                  value: record.treatmentPlan ?? 'Chưa ghi nhận',
                ),
                _ClinicalBlock(
                  label: 'Ghi chú bác sĩ',
                  value: record.notes ?? 'Chưa ghi nhận',
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'Đơn thuốc',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: ClinicColors.ink,
                          ),
                    ),
                    if (record.hasPrescription)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: ClinicColors.primarySoft,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${record.prescription.length} loại',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: ClinicColors.primary,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                PrescriptionSection(items: record.prescription),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 16, color: ClinicColors.primary),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: ClinicColors.muted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClinicalBlock extends StatelessWidget {
  const _ClinicalBlock({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final isEmptyFallback = value == 'Chưa ghi nhận';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ClinicColors.scaffold,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ClinicColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: ClinicColors.muted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 14,
                color: isEmptyFallback ? ClinicColors.muted : ClinicColors.ink,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
