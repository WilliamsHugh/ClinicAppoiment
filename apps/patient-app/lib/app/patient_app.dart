import 'package:flutter/material.dart';

import '../core/session/session.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/auth_page.dart';
import '../shared/widgets/async_states.dart';
import 'patient_shell.dart';

class PatientApp extends StatefulWidget {
  const PatientApp({
    super.key,
    this.sessionProvider = const UnauthenticatedSessionProvider(),
  });

  final SessionProvider sessionProvider;

  @override
  State<PatientApp> createState() => _PatientAppState();
}

class _PatientAppState extends State<PatientApp> {
  late final SessionController _sessionController;

  @override
  void initState() {
    super.initState();
    _sessionController = SessionController(widget.sessionProvider);
    _sessionController.initialize();
  }

  @override
  void dispose() {
    _sessionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Clinic Patient',
      debugShowCheckedModeBanner: false,
      theme: buildPatientTheme(),
      home: ListenableBuilder(
        listenable: _sessionController,
        builder: (context, _) => switch (_sessionController.status) {
          SessionStatus.loading => const Scaffold(
              body: AppLoadingState(label: 'Đang kiểm tra phiên đăng nhập'),
            ),
          SessionStatus.authenticated => PatientShell(
              session: _sessionController.session!,
            ),
          SessionStatus.unauthenticated => const AuthPage(),
        },
      ),
    );
  }
}
