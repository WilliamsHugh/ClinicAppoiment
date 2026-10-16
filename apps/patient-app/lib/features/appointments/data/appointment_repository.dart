import '../../../core/api/clinic_api_client.dart';
import '../../../core/api/api_models.dart';
import '../../doctors/doctor_models.dart';
import '../booking_selection.dart';

class AppointmentRepository {
  AppointmentRepository(this._api);
  final ClinicApiClient _api;
  final Map<String, String> _doctorNames = {};

  Future<void> create(BookingSelection selection,
      {required String reason, required String idempotencyKey}) async {
    final response = await _api.post('/api/v1/appointments',
        body: {
          'doctorId': selection.doctorId,
          'specialtyId': selection.specialtyId,
          'scheduledStartAt': selection.startAt.toUtc().toIso8601String(),
          'scheduledEndAt': selection.endAt.toUtc().toIso8601String(),
          if (reason.trim().isNotEmpty) 'reason': reason.trim(),
        },
        idempotencyKey: idempotencyKey);
    final data = response.data;
    if (data is! Map<String, dynamic> ||
        data['id'] is! String ||
        (data['id'] as String).isEmpty) {
      throw const ApiException(
          code: 'INVALID_RESPONSE',
          message: 'Chưa nhận được xác nhận đặt lịch. Vui lòng thử lại.');
    }
  }

  Future<List<DoctorSlot>> availableSlots(String doctorId, String date) async {
    final response = await _api.get('/api/v1/doctors/$doctorId/available-slots',
        query: {'date': date});
    return (response.data as List<dynamic>)
        .map((item) => DoctorSlot.fromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> fetch(
      {String? status, int page = 1, int limit = 20}) async {
    final res = await _api.get('/api/v1/appointments', query: {
      if (status != null) 'status': status,
      'page': page,
      'limit': limit,
    });
    final data = res.data;
    if (data is Map<String, dynamic> && data['items'] is List) {
      return _withDoctorNames(
          (data['items'] as List).cast<Map<String, dynamic>>());
    }
    if (data is List) {
      return _withDoctorNames(data.cast<Map<String, dynamic>>());
    }
    return [];
  }

  Future<List<Map<String, dynamic>>> _withDoctorNames(
      List<Map<String, dynamic>> items) async {
    final ids = items
        .where((item) => item['doctorName'] == null)
        .map((item) => item['doctorId'])
        .whereType<String>()
        .toSet();
    await Future.wait(
        ids.where((id) => !_doctorNames.containsKey(id)).map((id) async {
      try {
        final response = await _api.get('/api/v1/doctors/$id');
        final name = (response.data as Map<String, dynamic>)['displayName'];
        if (name is String && name.isNotEmpty) _doctorNames[id] = name;
      } catch (_) {
        // Keep the appointment visible when the directory is temporarily unavailable.
      }
    }));
    return items
        .map((item) => <String, dynamic>{
              ...item,
              'doctorName': item['doctorName'] ??
                  _doctorNames[item['doctorId']] ??
                  'Bác sĩ phụ trách',
              'specialty': item['specialty'] ?? 'Lịch khám',
            })
        .toList(growable: false);
  }

  Future<void> cancel(String id, {String? reason}) async {
    await _api.patch('/api/v1/appointments/$id/cancel',
        body: {if (reason != null) 'reason': reason});
  }

  Future<void> reschedule(String id, DateTime start, DateTime end,
      {String? reason}) async {
    await _api.patch('/api/v1/appointments/$id/reschedule', body: {
      'scheduledStartAt': start.toIso8601String(),
      'scheduledEndAt': end.toIso8601String(),
      if (reason != null) 'reason': reason,
    });
  }
}
