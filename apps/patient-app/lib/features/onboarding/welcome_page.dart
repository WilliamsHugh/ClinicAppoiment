import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Màn hình Welcome / Onboarding - bám sát hình giữa trong mobile_ui.png
/// Nền xanh #2D5BFF, tiêu đề "We'll help you take care of yourself",
/// card "Doctor Consultations" nghiêng nhẹ + nút mũi tên.
class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key, this.onGetStarted});

  final VoidCallback? onGetStarted;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.primary,
      body: SafeArea(
        child: Stack(
          children: [
            // Decorative elements giống hình Figma
            Positioned(
              top: 24,
              left: 18,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: const Color(0xFF00E5CC),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 22,
              left: 56,
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: const Color(0xFF00E5CC).withValues(alpha: 0.9),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            // Line art mờ phía trên (mô phỏng đường cong trong hình)
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: CustomPaint(
                size: const Size(double.infinity, 120),
                painter: _LineArtPainter(),
              ),
            ),
            // Nội dung chính
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Status bar fake spacing + logo header
                  Row(
                    children: [
                      // Logo 3 sóng
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        child: Row(
                          children: [
                            // icon sóng
                            const Icon(Icons.waves,
                                color: Colors.white, size: 20),
                            const SizedBox(width: 6),
                            Text(
                              'Health&Human',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.95),
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                    ],
                  ),
                  const SizedBox(height: 28),
                  // Headline
                  const Text(
                    'We\'ll help you\ntake care of\nyourself',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 30,
                      height: 1.12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.6,
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Yellow star
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 24),
                      child: Transform.rotate(
                        angle: 0.18,
                        child: const Icon(
                          Icons.star,
                          color: Color(0xFFFFD600),
                          size: 42,
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Card Doctor Consultations (trắng, xoay nhẹ)
                  Center(
                    child: Transform.rotate(
                      angle: -0.07,
                      child: Container(
                        width: 250,
                        padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.16),
                              blurRadius: 24,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Doctor\nConsultations',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                height: 1.1,
                                letterSpacing: -0.4,
                                color: ClinicColors.ink,
                              ),
                            ),
                            SizedBox(height: 16),
                            Row(
                              children: [
                                _AvatarMini(
                                    color: Color(0xFFBFD0FF), label: 'S'),
                                SizedBox(width: 8),
                                _AvatarMini(
                                    color: Color(0xFFFFD6C8), label: 'A'),
                                SizedBox(width: 8),
                                _AvatarMini(
                                    color: Color(0xFFBCE8FF), label: 'J'),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Decor shape dưới card (tam giác xanh đậm)
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Fake bottom round container hint already via card above
                      Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: const EdgeInsets.only(right: 4, bottom: 8),
                          child: Container(
                            width: 56,
                            height: 56,
                            decoration: const BoxDecoration(
                              color: Colors.black,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.arrow_outward,
                              color: Colors.white,
                              size: 26,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (onGetStarted != null)
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: ClinicColors.primary,
                        ),
                        onPressed: onGetStarted,
                        child: const Text('Get Started'),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarMini extends StatelessWidget {
  const _AvatarMini({required this.color, required this.label});
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 12,
          color: ClinicColors.ink,
        ),
      ),
    );
  }
}

class _LineArtPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.30)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;

    final path = Path();
    // đường cong lớn như trong hình giữa
    path.moveTo(size.width * 0.38, 10);
    path.cubicTo(
      size.width * 0.55,
      8,
      size.width * 0.58,
      26,
      size.width * 0.48,
      52,
    );
    path.cubicTo(
      size.width * 0.40,
      74,
      size.width * 0.62,
      78,
      size.width * 0.72,
      62,
    );
    canvas.drawPath(path, paint);

    // vòng tròn nhỏ mờ
    final dotPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(Offset(size.width * 0.58, 26), 18, dotPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
