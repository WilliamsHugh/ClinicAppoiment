import 'package:flutter/material.dart';

import '../home/home_page.dart';

/// Route /doctors hiện hiển thị HomePage bám sát mobile_ui.png (màn trái).
/// Navigation tới DoctorDetailPage được xử lý ngay trong HomePage qua
/// push MaterialPageRoute.
class DoctorsPage extends StatelessWidget {
  const DoctorsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const HomePage();
  }
}
