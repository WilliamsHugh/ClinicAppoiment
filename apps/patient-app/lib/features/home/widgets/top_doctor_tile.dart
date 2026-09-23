import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class TopDoctorTile extends StatelessWidget {
  const TopDoctorTile({required this.onCall, required this.onTap, super.key});
  final VoidCallback onCall;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 12,
                offset: const Offset(0, 6)),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFFE0E7FF),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child:
                  const Icon(Icons.person, size: 22, color: Color(0xFF6366F1)),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Dr. Alex Johnson',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: ClinicColors.ink)),
                  Text('Cardiologist',
                      style:
                          TextStyle(fontSize: 11, color: ClinicColors.muted)),
                ],
              ),
            ),
            FilledButton.icon(
              onPressed: onCall,
              icon: const Icon(Icons.call, size: 14),
              label: const Text('Call', style: TextStyle(fontSize: 12)),
              style: FilledButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
