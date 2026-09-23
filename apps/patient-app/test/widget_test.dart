import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_patient_app/app/patient_app.dart';
import 'package:clinic_patient_app/core/session/session.dart';

class _AuthenticatedProvider implements SessionProvider {
  const _AuthenticatedProvider();

  @override
  Future<String?> getAccessToken() async => 'test-token';

  @override
  Future<AuthSession?> restoreSession() async => const AuthSession(
        userId: 'test-user',
        role: UserRole.patient,
        accessToken: 'test-token',
      );
}

void main() {
  testWidgets('defaults to the unauthenticated shell', (tester) async {
    await tester.pumpWidget(const PatientApp());
    await tester.pumpAndSettle();

    expect(find.text('Health&Human'), findsOneWidget);
    expect(
      find.text(
        'Sức khỏe của bạn, sự tận tâm của chúng tôi.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('renders patient navigation for an authenticated session',
      (tester) async {
    await tester.pumpWidget(
      const PatientApp(sessionProvider: _AuthenticatedProvider()),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bác sĩ'), findsWidgets);
    expect(find.text('Lịch hẹn'), findsOneWidget);
    expect(find.text('Hồ sơ khám'), findsOneWidget);
    expect(find.text('Thông báo'), findsOneWidget);
    expect(find.text('Cá nhân'), findsOneWidget);
  });
}
