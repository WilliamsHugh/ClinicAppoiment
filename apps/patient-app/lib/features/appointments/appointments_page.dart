import 'package:flutter/material.dart';

import '../../shared/widgets/feature_placeholder.dart';

class AppointmentsPage extends StatelessWidget {
  const AppointmentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePlaceholder(
      title: 'Lịch hẹn',
      message: 'Luồng đặt lịch và quản lý lịch hẹn sẽ được triển khai tại đây.',
      icon: Icons.calendar_month_outlined,
    );
  }
}
