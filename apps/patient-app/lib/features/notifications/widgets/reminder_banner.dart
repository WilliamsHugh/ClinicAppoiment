import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class ReminderBanner extends StatelessWidget {
  const ReminderBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFEFF6FF), Color(0xFFFFF7ED)]),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ClinicColors.border),
      ),
      child: const Row(
        children: [
          Icon(Icons.alarm, size: 16, color: ClinicColors.primary),
          SizedBox(width: 8),
          Expanded(
            child: Text('Nhắc lịch tự động: 24h và 1h trước giờ hẹn qua push notification',
                style: TextStyle(fontSize: 11, color: ClinicColors.muted, height: 1.35)),
          ),
        ],
      ),
    );
  }
}
