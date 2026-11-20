import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/clinic_page_header.dart';
import '../appointments/booking_selection.dart';
import 'doctor_directory_page.dart';
import 'doctor_booking_controls.dart';

class DoctorsPage extends StatelessWidget {
  const DoctorsPage({
    required this.tokenProvider,
    required this.onOpenNotifications,
    required this.onBookingSelection,
    this.apiClient,
    this.bookingWidgets = const DoctorBookingWidgets(),
    super.key,
  });

  final TokenProvider tokenProvider;
  final VoidCallback onOpenNotifications;
  final ValueChanged<BookingSelection> onBookingSelection;
  final ClinicApiClient? apiClient;
  final DoctorBookingWidgets bookingWidgets;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: Column(
        children: [
          ClinicPageHeader(
            title: 'Bác sĩ',
            subtitle: 'Chọn chuyên khoa và đặt lịch khám phù hợp',
            trailing: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(12),
              ),
              child: IconButton(
                tooltip: 'Thông báo',
                onPressed: onOpenNotifications,
                icon: const Icon(
                  Icons.notifications_outlined,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          Expanded(
            child: DoctorDirectoryPage(
              tokenProvider: tokenProvider,
              apiClient: apiClient,
              bookingWidgets: bookingWidgets,
              onAppointmentCreated: onBookingSelection,
            ),
          ),
        ],
      ),
    );
  }
}
