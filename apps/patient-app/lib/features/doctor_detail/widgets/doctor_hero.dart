import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class DoctorHero extends StatelessWidget {
  const DoctorHero({super.key, this.onBack, this.onVideoTap});
  final VoidCallback? onBack;
  final VoidCallback? onVideoTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 300,
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xFFD6E4FF),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: 20,
            left: 20,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                color: const Color(0xFFBFD0FF).withOpacity(0.5),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            top: 24,
            child: Container(
              width: 210,
              color: const Color(0xFFE8EDFF),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    width: 160,
                    height: 200,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFD6C8),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    alignment: Alignment.center,
                    child: const Icon(Icons.person,
                        size: 80, color: Color(0xFF8B5A3C)),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            top: 10,
            left: 14,
            child: _CircleIcon(
                icon: Icons.arrow_back,
                onTap: onBack ?? () => Navigator.of(context).maybePop()),
          ),
          Positioned(
            top: 10,
            right: 14,
            child: _CircleIcon(
                icon: Icons.videocam_outlined,
                onTap: onVideoTap ?? () {}),
          ),
          const Positioned(
            left: 18,
            bottom: 56,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
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
                SizedBox(height: 6),
                Text('Sarah\nJohnson',
                    style: TextStyle(
                        fontSize: 20,
                        height: 1.05,
                        fontWeight: FontWeight.w800,
                        color: ClinicColors.ink)),
                SizedBox(height: 6),
                Text('MBBS, MD\nMedicine Specialist',
                    style: TextStyle(
                        fontSize: 9,
                        height: 1.25,
                        color: ClinicColors.muted,
                        fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleIcon extends StatelessWidget {
  const _CircleIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 10,
                offset: const Offset(0, 4)),
          ],
        ),
        child: Icon(icon, size: 18, color: ClinicColors.ink),
      ),
    );
  }
}
