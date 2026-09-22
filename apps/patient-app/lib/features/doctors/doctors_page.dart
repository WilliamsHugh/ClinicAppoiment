import 'package:flutter/material.dart';

import '../../shared/widgets/feature_placeholder.dart';

class DoctorsPage extends StatelessWidget {
  const DoctorsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePlaceholder(
      title: 'Bác sĩ',
      message:
          'Danh sách chuyên khoa, bác sĩ và khung giờ khám sẽ hiển thị tại đây.',
      icon: Icons.medical_services_outlined,
    );
  }
}
