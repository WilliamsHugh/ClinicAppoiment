import 'package:flutter/material.dart';

import 'app/patient_app.dart';
import 'core/session/gateway_session_provider.dart';
export 'app/patient_app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(PatientApp(sessionProvider: GatewaySessionProvider()));
}
