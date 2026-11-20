import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:clinic_patient_app/core/api/api_models.dart';
import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/users/profile_page.dart';
import 'package:clinic_patient_app/features/users/profile_validation.dart';
import 'package:clinic_patient_app/features/users/widgets/insurance_card.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_page_header.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

Map<String, Object?> _profile({
  String? insuranceNumber = 'DN40112345678',
  String? dateOfBirth = '1985-05-12',
  String fullName = 'Nguyễn Văn A',
}) => {
  'success': true,
  'data': {
    'id': 'user-1',
    'email': 'patient@example.com',
    'fullName': fullName,
    'phone': '0901234567',
    'role': 'PATIENT',
    'status': 'ACTIVE',
    'patientProfile': {
      'id': 'patient-1',
      'userId': 'user-1',
      'dateOfBirth': dateOfBirth,
      'gender': 'MALE',
      'address': '12 Lê Lợi, Q.1, TP.HCM',
      'emergencyContact': '0987654321',
      'insuranceNumber': insuranceNumber,
    },
  },
};

void main() {
  group('1. Unit helpers & validation', () {
    test('maskInsurance and formatInsuranceDate handle boundaries', () {
      expect(maskInsurance('DN40112345678'), 'DN401...***');
      expect(maskInsurance('INS-1'), 'INS-1');
      expect(maskInsurance(null), '—');
      expect(maskInsurance(''), '—');

      expect(formatInsuranceDate('1985-05-12'), '12/05/1985');
      expect(formatInsuranceDate('1985-05-12T08:00:00Z'), '12/05/1985');
      expect(formatInsuranceDate(null), '—');
      expect(formatInsuranceDate('   '), '—');
    });

    test('validateFullName enforces 2..120 chars after trim', () {
      expect(validateFullName(''), 'Họ và tên không được để trống.');
      expect(validateFullName('   '), 'Họ và tên không được để trống.');
      expect(validateFullName('A'), 'Họ và tên phải có từ 2 đến 120 ký tự.');
      expect(validateFullName('An'), isNull);
      expect(validateFullName('A' * 120), isNull);
      expect(
        validateFullName('A' * 121),
        'Họ và tên phải có từ 2 đến 120 ký tự.',
      );
    });

    test('validatePhone matches backend regex', () {
      expect(validatePhone(''), isNull);
      expect(validatePhone('0901234567'), isNull);
      expect(validatePhone('+84 90 123 4567'), isNull);
      expect(validatePhone('abc'), isNotNull);
      expect(validatePhone('1234567'), isNotNull);
    });

    test('validateDateOfBirth checks YYYY-MM-DD, calendar, and non-future', () {
      final now = DateTime(2026, 11, 20);
      expect(validateDateOfBirth('', now: now), isNull);
      expect(validateDateOfBirth('1985-05-12', now: now), isNull);
      expect(validateDateOfBirth('2024-02-29', now: now), isNull);
      expect(validateDateOfBirth('2025-02-29', now: now), isNotNull);
      expect(validateDateOfBirth('2026-02-30', now: now), isNotNull);
      expect(validateDateOfBirth('2026-13-01', now: now), isNotNull);
      expect(validateDateOfBirth('12/05/1985', now: now), isNotNull);
      expect(validateDateOfBirth('2026-11-21', now: now), isNotNull);
    });

    test('validateAddress, emergencyContact, insuranceNumber lengths', () {
      expect(validateAddress('a' * 500), isNull);
      expect(validateAddress('a' * 501), isNotNull);
      expect(validateEmergencyContact('a' * 120), isNull);
      expect(validateEmergencyContact('a' * 121), isNotNull);
      expect(validateInsuranceNumber('a' * 50), isNull);
      expect(validateInsuranceNumber('a' * 51), isNotNull);
    });

    test('friendlyProfileError never leaks ApiException', () {
      const apiErr = ApiException(
        statusCode: 500,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Internal error',
      );
      final mapped = friendlyProfileError(apiErr);
      expect(mapped, isNot(contains('ApiException')));
      expect(mapped, contains('Hệ thống đang tạm gián đoạn'));

      const validationErr = ApiException(
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        details: [
          {
            'path': ['dateOfBirth'],
          },
        ],
      );
      expect(
        friendlyProfileError(validationErr),
        contains('Ngày sinh không hợp lệ'),
      );
    });
  });

  group('2 & 3. Header, 3 states, RefreshIndicator & InsuranceCard', () {
    testWidgets(
      'renders ProfilePage without fake sample text or hardcoded expiry',
      (tester) async {
        await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
        await tester.pumpAndSettle();

        expect(find.byType(ClinicPageHeader), findsOneWidget);
        expect(find.byType(AppBar), findsNothing);
        expect(find.text('Hồ sơ cá nhân'), findsOneWidget);
        expect(find.text('Cá nhân'), findsNothing);
        expect(find.byKey(const Key('insurance-card')), findsOneWidget);
        expect(find.text('BẢO HIỂM'), findsOneWidget);
        expect(find.text('Thẻ mẫu'), findsNothing);
        expect(find.text('31/12/2027'), findsNothing);
        expect(find.text('Hạn dùng:'), findsNothing);
        expect(find.text('Chưa cập nhật'), findsWidgets);
        expect(find.text('Chưa có số BHYT'), findsOneWidget);
        expect(find.text('Thông tin liên hệ'), findsOneWidget);
        expect(find.text('Hồ sơ y tế & BHYT'), findsOneWidget);
        expect(find.text('Chỉnh sửa thông tin hồ sơ'), findsOneWidget);
      },
    );

    testWidgets(
      'keeps ClinicPageHeader, logout button and RefreshIndicator in loading and error states',
      (tester) async {
        var profileAttempts = 0;
        var signOutCalled = 0;
        final firstLoad = Completer<http.Response>();

        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              profileAttempts++;
              if (profileAttempts == 1) {
                return firstLoad.future;
              }
              return http.Response(
                jsonEncode({
                  'success': false,
                  'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Down'},
                }),
                503,
              );
            }
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {'items': <Object>[]},
              }),
              200,
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(
            home: ProfilePage(
              apiClient: apiClient,
              onSignOut: () => signOutCalled++,
            ),
          ),
        );
        await tester.pump();

        // Loading state assertions
        expect(find.byType(ClinicPageHeader), findsOneWidget);
        expect(find.byType(AppBar), findsNothing);
        expect(find.byType(RefreshIndicator), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.byTooltip('Đăng xuất'), findsOneWidget);
        expect(find.byTooltip('Làm mới'), findsOneWidget);

        // Complete first request with HTTP 500 -> Error state
        firstLoad.complete(
          http.Response(
            jsonEncode({
              'success': false,
              'error': {'code': 'INTERNAL_ERROR', 'message': 'Server down'},
            }),
            500,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(ClinicPageHeader), findsOneWidget);
        expect(find.byType(RefreshIndicator), findsOneWidget);
        expect(find.byTooltip('Đăng xuất'), findsOneWidget);
        expect(find.text('Thử lại'), findsOneWidget);
        expect(find.textContaining('ApiException'), findsNothing);

        // Pull to refresh on error state triggers GET /users/me again
        await tester.fling(
          find.byType(SingleChildScrollView),
          const Offset(0, 300),
          1000,
        );
        await tester.pumpAndSettle();
        expect(profileAttempts, greaterThanOrEqualTo(2));

        // Tap header logout button directly calls onSignOut
        await tester.tap(find.byTooltip('Đăng xuất'));
        await tester.pumpAndSettle();
        expect(signOutCalled, 1);
      },
    );

    testWidgets(
      'displays #2D5BFF theme, masked BHYT, real DOB, and RefreshIndicator on data state',
      (tester) async {
        var meCalls = 0;
        var sessionsCalls = 0;
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              meCalls++;
              return http.Response(
                jsonEncode(_profile()),
                200,
                headers: const {
                  'content-type': 'application/json; charset=utf-8',
                },
              );
            }
            if (request.url.path == '/api/v1/auth/sessions') {
              sessionsCalls++;
              return http.Response(
                jsonEncode({
                  'success': true,
                  'data': {'items': <Object>[]},
                }),
                200,
              );
            }
            return http.Response(
              jsonEncode({'success': true, 'data': <String, Object?>{}}),
              200,
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        expect(find.text('NGUYỄN VĂN A'), findsOneWidget);
        expect(find.text('DN401...***'), findsNWidgets(2));
        expect(find.text('DN40112345678'), findsNothing);
        expect(find.text('12/05/1985'), findsOneWidget);
        expect(find.text('Đã lưu mã BHYT'), findsOneWidget);
        expect(find.text('Thẻ mẫu'), findsNothing);
        expect(find.text('31/12/2027'), findsNothing);

        // Verify #2D5BFF colors on Avatar and InsuranceCard
        final avatar = tester.widget<CircleAvatar>(find.byType(CircleAvatar));
        expect(avatar.backgroundColor, ClinicColors.primarySoft);

        final cardContainer = tester.widget<Container>(
          find.byKey(const Key('insurance-card')),
        );
        final decoration = cardContainer.decoration! as BoxDecoration;
        final gradient = decoration.gradient! as LinearGradient;
        expect(gradient.colors, const [
          ClinicColors.primary,
          ClinicColors.primaryDark,
        ]);

        // Pull to refresh reloads /users/me and /auth/sessions
        final prevMe = meCalls;
        final prevSessions = sessionsCalls;
        await tester.fling(
          find.byType(SingleChildScrollView),
          const Offset(0, 300),
          1000,
        );
        await tester.pumpAndSettle();
        expect(meCalls, greaterThan(prevMe));
        expect(sessionsCalls, greaterThan(prevSessions));
      },
    );
  });

  group('4 & 5. Edit sheet validation & 2-step PATCH handling', () {
    testWidgets(
      'validates fullName (2..120), phone, dateOfBirth, and requires confirm dialog before PATCH',
      (tester) async {
        final requests = <http.Request>[];
        final transport = MockClient((request) async {
          requests.add(request);
          if (request.method == 'GET') {
            if (request.url.path == '/api/v1/users/me') {
              return http.Response(
                jsonEncode(_profile()),
                200,
                headers: const {
                  'content-type': 'application/json; charset=utf-8',
                },
              );
            }
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {'items': <Object>[]},
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'success': true,
              'data': request.url.path.endsWith('/users/me')
                  ? _profile()['data']
                  : (_profile()['data']
                        as Map<String, Object?>)['patientProfile'],
            }),
            200,
            headers: const {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: transport,
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.pumpAndSettle();

        // 1. Empty fullName
        await tester.enterText(find.byType(TextField).at(0), '   ');
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        expect(find.text('Họ và tên không được để trống.'), findsOneWidget);
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 2. Single char fullName (< 2)
        await tester.enterText(find.byType(TextField).at(0), 'A');
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        expect(
          find.text('Họ và tên phải có từ 2 đến 120 ký tự.'),
          findsOneWidget,
        );
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 3. > 120 chars fullName
        await tester.enterText(find.byType(TextField).at(0), 'A' * 121);
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        expect(
          find.text('Họ và tên phải có từ 2 đến 120 ký tự.'),
          findsOneWidget,
        );
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 4. Invalid phone
        await tester.enterText(find.byType(TextField).at(0), 'Patient Updated');
        await tester.enterText(find.byType(TextField).at(1), 'abc');
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('profile-validation-error')), findsOneWidget);
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 5. Invalid dateOfBirth
        await tester.enterText(find.byType(TextField).at(1), '0901234567');
        await tester.enterText(find.byType(TextField).at(2), '2026-02-30');
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('profile-validation-error')), findsOneWidget);
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 6. Valid values -> opens confirmation dialog -> Hủy sends 0 PATCH
        await tester.enterText(find.byType(TextField).at(2), '1990-08-15');
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();

        expect(find.text('Xác nhận cập nhật hồ sơ?'), findsOneWidget);
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        await tester.tap(find.text('Hủy'));
        await tester.pumpAndSettle();
        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

        // 7. Confirm -> sends both PATCHes with strict payloads
        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('confirm-save-profile-button')));
        await tester.pumpAndSettle();

        final patches =
            requests.where((request) => request.method == 'PATCH').toList();
        expect(
          patches.map((request) => request.url.path),
          ['/api/v1/users/me', '/api/v1/patients/patient-1'],
        );
        final step1Body = jsonDecode(patches.first.body) as Map<String, dynamic>;
        expect(step1Body.keys.toSet(), {'fullName', 'phone'});
        final step2Body = jsonDecode(patches[1].body) as Map<String, dynamic>;
        expect(step2Body.keys.toSet(), {
          'dateOfBirth',
          'gender',
          'address',
          'emergencyContact',
          'insuranceNumber',
        });
        expect(step2Body['dateOfBirth'], '1990-08-15');
        expect(
          requests.any((r) => r.url.path.contains('/auth/password')),
          isFalse,
        );
      },
    );

    testWidgets(
      'sends null in step 1 and step 2 PATCH payloads when optional fields are cleared',
      (tester) async {
        final requests = <http.Request>[];
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            requests.add(request);
            if (request.method == 'GET') {
              if (request.url.path == '/api/v1/users/me') {
                return http.Response(
                  jsonEncode(_profile()),
                  200,
                  headers: const {
                    'content-type': 'application/json; charset=utf-8',
                  },
                );
              }
              return http.Response(
                jsonEncode({
                  'success': true,
                  'data': {'items': <Object>[]},
                }),
                200,
              );
            }
            return http.Response(
              jsonEncode({
                'success': true,
                'data': request.url.path.endsWith('/users/me')
                    ? _profile()['data']
                    : (_profile()['data']
                          as Map<String, Object?>)['patientProfile'],
              }),
              200,
              headers: const {'content-type': 'application/json; charset=utf-8'},
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.pumpAndSettle();

        // Clear phone and all text fields in step 2
        await tester.enterText(find.byType(TextField).at(1), '   ');
        await tester.enterText(find.byType(TextField).at(2), '');
        await tester.enterText(find.byType(TextField).at(3), '   ');
        await tester.enterText(find.byType(TextField).at(4), '');
        await tester.enterText(find.byType(TextField).at(5), '  ');

        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('confirm-save-profile-button')));
        await tester.pumpAndSettle();

        final patches =
            requests.where((request) => request.method == 'PATCH').toList();
        expect(patches.length, 2);
        final step1Body = jsonDecode(patches[0].body) as Map<String, dynamic>;
        expect(step1Body['phone'], isNull);

        final step2Body = jsonDecode(patches[1].body) as Map<String, dynamic>;
        expect(step2Body.keys.toSet(), {
          'dateOfBirth',
          'gender',
          'address',
          'emergencyContact',
          'insuranceNumber',
        });
        expect(step2Body['dateOfBirth'], isNull);
        expect(step2Body['address'], isNull);
        expect(step2Body['emergencyContact'], isNull);
        expect(step2Body['insuranceNumber'], isNull);
      },
    );

    testWidgets(
      'normalizes ISO T dateOfBirth, resets medical data when patientProfile becomes null, disables medical fields in edit sheet, and shows SnackBar on refresh error',
      (tester) async {
        var meCalls = 0;
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              meCalls++;
              if (meCalls == 1) {
                return http.Response(
                  jsonEncode(
                    _profile(dateOfBirth: '1985-05-12T00:00:00.000Z'),
                  ),
                  200,
                  headers: const {
                    'content-type': 'application/json; charset=utf-8',
                  },
                );
              }
              if (meCalls == 2) {
                return http.Response(
                  jsonEncode({
                    'success': true,
                    'data': {
                      'id': 'user-1',
                      'email': 'patient@example.com',
                      'fullName': 'Nguyễn Văn A',
                      'phone': '0901234567',
                      'role': 'PATIENT',
                      'status': 'ACTIVE',
                      'patientProfile': null,
                    },
                  }),
                  200,
                  headers: const {
                    'content-type': 'application/json; charset=utf-8',
                  },
                );
              }
              return http.Response(
                jsonEncode({
                  'success': false,
                  'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Down'},
                }),
                503,
              );
            }
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {'items': <Object>[]},
              }),
              200,
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        // First load normalized ISO timestamp dateOfBirth by stripping T...
        expect(find.text('1985-05-12'), findsOneWidget);
        expect(find.text('1985-05-12T00:00:00.000Z'), findsNothing);
        expect(find.text('12 Lê Lợi, Q.1, TP.HCM'), findsOneWidget);
        expect(find.text('DN401...***'), findsNWidgets(2));

        // Pull to refresh -> second load returns patientProfile: null -> resets medical fields
        await tester.fling(
          find.byType(SingleChildScrollView),
          const Offset(0, 300),
          1000,
        );
        await tester.pumpAndSettle();

        expect(find.text('1985-05-12'), findsNothing);
        expect(find.text('12 Lê Lợi, Q.1, TP.HCM'), findsNothing);
        expect(find.text('DN401...***'), findsNothing);
        expect(find.text('Chưa có số BHYT'), findsOneWidget);

        // Open edit sheet when patientProfile == null -> shows clear notice & disables 5 medical fields
        await tester.ensureVisible(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.pumpAndSettle();

        expect(
          find.byKey(const Key('no-patient-profile-notice')),
          findsOneWidget,
        );
        expect(
          tester.widget<TextField>(find.byType(TextField).at(0)).enabled ?? true,
          isTrue,
        );
        expect(
          tester.widget<TextField>(find.byType(TextField).at(1)).enabled ?? true,
          isTrue,
        );
        expect(tester.widget<TextField>(find.byType(TextField).at(2)).enabled, isFalse);
        expect(tester.widget<TextField>(find.byType(TextField).at(3)).enabled, isFalse);
        expect(tester.widget<TextField>(find.byType(TextField).at(4)).enabled, isFalse);
        expect(tester.widget<TextField>(find.byType(TextField).at(5)).enabled, isFalse);

        // Dismiss sheet and scroll back to offset 0 before pulling RefreshIndicator
        await tester.tapAt(const Offset(10, 10));
        await tester.pumpAndSettle();
        tester.state<ScrollableState>(find.byType(Scrollable)).position.jumpTo(0);
        await tester.pump();

        // Pull to refresh when data already loaded -> 503 error shows friendly SnackBar
        await tester.fling(
          find.byType(SingleChildScrollView),
          const Offset(0, 300),
          1000,
        );
        await tester.pumpAndSettle();

        expect(meCalls, 3);
        expect(
          find.text('Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.'),
          findsOneWidget,
        );
        expect(find.textContaining('ApiException'), findsNothing);
        expect(find.text('NGUYỄN VĂN A'), findsOneWidget);
      },
    );

    testWidgets(
      'preserves step 1 state and keeps user inputs with friendly Vietnamese error when step 2 fails',
      (tester) async {
        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.method == 'GET') {
              if (request.url.path == '/api/v1/users/me') {
                return http.Response(
                  jsonEncode(_profile()),
                  200,
                  headers: const {
                    'content-type': 'application/json; charset=utf-8',
                  },
                );
              }
              return http.Response(
                jsonEncode({
                  'success': true,
                  'data': {'items': <Object>[]},
                }),
                200,
              );
            }
            if (request.method == 'PATCH' &&
                request.url.path == '/api/v1/users/me') {
              return http.Response(
                jsonEncode({
                  'success': true,
                  'data': {
                    'id': 'user-1',
                    'email': 'patient@example.com',
                    'fullName': 'Tên Mới',
                    'phone': '0911222333',
                    'role': 'PATIENT',
                    'status': 'ACTIVE',
                  },
                }),
                200,
                headers: const {
                  'content-type': 'application/json; charset=utf-8',
                },
              );
            }
            return http.Response(
              jsonEncode({
                'success': false,
                'error': {
                  'code': 'VALIDATION_ERROR',
                  'message': 'Bad patient payload',
                  'details': [
                    {
                      'path': ['insuranceNumber'],
                    },
                  ],
                },
              }),
              400,
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
        await tester.pumpAndSettle();

        await tester.enterText(find.byType(TextField).at(0), 'Tên Mới');
        await tester.enterText(find.byType(TextField).at(1), '0911222333');
        await tester.enterText(find.byType(TextField).at(3), '99 Hai Bà Trưng');

        await tester.ensureVisible(find.text('Lưu thay đổi'));
        await tester.tap(find.text('Lưu thay đổi'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('confirm-save-profile-button')));
        await tester.pumpAndSettle();

        // Sheet remains open with user's entered address intact and friendly error
        expect(find.byKey(const Key('profile-validation-error')), findsOneWidget);
        expect(
          find.textContaining('Đã lưu họ tên và số điện thoại.'),
          findsOneWidget,
        );
        expect(find.textContaining('ApiException('), findsNothing);
        expect(find.text('99 Hai Bà Trưng'), findsOneWidget);

        // Step 1 state already updated on underlying ProfilePage
        expect(find.text('Tên Mới'), findsWidgets);
        expect(find.text('0911222333'), findsWidgets);
      },
    );

    testWidgets(
      'ignores stale /users/me response when newer refresh completes first (epoch guard)',
      (tester) async {
        var meCalls = 0;
        final slowFirstLoad = Completer<http.Response>();
        final fastSecondLoad = Completer<http.Response>();

        final apiClient = ClinicApiClient(
          tokenProvider: _TokenProvider(),
          transport: MockClient((request) async {
            if (request.url.path == '/api/v1/users/me') {
              meCalls++;
              if (meCalls == 1) {
                return slowFirstLoad.future;
              }
              return fastSecondLoad.future;
            }
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {'items': <Object>[]},
              }),
              200,
            );
          }),
          baseUrl: 'http://gateway.test',
        );

        await tester.pumpWidget(
          MaterialApp(home: ProfilePage(apiClient: apiClient)),
        );
        await tester.pump();
        expect(meCalls, 1);

        // Trigger second refresh before first slow request resolves
        await tester.tap(find.byTooltip('Làm mới'));
        await tester.pump();
        expect(meCalls, 2);

        // Second request finishes with fresh name
        fastSecondLoad.complete(
          http.Response(
            jsonEncode(_profile(fullName: 'Tên Mới Nhất')),
            200,
            headers: const {'content-type': 'application/json; charset=utf-8'},
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('TÊN MỚI NHẤT'), findsOneWidget);

        // Stale first request arrives late -> must NOT overwrite fresh state
        slowFirstLoad.complete(
          http.Response(
            jsonEncode(_profile(fullName: 'Tên Cũ Bị Trễ')),
            200,
            headers: const {'content-type': 'application/json; charset=utf-8'},
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('TÊN MỚI NHẤT'), findsOneWidget);
        expect(find.text('TÊN CŨ BỊ TRỄ'), findsNothing);
      },
    );
  });
}
