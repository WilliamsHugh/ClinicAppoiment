import '../../../core/api/api_models.dart';
import '../../../core/api/clinic_api_client.dart';

class DoctorSummary {
  const DoctorSummary({
    required this.id,
    required this.displayName,
    required this.specialtyId,
    required this.isActive,
    this.bio,
  });

  final String id;
  final String displayName;
  final String specialtyId;
  final bool isActive;
  final String? bio;

  factory DoctorSummary.fromJson(Map<String, dynamic> json) => DoctorSummary(
        id: json['id'].toString(),
        displayName: json['displayName'].toString(),
        specialtyId: json['specialtyId'].toString(),
        isActive: json['isActive'] == true,
        bio: json['bio']?.toString(),
      );
}

class DoctorRepository {
  const DoctorRepository(this._api);

  final ClinicApiClient _api;

  Future<List<DoctorSummary>> fetchActive() async {
    final response = await _api.get('/api/v1/doctors');
    final data = response.data;
    final items = data is List
        ? data
        : data is Map<String, dynamic> && data['items'] is List
            ? data['items'] as List
            : <Object?>[];
    return items
        .whereType<Map<String, dynamic>>()
        .map(DoctorSummary.fromJson)
        .where((doctor) => doctor.isActive)
        .toList(growable: false);
  }

  Future<DoctorSummary> fetchById(String doctorId) async {
    final response = await _api.get('/api/v1/doctors/$doctorId');
    final data = response.data;
    if (data is! Map<String, dynamic>) {
      throw const ApiException(
        code: 'UPSTREAM_INVALID_RESPONSE',
        message: 'Không thể đọc thông tin bác sĩ.',
      );
    }
    return DoctorSummary.fromJson(data);
  }
}
