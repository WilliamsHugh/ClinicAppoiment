import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/users/profile_page.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

Map<String, Object?> _profile() => {
      'success': true,
      'data': {
        'id': 'user-1',
        'email': 'patient@example.com',
        'fullName': 'Patient One',
        'phone': '0901234567',
        'role': 'PATIENT',
        'status': 'ACTIVE',
        'patientProfile': {
          'id': 'patient-1',
          'userId': 'user-1',
          'dateOfBirth': '1995-05-15',
          'gender': 'MALE',
          'address': 'Old address',
          'emergencyContact': '0987654321',
          'insuranceNumber': 'INS-1',
        },
      },
    };

void main() {
  testWidgets('renders ProfilePage with header and section cards',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ProfilePage(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ cá nhân'), findsOneWidget);
    expect(find.text('Thông tin liên hệ'), findsOneWidget);
    expect(find.text('Hồ sơ y tế & BHYT'), findsOneWidget);
    expect(find.text('Chỉnh sửa thông tin hồ sơ'), findsOneWidget);
  });

  testWidgets('loads and updates both contact and patient profile through Gateway',
      (tester) async {
    final requests = <http.Request>[];
    final transport = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') {
        return http.Response(jsonEncode(_profile()), 200);
      }
      return http.Response(jsonEncode({
        'success': true,
        'data': request.url.path.endsWith('/users/me')
            ? _profile()['data']
            : (_profile()['data'] as Map<String, Object?>)['patientProfile'],
      }), 200);
    });
    final apiClient = ClinicApiClient(
      tokenProvider: _TokenProvider(),
      transport: transport,
      baseUrl: 'http://gateway.test',
    );

    await tester.pumpWidget(MaterialApp(home: ProfilePage(apiClient: apiClient)));
    await tester.pumpAndSettle();
    expect(find.text('Patient One'), findsWidgets);

    await tester.tap(find.text('Chỉnh sửa thông tin hồ sơ'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Patient Updated');
    await tester.ensureVisible(find.text('Lưu thay đổi'));
    await tester.tap(find.text('Lưu thay đổi'));
    await tester.pumpAndSettle();

    expect(requests.where((request) => request.method == 'PATCH').map((request) => request.url.path), [
      '/api/v1/users/me',
      '/api/v1/patients/patient-1',
    ]);
    expect(requests.every((request) => request.url.host == 'gateway.test'), isTrue);
  });
}
