import 'package:flutter/material.dart';

import '../core/api/clinic_api_client.dart';
import '../core/session/session.dart';
import '../features/appointments/booking_selection.dart';
import '../shared/widgets/async_states.dart';
import 'app_routes.dart';

class PatientShell extends StatefulWidget {
  const PatientShell({
    required this.session,
    required this.onSignOut,
    this.doctorApiClient,
    super.key,
  });

  final AuthSession session;
  final Future<void> Function() onSignOut;
  final ClinicApiClient? doctorApiClient;

  @override
  State<PatientShell> createState() => _PatientShellState();
}

class _PatientShellState extends State<PatientShell> {
  int _selectedIndex = 0;
  BookingSelection? _bookingSelection;

  @override
  Widget build(BuildContext context) {
    final routes = patientRoutes
        .where((route) => route.roles.contains(widget.session.role))
        .toList(growable: false);
    if (routes.isEmpty) {
      return const Scaffold(
        body: AppErrorState(
          message: 'Tài khoản này không có quyền sử dụng Patient App.',
        ),
      );
    }
    final selectedRoute = routes[_selectedIndex];
    // Các page Doctor/Appointments/Records/Notifications tự có AppBar,
    // nên ẩn AppBar của Shell để không hiển thị hai thanh tiêu đề.
    final hideAppBar = selectedRoute.path == AppRoutes.doctors ||
        selectedRoute.path == AppRoutes.appointments ||
        selectedRoute.path == AppRoutes.records ||
        selectedRoute.path == AppRoutes.notifications;

    final routeContext = PatientRouteContext(
      navigate: (path) => _selectPath(routes, path),
      onBookingSelection: (selection) =>
          setState(() => _bookingSelection = selection),
      bookingSelection: _bookingSelection,
      doctorApiClient: widget.doctorApiClient,
    );

    return Scaffold(
      appBar: hideAppBar
          ? null
          : AppBar(
              title: Text(selectedRoute.label),
              actions: selectedRoute.path == AppRoutes.profile
                  ? [
                      IconButton(
                        tooltip: 'Đăng xuất',
                        onPressed: widget.onSignOut,
                        icon: const Icon(Icons.logout),
                      ),
                    ]
                  : [
                      IconButton(
                        tooltip: 'Hồ sơ cá nhân',
                        onPressed: () => _selectPath(routes, AppRoutes.profile),
                        icon: const Icon(Icons.account_circle_outlined),
                      ),
                    ],
            ),
      body: IndexedStack(
        index: _selectedIndex,
        children: routes
            .map(
                (route) => route.builder(context, widget.session, routeContext))
            .toList(),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 16,
              offset: const Offset(0, -4),
            ),
          ],
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: NavigationBar(
            height: 64,
            backgroundColor: Colors.white,
            elevation: 0,
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) =>
                setState(() => _selectedIndex = index),
            destinations: routes
                .map(
                  (route) => NavigationDestination(
                    icon: Icon(route.icon),
                    label: route.label,
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }

  void _selectPath(List<PatientRoute> routes, String path) {
    final index = routes.indexWhere((route) => route.path == path);
    if (index >= 0) {
      setState(() => _selectedIndex = index);
    }
  }
}
