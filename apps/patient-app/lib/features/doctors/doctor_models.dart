class Specialty {
  const Specialty({
    required this.id,
    required this.name,
    this.description,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? description;
  final bool isActive;

  factory Specialty.fromJson(Map<String, dynamic> json) => Specialty(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        isActive: json['isActive'] is bool ? json['isActive'] as bool : true,
      );
}

class Doctor {
  const Doctor({
    required this.id,
    required this.specialtyId,
    required this.displayName,
    this.bio,
    this.isActive = true,
  });

  final String id;
  final String specialtyId;
  final String displayName;
  final String? bio;
  final bool isActive;

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: json['id'] as String,
        specialtyId: json['specialtyId'] as String,
        displayName: json['displayName'] as String,
        bio: json['bio'] as String?,
        isActive: json['isActive'] == true,
      );
}

class DoctorSlot {
  const DoctorSlot({required this.startAt, required this.endAt});

  final DateTime startAt;
  final DateTime endAt;

  factory DoctorSlot.fromJson(Map<String, dynamic> json) => DoctorSlot(
        startAt: DateTime.parse(json['startAt'] as String).toUtc(),
        endAt: DateTime.parse(json['endAt'] as String).toUtc(),
      );
}

class DoctorSchedule {
  const DoctorSchedule(
      {required this.id,
      required this.doctorId,
      required this.weekday,
      required this.startTime,
      required this.endTime,
      required this.slotDurationMinutes,
      required this.isActive});

  final String id;
  final String doctorId;

  /// Clinic weekday: Sunday = 0, Monday = 1, ..., Saturday = 6.
  final int weekday;
  final String startTime;
  final String endTime;
  final int slotDurationMinutes;
  final bool isActive;

  factory DoctorSchedule.fromJson(Map<String, dynamic> json) {
    final weekday = json['weekday'] as int;
    final start = json['startTime'] as String;
    final end = json['endTime'] as String;
    final duration = json['slotDurationMinutes'] as int;
    final isActive = json['isActive'];
    final clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
    if (weekday < 0 ||
        weekday > 6 ||
        !clock.hasMatch(start) ||
        !clock.hasMatch(end) ||
        start.compareTo(end) >= 0 ||
        duration <= 0 ||
        isActive is! bool) {
      throw const FormatException('Invalid doctor schedule');
    }
    return DoctorSchedule(
        id: json['id'] as String,
        doctorId: json['doctorId'] as String,
        weekday: weekday,
        startTime: start,
        endTime: end,
        slotDurationMinutes: duration,
        isActive: isActive);
  }
}

const clinicWeekdays = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy'
];

String slotKey(DoctorSlot slot) =>
    '${slot.startAt.toUtc().toIso8601String()}/${slot.endAt.toUtc().toIso8601String()}';

String clinicDate(DateTime value) {
  final local = value.toUtc().add(const Duration(hours: 7));
  return formatClinicDate(local);
}

String clinicTime(DateTime value) {
  final local = value.toUtc().add(const Duration(hours: 7));
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

String clinicTodayDate() => clinicDate(DateTime.now());

String formatClinicDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

DateTime? tryParseClinicDateUtc(String date) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) return null;
  final parts = date.split('-');
  final year = int.parse(parts[0]);
  final month = int.parse(parts[1]);
  final day = int.parse(parts[2]);
  final utc = DateTime.utc(year, month, day);
  if (utc.year != year || utc.month != month || utc.day != day) return null;
  return utc;
}

String addClinicDays(String date, int days) {
  final parsed = tryParseClinicDateUtc(date);
  if (parsed == null) {
    throw FormatException('Invalid clinic date: $date');
  }
  return formatClinicDate(
    DateTime.utc(parsed.year, parsed.month, parsed.day + days),
  );
}
