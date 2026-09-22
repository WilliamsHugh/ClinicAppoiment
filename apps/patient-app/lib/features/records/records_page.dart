import 'package:flutter/material.dart';

import '../../shared/widgets/feature_placeholder.dart';

class RecordsPage extends StatelessWidget {
  const RecordsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePlaceholder(
      title: 'Hồ sơ khám',
      message:
          'Lịch sử khám được giới hạn theo phiên người bệnh sẽ hiển thị tại đây.',
      icon: Icons.description_outlined,
    );
  }
}
