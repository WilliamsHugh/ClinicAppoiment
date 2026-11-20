import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class ProfileInfoItem {
  const ProfileInfoItem({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;
}

class ProfileInfoSection extends StatelessWidget {
  const ProfileInfoSection({
    required this.title,
    required this.icon,
    required this.items,
    this.footer,
    super.key,
  });

  final String title;
  final IconData icon;
  final List<ProfileInfoItem> items;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: ClinicColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  softWrap: true,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 20, thickness: 0.8, color: ClinicColors.border),
          for (final item in items) _ProfileInfoRow(item: item),
          if (footer != null) ...[
            const SizedBox(height: 12),
            footer!,
          ],
        ],
      ),
    );
  }
}

class _ProfileInfoRow extends StatelessWidget {
  const _ProfileInfoRow({required this.item});

  final ProfileInfoItem item;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final labelWidget = Text(
      item.label,
      style: const TextStyle(fontSize: 13, color: ClinicColors.muted),
    );
    final valueWidget = Text(
      item.value,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: ClinicColors.ink,
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (textScale >= 1.3 || constraints.maxWidth < 260) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                labelWidget,
                const SizedBox(height: 2),
                valueWidget,
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 2, child: labelWidget),
              const SizedBox(width: 12),
              Expanded(flex: 3, child: valueWidget),
            ],
          );
        },
      ),
    );
  }
}
