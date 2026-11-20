import 'package:clinic_patient_app/features/doctors/doctor_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Doctor slot UTC times display in clinic UTC+7', () {
    final slot = DoctorSlot.fromJson({
      'startAt': '2030-01-07T01:00:00.000Z',
      'endAt': '2030-01-07T01:30:00.000Z',
    });
    expect(clinicDate(slot.startAt), '2030-01-07');
    expect(clinicTime(slot.startAt), '08:00');
    expect(clinicTime(slot.endAt), '08:30');
  });

  test('Clinic date and time handle UTC midnight and noon boundaries (UTC+7)',
      () {
    final afterMidnightVn = DateTime.parse('2030-01-06T17:00:00.000Z');
    expect(clinicDate(afterMidnightVn), '2030-01-07');
    expect(clinicTime(afterMidnightVn), '00:00');

    final beforeMidnightVn = DateTime.parse('2030-01-06T16:30:00.000Z');
    expect(clinicDate(beforeMidnightVn), '2030-01-06');
    expect(clinicTime(beforeMidnightVn), '23:30');

    final noonVn = DateTime.parse('2030-01-06T05:00:00.000Z');
    expect(clinicDate(noonVn), '2030-01-06');
    expect(clinicTime(noonVn), '12:00');
  });

  test('addClinicDays shifts calendar dates across months and leap years', () {
    expect(addClinicDays('2029-12-31', 1), '2030-01-01');
    expect(addClinicDays('2028-02-28', 2), '2028-03-01');
    expect(addClinicDays('2030-03-01', -1), '2030-02-28');
    expect(() => addClinicDays('2030-02-30', 1), throwsFormatException);
  });

  test('Specialty and DoctorSchedule parse optional and strict fields safely',
      () {
    final minimal = Specialty.fromJson({'id': 'sp-1', 'name': 'Tim mạch'});
    expect(minimal.description, isNull);
    expect(minimal.isActive, isTrue);

    final full = Specialty.fromJson({
      'id': 'sp-2',
      'name': 'Nhi khoa',
      'description': 'Khám trẻ em',
      'isActive': false,
    });
    expect(full.description, 'Khám trẻ em');
    expect(full.isActive, isFalse);

    expect(
      () => DoctorSchedule.fromJson({
        'id': 'sch-1',
        'doctorId': 'doc-1',
        'weekday': 1,
        'startTime': '09:00',
        'endTime': '12:00',
        'slotDurationMinutes': 30,
        'isActive': 'true',
      }),
      throwsFormatException,
    );
  });
}
