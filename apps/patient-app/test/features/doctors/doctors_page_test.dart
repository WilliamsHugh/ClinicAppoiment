import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

void main() {
  testWidgets('Doctor screen requires an injected session', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: DoctorDirectoryPage())));
    expect(find.textContaining('Không thể truy cập phiên đăng nhập'), findsOneWidget);
  });

  testWidgets('Doctor screen lists specialties and doctors from Gateway', (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _TokenProvider(),
      transport: MockClient((request) async {
        final data = request.url.path.endsWith('/specialties')
            ? {
                'items': [
                  {'id': 'specialty-1', 'name': 'Tim mạch'}
                ],
                'page': 1, 'limit': 20, 'total': 1,
              }
            : {
                'items': [
                  {
                    'id': 'doctor-1', 'specialtyId': 'specialty-1',
                    'displayName': 'Bác sĩ An', 'bio': 'Chuyên khoa tim mạch',
                  }
                ],
                'page': 1, 'limit': 20, 'total': 1,
              };
        return http.Response(jsonEncode({'success': true, 'data': data}), 200);
      }),
    );
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: DoctorDirectoryPage(apiClient: client))));
    await tester.pumpAndSettle();
    expect(find.text('Tim mạch'), findsWidgets);
    expect(find.text('Bác sĩ An'), findsOneWidget);
  });
}
