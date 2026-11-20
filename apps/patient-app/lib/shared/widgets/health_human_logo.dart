import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

const String kHealthHumanLogoAsset = 'assets/images/health_human_logo.png';

/// Logo thương hiệu chính thức của Health&Human.
/// Vì nét chữ HH màu trắng + biểu tượng rắn màu xanh ngọc, mặc định [withBadge]
/// đặt logo trên nền gradient xanh chủ đạo [ClinicColors.primary] để nổi bật trên nền sáng.
/// Trên nền tối/xanh có sẵn (như WelcomePage hoặc InsuranceCard), đặt [withBadge] = false.
class HealthHumanLogo extends StatelessWidget {
  const HealthHumanLogo({
    this.size = 84,
    this.withBadge = true,
    super.key,
  });

  final double size;
  final bool withBadge;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      kHealthHumanLogoAsset,
      width: withBadge ? size * 0.72 : size,
      height: withBadge ? size * 0.72 : size,
      fit: BoxFit.contain,
      semanticLabel: 'Logo Health&Human',
      errorBuilder: (_, __, ___) => Icon(
        Icons.local_hospital_rounded,
        size: withBadge ? size * 0.48 : size,
        color: Colors.white,
      ),
    );

    if (!withBadge) {
      return SizedBox(
        width: size,
        height: size,
        child: Center(child: image),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [ClinicColors.primary, ClinicColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: ClinicColors.primary.withValues(alpha: 0.28),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Center(child: image),
    );
  }
}
