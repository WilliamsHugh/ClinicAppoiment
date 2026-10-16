import 'package:flutter/material.dart';

import '../appointment_models.dart';
import 'status_chip.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard(
      {required this.appointment,
      required this.onCancel,
      required this.onReschedule,
      required this.onTicket,
      this.enabled = true,
      super.key});
  final PatientAppointment appointment;
  final VoidCallback onCancel;
  final VoidCallback onReschedule;
  final VoidCallback onTicket;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      Text(appointment.doctorName,
                          style: Theme.of(context).textTheme.titleMedium),
                      StatusChip(status: appointment.status),
                    ]),
                const SizedBox(height: 6),
                Text(appointment.specialty,
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 12),
                Text(
                    '${appointment.displayDate} · ${appointment.displayTime} (giờ Việt Nam)',
                    style: Theme.of(context).textTheme.bodyMedium),
                if (appointment.canModify &&
                    !appointment.endAt.isAfter(DateTime.now().toUtc())) ...[
                  const SizedBox(height: 8),
                  const Text(
                      'Đã qua giờ dự kiến; trạng thái lịch hẹn chưa được cập nhật.'),
                ],
                if (appointment.reason?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text('Lý do: ${appointment.reason}')
                ],
                if (appointment.canModify ||
                    appointment.ticketAvailable(DateTime.now())) ...[
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    if (appointment.ticketAvailable(DateTime.now()))
                      OutlinedButton.icon(
                          onPressed: enabled ? onTicket : null,
                          icon: const Icon(Icons.qr_code),
                          label: const Text('Xem vé QR')),
                    if (appointment.canModify) ...[
                      OutlinedButton.icon(
                          onPressed: enabled ? onReschedule : null,
                          icon: const Icon(Icons.edit_calendar_outlined),
                          label: const Text('Đổi lịch')),
                      OutlinedButton.icon(
                          onPressed: enabled ? onCancel : null,
                          style: OutlinedButton.styleFrom(
                              foregroundColor: colors.error),
                          icon: const Icon(Icons.cancel_outlined),
                          label: const Text('Hủy lịch')),
                    ],
                  ]),
                ],
              ],
            )));
  }
}
