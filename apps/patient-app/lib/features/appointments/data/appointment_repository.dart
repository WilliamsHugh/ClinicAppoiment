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

  /// Mock fallback để không phá layout khi backend chưa chạy
  List<Map<String, dynamic>> fallback(String? status) {
    final all = [
      {
        'id': 'apt-1',
        'doctorName': 'Dr. Sarah Smith',
        'specialty': 'Gynecologist',
        'scheduledStartAt': DateTime.now().add(const Duration(days: 1, hours: 2)).toIso8601String(),
        'scheduledEndAt': DateTime.now().add(const Duration(days: 1, hours: 2, minutes: 30)).toIso8601String(),
        'status': 'PENDING',
        'reason': 'Khám tổng quát',
      },
      {
        'id': 'apt-2',
        'doctorName': 'Dr. Alex Johnson',
        'specialty': 'Cardiologist',
        'scheduledStartAt': DateTime.now().add(const Duration(days: 2)).toIso8601String(),
        'scheduledEndAt': DateTime.now().add(const Duration(days: 2, minutes: 30)).toIso8601String(),
        'status': 'CONFIRMED',
        'reason': 'Theo dõi huyết áp',
      },
      {
        'id': 'apt-3',
        'doctorName': 'Dr. Emily Stone',
        'specialty': 'Neurologist',
        'scheduledStartAt': DateTime.now().subtract(const Duration(days: 5)).toIso8601String(),
        'scheduledEndAt': DateTime.now().subtract(const Duration(days: 5)).add(const Duration(minutes: 30)).toIso8601String(),
        'status': 'COMPLETED',
        'reason': 'Đau đầu kéo dài',
      },
    ];
    if (status == null) return all;
    return all.where((e) => e['status'] == status).toList();
  }
}
