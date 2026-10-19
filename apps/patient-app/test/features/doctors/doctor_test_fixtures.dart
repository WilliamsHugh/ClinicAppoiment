import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/doctors/doctor_models.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const patientSession = AuthSession(
    userId: 'patient-test',
    role: UserRole.patient,
    accessToken: 'synthetic-token');
const doctorData = <String, dynamic>{
  'id': 'doctor-1',
  'specialtyId': 'specialty-1',
  'displayName': 'Bác sĩ An',
  'bio': 'Tư vấn và chăm sóc sức khỏe tim mạch.',
  'isActive': true
};
const scheduleData = <String, dynamic>{
  'id': 'schedule-1',
  'doctorId': 'doctor-1',
  'weekday': 1,
  'startTime': '09:00',
  'endTime': '12:00',
  'slotDurationMinutes': 30,
  'isActive': true
};
String dayAfter(int days) =>
    clinicDate(DateTime.now().add(Duration(days: days)));
http.Response success(Object? data) =>
    http.Response(jsonEncode({'success': true, 'data': data}), 200,
        headers: {'content-type': 'application/json; charset=utf-8'});
http.Response failure(String code, int status) => http.Response(
    jsonEncode({
      'success': false,
      'error': {'code': code, 'message': 'Unsafe internal server detail'},
    }),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'});
Map<String, Object> pageData(List<Object> items,
        {int page = 1, int limit = 100, int? total}) =>
    {
      'items': items,
      'page': page,
      'limit': limit,
      'total': total ?? items.length
    };

typedef Override = Future<http.Response?> Function(http.Request);
ClinicApiClient doctorClient(
        {Override? override, List<http.Request>? requests}) =>
    ClinicApiClient(
      tokenProvider: patientSession,
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        requests?.add(request);
        final custom = await override?.call(request);
        if (custom != null) return custom;
        final path = request.url.path;
        if (path == '/api/v1/specialties') {
          return success(pageData([
            {'id': 'specialty-1', 'name': 'Tim mạch'}
          ], limit: int.parse(request.url.queryParameters['limit'] ?? '100')));
        }
        if (path == '/api/v1/doctors') {
          return success(pageData([doctorData], limit: 20));
        }
        if (path == '/api/v1/doctors/doctor-1') return success(doctorData);
        if (path.endsWith('/schedules')) {
          return success(pageData([scheduleData]));
        }
        if (path.endsWith('/available-slots')) {
          final date = request.url.queryParameters['date'];
          return success([
            {
              'startAt': '${date}T01:00:00.000Z',
              'endAt': '${date}T01:30:00.000Z'
            },
            {
              'startAt': '${date}T07:00:00.000Z',
              'endAt': '${date}T07:30:00.000Z'
            },
          ]);
        }
        throw StateError('Unexpected test request: ${request.method} $path');
      }),
    );
