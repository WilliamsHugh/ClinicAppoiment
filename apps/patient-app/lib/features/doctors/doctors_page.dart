import 'package:flutter/material.dart';

import '../../core/session/session.dart';
import '../home/home_page.dart';

/// Route /doctors hiện hiển thị HomePage bám sát mobile_ui.png (màn trái).
/// Navigation tới DoctorDetailPage được xử lý ngay trong HomePage qua
/// push MaterialPageRoute.
class DoctorsPage extends StatelessWidget {
  const DoctorsPage({
    required this.tokenProvider,
    required this.onOpenNotifications,
    super.key,
  });

  final TokenProvider tokenProvider;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    return HomePage(
      tokenProvider: tokenProvider,
      onOpenNotifications: onOpenNotifications,
    );
  }
}
