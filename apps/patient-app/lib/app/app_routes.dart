import 'package:flutter/material.dart';

import '../core/session/session.dart';
import '../features/appointments/appointments_page.dart';
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
class PatientRoute {
  const PatientRoute({
    required this.path,
    required this.label,
    required this.icon,
    required this.builder,
    this.roles = const {UserRole.patient},
  });

  final String path;
  final String label;
  final IconData icon;
  final WidgetBuilder builder;
  final Set<UserRole> roles;
}

final patientRoutes = <PatientRoute>[
  PatientRoute(
    path: AppRoutes.doctors,
    label: 'Bác sĩ',
    icon: Icons.medical_services_outlined,
    builder: (_) => const DoctorsPage(),
  ),
  PatientRoute(
    path: AppRoutes.appointments,
    label: 'Lịch hẹn',
    icon: Icons.calendar_month_outlined,
    builder: (_) => const AppointmentsPage(),
  ),
  PatientRoute(
    path: AppRoutes.records,
    label: 'Hồ sơ khám',
    icon: Icons.description_outlined,
    builder: (_) => const RecordsPage(),
  ),
  PatientRoute(
    path: AppRoutes.notifications,
    label: 'Thông báo',
    icon: Icons.notifications_outlined,
    builder: (_) => const NotificationsPage(),
  ),
  PatientRoute(
    path: AppRoutes.profile,
    label: 'Cá nhân',
    icon: Icons.person_outline,
    builder: (_) => const ProfilePage(),
  ),
];
