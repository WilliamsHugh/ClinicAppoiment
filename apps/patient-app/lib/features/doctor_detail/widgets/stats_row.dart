import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class StatsRow extends StatelessWidget {
  const StatsRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 12,
              offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          _Stat(icon: Icons.access_time, title: '10 Years', subtitle: 'Experience'),
          _DividerVertical(),
          _Stat(icon: Icons.groups_outlined, title: '4.5k+', subtitle: 'Patients'),
          _DividerVertical(),
          _Stat(icon: Icons.star_border, title: '2.9k+', subtitle: 'Reviews'),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              shape: BoxShape.circle,
              border: Border.all(color: ClinicColors.border),
            ),
            child: Icon(icon, size: 14, color: ClinicColors.ink),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: ClinicColors.ink)),
              Text(subtitle,
                  style: const TextStyle(
                      fontSize: 10,
                      color: ClinicColors.muted,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }
}

class _DividerVertical extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 32,
      color: ClinicColors.border,
      margin: const EdgeInsets.symmetric(horizontal: 6),
    );
  }
}
