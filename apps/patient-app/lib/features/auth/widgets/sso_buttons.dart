import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// SSO buttons (Google / Apple) - placeholder cho Supabase Auth
/// Giữ bo 24, màu trắng viền border như search bar trong Figma
class SsoButtons extends StatelessWidget {
  const SsoButtons({super.key, this.onGoogleTap, this.onAppleTap});

  final VoidCallback? onGoogleTap;
  final VoidCallback? onAppleTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            const Expanded(child: Divider(color: ClinicColors.border)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text('hoặc tiếp tục với',
                  style: TextStyle(
                      fontSize: 11,
                      color: ClinicColors.muted.withValues(alpha: 0.9))),
            ),
            const Expanded(child: Divider(color: ClinicColors.border)),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _SsoTile(
                label: 'Google',
                icon: Icons.g_mobiledata,
                onTap:
                    onGoogleTap ?? () => _showComingSoon(context, 'Google SSO'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SsoTile(
                label: 'Apple',
                icon: Icons.apple,
                onTap:
                    onAppleTap ?? () => _showComingSoon(context, 'Apple SSO'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  static void _showComingSoon(BuildContext c, String provider) {
    ScaffoldMessenger.of(c).showSnackBar(SnackBar(
        content: Text('$provider sẽ kết nối qua Supabase Auth (SSO)')));
  }
}

class _SsoTile extends StatelessWidget {
  const _SsoTile(
      {required this.label, required this.icon, required this.onTap});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ClinicColors.border),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: ClinicColors.ink),
            const SizedBox(width: 6),
            Text(label,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: ClinicColors.ink)),
          ],
        ),
      ),
    );
  }
}
