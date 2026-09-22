import 'package:flutter/material.dart';

import '../core/session/session.dart';
import '../shared/widgets/async_states.dart';
import 'app_routes.dart';

class PatientShell extends StatefulWidget {
  const PatientShell({required this.session, super.key});

  final AuthSession session;

  @override
  State<PatientShell> createState() => _PatientShellState();
}

class _PatientShellState extends State<PatientShell> {
  int _selectedIndex = 0;

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

    return Scaffold(
      appBar: AppBar(
        title: Text(selectedRoute.label),
        actions: [
          IconButton(
            tooltip: 'Hồ sơ cá nhân',
            onPressed: () => _selectPath(routes, AppRoutes.profile),
            icon: const Icon(Icons.account_circle_outlined),
          ),
        ],
      ),
      body: IndexedStack(
        index: _selectedIndex,
        children: routes.map((route) => route.builder(context)).toList(),
      ),
      bottomNavigationBar: NavigationBar(
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
    );
  }

  void _selectPath(List<PatientRoute> routes, String path) {
    final index = routes.indexWhere((route) => route.path == path);
    if (index >= 0) {
      setState(() => _selectedIndex = index);
    }
  }
}
