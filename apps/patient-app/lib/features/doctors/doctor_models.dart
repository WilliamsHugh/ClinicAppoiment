class Specialty {
  const Specialty({required this.id, required this.name});

  final String id;
  final String name;

  factory Specialty.fromJson(Map<String, dynamic> json) => Specialty(
        id: json['id'] as String,
        name: json['name'] as String,
      );
}

class Doctor {
  const Doctor({
    required this.id,
    required this.specialtyId,
    required this.displayName,
    this.bio,
  });

  final String id;
  final String specialtyId;
  final String displayName;
  final String? bio;

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: json['id'] as String,
        specialtyId: json['specialtyId'] as String,
        displayName: json['displayName'] as String,
        bio: json['bio'] as String?,
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

String clinicDate(DateTime value) {
  final local = value.toUtc().add(const Duration(hours: 7));
  return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}

String clinicTime(DateTime value) {
  final local = value.toUtc().add(const Duration(hours: 7));
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
