import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Semantic status badge for appointments matching Health&Human Design Contract.
class AppointmentStatusChip extends StatelessWidget {
  const AppointmentStatusChip({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, bgColor, textColor, borderColor) = switch (status.toUpperCase()) {
      'PENDING' => (
          'Chờ xác nhận',
          ClinicColors.warningLight,
          ClinicColors.warningDark,
          ClinicColors.warning.withValues(alpha: 0.4),
        ),
      'CONFIRMED' => (
          'Đã xác nhận',
          ClinicColors.infoLight,
          ClinicColors.infoDark,
          ClinicColors.info.withValues(alpha: 0.4),
        ),
      'CHECKED_IN' => (
          'Đã tiếp đón',
          const Color(0xFFEFF6FF),
          const Color(0xFF1D4ED8),
          const Color(0xFF93C5FD),
        ),
      'COMPLETED' => (
          'Hoàn thành',
          ClinicColors.successLight,
          ClinicColors.successDark,
          ClinicColors.success.withValues(alpha: 0.4),
        ),
      'CANCELLED' => (
          'Đã hủy',
          ClinicColors.dangerLight,
          ClinicColors.dangerDark,
          ClinicColors.danger.withValues(alpha: 0.4),
        ),
      'NO_SHOW' => (
          'Không đến',
          const Color(0xFFF1F5F9),
          const Color(0xFF475569),
          ClinicColors.border,
        ),
      _ => (
          status,
          const Color(0xFFF1F5F9),
          ClinicColors.ink,
          ClinicColors.border,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
