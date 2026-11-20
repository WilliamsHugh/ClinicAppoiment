import '../../core/api/api_models.dart';

class PrescriptionItem {
  const PrescriptionItem({
    required this.medicineName,
    required this.dosage,
    required this.frequency,
    required this.duration,
  });

  final String medicineName;
  final String dosage;
  final String frequency;
  final String duration;

  factory PrescriptionItem.fromJson(Map<String, dynamic> json) {
    return PrescriptionItem(
      medicineName: _cleanText(json['medicineName']) ?? '',
      dosage: _cleanText(json['dosage']) ?? '',
      frequency: _cleanText(json['frequency']) ?? '',
      duration: _cleanText(json['duration']) ?? '',
    );
  }

  static List<PrescriptionItem> listFromJson(Object? raw) {
    if (raw is! List) return const [];
    final items = <PrescriptionItem>[];
    for (final entry in raw) {
      if (entry is Map<String, dynamic>) {
        items.add(PrescriptionItem.fromJson(entry));
      } else if (entry is Map) {
        items.add(
          PrescriptionItem.fromJson(
            entry.map((key, value) => MapEntry(key.toString(), value)),
          ),
        );
      }
    }
    return List<PrescriptionItem>.unmodifiable(items);
  }
}

class MedicalRecord {
  const MedicalRecord({
    required this.id,
    required this.appointmentId,
    this.patientId,
    this.doctorId,
    this.doctorName,
    required this.status,
    this.version = 1,
    this.appointmentCompletion,
    this.symptoms,
    this.diagnosis,
    this.notes,
    this.treatmentPlan,
    this.prescription = const [],
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String appointmentId;
  final String? patientId;
  final String? doctorId;
  final String? doctorName;
  final String status;
  final int version;
  final String? appointmentCompletion;
  final String? symptoms;
  final String? diagnosis;
  final String? notes;
  final String? treatmentPlan;
  final List<PrescriptionItem> prescription;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory MedicalRecord.fromJson(Map<String, dynamic> json) {
    return MedicalRecord(
      id: _cleanText(json['id']) ?? '',
      appointmentId: _cleanText(json['appointmentId']) ?? '',
      patientId: _cleanText(json['patientId']),
      doctorId: _cleanText(json['doctorId']),
      doctorName: cleanDoctorName(json['doctorName']),
      status: (_cleanText(json['status']) ?? 'FINAL').toUpperCase(),
      version: _parseInt(json['version'], fallback: 1),
      appointmentCompletion: _cleanText(json['appointmentCompletion']),
      symptoms: _cleanText(json['symptoms']),
      diagnosis: _cleanText(json['diagnosis']),
      notes: _cleanText(json['notes']),
      treatmentPlan: _cleanText(json['treatmentPlan']),
      prescription: PrescriptionItem.listFromJson(json['prescription']),
      createdAt: _parseUtcDateTime(json['createdAt']),
      updatedAt: _parseUtcDateTime(json['updatedAt']),
    );
  }

  static String safeShortId(String value) {
    final trimmed = value.trim();
    if (trimmed.length <= 8) return trimmed;
    return trimmed.substring(0, 8);
  }

  bool get hasPrescription => prescription.isNotEmpty;

  bool get hasDoctorId => doctorId != null && doctorId!.isNotEmpty;

  String get displayTitle {
    final diag = diagnosis?.trim();
    if (diag != null && diag.isNotEmpty) return diag;
    if (createdAt != null) return 'Kết quả khám ngày $displayDate';
    return 'Kết quả khám';
  }

  String get displayDate {
    final dt = createdAt;
    if (dt == null) return 'Chưa rõ ngày';
    final vn = _toVnTime(dt);
    return '${_two(vn.day)}/${_two(vn.month)}/${vn.year}';
  }

  String get displayDateTime {
    final dt = createdAt;
    if (dt == null) return 'Chưa rõ thời gian';
    final vn = _toVnTime(dt);
    return '${_two(vn.day)}/${_two(vn.month)}/${vn.year} • ${_two(vn.hour)}:${_two(vn.minute)}';
  }

  String get localizedStatus {
    switch (status.toUpperCase()) {
      case 'FINAL':
        return 'Đã hoàn tất';
      case 'DRAFT':
        return 'Bản nháp';
      default:
        return 'Đã ghi nhận';
    }
  }

  String get displayDoctorLabel {
    final name = doctorName?.trim();
    if (name != null && name.isNotEmpty) return name;
    if (hasDoctorId) return 'Bác sĩ phòng khám';
    return 'Bác sĩ phụ trách';
  }

  bool matchesQuery(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    final fields = <String?>[
      diagnosis,
      symptoms,
      doctorName,
      notes,
      treatmentPlan,
    ];
    for (final field in fields) {
      if (field != null && field.toLowerCase().contains(q)) {
        return true;
      }
    }
    for (final item in prescription) {
      if (item.medicineName.toLowerCase().contains(q)) {
        return true;
      }
    }
    return false;
  }

  MedicalRecord copyWith({String? doctorName}) {
    return MedicalRecord(
      id: id,
      appointmentId: appointmentId,
      patientId: patientId,
      doctorId: doctorId,
      doctorName: doctorName ?? this.doctorName,
      status: status,
      version: version,
      appointmentCompletion: appointmentCompletion,
      symptoms: symptoms,
      diagnosis: diagnosis,
      notes: notes,
      treatmentPlan: treatmentPlan,
      prescription: prescription,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}

class RecordPageResult {
  const RecordPageResult({
    required this.items,
    required this.page,
    required this.limit,
    required this.total,
  });

  final List<MedicalRecord> items;
  final int page;
  final int limit;
  final int total;

  bool get hasMore => limit > 0 && page * limit < total;
}

String recordErrorMessage(Object error) {
  if (error is ApiException) {
    if (error.requiresAuthentication || error.code == 'SESSION_REQUIRED') {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    }
    if (error.isForbidden) {
      return 'Bạn không có quyền xem hồ sơ khám này.';
    }
    if (error.statusCode == 404) {
      return 'Không tìm thấy dữ liệu hồ sơ khám.';
    }
    if (error.isRateLimited) {
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    if (error.statusCode == 502 || error.statusCode == 503) {
      return 'Hệ thống hồ sơ khám đang tạm gián đoạn. Vui lòng thử lại sau.';
    }
    if (error.code == 'NETWORK_ERROR') {
      return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.';
    }
    if (error.code == 'REQUEST_TIMEOUT') {
      return 'Kết nối quá thời gian chờ. Vui lòng thử lại.';
    }
    if (error.code == 'INVALID_RESPONSE') {
      return 'Dữ liệu hồ sơ khám từ máy chủ không hợp lệ.';
    }
    final msg = error.message.trim();
    if (msg.isNotEmpty && !msg.startsWith('ApiException')) {
      return msg;
    }
    return 'Không thể tải hồ sơ khám lúc này. Vui lòng thử lại.';
  }
  if (error is FormatException) {
    return 'Dữ liệu hồ sơ khám không đúng định dạng.';
  }
  return 'Không thể tải hồ sơ khám lúc này. Vui lòng thử lại.';
}

final RegExp _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

String? _cleanText(Object? raw) {
  if (raw == null) return null;
  final text = raw.toString().trim();
  return text.isEmpty ? null : text;
}

String? cleanDoctorName(Object? raw) {
  if (raw is! String) return null;
  final text = raw.trim();
  if (text.isEmpty || _uuidPattern.hasMatch(text)) return null;
  return text;
}

int _parseInt(Object? raw, {required int fallback}) {
  if (raw is int) return raw;
  if (raw is num) return raw.toInt();
  if (raw is String) return int.tryParse(raw.trim()) ?? fallback;
  return fallback;
}

DateTime? _parseUtcDateTime(Object? raw) {
  if (raw is! String) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return DateTime.tryParse(trimmed)?.toUtc();
}

DateTime _toVnTime(DateTime value) =>
    value.toUtc().add(const Duration(hours: 7));

String _two(int value) => value.toString().padLeft(2, '0');
