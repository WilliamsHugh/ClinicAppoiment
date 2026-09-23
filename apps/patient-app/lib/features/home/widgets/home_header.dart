import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key, this.onNotificationTap});

  final VoidCallback? onNotificationTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFFFFD6C8),
            border: Border.all(color: Colors.white, width: 2),
          ),
          alignment: Alignment.center,
          child: const Text('SJ',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink)),
        ),
        const SizedBox(width: 10),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Sarah Johnson',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: ClinicColors.ink)),
              Text('Good Morning',
                  style: TextStyle(
                      fontSize: 11,
                      color: ClinicColors.muted,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        GestureDetector(
          onTap: onNotificationTap,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                )
              ],
            ),
            child: const Icon(Icons.notifications_none_rounded,
                size: 18, color: ClinicColors.ink),
          ),
        ),
      ],
    );
  }
}
