import 'dart:convert';

import 'package:clinic_patient_app/app/patient_app.dart';
import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
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
  testWidgets(
      'patient books from Doctor directory and sees the created appointment',
      (tester) async {
    final paths = <String>[];
    var created = false;
    var listReads = 0;
    final api = ClinicApiClient(
      tokenProvider: _PatientSession(),
      transport: MockClient((request) async {
        paths.add(request.url.path);
        if (request.method == 'POST') {
          expect(request.url.path, '/api/v1/appointments');
          expect(request.headers['Idempotency-Key'], isNotEmpty);
          created = true;
          return http.Response(
              jsonEncode({
                'success': true,
                'data': {
                  'id': 'appointment-1',
                  'status': 'PENDING',
                }
              }),
              201);
        }
        if (request.url.path == '/api/v1/appointments') {
          listReads++;
          return http.Response(
              jsonEncode({
                'success': true,
                'data': {
                  'items': created
                      ? [
                          {
                            'id': 'appointment-1',
                            'doctorId': 'doctor-1',
                            'status': 'PENDING',
                            'scheduledStartAt': '2030-01-07T01:00:00Z',
                            'scheduledEndAt': '2030-01-07T01:30:00Z',
                            'reason': 'Khám tổng quát',
                          }
                        ]
                      : [],
                  'page': 1,
                  'limit': 20,
                  'total': created ? 1 : 0,
                }
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
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

    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    expect(created, isFalse);
    await tester.enterText(find.byType(TextField).last, 'Khám tổng quát');
    await tester.ensureVisible(find.byType(FilledButton).last);
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle();

    expect(created, isTrue);
    expect(find.byType(BookingConfirmationSheet), findsNothing);
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        1);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(find.text('Lý do: Khám tổng quát'), findsOneWidget);
    expect(listReads, greaterThanOrEqualTo(2));
    expect(find.textContaining('Lịch hẹn chưa được tạo.'), findsNothing);
    expect(paths, contains('/api/v1/doctors/doctor-1/available-slots'));
  });
}
