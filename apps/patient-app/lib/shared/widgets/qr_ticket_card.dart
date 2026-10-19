import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import 'appointment_status_chip.dart';

/// Formatted appointment ticket with QR code for reception check-in.
class QrTicketCard extends StatelessWidget {
  const QrTicketCard({
    required this.appointmentId,
    required this.doctorName,
    required this.dateTimeLabel,
    required this.status,
    this.specialtyName,
    super.key,
  });

  final String appointmentId;
  final String doctorName;
  final String dateTimeLabel;
  final String status;
  final String? specialtyName;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ClinicColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            doctorName,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: ClinicColors.ink,
            ),
            textAlign: TextAlign.center,
          ),
          if (specialtyName != null && specialtyName!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              specialtyName!,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: ClinicColors.muted,
              ),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 8),
          Text(
            dateTimeLabel,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: ClinicColors.ink,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          AppointmentStatusChip(status: status),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (_, constraints) {
              final size = constraints.maxWidth < 220 ? constraints.maxWidth : 220.0;
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ClinicColors.border),
                ),
                child: QrImageView(
                  data: appointmentId,
                  version: QrVersions.auto,
                  size: size,
                  backgroundColor: Colors.white,
                  gapless: false,
                  errorCorrectionLevel: QrErrorCorrectLevel.M,
                  semanticsLabel: 'Mã QR lịch hẹn để xuất trình cho lễ tân tại phòng khám',
                  errorStateBuilder: (_, __) => const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Không thể tạo mã QR. Vui lòng tải lại vé.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: ClinicColors.danger, fontSize: 13),
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          const Text(
            'Xuất trình mã QR cho lễ tân khi đến phòng khám để check-in nhanh.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: ClinicColors.muted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
