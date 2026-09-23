import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class PrescriptionSection extends StatelessWidget {
  const PrescriptionSection({required this.prescription, super.key});
  final dynamic prescription;

  @override
  Widget build(BuildContext context) {
    if (prescription == null || (prescription as List).isEmpty) {
      return const Text('Không có đơn thuốc.', style: TextStyle(color: ClinicColors.muted, fontSize: 12));
    }
    return Column(
      children: (prescription as List).map((p) {
        final m = p as Map<String, dynamic>;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: ClinicColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.medication_outlined, size: 18, color: ClinicColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m['medicineName'].toString(),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ClinicColors.ink)),
                    Text('Liều: ${m['dosage']} • Tần suất: ${m['frequency']} • Thời gian: ${m['duration']}',
                        style: const TextStyle(fontSize: 11, color: ClinicColors.muted)),
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
