import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../data/doctor_repository.dart';

class AvailableDoctorCard extends StatelessWidget {
  const AvailableDoctorCard({
    required this.doctor,
    required this.onTap,
    super.key,
  });

  final DoctorSummary doctor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFE0E7FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.person,
                  size: 24,
                  color: ClinicColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doctor.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: ClinicColors.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      doctor.bio?.isNotEmpty == true
                          ? doctor.bio!
                          : 'Bác sĩ đang nhận lịch khám',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: ClinicColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: ClinicColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
