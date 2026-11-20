import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/health_human_logo.dart';

String maskInsurance(String? number) {
  if (number == null || number.trim().isEmpty) return '—';
  final trimmed = number.trim();
  if (trimmed.length <= 5) return trimmed;
  return '${trimmed.substring(0, 5)}...***';
}

String formatInsuranceDate(String? rawDate) {
  if (rawDate == null || rawDate.trim().isEmpty) return '—';
  final trimmed = rawDate.trim();
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(trimmed);
  if (match != null) {
    return '${match.group(3)}/${match.group(2)}/${match.group(1)}';
  }
  return trimmed;
}

class InsuranceCard extends StatelessWidget {
  const InsuranceCard({
    required this.fullName,
    this.insuranceNumber,
    this.dateOfBirth,
    super.key,
  });

  final String fullName;
  final String? insuranceNumber;
  final String? dateOfBirth;

  @override
  Widget build(BuildContext context) {
    final displayName = fullName.trim().isNotEmpty
        ? fullName.trim().toUpperCase()
        : 'BỆNH NHÂN';
    final hasInsurance =
        insuranceNumber != null && insuranceNumber!.trim().isNotEmpty;
    final maskedCode =
        hasInsurance ? maskInsurance(insuranceNumber) : 'Chưa cập nhật';
    final hasDob = dateOfBirth != null && dateOfBirth!.trim().isNotEmpty;
    final formattedDob =
        hasDob ? formatInsuranceDate(dateOfBirth) : 'Chưa cập nhật';

    return Container(
      key: const Key('insurance-card'),
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [ClinicColors.primary, ClinicColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: ClinicColors.primary.withValues(alpha: 0.22),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Expanded(
                child: Row(
                  children: [
                    HealthHumanLogo(
                      size: 24,
                      withBadge: false,
                    ),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Health&Human',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'BẢO HIỂM',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.92),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  letterSpacing: 1.1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _CardFieldRow(label: 'Họ tên:', value: displayName, isBold: true),
          const SizedBox(height: 8),
          _CardFieldRow(
            label: 'Mã BHYT:',
            value: maskedCode,
            isBold: hasInsurance,
          ),
          const SizedBox(height: 8),
          _CardFieldRow(label: 'Ngày sinh:', value: formattedDob),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.32),
                  ),
                ),
                child: Text(
                  hasInsurance ? 'Đã lưu mã BHYT' : 'Chưa có số BHYT',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardFieldRow extends StatelessWidget {
  const _CardFieldRow({
    required this.label,
    required this.value,
    this.isBold = false,
  });

  final String label;
  final String value;
  final bool isBold;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final labelWidget = Text(
      label,
      style: TextStyle(
        color: Colors.white.withValues(alpha: 0.82),
        fontSize: 13,
      ),
    );
    final valueWidget = Text(
      value,
      style: TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
        letterSpacing: isBold ? 0.3 : 0,
      ),
    );

    if (textScale >= 1.3) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          labelWidget,
          const SizedBox(height: 2),
          valueWidget,
        ],
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 96, child: labelWidget),
        const SizedBox(width: 8),
        Expanded(child: valueWidget),
      ],
    );
  }
}
