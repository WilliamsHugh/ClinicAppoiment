import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/health_human_logo.dart';

class AuthHeader extends StatelessWidget {
  const AuthHeader({this.compact = false, super.key});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        HealthHumanLogo(
          size: compact ? 74 : 90,
          withBadge: true,
        ),
        SizedBox(height: compact ? 14 : 20),
        Text(
          'Health&Human',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: compact ? 24 : 28,
            fontWeight: FontWeight.w800,
            color: ClinicColors.ink,
            letterSpacing: -0.6,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Sức khỏe của bạn, sự tận tâm của chúng tôi.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13.5,
            height: 1.4,
            color: ClinicColors.muted,
            fontWeight: FontWeight.w400,
          ),
        ),
      ],
    );
  }
}
