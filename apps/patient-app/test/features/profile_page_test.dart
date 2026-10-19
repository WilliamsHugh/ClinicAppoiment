import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/users/profile_page.dart';
import 'package:clinic_patient_app/features/users/widgets/insurance_card.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

Map<String, Object?> _profile() => {
  'success': true,
  'data': {
    'id': 'user-1',
    'email': 'patient@example.com',
    'fullName': 'Nguyễn Văn A',
    'phone': '0901234567',
    'role': 'PATIENT',
    'status': 'ACTIVE',
    'patientProfile': {
      'id': 'patient-1',
      'userId': 'user-1',
      'dateOfBirth': '1985-05-12',
      'gender': 'MALE',
      'address': '12 Lê Lợi, Q.1, TP.HCM',
      'emergencyContact': '0987654321',
      'insuranceNumber': 'DN40112345678',
    },
  },
};

void main() {
  test('maskInsurance masks numbers longer than 5 chars to XXXXX...***', () {
    expect(maskInsurance('DN40112345678'), 'DN401...***');
    expect(maskInsurance('INS-1'), 'INS-1');
    expect(maskInsurance(null), '—');
    expect(maskInsurance(''), '—');
  });

  testWidgets('renders ProfilePage with InsuranceCard and section cards', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ cá nhân'), findsOneWidget);
    expect(find.byKey(const Key('insurance-card')), findsOneWidget);
    expect(find.text('BẢO HIỂM'), findsOneWidget);
    expect(find.text('Thẻ mẫu'), findsOneWidget);
    expect(find.text('Thông tin liên hệ'), findsOneWidget);
    expect(find.text('Hồ sơ y tế & BHYT'), findsOneWidget);
    expect(find.text('Chỉnh sửa thông tin hồ sơ'), findsOneWidget);
  });

  testWidgets(
    'masks BHYT in InsuranceCard and profile section, validates form, and requires confirmation dialog before PATCH',
    (tester) async {
      final requests = <http.Request>[];
      final transport = MockClient((request) async {
        requests.add(request);
        if (request.method == 'GET') {
          return http.Response(
            jsonEncode(_profile()),
            200,
            headers: const {'content-type': 'application/json; charset=utf-8'},
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

      // Check InsuranceCard & masked BHYT
      expect(find.text('NGUYỄN VĂN A'), findsOneWidget);
      expect(find.text('DN401...***'), findsNWidgets(2));
      expect(find.text('DN40112345678'), findsNothing);
      expect(find.text('12/05/1985'), findsOneWidget);

      await tester.ensureVisible(find.text('Chỉnh sửa thông tin hồ sơ'));
      await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
      await tester.pumpAndSettle();

      // Test validation: empty name
      await tester.enterText(find.byType(TextField).first, '   ');
      await tester.ensureVisible(find.text('Lưu thay đổi'));
      await tester.tap(find.text('Lưu thay đổi'));
      await tester.pumpAndSettle();
      expect(find.text('Họ và tên không được để trống.'), findsOneWidget);
      expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

      // Enter valid name and tap save -> opens confirmation dialog
      await tester.enterText(find.byType(TextField).first, 'Patient Updated');
      await tester.ensureVisible(find.text('Lưu thay đổi'));
      await tester.tap(find.text('Lưu thay đổi'));
      await tester.pumpAndSettle();

      expect(find.text('Xác nhận cập nhật hồ sơ?'), findsOneWidget);
      expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

      // Tap Hủy -> does not send PATCH
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

      // Tap Lưu thay đổi again and confirm in dialog
      await tester.tap(find.text('Lưu thay đổi'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-save-profile-button')));
      await tester.pumpAndSettle();

      expect(
        requests
            .where((request) => request.method == 'PATCH')
            .map((request) => request.url.path),
        ['/api/v1/users/me', '/api/v1/patients/patient-1'],
      );
      expect(
        requests.every((request) => request.url.host == 'gateway.test'),
        isTrue,
      );
    },
  );
}
