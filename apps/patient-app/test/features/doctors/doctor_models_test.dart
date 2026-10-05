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
}
