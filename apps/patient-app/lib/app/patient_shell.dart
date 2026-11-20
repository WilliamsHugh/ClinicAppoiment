import 'package:flutter/material.dart';

import '../core/api/clinic_api_client.dart';
import '../core/session/session.dart';
import '../core/theme/app_theme.dart';
import '../shared/widgets/async_states.dart';
import 'app_routes.dart';

class PatientShell extends StatefulWidget {
  const PatientShell({
    required this.session,
    required this.onSignOut,
    this.doctorApiClient,
    this.apiClient,
    super.key,
  });

  final AuthSession session;
  final Future<void> Function() onSignOut;
  final ClinicApiClient? doctorApiClient;
  final ClinicApiClient? apiClient;

  @override
  State<PatientShell> createState() => _PatientShellState();
}

class _PatientShellState extends State<PatientShell> {
  int _selectedIndex = 0;
  int _appointmentsRevision = 0;
  int _recordsRevision = 0;

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

    final routeContext = PatientRouteContext(
      navigate: (path) => _selectPath(routes, path),
      onBookingSelection: (_) => setState(() => _appointmentsRevision++),
      appointmentsRevision: _appointmentsRevision,
      recordsRevision: _recordsRevision,
      doctorApiClient: widget.doctorApiClient,
      apiClient: widget.apiClient,
      onSignOut: widget.onSignOut,
    );

    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: routes
            .map(
              (route) => route.builder(context, widget.session, routeContext),
            )
            .toList(),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: ClinicColors.card,
          border: const Border(
            top: BorderSide(color: ClinicColors.border, width: 0.8),
          ),
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
            backgroundColor: ClinicColors.card,
            surfaceTintColor: Colors.transparent,
            indicatorColor: ClinicColors.primarySoft,
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            elevation: 0,
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) => _selectIndex(routes, index),
            destinations: routes
                .map(
                  (route) => NavigationDestination(
                    icon: Icon(route.icon),
                    selectedIcon: Icon(route.selectedIcon ?? route.icon),
                    label: route.label,
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }

  void _selectIndex(List<PatientRoute> routes, int index) {
    if (index < 0 || index >= routes.length) return;
    setState(() {
      if (routes[index].path == AppRoutes.records && index != _selectedIndex) {
        _recordsRevision++;
      }
      _selectedIndex = index;
    });
  }

  void _selectPath(List<PatientRoute> routes, String path) {
    final index = routes.indexWhere((route) => route.path == path);
    if (index >= 0) {
      setState(() {
        if (routes[index].path == AppRoutes.records) {
          _recordsRevision++;
        }
        _selectedIndex = index;
      });
    }
  }
}
