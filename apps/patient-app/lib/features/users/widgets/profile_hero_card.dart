import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class ProfileHeroCard extends StatelessWidget {
  const ProfileHeroCard({
    required this.fullName,
    required this.email,
    required this.phone,
    required this.role,
    required this.status,
    super.key,
  });

  final String fullName;
  final String email;
  final String phone;
  final String role;
  final String status;

  String get _initials {
    final trimmed = fullName.trim();
    if (trimmed.isEmpty) return 'BN';
    final letters = trimmed
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .map((w) => w[0])
        .take(2)
        .join()
        .toUpperCase();
    return letters.isEmpty ? 'BN' : letters;
  }

  String get _roleLabel {
    switch (role) {
      case 'PATIENT':
        return 'Bệnh nhân';
      case 'DOCTOR':
        return 'Bác sĩ';
      case 'STAFF':
        return 'Nhân viên';
      case 'ADMIN':
        return 'Quản trị viên';
      default:
        return role.isEmpty ? 'Bệnh nhân' : role;
    }
  }

  (String label, Color bg, Color fg) get _statusStyle {
    switch (status) {
      case 'ACTIVE':
        return ('Hoạt động', ClinicColors.successLight, ClinicColors.success);
      case 'INACTIVE':
        return (
          'Tạm ngưng',
          ClinicColors.warningLight,
          ClinicColors.warningDark,
        );
      case 'LOCKED':
        return ('Đã khóa', ClinicColors.dangerLight, ClinicColors.danger);
      default:
        return (
          status.isEmpty ? 'Hoạt động' : status,
          ClinicColors.dangerLight,
          ClinicColors.danger,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusBg, statusFg) = _statusStyle;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: ClinicColors.primarySoft,
            child: Text(
              _initials,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: ClinicColors.primary,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            fullName.trim().isNotEmpty ? fullName.trim() : 'Bệnh nhân',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: ClinicColors.ink,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            email.trim().isNotEmpty ? email.trim() : 'Chưa cập nhật email',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              color: ClinicColors.muted,
            ),
          ),
          if (phone.trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              phone.trim(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: ClinicColors.muted,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              _HeroBadge(
                label: _roleLabel,
                backgroundColor: ClinicColors.primarySoft,
                foregroundColor: ClinicColors.primary,
              ),
              _HeroBadge(
                label: statusLabel,
                backgroundColor: statusBg,
                foregroundColor: statusFg,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: foregroundColor,
        ),
      ),
    );
  }
}
