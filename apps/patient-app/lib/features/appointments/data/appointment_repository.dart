import '../../../core/api/clinic_api_client.dart';

class AppointmentRepository {
  AppointmentRepository(this._api);
  final ClinicApiClient _api;

  Future<List<Map<String, dynamic>>> fetch(
      {String? status, int page = 1, int limit = 20}) async {
    final res = await _api.get('/api/v1/appointments', query: {
      if (status != null) 'status': status,
      'page': page,
      'limit': limit,
    });
    final data = res.data;
    if (data is Map<String, dynamic> && data['items'] is List) {
      return (data['items'] as List).cast<Map<String, dynamic>>();
    }
    if (data is List) return data.cast<Map<String, dynamic>>();
    return [];
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
