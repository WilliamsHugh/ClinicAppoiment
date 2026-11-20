import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class ReminderBanner extends StatelessWidget {
  const ReminderBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ClinicColors.primarySoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ClinicColors.border),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 1),
            child: Icon(
              Icons.notifications_active_outlined,
              size: 18,
              color: ClinicColors.primary,
            ),
          ),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Nhắc lịch tự động: 24 giờ trước giờ hẹn ngay trong ứng dụng cho các lịch hẹn đã xác nhận.',
              softWrap: true,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                color: ClinicColors.ink,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
