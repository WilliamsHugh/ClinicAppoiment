import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import 'prescription_section.dart';

class RecordDetailSheet extends StatelessWidget {
  const RecordDetailSheet({required this.record, super.key});
  final Map<String, dynamic> record;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      builder: (_, controller) => Container(
        decoration: const BoxDecoration(
          color: ClinicColors.scaffold,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ClinicColors.border, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 16),
              Text('Chi tiết kết quả khám', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              _Row(label: 'Chẩn đoán', value: record['diagnosis']?.toString() ?? '—'),
              _Row(label: 'Triệu chứng', value: record['symptoms']?.toString() ?? '—'),
              _Row(label: 'Ghi chú', value: record['notes']?.toString() ?? '—'),
              _Row(label: 'Điều trị', value: record['treatmentPlan']?.toString() ?? '—'),
              const SizedBox(height: 12),
              Text('Đơn thuốc', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              PrescriptionSection(prescription: record['prescription']),
              const SizedBox(height: 12),
              Text('ID lịch hẹn: ${record['appointmentId']}',
                  style: const TextStyle(color: ClinicColors.mutedLight, fontSize: 11)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: ClinicColors.muted, fontSize: 11)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 13, color: ClinicColors.ink)),
          ],
        ),
      ),
    );
  }
}
