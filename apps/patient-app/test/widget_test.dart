import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:clinic_patient_app/app/patient_app.dart';
import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';

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

  testWidgets(
      'hides shell AppBar on all 5 tabs, signs out from profile, refreshes records on notification tap, and applies #2D5BFF theme',
      (tester) async {
    var recordRequests = 0;
    final sessionProvider = _SignOutTrackingProvider();
    final apiClient = ClinicApiClient(
      tokenProvider: sessionProvider,
      transport: MockClient((request) async {
        final path = request.url.path;
        if (path == '/api/v1/medical-records') {
          recordRequests++;
        }
        if (request.method == 'PATCH') {
          return http.Response(jsonEncode({'success': true, 'data': {}}), 200);
        }
        final data = switch (path) {
          '/api/v1/specialties' => {
              'items': [
                {'id': 'spec-1', 'name': 'Tim mạch'},
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/doctors' => {
              'items': [
                {
                  'id': 'doc-1',
                  'specialtyId': 'spec-1',
                  'displayName': 'BS. An',
                  'isActive': true,
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/appointments' => {
              'items': <Object>[],
              'page': 1,
              'limit': 20,
              'total': 0,
            },
          '/api/v1/medical-records' => {
              'items': [
                {
                  'id': 'rec-1',
                  'appointmentId': 'appt-1',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Khám định kỳ',
                  'prescription': <Object>[],
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/notifications' => {
              'items': [
                {
                  'id': 'notif-1',
                  'status': 'UNREAD',
                  'title': 'Có kết quả khám mới',
                  'message': 'Chạm để xem hồ sơ',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {'recordId': 'rec-1'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/users/me' => {
              'id': 'test-user',
              'email': 'patient@example.com',
              'fullName': 'Nguyễn Văn A',
              'phone': '0901234567',
              'role': 'PATIENT',
              'status': 'ACTIVE',
            },
          _ => <String, Object?>{},
        };
        return http.Response.bytes(
          utf8.encode(jsonEncode({'success': true, 'data': data})),
          200,
          headers: const {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    await tester.pumpWidget(
      PatientApp(
        sessionProvider: sessionProvider,
        apiClient: apiClient,
      ),
    );
    await tester.pumpAndSettle();

    // Theme checks (#2D5BFF)
    expect(ClinicColors.primary, const Color(0xFF2D5BFF));
    final theme = buildPatientTheme();
    expect(theme.filledButtonTheme.style, isNotNull);
    expect(theme.filledButtonTheme.style!.textStyle!.resolve({}), isNotNull);
    expect(
      theme.navigationBarTheme.indicatorColor,
      ClinicColors.primarySoft,
    );
    expect(
      theme.navigationBarTheme.iconTheme
          ?.resolve({WidgetState.selected})?.color,
      ClinicColors.primary,
    );
    expect(
      theme.navigationBarTheme.iconTheme?.resolve({})?.color,
      ClinicColors.muted,
    );

    // Check NavigationBar on shell
    final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(navBar.indicatorColor, ClinicColors.primarySoft);

    // Verify at most 1 AppBar on each of the 5 tabs (no double AppBar on Profile)
    for (final label in ['Bác sĩ', 'Lịch hẹn', 'Hồ sơ khám', 'Thông báo', 'Cá nhân']) {
      await tester.tap(find.text(label).last);
      await tester.pumpAndSettle();
      expect(find.byType(AppBar).evaluate().length, lessThanOrEqualTo(1));
    }
    expect(find.text('Cá nhân'), findsOneWidget);
    expect(find.text('Hồ sơ cá nhân'), findsOneWidget);

    // Tapping notification with recordId switches to /records & refreshes
    final initialRecordRequests = recordRequests;
    await tester.tap(find.text('Thông báo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Có kết quả khám mới'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      2,
    );
    expect(recordRequests, greaterThan(initialRecordRequests));

    // Sign out from Profile tab returns to AuthPage
    await tester.tap(find.text('Cá nhân'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Đăng xuất'));
    await tester.pumpAndSettle();
    expect(sessionProvider.signedOut, isTrue);
    expect(find.widgetWithText(FilledButton, 'Đăng nhập'), findsOneWidget);
  });
}

class _SignOutTrackingProvider
    implements SessionProvider, CredentialSessionProvider {
  bool signedOut = false;

  @override
  Future<String?> getAccessToken() async => signedOut ? null : 'test-token';

  @override
  Future<AuthSession?> restoreSession() async => signedOut
      ? null
      : const AuthSession(
          userId: 'test-user',
          role: UserRole.patient,
          accessToken: 'test-token',
        );

  @override
  Future<AuthSession> signIn(String email, String password) async {
    signedOut = false;
    return (await restoreSession())!;
  }

  @override
  Future<AuthSession?> signUp(
    String fullName,
    String email,
    String password,
  ) async =>
      null;

  @override
  Future<void> signOut() async {
    signedOut = true;
  }
}
