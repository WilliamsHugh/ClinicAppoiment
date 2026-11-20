import 'package:flutter/material.dart';

import '../core/api/clinic_api_client.dart';
import '../core/session/session.dart';
import '../features/appointments/appointments_page.dart';
import '../features/appointments/booking_selection.dart';
import '../features/doctors/doctors_page.dart';
import '../features/notifications/notifications_page.dart';
import '../features/records/records_page.dart';
import '../features/users/profile_page.dart';

abstract final class AppRoutes {
  static const profile = '/profile';
  static const doctors = '/doctors';
  static const appointments = '/appointments';
  static const records = '/records';
  static const notifications = '/notifications';
}

@immutable
class PatientRouteContext {
  const PatientRouteContext({
    required this.navigate,
    required this.onBookingSelection,
    this.appointmentsRevision = 0,
    this.recordsRevision = 0,
    this.doctorApiClient,
    this.apiClient,
    this.onSignOut,
  });

  final void Function(String) navigate;
  final ValueChanged<BookingSelection> onBookingSelection;
  final int appointmentsRevision;
  final int recordsRevision;
  final ClinicApiClient? doctorApiClient;
  final ClinicApiClient? apiClient;
  final VoidCallback? onSignOut;
}

@immutable
class PatientRoute {
  const PatientRoute({
    required this.path,
    required this.label,
    required this.icon,
    required this.builder,
    this.selectedIcon,
    this.roles = const {UserRole.patient},
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData? selectedIcon;
  final Widget Function(BuildContext, AuthSession, PatientRouteContext) builder;
  final Set<UserRole> roles;
}

final patientRoutes = <PatientRoute>[
  PatientRoute(
    path: AppRoutes.doctors,
    label: 'Bác sĩ',
    icon: Icons.medical_services_outlined,
    selectedIcon: Icons.medical_services,
    builder: (_, session, route) => DoctorsPage(
      tokenProvider: session,
      apiClient: route.doctorApiClient ?? route.apiClient,
      onOpenNotifications: () => route.navigate(AppRoutes.notifications),
      onBookingSelection: (selection) {
        route.onBookingSelection(selection);
        route.navigate(AppRoutes.appointments);
      },
    ),
  ),
  PatientRoute(
    path: AppRoutes.appointments,
    label: 'Lịch hẹn',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month,
    builder: (_, session, route) => AppointmentsPage(
      tokenProvider: session,
      api: route.doctorApiClient ?? route.apiClient,
      refreshVersion: route.appointmentsRevision,
    ),
  ),
  PatientRoute(
    path: AppRoutes.records,
    label: 'Hồ sơ khám',
    icon: Icons.description_outlined,
    selectedIcon: Icons.description,
    builder: (_, session, route) => RecordsPage(
      tokenProvider: session,
      api: route.apiClient,
      refreshVersion: route.recordsRevision,
    ),
  ),
  PatientRoute(
    path: AppRoutes.notifications,
    label: 'Thông báo',
    icon: Icons.notifications_outlined,
    selectedIcon: Icons.notifications,
    builder: (_, session, route) => NotificationsPage(
      tokenProvider: session,
      api: route.apiClient,
      onOpenRoute: route.navigate,
    ),
  ),
  PatientRoute(
    path: AppRoutes.profile,
    label: 'Cá nhân',
    icon: Icons.person_outline,
    selectedIcon: Icons.person,
    builder: (_, session, route) => ProfilePage(
      tokenProvider: session,
      apiClient: route.apiClient,
      onSignOut: route.onSignOut,
    ),
  ),
];
