import 'package:clinic_patient_app/features/doctors/doctor_models.dart';
import 'package:clinic_patient_app/features/doctors/doctor_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'doctor_test_fixtures.dart';

void main() {
  test(
      'schedule pagination includes all active sessions and sorts Monday through Sunday',
      () async {
    final requests = <http.Request>[];
    final client = doctorClient(
        requests: requests,
        override: (request) async {
          if (!request.url.path.endsWith('/schedules')) return null;
          final firstPage = request.url.queryParameters['page'] == '1';
          return success(pageData(
              firstPage
                  ? List.generate(
                      100,
                      (index) => {
                            ...scheduleData,
                            'id': 'schedule-$index',
                            'weekday': 0,
                          })
                  : [
                      {...scheduleData, 'id': 'monday', 'weekday': 1},
                      {...scheduleData, 'id': 'inactive', 'isActive': false}
                    ],
              page: firstPage ? 1 : 2,
              total: 102));
        });
    final schedules = await DoctorRepository(client).schedules('doctor-1');
    expect(schedules.length, 101);
    expect(schedules.first.weekday, 1);
    expect(schedules.last.weekday, 0);
    expect(requests.map((request) => request.url.queryParameters['page']),
        ['1', '2']);
    expect(
        requests.every((request) =>
            request.headers['Authorization'] == 'Bearer synthetic-token'),
        isTrue);
  });
  test('specialty resolution finds a doctor specialty outside the first page',
      () async {
    final client = doctorClient(override: (request) async {
      final firstPage = request.url.queryParameters['page'] == '1';
      return success(pageData(
          firstPage
              ? List.generate(
                  100,
                  (index) =>
                      {'id': 'specialty-other-$index', 'name': 'Khoa khác'})
              : [
                  {'id': 'specialty-1', 'name': 'Tim mạch'}
                ],
          page: firstPage ? 1 : 2,
          total: 101));
    });
    expect(await DoctorRepository(client).specialtyName('specialty-1'),
        'Tim mạch');
  });
  test('rejects malformed clocks, foreign schedules and malformed pagination',
      () async {
    expect(() => DoctorSchedule.fromJson({...scheduleData, 'weekday': 7}),
        throwsFormatException);
    expect(
        () => DoctorSchedule.fromJson({...scheduleData, 'startTime': '25:00'}),
        throwsFormatException);
    final foreign = doctorClient(
        override: (_) async => success(pageData([
              {...scheduleData, 'doctorId': 'other-doctor'}
            ])));
    await expectLater(
        DoctorRepository(foreign).schedules('doctor-1'), throwsFormatException);
    final incomplete =
        doctorClient(override: (_) async => success(pageData([], total: 101)));
    await expectLater(DoctorRepository(incomplete).schedules('doctor-1'),
        throwsFormatException);
  });
  test(
      'unknown active flag fails closed and an incorrect doctor cannot replace the requested doctor',
      () async {
    expect(
        Doctor.fromJson({...doctorData, 'isActive': null}).isActive, isFalse);
    final client = doctorClient(
        override: (_) async => success({...doctorData, 'id': 'other-doctor'}));
    await expectLater(
        DoctorRepository(client).doctor('doctor-1'), throwsFormatException);
  });
  test('slots preserve UTC instants, filter past times, deduplicate and sort',
      () async {
    final date = dayAfter(1);
    final slots = [
      {'startAt': '${date}T07:00:00Z', 'endAt': '${date}T07:30:00Z'},
      {'startAt': '${date}T01:00:00Z', 'endAt': '${date}T01:30:00Z'},
      {'startAt': '${date}T01:00:00Z', 'endAt': '${date}T01:30:00Z'},
    ];
    final client = doctorClient(override: (_) async => success(slots));
    final result = await DoctorRepository(client).slots('doctor-1', date);
    expect(result.length, 2);
    expect(result.first.startAt.isUtc, isTrue);
    expect(clinicTime(result.first.startAt), '08:00');
    expect(clinicTime(result.last.startAt), '14:00');
  });
  test('does not accept slots from another day or inverted intervals',
      () async {
    final date = dayAfter(1);
    final wrongDay = doctorClient(
        override: (_) async => success([
              {
                'startAt': '${dayAfter(2)}T01:00:00Z',
                'endAt': '${dayAfter(2)}T01:30:00Z'
              },
            ]));
    await expectLater(DoctorRepository(wrongDay).slots('doctor-1', date),
        throwsFormatException);
    final inverted = doctorClient(
        override: (_) async => success([
              {'startAt': '${date}T02:00:00Z', 'endAt': '${date}T01:30:00Z'},
            ]));
    await expectLater(DoctorRepository(inverted).slots('doctor-1', date),
        throwsFormatException);
  });
}
