import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import 'doctor_models.dart';

/// Patient-facing reads only, through the shared Gateway client.
class DoctorRepository {
  DoctorRepository(this._api);
  final ClinicApiClient _api;

  Future<Doctor> doctor(String id, {RequestCancellation? cancellation}) async {
    final response = await _api.get(
        '/api/v1/doctors/${Uri.encodeComponent(id)}',
        cancellation: cancellation);
    final result = Doctor.fromJson(response.data as Map<String, dynamic>);
    if (result.id != id) throw const FormatException('Mismatched doctor');
    return result;
  }

  Future<List<Map<String, dynamic>>> _all(String path,
      {RequestCancellation? cancellation}) async {
    final items = <Map<String, dynamic>>[];
    for (var page = 1;; page++) {
      final response = await _api.get(path,
          query: {'page': page, 'limit': 100}, cancellation: cancellation);
      final data = response.data as Map<String, dynamic>;
      final values = (data['items'] as List).cast<Map<String, dynamic>>();
      final total = data['total'] as int;
      final limit = data['limit'] as int;
      if (data['page'] != page ||
          total < 0 ||
          limit <= 0 ||
          values.length > limit ||
          (values.isEmpty && items.length < total) ||
          page > 100) {
        throw const FormatException('Invalid pagination');
      }
      items.addAll(values);
      if (page * limit >= total) return items;
    }
  }

  Future<List<DoctorSchedule>> schedules(String id,
      {RequestCancellation? cancellation}) async {
    final data = await _all(
        '/api/v1/doctors/${Uri.encodeComponent(id)}/schedules',
        cancellation: cancellation);
    final items = data.map(DoctorSchedule.fromJson).toList();
    if (items.any((item) => item.doctorId != id)) {
      throw const FormatException('Mismatched schedule');
    }
    return items.where((item) => item.isActive).toList()
      ..sort((a, b) {
        final day = ((a.weekday + 6) % 7).compareTo((b.weekday + 6) % 7);
        return day != 0 ? day : a.startTime.compareTo(b.startTime);
      });
  }

  Future<String?> specialtyName(String id,
      {RequestCancellation? cancellation}) async {
    final items = await _all('/api/v1/specialties', cancellation: cancellation);
    return items
        .where((item) => item['id'] == id)
        .map((item) => item['name'] as String)
        .firstOrNull;
  }

  Future<List<DoctorSlot>> slots(String doctorId, String date,
      {RequestCancellation? cancellation}) async {
    final response = await _api.get(
        '/api/v1/doctors/${Uri.encodeComponent(doctorId)}/available-slots',
        query: {'date': date},
        cancellation: cancellation);
    final slots = (response.data as List)
        .map((item) => DoctorSlot.fromJson(item as Map<String, dynamic>))
        .toList();
    if (slots.any((slot) =>
        !slot.endAt.isAfter(slot.startAt) ||
        clinicDate(slot.startAt) != date)) {
      throw const FormatException('Invalid slot interval');
    }
    final unique = {for (final slot in slots) slotKey(slot): slot};
    return unique.values
        .where((slot) => slot.startAt.isAfter(DateTime.now().toUtc()))
        .toList()
      ..sort((a, b) => a.startAt.compareTo(b.startAt));
  }
}

String doctorError(Object error) {
  if (error is ApiException) {
    if (error.statusCode == 401 || error.code == 'SESSION_REQUIRED') {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    }
    if (error.statusCode == 403) return 'Bạn không có quyền xem thông tin này.';
    if (error.statusCode == 404) {
      return 'Bác sĩ không còn nhận lịch. Vui lòng chọn bác sĩ khác.';
    }
    if (error.code == 'NETWORK_ERROR' || error.code == 'REQUEST_TIMEOUT') {
      return 'Chưa thể kết nối máy chủ. Vui lòng thử lại.';
    }
  }
  return 'Không thể tải dữ liệu lúc này. Vui lòng thử lại.';
}
