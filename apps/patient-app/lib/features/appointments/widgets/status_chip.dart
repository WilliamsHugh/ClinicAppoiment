import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({required this.status, super.key});
  final String status;

  Color get bg {
    switch (status) {
      case 'PENDING':
        return const Color(0xFFFFF7ED);
      case 'CONFIRMED':
        return const Color(0xFFEFF6FF);
      case 'COMPLETED':
        return const Color(0xFFECFDF5);
      case 'CANCELLED':
        return const Color(0xFFFEF2F2);
      default:
        return const Color(0xFFF1F5F9);
    }
  }

  Color get fg {
    switch (status) {
      case 'PENDING':
        return const Color(0xFFF59E0B);
      case 'CONFIRMED':
        return ClinicColors.primary;
      case 'COMPLETED':
        return const Color(0xFF059669);
      case 'CANCELLED':
        return const Color(0xFFDC2626);
      default:
        return ClinicColors.muted;
    }
  }

  String get label {
    switch (status) {
      case 'PENDING':
        return 'Chờ xác nhận';
      case 'CONFIRMED':
        return 'Đã xác nhận';
      case 'COMPLETED':
        return 'Hoàn thành';
      case 'CANCELLED':
        return 'Đã hủy';
      case 'CHECKED_IN':
        return 'Đã check-in';
      case 'NO_SHOW':
        return 'Vắng mặt';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style:
              TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}
