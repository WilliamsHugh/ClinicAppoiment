import 'package:clinic_patient_app/core/api/api_models.dart';
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

  test(
      'specialties and doctors omit empty query params, never send isActive, and cache specialty names',
      () async {
    final requests = <http.Request>[];
    final client = doctorClient(requests: requests);
    final repo = DoctorRepository(client);

    final spPage = await repo.specialties(page: 1, limit: 20, q: '   ');
    final docPage = await repo.doctors(
      page: 1,
      limit: 20,
      specialtyId: '',
      q: '  An  ',
    );

    expect(spPage.items.single.name, 'Tim mạch');
    expect(docPage.items.single.displayName, 'Bác sĩ An');

    final spQuery = requests[0].url.queryParameters;
    expect(spQuery.containsKey('q'), isFalse);
    expect(spQuery.containsKey('isActive'), isFalse);

    final docQuery = requests[1].url.queryParameters;
    expect(docQuery['q'], 'An');
    expect(docQuery.containsKey('specialtyId'), isFalse);
    expect(docQuery.containsKey('isActive'), isFalse);

    // Cached from specialties() -> no extra HTTP request.
    expect(await repo.specialtyName('specialty-1'), 'Tim mạch');
    expect(requests.length, 2);
  });

  test('slots accept 17:00Z previous UTC day as 00:00 VN clinic day',
      () async {
    final previousUtcDay = dayAfter(0);
    final clinicTargetDay = dayAfter(1);
    final client = doctorClient(
      override: (_) async => success([
        {
          'startAt': '${previousUtcDay}T17:00:00.000Z',
          'endAt': '${previousUtcDay}T17:30:00.000Z',
        },
      ]),
    );
    final result = await DoctorRepository(client).slots(
      'doctor-1',
      clinicTargetDay,
    );
    expect(result.length, 1);
    expect(clinicDate(result.single.startAt), clinicTargetDay);
    expect(clinicTime(result.single.startAt), '00:00');
  });

  test('doctorError maps 429 rate limit cleanly', () {
    const exception = ApiException(
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    );
    expect(doctorError(exception), contains('quá nhanh'));
  });
}
