import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class AvailableDoctorCard extends StatelessWidget {
  const AvailableDoctorCard({required this.onTap, super.key});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 240,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 16,
                offset: const Offset(0, 8)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFEAD8),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(Icons.person,
                      size: 20, color: Color(0xFF9A6A3A)),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Dr. Sarah Smith',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: ClinicColors.ink)),
                      Text('Gynecologist',
                          style: TextStyle(
                              fontSize: 10, color: ClinicColors.muted)),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.star, size: 10, color: ClinicColors.ink),
                      SizedBox(width: 3),
                      Text('4.9',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: ClinicColors.ink)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('\$300',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: ClinicColors.ink)),
                    Text('Per Session',
                        style:
                            TextStyle(fontSize: 10, color: ClinicColors.muted)),
                  ],
                ),
                const Spacer(),
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    shape: BoxShape.circle,
                    border: Border.all(color: ClinicColors.border),
                  ),
                  child: const Icon(Icons.favorite_border,
                      size: 14, color: ClinicColors.ink),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF8FAFC),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.arrow_outward,
                      size: 14, color: ClinicColors.ink),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _ActionPill(
                    icon: Icons.chat_bubble_outline,
                    label: 'Massage',
                    onTap: () {}),
                const SizedBox(width: 8),
                _ActionPill(
                    icon: Icons.videocam_outlined,
                    label: 'Video Call',
                    onTap: () {}),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class AvailableDoctorCardCompact extends StatelessWidget {
  const AvailableDoctorCardCompact({required this.index, super.key});
  final int index;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.72),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFFE0E7FF),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.person, size: 18, color: Color(0xFF4F46E5)),
          ),
          const Spacer(),
          const Text('Dr. Emily',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink)),
          const Text('Cardiologist',
              style: TextStyle(fontSize: 10, color: ClinicColors.muted)),
        ],
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: ClinicColors.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 12, color: ClinicColors.ink),
              const SizedBox(width: 6),
              Text(label,
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: ClinicColors.ink)),
            ],
          ),
        ),
      ),
    );
  }
}
