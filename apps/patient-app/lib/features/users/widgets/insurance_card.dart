import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

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
    this.expiryDate = '31/12/2027',
    super.key,
  });

  final String fullName;
  final String? insuranceNumber;
  final String? dateOfBirth;
  final String expiryDate;

  @override
  Widget build(BuildContext context) {
    final displayName =
        fullName.trim().isNotEmpty ? fullName.trim().toUpperCase() : 'BỆNH NHÂN';
    final maskedCode = maskInsurance(insuranceNumber);
    final formattedDob = formatInsuranceDate(dateOfBirth);

    return Container(
      key: const Key('insurance-card'),
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [ClinicColors.primary, Color(0xFF0D9488)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: ClinicColors.primary.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.local_hospital_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Health&Human',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ],
              ),
              Text(
                'BẢO HIỂM',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _buildCardRow('Họ tên:', displayName, isBold: true),
          const SizedBox(height: 8),
          _buildCardRow('Mã BHYT:', maskedCode, isBold: true),
          const SizedBox(height: 8),
          _buildCardRow('Ngày sinh:', formattedDob),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: _buildCardRow('Hạn dùng:', expiryDate)),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.35),
                  ),
                ),
                child: const Text(
                  'Thẻ mẫu',
                  style: TextStyle(
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

  Widget _buildCardRow(String label, String value, {bool isBold = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 88,
          child: Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.82),
              fontSize: 13,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
              letterSpacing: isBold ? 0.3 : 0,
            ),
          ),
        ),
      ],
    );
  }
}
