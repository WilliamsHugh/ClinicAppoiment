import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../record_models.dart';

class RecordCard extends StatelessWidget {
  const RecordCard({
    required this.record,
    required this.onTap,
    super.key,
  });

  final MedicalRecord record;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasPrescription = record.hasPrescription;
    final statusStyle = _statusStyle(record.status);

    return Semantics(
      button: true,
      label:
          '${record.displayTitle}, ${record.localizedStatus}, ${record.displayDoctorLabel}, ngày ${record.displayDate}',
      child: Material(
        color: ClinicColors.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: ClinicColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: ClinicColors.primarySoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.description_outlined,
                      size: 20,
                      color: ClinicColors.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              record.displayTitle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: ClinicColors.ink,
                                height: 1.3,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: statusStyle.background,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: statusStyle.border),
                              ),
                              child: Text(
                                record.localizedStatus,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: statusStyle.foreground,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 2),
                              child: Icon(
                                Icons.medical_services_outlined,
                                size: 15,
                                color: ClinicColors.muted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                record.displayDoctorLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: ClinicColors.ink,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 2),
                              child: Icon(
                                Icons.calendar_today_outlined,
                                size: 14,
                                color: ClinicColors.muted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Ngày khám: ${record.displayDate}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: ClinicColors.muted,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (record.symptoms != null &&
                            record.symptoms!.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Triệu chứng: ${record.symptoms!}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: ClinicColors.muted,
                              height: 1.35,
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: hasPrescription
                                        ? ClinicColors.primarySoft
                                        : ClinicColors.surfaceSubtle,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    hasPrescription
                                        ? 'Đơn thuốc: ${record.prescription.length} loại'
                                        : 'Không có đơn thuốc',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: hasPrescription
                                          ? ClinicColors.primary
                                          : ClinicColors.muted,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.chevron_right,
                              size: 20,
                              color: ClinicColors.mutedLight,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  _StatusBadgeStyle _statusStyle(String status) {
    switch (status.toUpperCase()) {
      case 'FINAL':
        return _StatusBadgeStyle(
          background: ClinicColors.successLight,
          foreground: ClinicColors.successDark,
          border: ClinicColors.success.withValues(alpha: 0.25),
        );
      case 'DRAFT':
        return _StatusBadgeStyle(
          background: ClinicColors.warningLight,
          foreground: ClinicColors.warningDark,
          border: ClinicColors.warning.withValues(alpha: 0.25),
        );
      default:
        return const _StatusBadgeStyle(
          background: ClinicColors.surfaceSubtle,
          foreground: ClinicColors.muted,
          border: ClinicColors.border,
        );
    }
  }
}

class _StatusBadgeStyle {
  const _StatusBadgeStyle({
    required this.background,
    required this.foreground,
    required this.border,
  });

  final Color background;
  final Color foreground;
  final Color border;
}
