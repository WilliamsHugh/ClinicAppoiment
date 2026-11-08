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
const appointmentId = '00000000-0000-4000-8000-000000000001';
const doctorId = '00000000-0000-4000-8000-000000000002';
String clinicDay(int days) =>
    clinicDate(DateTime.now().add(Duration(days: days)));
Map<String, dynamic> appointmentJson(
        {String id = appointmentId, String status = 'PENDING', int day = 1}) =>
    {
      'id': id,
      'doctorId': doctorId,
      'patientId': '00000000-0000-4000-8000-000000000003',
      'status': status,
      'scheduledStartAt': '${clinicDay(day)}T01:00:00.000Z',
      'scheduledEndAt': '${clinicDay(day)}T01:30:00.000Z',
      'reason': 'Khám tổng quát',
    };
http.Response success(Object? data) =>
    http.Response(jsonEncode({'success': true, 'data': data}), 200,
        headers: {'content-type': 'application/json; charset=utf-8'});
http.Response failure(String code, {int status = 409}) => http.Response(
    jsonEncode({
      'success': false,
      'error': {
        'code': code,
        'message': 'Sensitive server implementation detail'
      },
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
typedef Override = Future<http.Response?> Function(http.Request request);

class AppointmentGateway {
  AppointmentGateway({List<Map<String, dynamic>>? appointments, this.override})
      : items = appointments ?? [appointmentJson()];
  List<Map<String, dynamic>> items;
  final Override? override;
  final requests = <http.Request>[];
  List<http.Request> get writes =>
      requests.where((request) => request.method == 'PATCH').toList();
  late final api = ClinicApiClient(
      tokenProvider: patientSession,
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        requests.add(request);
        final custom = await override?.call(request);
        if (custom != null) return custom;
        final path = request.url.path;
        if (path == '/api/v1/appointments') {
          final page = int.parse(request.url.queryParameters['page'] ?? '1');
          final limit =
              int.parse(request.url.queryParameters['limit'] ?? '100');
          return success(pageData(
              items.skip((page - 1) * limit).take(limit).toList(),
              page: page,
              limit: limit,
              total: items.length));
        }
        if (path == '/api/v1/doctors/$doctorId') {
          return success({'displayName': 'Bác sĩ An'});
        }
        if (path.endsWith('/available-slots')) {
          final date = request.url.queryParameters['date'];
          return success([
            {
              'startAt': '${date}T03:00:00.000Z',
              'endAt': '${date}T03:30:00.000Z'
            }
          ]);
        }
        final parts = path.split('/');
        final id = parts.length > 4 ? parts[4] : '';
        final index = items.indexWhere((item) => item['id'] == id);
        if (index < 0) return failure('APPOINTMENT_NOT_FOUND', status: 404);
        if (request.method == 'GET') return success(items[index]);
        if (request.method == 'PATCH') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          items[index] = {
            ...items[index],
            if (parts.last == 'cancel') 'status': 'CANCELLED',
            if (parts.last == 'reschedule') ...{
              'scheduledStartAt': body['scheduledStartAt'],
              'scheduledEndAt': body['scheduledEndAt'],
            }
          };
          return success(items[index]);
        }
        throw StateError('Unexpected test request: ${request.method} $path');
      }));
}
