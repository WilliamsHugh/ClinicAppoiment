import 'package:flutter/material.dart';
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

class _RejectedLoginProvider
    implements SessionProvider, CredentialSessionProvider {
  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<AuthSession?> restoreSession() async => null;

  @override
  Future<AuthSession> signIn(String email, String password) {
    throw const SessionException('Email hoặc mật khẩu không đúng');
  }

  @override
  Future<AuthSession?> signUp(String fullName, String email, String password) {
    throw const SessionException('Địa chỉ email không hợp lệ');
  }

  @override
  Future<void> signOut() async {}
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

  testWidgets('keeps the login form visible and shows the backend error',
      (tester) async {
    await tester.pumpWidget(
      PatientApp(sessionProvider: _RejectedLoginProvider()),
    );
    await tester.pumpAndSettle();

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'patient@example.com');
    await tester.enterText(fields.at(1), 'wrong-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Đăng nhập'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('login-error')), findsOneWidget);
    expect(find.text('Email hoặc mật khẩu không đúng'), findsOneWidget);
    expect(find.text('Đăng nhập'), findsWidgets);
    expect(find.text('Đang kiểm tra phiên đăng nhập'), findsNothing);
  });
}
