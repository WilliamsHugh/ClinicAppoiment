import 'package:flutter/material.dart';

import '../../shared/widgets/feature_placeholder.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePlaceholder(
      title: 'Hồ sơ cá nhân',
      message:
          'Thông tin người dùng và hồ sơ bệnh nhân sẽ được triển khai tại đây.',
      icon: Icons.person_outline,
    );
  }
}
