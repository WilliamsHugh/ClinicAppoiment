import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../auth/auth_page.dart';

class OnboardingSlideData {
  const OnboardingSlideData({
    required this.title,
    required this.description,
    required this.icon,
    required this.badgeLabel,
  });

  final String title;
  final String description;
  final IconData icon;
  final String badgeLabel;
}

const List<OnboardingSlideData> kOnboardingSlides = [
  OnboardingSlideData(
    title: 'Đặt lịch khám dễ dàng',
    description: 'Chọn bác sĩ, chuyên khoa, ngày giờ phù hợp.',
    icon: Icons.calendar_month_rounded,
    badgeLabel: 'Doctor Consultations',
  ),
  OnboardingSlideData(
    title: 'Theo dõi lịch hẹn',
    description: 'Xem vé khám, QR check-in, đổi/hủy lịch linh hoạt.',
    icon: Icons.qr_code_scanner_rounded,
    badgeLabel: 'Smart Check-in QR',
  ),
  OnboardingSlideData(
    title: 'Hồ sơ sức khỏe của bạn',
    description: 'Xem bệnh án, đơn thuốc, tiền sử khám bệnh.',
    icon: Icons.health_and_safety_rounded,
    badgeLabel: 'Electronic Records',
  ),
];

/// Màn hình Welcome / Onboarding 3 slides với PageView, dot indicator và nút "Bắt đầu".
class WelcomePage extends StatefulWidget {
  const WelcomePage({
    super.key,
    this.onGetStarted,
    this.onLogin,
    this.onRegister,
  });

  final VoidCallback? onGetStarted;
  final Future<void> Function(String email, String password)? onLogin;
  final Future<bool> Function(String name, String email, String password)?
      onRegister;

  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _completeOnboarding() {
    if (widget.onGetStarted != null) {
      widget.onGetStarted!();
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => AuthPage(
          onLogin: widget.onLogin ?? (_, __) async {},
          onRegister: widget.onRegister ?? (_, __, ___) async => false,
        ),
      ),
    );
  }

  void _nextSlide() {
    if (_currentIndex < kOnboardingSlides.length - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    } else {
      _completeOnboarding();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLastSlide = _currentIndex == kOnboardingSlides.length - 1;

    return Scaffold(
      backgroundColor: ClinicColors.primary,
      body: SafeArea(
        child: Stack(
          children: [
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
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: CustomPaint(
                size: const Size(double.infinity, 120),
                painter: _LineArtPainter(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.waves,
                              color: Colors.white,
                              size: 20,
                            ),
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
                      if (!isLastSlide)
                        TextButton(
                          onPressed: _completeOnboarding,
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Bỏ qua'),
                        ),
                    ],
                  ),
                  Expanded(
                    child: PageView.builder(
                      key: const Key('onboarding-page-view'),
                      controller: _pageController,
                      itemCount: kOnboardingSlides.length,
                      onPageChanged: (index) {
                        setState(() => _currentIndex = index);
                      },
                      itemBuilder: (context, index) {
                        final slide = kOnboardingSlides[index];
                        return _OnboardingSlideView(slide: slide);
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(kOnboardingSlides.length, (index) {
                      final active = index == _currentIndex;
                      return AnimatedContainer(
                        key: Key('onboarding-dot-$index'),
                        duration: const Duration(milliseconds: 220),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: active ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: active
                              ? const Color(0xFF00E5CC)
                              : Colors.white.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      key: Key(
                        isLastSlide
                            ? 'onboarding-start-button'
                            : 'onboarding-next-button',
                      ),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: ClinicColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: isLastSlide ? _completeOnboarding : _nextSlide,
                      child: Text(isLastSlide ? 'Bắt đầu' : 'Tiếp tục'),
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

class _OnboardingSlideView extends StatelessWidget {
  const _OnboardingSlideView({required this.slide});

  final OnboardingSlideData slide;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 12),
                Transform.rotate(
                  angle: -0.04,
                  child: Container(
                    width: 240,
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.16),
                          blurRadius: 24,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: ClinicColors.primary.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            slide.icon,
                            size: 40,
                            color: ClinicColors.primary,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          slide.badgeLabel,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: ClinicColors.ink,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  slide.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    slide.description,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 15,
                      height: 1.45,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
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

    final path = Path()
      ..moveTo(size.width * 0.38, 10)
      ..cubicTo(
        size.width * 0.55,
        8,
        size.width * 0.58,
        26,
        size.width * 0.48,
        52,
      )
      ..cubicTo(
        size.width * 0.40,
        74,
        size.width * 0.62,
        78,
        size.width * 0.72,
        62,
      );
    canvas.drawPath(path, paint);

    final dotPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(Offset(size.width * 0.58, 26), 18, dotPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
