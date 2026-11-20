import 'package:flutter/material.dart';

import '../../../shared/widgets/appointment_status_chip.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) => AppointmentStatusChip(status: status);
}
