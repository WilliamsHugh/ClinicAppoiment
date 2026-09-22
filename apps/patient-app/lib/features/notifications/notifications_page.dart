import 'package:flutter/material.dart';

import '../../shared/widgets/feature_placeholder.dart';

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePlaceholder(
      title: 'Thông báo',
      message:
          'Thông báo dành cho tài khoản đang đăng nhập sẽ hiển thị tại đây.',
      icon: Icons.notifications_outlined,
    );
  }
}
