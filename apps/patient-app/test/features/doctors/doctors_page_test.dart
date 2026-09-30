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
    await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: DoctorDirectoryPage())));
    expect(find.textContaining('Không thể truy cập phiên đăng nhập'),
        findsOneWidget);
  });

  testWidgets(
      'Doctor directory lists specialties, doctors and available slots from Gateway',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _TokenProvider(),
      transport: MockClient((request) async {
        final path = request.url.path;
        final data = switch (path) {
          '/api/v1/specialties' => {
              'items': [
                {'id': 'specialty-1', 'name': 'Tim mạch'}
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/doctors' => {
              'items': [
                {
                  'id': 'doctor-1',
                  'specialtyId': 'specialty-1',
                  'displayName': 'Bác sĩ An',
                  'bio': 'Chuyên khoa tim mạch',
                }
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/doctors/doctor-1' => {
              'id': 'doctor-1',
              'specialtyId': 'specialty-1',
              'displayName': 'Bác sĩ An',
              'bio': 'Chuyên khoa tim mạch',
            },
          '/api/v1/doctors/doctor-1/available-slots' => [
              {
                'startAt': '2030-01-07T01:00:00.000Z',
                'endAt': '2030-01-07T01:30:00.000Z',
              },
            ],
          _ => throw StateError('Unexpected Doctor API path: $path'),
        };
        return http.Response(
          jsonEncode({'success': true, 'data': data}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: DoctorDirectoryPage(apiClient: client)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Tim mạch'), findsWidgets);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    await tester.tap(find.text('Bác sĩ An'));
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết bác sĩ'), findsOneWidget);
    expect(find.textContaining('08:00'), findsOneWidget);
  });
}
