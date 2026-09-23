import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class CategoryChip extends StatelessWidget {
  const CategoryChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    super.key,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? ClinicColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? ClinicColors.primary : ClinicColors.border),
          boxShadow: selected
              ? [
                  BoxShadow(
                      color: ClinicColors.primary.withOpacity(0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4))
                ]
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: selected ? Colors.white : const Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: Icon(icon,
                  size: 14,
                  color:
                      selected ? ClinicColors.primary : ClinicColors.muted),
            ),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : ClinicColors.ink)),
            const SizedBox(width: 10),
            if (!selected)
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  shape: BoxShape.circle,
                  border: Border.all(color: ClinicColors.border),
                ),
                child: const Icon(Icons.access_time,
                    size: 10, color: ClinicColors.muted),
              ),
          ],
        ),
      ),
    );
  }
}
