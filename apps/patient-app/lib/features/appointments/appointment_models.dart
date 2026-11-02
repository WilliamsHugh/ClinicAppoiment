import '../doctors/doctor_models.dart';

enum AppointmentTab { upcoming, history, cancelled }

const appointmentTabLabels = ['Sắp tới', 'Lịch sử', 'Đã hủy'];
const appointmentStatuses = {
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
};

class PatientAppointment {
  const PatientAppointment(
      {required this.id,
      required this.doctorId,
      required this.startAt,
      required this.endAt,
      required this.status,
      this.reason,
      this.doctorName = 'Bác sĩ phụ trách',
      this.specialty = 'Lịch khám'});
  final String id;
  final String doctorId;
  final DateTime startAt;
  final DateTime endAt;
  final String status;
  final String? reason;
  final String doctorName;
  final String specialty;

  factory PatientAppointment.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String;
    final doctorId = json['doctorId'] as String;
    final start = DateTime.parse(json['scheduledStartAt'] as String).toUtc();
    final end = DateTime.parse(json['scheduledEndAt'] as String).toUtc();
    final status = json['status'] as String;
    if (id.isEmpty ||
        doctorId.isEmpty ||
        !appointmentStatuses.contains(status) ||
        !end.isAfter(start)) {
      throw const FormatException('Invalid appointment');
    }
    return PatientAppointment(
        id: id,
        doctorId: doctorId,
        startAt: start,
        endAt: end,
        status: status,
        reason: json['reason'] as String?,
        doctorName:
            appointmentDisplayName(json['doctorName']) ?? 'Bác sĩ phụ trách',
        specialty: appointmentDisplayName(json['specialty']) ?? 'Lịch khám');
  }

  bool get canModify => status == 'PENDING' || status == 'CONFIRMED';
  bool ticketAvailable(DateTime now) =>
      status == 'CONFIRMED' && endAt.isAfter(now.toUtc());
  bool belongsTo(AppointmentTab tab, DateTime now) {
    if (status == 'CANCELLED') return tab == AppointmentTab.cancelled;
    final history = status == 'COMPLETED' ||
        status == 'NO_SHOW' ||
        (status != 'CHECKED_IN' && !endAt.isAfter(now.toUtc()));
    return history
        ? tab == AppointmentTab.history
        : tab == AppointmentTab.upcoming;
  }

  String get displayDate {
    final parts = clinicDate(startAt).split('-');
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  String get displayTime => '${clinicTime(startAt)}–${clinicTime(endAt)}';
  PatientAppointment withNames(
          {required String doctorName, required String specialty}) =>
      PatientAppointment(
          id: id,
          doctorId: doctorId,
          startAt: startAt,
          endAt: endAt,
          status: status,
          reason: reason,
          doctorName: doctorName,
          specialty: specialty);
}

String? appointmentDisplayName(Object? value) {
  if (value is! String ||
      value.trim().isEmpty ||
      RegExp(r'^[0-9a-f]{8}-[0-9a-f-]{27}$', caseSensitive: false)
          .hasMatch(value.trim())) {
    return null;
  }
  return value.trim();
}
