import 'dart:convert';

import 'package:clinic_patient_app/features/appointments/appointment_models.dart';
import 'package:clinic_patient_app/features/appointments/data/appointment_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import 'appointment_test_fixtures.dart';

void main() {
  test(
      'malformed or contradictory mutation success is never shown as confirmed',
      () async {
    final gateway = AppointmentGateway(
        override: (request) async =>
            request.method == 'PATCH' ? success(appointmentJson()) : null);
    await expectLater(AppointmentRepository(gateway.api).cancel(appointmentId),
        throwsFormatException);
    final start = DateTime.parse('${clinicDay(2)}T03:00:00Z');
    await expectLater(
        AppointmentRepository(gateway.api).reschedule(
            appointmentId, start, start.add(const Duration(minutes: 30))),
        throwsFormatException);
    expect(gateway.writes.length, 2);
  });
  test(
      'three groups cover all statuses; overdue appointments do not become completed',
      () {
    final now = DateTime.now().toUtc();
    for (final status in appointmentStatuses) {
      final item = PatientAppointment.fromJson(appointmentJson(status: status));
      expect(
          AppointmentTab.values.where((tab) => item.belongsTo(tab, now)).length,
          1);
    }
    final overdue = PatientAppointment.fromJson(appointmentJson(day: -1));
    expect(overdue.belongsTo(AppointmentTab.history, now), isTrue);
    expect(overdue.status, 'PENDING');
    expect(overdue.canModify, isTrue);
    final checkedIn = PatientAppointment.fromJson(
        appointmentJson(status: 'CHECKED_IN', day: -1));
    expect(checkedIn.belongsTo(AppointmentTab.upcoming, now), isTrue);
  });
  test(
      'ticket requires confirmed, unexpired appointment; never pending or cancelled',
      () {
    final now = DateTime.now();
    for (final status in appointmentStatuses) {
      expect(
          PatientAppointment.fromJson(appointmentJson(status: status))
              .ticketAvailable(now),
          status == 'CONFIRMED');
    }
    expect(
        PatientAppointment.fromJson(
                appointmentJson(status: 'CONFIRMED', day: -1))
            .ticketAvailable(now),
        isFalse);
  });
  test(
      'clinic time stays UTC+7 and raw identifiers cannot become display names',
      () {
    final item = PatientAppointment.fromJson(
        {...appointmentJson(), 'doctorName': doctorId});
    expect(item.displayTime, '08:00–08:30');
    expect(item.doctorName, 'Bác sĩ phụ trách');
    expect(item.displayDate, matches(RegExp(r'^\d{2}/\d{2}/\d{4}$')));
  });
  test(
      'invalid status and inverted interval fail instead of disappearing silently',
      () {
    expect(
        () => PatientAppointment.fromJson(
            {...appointmentJson(), 'status': 'IN_PROGRESS'}),
        throwsFormatException);
    expect(
        () => PatientAppointment.fromJson({
              ...appointmentJson(),
              'scheduledEndAt': '${clinicDay(1)}T00:00:00Z'
            }),
        throwsFormatException);
  });
  test(
      'fetch reads all pages without a forged patient filter and caches doctor names',
      () async {
    final gateway = AppointmentGateway(
        appointments: List.generate(
            101, (index) => appointmentJson(id: 'appointment-$index')));
    final repo = AppointmentRepository(gateway.api);
    final rows = await repo.fetchAll();
    expect(rows.length, 101);
    expect(
        gateway.requests
            .where((request) => request.url.path == '/api/v1/appointments')
            .length,
        2);
    expect(
        gateway.requests.every(
            (request) => !request.url.queryParameters.containsKey('patientId')),
        isTrue);
    expect(
        gateway.requests
            .where((request) => request.url.path.startsWith('/api/v1/doctors/'))
            .length,
        1);
    expect(rows.first.doctorName, 'Bác sĩ An');
    await repo.fetchAll();
    expect(
        gateway.requests
            .where((request) => request.url.path.startsWith('/api/v1/doctors/'))
            .length,
        1);
  });
  test('malformed pagination does not become an empty appointment list',
      () async {
    final gateway = AppointmentGateway(
        override: (_) async => success(pageData([], total: 1)));
    await expectLater(
        AppointmentRepository(gateway.api).fetchAll(), throwsFormatException);
  });
  test(
      'foreign doctor lookup outage retains the appointment but session expiry is not swallowed',
      () async {
    final gateway = AppointmentGateway(
        override: (request) async =>
            request.url.path.startsWith('/api/v1/doctors/')
                ? failure('DEPENDENCY_UNAVAILABLE', status: 503)
                : null);
    expect(
        (await AppointmentRepository(gateway.api).fetchAll()).single.doctorName,
        'Bác sĩ phụ trách');
    final expired = AppointmentGateway(
        override: (request) async =>
            request.url.path.startsWith('/api/v1/doctors/')
                ? failure('AUTH_TOKEN_INVALID', status: 401)
                : null);
    await expectLater(AppointmentRepository(expired.api).fetchAll(),
        throwsA(isA<Exception>()));
  });
  test('cancel and reschedule use owner endpoints with exact UTC payloads',
      () async {
    final gateway = AppointmentGateway();
    final repo = AppointmentRepository(gateway.api);
    final start = DateTime.parse('${clinicDay(2)}T10:00:00+07:00');
    final end = start.add(const Duration(minutes: 30));
    await repo.reschedule(appointmentId, start, end, reason: ' Đổi giờ ');
    expect(jsonDecode(gateway.writes.single.body), {
      'scheduledStartAt': start.toUtc().toIso8601String(),
      'scheduledEndAt': end.toUtc().toIso8601String(),
      'reason': 'Đổi giờ'
    });
    await repo.cancel(appointmentId, reason: ' Hủy theo yêu cầu ');
    expect(
        jsonDecode(gateway.writes.last.body), {'reason': 'Hủy theo yêu cầu'});
    expect(
        gateway.writes.last.headers['Authorization'], 'Bearer synthetic-token');
  });
  test('rescheduling refuses past or inverted slots without sending a write',
      () async {
    final gateway = AppointmentGateway();
    final repo = AppointmentRepository(gateway.api);
    final start = DateTime.now().subtract(const Duration(days: 1));
    await expectLater(
        repo.reschedule(
            appointmentId, start, start.add(const Duration(minutes: 30))),
        throwsA(isA<Exception>()));
    expect(gateway.writes, isEmpty);
  });
  test(
      'failed mutation is never retried automatically and errors stay readable',
      () async {
    final gateway = AppointmentGateway(
        override: (request) async => request.method == 'PATCH'
            ? failure('APPOINTMENT_INVALID_STATUS_TRANSITION')
            : null);
    await expectLater(AppointmentRepository(gateway.api).cancel(appointmentId),
        throwsA(isA<Exception>()));
    expect(gateway.writes.length, 1);
    expect(appointmentError(const FormatException('Sensitive detail')),
        isNot(contains('Sensitive')));
  });
}
