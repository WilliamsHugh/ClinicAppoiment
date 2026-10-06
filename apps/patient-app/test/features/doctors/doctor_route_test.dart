import 'dart:convert';

import 'package:clinic_patient_app/app/patient_app.dart';
import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _PatientSession implements SessionProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';

  @override
  Future<AuthSession?> restoreSession() async => const AuthSession(
        userId: 'patient-1',
        role: UserRole.patient,
        accessToken: 'test-token',
      );
}

void main() {
  testWidgets('patient route passes the selected Doctor slot to Booking',
      (tester) async {
    final paths = <String>[];
    final api = ClinicApiClient(
      tokenProvider: _PatientSession(),
      transport: MockClient((request) async {
        paths.add(request.url.path);
        final data = switch (request.url.path) {
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
            },
          '/api/v1/doctors/doctor-1/available-slots' => [
              {
                'startAt': '2030-01-07T01:00:00.000Z',
                'endAt': '2030-01-07T01:30:00.000Z',
              },
            ],
          _ =>
            throw StateError('Unexpected Doctor API path: ${request.url.path}'),
        };
        return http.Response(
          jsonEncode({'success': true, 'data': data}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    await tester.pumpWidget(PatientApp(
      sessionProvider: _PatientSession(),
      doctorApiClient: api,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(DoctorDirectoryPage), findsOneWidget);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    await tester.tap(find.text('Bác sĩ An'));
    await tester.pumpAndSettle();
    final slot = find.text('08:00–08:30');
    await tester.scrollUntilVisible(
      slot,
      240,
      scrollable: find
          .descendant(
            of: find.byType(DoctorDirectoryPage),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(slot);
    await tester.pumpAndSettle();

    final navigation = find.byType(NavigationBar);
    await tester.tap(find.descendant(
      of: navigation,
      matching: find.text('Lịch hẹn'),
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('Bác sĩ An, 2030-01-07 08:00–08:30'),
        findsOneWidget);
    expect(find.textContaining('Lịch hẹn chưa được tạo.'), findsOneWidget);
    final selection = tester
        .widget<AppointmentsPage>(find.byType(AppointmentsPage))
        .bookingSelection!;
    expect(selection.doctorId, 'doctor-1');
    expect(selection.specialtyId, 'specialty-1');
    expect(selection.startAt, DateTime.utc(2030, 1, 7, 1));
    expect(selection.endAt, DateTime.utc(2030, 1, 7, 1, 30));
    expect(paths, contains('/api/v1/doctors/doctor-1/available-slots'));
  });
}
