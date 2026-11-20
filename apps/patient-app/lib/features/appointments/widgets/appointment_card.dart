import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/appointment_status_chip.dart';
import '../appointment_models.dart';

String _doctorInitial(String name) {
  final cleaned = name
      .trim()
      .replaceFirst(RegExp(r'^(BS\.?|Bác sĩ)\s+', caseSensitive: false), '')
      .trim();
  if (cleaned.isEmpty) return 'B';
  return String.fromCharCode(cleaned.runes.first).toUpperCase();
}

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
    final now = DateTime.now();
    final showTicket = appointment.ticketAvailable(now);
    final overdue =
        appointment.canModify && !appointment.endAt.isAfter(now.toUtc());
    return Container(
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ClinicColors.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: ClinicColors.primarySoft,
                child: Text(
                  _doctorInitial(appointment.doctorName),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      alignment: WrapAlignment.spaceBetween,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          appointment.doctorName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: ClinicColors.ink,
                          ),
                        ),
                        AppointmentStatusChip(status: appointment.status),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      appointment.specialty,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: ClinicColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: ClinicColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.schedule_outlined,
                  size: 18,
                  color: ClinicColors.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${appointment.displayDate} · ${appointment.displayTime} (giờ Việt Nam)',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ClinicColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (overdue) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: ClinicColors.warningLight,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: ClinicColors.warning.withValues(alpha: 0.35),
                ),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.info_outline,
                    size: 18,
                    color: ClinicColors.warning,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Đã qua giờ dự kiến; trạng thái lịch hẹn chưa được cập nhật.',
                      style: TextStyle(
                        fontSize: 13,
                        color: ClinicColors.warningDark,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (appointment.reason?.isNotEmpty == true) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(
                    Icons.notes_outlined,
                    size: 16,
                    color: ClinicColors.muted,
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Lý do: ${appointment.reason}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: ClinicColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (appointment.canModify || showTicket) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (showTicket)
                  FilledButton.icon(
                    onPressed: enabled ? onTicket : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: ClinicColors.primary,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.qr_code, size: 18),
                    label: const Text('Xem vé QR'),
                  ),
                if (appointment.canModify) ...[
                  OutlinedButton.icon(
                    onPressed: enabled ? onReschedule : null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: ClinicColors.primary,
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.edit_calendar_outlined, size: 18),
                    label: const Text('Đổi lịch'),
                  ),
                  OutlinedButton.icon(
                    onPressed: enabled ? onCancel : null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: ClinicColors.danger,
                      side: BorderSide(
                        color: ClinicColors.danger.withValues(alpha: 0.45),
                      ),
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.cancel_outlined, size: 18),
                    label: const Text('Hủy lịch'),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
