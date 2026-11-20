import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../record_models.dart';

class PrescriptionSection extends StatelessWidget {
  const PrescriptionSection({
    required this.items,
    super.key,
  });

  final List<PrescriptionItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ClinicColors.surfaceSubtle,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ClinicColors.border),
        ),
        child: const Row(
          children: [
            Icon(
              Icons.medication_outlined,
              size: 18,
              color: ClinicColors.muted,
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Không có đơn thuốc.',
                style: TextStyle(
                  color: ClinicColors.muted,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _PrescriptionItemCard(item: items[i]),
        ],
      ],
    );
  }
}

class _PrescriptionItemCard extends StatelessWidget {
  const _PrescriptionItemCard({required this.item});

  final PrescriptionItem item;

  @override
  Widget build(BuildContext context) {
    final medicineName = item.medicineName.isNotEmpty
        ? item.medicineName
        : 'Thuốc chưa rõ tên';
    final dosage = item.dosage.isNotEmpty ? item.dosage : 'Chưa ghi nhận';
    final frequency =
        item.frequency.isNotEmpty ? item.frequency : 'Chưa ghi nhận';
    final duration =
        item.duration.isNotEmpty ? item.duration : 'Chưa ghi nhận';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ClinicColors.scaffold,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: ClinicColors.primarySoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.medication_outlined,
                  size: 18,
                  color: ClinicColors.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  medicineName,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _DetailTag(label: 'Liều dùng', value: dosage),
              _DetailTag(label: 'Tần suất', value: frequency),
              _DetailTag(label: 'Thời gian', value: duration),
            ],
          ),
        ],
      ),
    );
  }
}

class _DetailTag extends StatelessWidget {
  const _DetailTag({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ClinicColors.muted,
              ),
            ),
            TextSpan(
              text: value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ClinicColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
