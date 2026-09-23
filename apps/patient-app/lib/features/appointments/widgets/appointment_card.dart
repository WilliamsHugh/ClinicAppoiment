import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import 'status_chip.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({
    required this.data,
    required this.onCancel,
    required this.onReschedule,
    super.key,
  });
  final Map<String, dynamic> data;
  final VoidCallback onCancel;
  final VoidCallback onReschedule;

  String _fmt(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} • ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = data['status'].toString();
    final canCancel = status == 'PENDING' || status == 'CONFIRMED';
    final canReschedule = status == 'PENDING' || status == 'CONFIRMED';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 12, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: const Color(0xFFE0E7FF),
                    borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.person, size: 18, color: Color(0xFF6366F1)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(data['doctorName'].toString(),
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: ClinicColors.ink)),
                    Text(data['specialty'].toString(),
                        style: const TextStyle(fontSize: 11, color: ClinicColors.muted)),
                  ],
                ),
              ),
              StatusChip(status: status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.calendar_month_outlined, size: 14, color: ClinicColors.muted),
              const SizedBox(width: 6),
              Text(_fmt(data['scheduledStartAt'].toString()),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ClinicColors.ink)),
              const SizedBox(width: 12),
              const Icon(Icons.access_time, size: 14, color: ClinicColors.muted),
              const SizedBox(width: 6),
              Text(_fmt(data['scheduledEndAt'].toString()).split('•').last.trim(),
                  style: const TextStyle(fontSize: 12, color: ClinicColors.muted)),
            ],
          ),
          if (data['reason'] != null) ...[
            const SizedBox(height: 6),
            Text('Lý do: ${data['reason']}',
                style: const TextStyle(fontSize: 11, color: ClinicColors.muted)),
          ],
          if (canCancel || canReschedule) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (canReschedule)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onReschedule,
                      icon: const Icon(Icons.edit_calendar, size: 14),
                      label: const Text('Đổi lịch', style: TextStyle(fontSize: 12)),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                if (canReschedule && canCancel) const SizedBox(width: 8),
                if (canCancel)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onCancel,
                      icon: const Icon(Icons.close, size: 14, color: Color(0xFFDC2626)),
                      label: const Text('Hủy', style: TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        side: const BorderSide(color: Color(0xFFFECACA)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
