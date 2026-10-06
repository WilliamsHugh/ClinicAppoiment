import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../appointments/booking_selection.dart';
import 'doctor_directory_page.dart';

class DoctorsPage extends StatelessWidget {
  const DoctorsPage({
    required this.tokenProvider,
    required this.onOpenNotifications,
    required this.onBookingSelection,
    this.apiClient,
    super.key,
  });

  final TokenProvider tokenProvider;
  final VoidCallback onOpenNotifications;
  final ValueChanged<BookingSelection> onBookingSelection;
  final ClinicApiClient? apiClient;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bác sĩ'),
        actions: [
          IconButton(
            tooltip: 'Thông báo',
            onPressed: onOpenNotifications,
            icon: const Icon(Icons.notifications_outlined),
          ),
        ],
      ),
      body: DoctorDirectoryPage(
        tokenProvider: tokenProvider,
        apiClient: apiClient,
        onSlotSelected: (doctor, slot) => onBookingSelection(
          BookingSelection.fromDoctorSlot(doctor, slot),
        ),
      ),
    );
  }
}
