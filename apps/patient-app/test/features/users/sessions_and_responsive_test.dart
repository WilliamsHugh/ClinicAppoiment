import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/users/profile_page.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

Map<String, Object?> _profileJson({
  String fullName = 'Nguyễn Văn A',
  String email = 'patient@example.com',
  String address = '12 Lê Lợi, Q.1, TP.HCM',
}) => {
  'success': true,
  'data': {
    'id': 'user-1',
    'email': email,
    'fullName': fullName,
    'phone': '0901234567',
    'role': 'PATIENT',
    'status': 'ACTIVE',
    'patientProfile': {
      'id': 'patient-1',
      'userId': 'user-1',
      'dateOfBirth': '1985-05-12',
      'gender': 'MALE',
      'address': address,
      'emergencyContact': '0987654321',
      'insuranceNumber': 'DN40112345678',
    },
  },
};

http.Response _jsonResponse(Object body, {int statusCode = 200}) {
  return http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    statusCode,
    headers: const {'content-type': 'application/json; charset=utf-8'},
  );
}

void main() {
  group('6. Sessions management & forbidden API check', () {
    testWidgets(
      'loads /auth/sessions + /auth/session, identifies current session, revokes other session with confirm dialog, and never calls /auth/password/*',
      (tester) async {
        final requests = <http.Request>[];
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            requests.add(request);
            final path = request.url.path;
            if (request.method == 'GET' && path == '/api/v1/users/me') {
              return _jsonResponse(_profileJson());
            }
            if (request.method == 'GET' && path == '/api/v1/auth/session') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-1', 'state': 'ACTIVE'},
              });
            }
            if (request.method == 'GET' && path == '/api/v1/auth/sessions') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'sessionId': 'sess-1',
                      'isCurrent': false, // Backend bug simulated!
                      'role': 'PATIENT',
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-20T04:00:00Z',
                      'deviceInfo': 'Mozilla/5.0 (Linux; Android 14)',
                    },
                    {
                      'sessionId': 'sess-2',
                      'isCurrent': false,
                      'role': 'PATIENT',
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-19T10:30:00Z',
                      'deviceInfo': 'Mozilla/5.0 (Windows NT 10.0)',
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 2,
                },
              });
            }
            if (request.method == 'DELETE' &&
                path == '/api/v1/auth/sessions/sess-2') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-2', 'revoked': true},
              });
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            theme: buildPatientTheme(),
            home: ProfilePage(apiClient: apiClient),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Phiên đăng nhập & Bảo mật'), findsOneWidget);
        expect(find.text('Thiết bị Android'), findsOneWidget);
        expect(find.text('Trình duyệt Windows'), findsOneWidget);
        expect(find.text('Phiên hiện tại'), findsOneWidget);
        // UTC 04:00 -> VN 11:00
        expect(find.textContaining('20/11/2026 11:00'), findsOneWidget);

        // Current session does NOT have a revoke button; sess-2 does
        expect(find.byKey(const Key('revoke-session-sess-1')), findsNothing);
        final revokeSess2 = find.byKey(const Key('revoke-session-sess-2'));
        expect(revokeSess2, findsOneWidget);

        await tester.ensureVisible(revokeSess2);
        await tester.tap(revokeSess2);
        await tester.pumpAndSettle();

        // Cancel first
        expect(find.text('Thu hồi phiên đăng nhập?'), findsOneWidget);
        await tester.tap(find.text('Hủy'));
        await tester.pumpAndSettle();
        expect(requests.where((r) => r.method == 'DELETE'), isEmpty);

        // Confirm revoke
        await tester.tap(revokeSess2);
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const Key('confirm-revoke-session-sess-2')),
        );
        await tester.pumpAndSettle();

        final deletes = requests.where((r) => r.method == 'DELETE').toList();
        expect(deletes.length, 1);
        expect(deletes.first.url.path, '/api/v1/auth/sessions/sess-2');
        expect(find.text('Trình duyệt Windows'), findsNothing);
        expect(
          requests.any((r) => r.url.path.contains('/auth/password')),
          isFalse,
        );
      },
    );

    testWidgets(
      'falls back gracefully when /auth/sessions fails with 503',
      (tester) async {
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              return _jsonResponse(_profileJson());
            }
            if (request.url.path == '/api/v1/auth/sessions') {
              return _jsonResponse(
                {
                  'success': false,
                  'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Down'},
                },
                statusCode: 503,
              );
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        // Page still renders user profile & retry inside sessions section
        expect(find.text('Nguyễn Văn A'), findsWidgets);
        expect(find.text('Phiên đăng nhập & Bảo mật'), findsOneWidget);
        expect(find.text('Thử tải lại phiên'), findsOneWidget);
        expect(find.textContaining('ApiException'), findsNothing);
      },
    );

    testWidgets(
      'keeps session item and shows friendly Vietnamese SnackBar when DELETE /auth/sessions/{id} returns 500',
      (tester) async {
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            final path = request.url.path;
            if (request.method == 'GET' && path == '/api/v1/users/me') {
              return _jsonResponse(_profileJson());
            }
            if (request.method == 'GET' && path == '/api/v1/auth/session') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-1', 'state': 'ACTIVE'},
              });
            }
            if (request.method == 'GET' && path == '/api/v1/auth/sessions') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'sessionId': 'sess-1',
                      'isCurrent': true,
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-20T04:00:00Z',
                      'deviceInfo': 'Mozilla/5.0 (Linux; Android 14)',
                    },
                    {
                      'sessionId': 'sess-2',
                      'isCurrent': false,
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-19T10:30:00Z',
                      'deviceInfo': 'Mozilla/5.0 (Windows NT 10.0)',
                    },
                  ],
                },
              });
            }
            if (request.method == 'DELETE' &&
                path == '/api/v1/auth/sessions/sess-2') {
              return _jsonResponse(
                {
                  'success': false,
                  'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Database error',
                  },
                },
                statusCode: 500,
              );
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            theme: buildPatientTheme(),
            home: ProfilePage(apiClient: apiClient),
          ),
        );
        await tester.pumpAndSettle();

        final revokeSess2 = find.byKey(const Key('revoke-session-sess-2'));
        await tester.ensureVisible(revokeSess2);
        await tester.tap(revokeSess2);
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const Key('confirm-revoke-session-sess-2')),
        );
        await tester.pumpAndSettle();

        // Session stays in list and friendly Vietnamese SnackBar is displayed
        expect(find.text('Trình duyệt Windows'), findsOneWidget);
        expect(find.byKey(const Key('revoke-session-sess-2')), findsOneWidget);
        expect(
          find.text('Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.'),
          findsOneWidget,
        );
        expect(find.textContaining('ApiException'), findsNothing);
      },
    );

    testWidgets(
      'tracks multiple concurrent session revocations independently via revokingSessionIds',
      (tester) async {
        final revoke2Completer = Completer<http.Response>();
        final revoke3Completer = Completer<http.Response>();

        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            final path = request.url.path;
            if (request.method == 'GET' && path == '/api/v1/users/me') {
              return _jsonResponse(_profileJson());
            }
            if (request.method == 'GET' && path == '/api/v1/auth/session') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-1'},
              });
            }
            if (request.method == 'GET' && path == '/api/v1/auth/sessions') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'sessionId': 'sess-1',
                      'isCurrent': true,
                      'state': 'ACTIVE',
                      'deviceInfo': 'Mozilla/5.0 (Linux; Android 14)',
                    },
                    {
                      'sessionId': 'sess-2',
                      'isCurrent': false,
                      'state': 'ACTIVE',
                      'deviceInfo': 'Mozilla/5.0 (Windows NT 10.0)',
                    },
                    {
                      'sessionId': 'sess-3',
                      'isCurrent': false,
                      'state': 'ACTIVE',
                      'deviceInfo': 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
                    },
                  ],
                },
              });
            }
            if (request.method == 'DELETE' &&
                path == '/api/v1/auth/sessions/sess-2') {
              return revoke2Completer.future;
            }
            if (request.method == 'DELETE' &&
                path == '/api/v1/auth/sessions/sess-3') {
              return revoke3Completer.future;
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            theme: buildPatientTheme(),
            home: ProfilePage(apiClient: apiClient),
          ),
        );
        await tester.pumpAndSettle();

        // Start revoking sess-2
        final revoke2 = find.byKey(const Key('revoke-session-sess-2'));
        await tester.ensureVisible(revoke2);
        await tester.tap(revoke2);
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const Key('confirm-revoke-session-sess-2')),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));

        // Start revoking sess-3 while sess-2 is still pending
        final revoke3 = find.byKey(const Key('revoke-session-sess-3'));
        await tester.ensureVisible(revoke3);
        await tester.tap(revoke3);
        await tester.pump(const Duration(milliseconds: 300));
        await tester.tap(
          find.byKey(const Key('confirm-revoke-session-sess-3')),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));

        // Both buttons are disabled independently while in-flight
        expect(
          tester.widget<OutlinedButton>(revoke2).onPressed,
          isNull,
        );
        expect(
          tester.widget<OutlinedButton>(revoke3).onPressed,
          isNull,
        );

        // Complete sess-2 only -> sess-3 remains disabled (still revoking)
        revoke2Completer.complete(
          _jsonResponse({
            'success': true,
            'data': {'revoked': true},
          }),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(find.byKey(const Key('revoke-session-sess-2')), findsNothing);
        expect(
          tester.widget<OutlinedButton>(revoke3).onPressed,
          isNull,
        );

        // Complete sess-3
        revoke3Completer.complete(
          _jsonResponse({
            'success': true,
            'data': {'revoked': true},
          }),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('revoke-session-sess-3')), findsNothing);
      },
    );
  });

  group('7. Bottom Sign Out confirmation & null onSignOut behavior', () {
    testWidgets(
      'bottom Sign Out opens confirmation dialog while header icon calls onSignOut directly',
      (tester) async {
        var signOutCount = 0;

        await tester.pumpWidget(
          MaterialApp(
            home: ProfilePage(onSignOut: () => signOutCount++),
          ),
        );
        await tester.pumpAndSettle();

        final bottomSignOut = find.byKey(const Key('profile-sign-out-button'));
        expect(bottomSignOut, findsOneWidget);
        await tester.ensureVisible(bottomSignOut);
        await tester.tap(bottomSignOut);
        await tester.pumpAndSettle();

        expect(find.text('Xác nhận đăng xuất?'), findsOneWidget);
        await tester.tap(find.text('Hủy'));
        await tester.pumpAndSettle();
        expect(signOutCount, 0);

        await tester.tap(bottomSignOut);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('confirm-sign-out-button')));
        await tester.pumpAndSettle();
        expect(signOutCount, 1);

        // Header logout button has tooltip 'Đăng xuất' and calls directly
        await tester.tap(find.byTooltip('Đăng xuất'));
        await tester.pumpAndSettle();
        expect(signOutCount, 2);
      },
    );

    testWidgets('hides both logout buttons when onSignOut is null', (
      tester,
    ) async {
      await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
      await tester.pumpAndSettle();

      expect(find.byTooltip('Đăng xuất'), findsNothing);
      expect(find.byKey(const Key('profile-sign-out-button')), findsNothing);
    });
  });

  group('8. Responsive 360px @ 1.4x (Zero RenderFlex Overflow)', () {
    testWidgets(
      'renders ProfilePage and ProfileEditSheet cleanly at 360x740 with textScaleFactor 1.4',
      (tester) async {
        tester.view.physicalSize = const Size(360, 740);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              return _jsonResponse(
                _profileJson(
                  fullName: 'Nguyễn Hoàng Phương Anh Minh Tú',
                  email: 'nguyenhoangphuonganhminhtu.patient@example.com',
                  address:
                      'Số 123 Đường Nguyễn Trãi, Phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh',
                ),
              );
            }
            if (request.url.path == '/api/v1/auth/session') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-1'},
              });
            }
            if (request.url.path == '/api/v1/auth/sessions') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'sessionId': 'sess-1',
                      'isCurrent': true,
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-20T04:00:00Z',
                      'deviceInfo':
                          'Dart/3.6 (dart:io) Health&Human Patient App',
                    },
                    {
                      'sessionId': 'sess-2',
                      'isCurrent': false,
                      'state': 'ACTIVE',
                      'lastActiveAt': '2026-11-19T08:00:00Z',
                      'deviceInfo': 'Mozilla/5.0 (Windows NT 10.0; Win64)',
                    },
                  ],
                },
              });
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            theme: buildPatientTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(1.4),
              ),
              child: child!,
            ),
            home: ProfilePage(apiClient: apiClient, onSignOut: () {}),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        // Open edit sheet at 360px @ 1.4x
        final editButton = find.text('Chỉnh sửa thông tin hồ sơ');
        await tester.ensureVisible(editButton);
        await tester.tap(editButton);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'opens save confirmation AlertDialog cleanly at 320x640 @ 1.5x with keyboard open (viewInsets.bottom = 280)',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1.0;
        tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          tester.view.resetViewInsets();
          tester.platformDispatcher.clearTextScaleFactorTestValue();
        });

        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              return _jsonResponse(_profileJson());
            }
            if (request.url.path == '/api/v1/auth/session') {
              return _jsonResponse({
                'success': true,
                'data': {'sessionId': 'sess-1'},
              });
            }
            if (request.url.path == '/api/v1/auth/sessions') {
              return _jsonResponse({
                'success': true,
                'data': {'items': <Object>[]},
              });
            }
            return _jsonResponse({
              'success': true,
              'data': <String, Object?>{},
            });
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            theme: buildPatientTheme(),
            home: ProfilePage(apiClient: apiClient, onSignOut: () {}),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        final editButton = find.text('Chỉnh sửa thông tin hồ sơ');
        await tester.ensureVisible(editButton);
        await tester.tap(editButton);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        // Simulate virtual keyboard open while tapping Save
        tester.view.viewInsets = const FakeViewPadding(bottom: 280);
        await tester.pump();

        final saveButton = find.text('Lưu thay đổi');
        await tester.ensureVisible(saveButton);
        await tester.tap(saveButton);
        await tester.pumpAndSettle();

        expect(find.text('Xác nhận cập nhật hồ sơ?'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  });
}
