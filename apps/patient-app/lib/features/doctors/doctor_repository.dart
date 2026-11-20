import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import 'doctor_models.dart';

class DoctorPage<T> {
  const DoctorPage({required this.items, required this.pagination});

  final List<T> items;
  final PageMetadata pagination;
}

/// Patient-facing reads only, through the shared Gateway client.
class DoctorRepository {
  DoctorRepository(this._api);
  final ClinicApiClient _api;
  final Map<String, String> _specialtyNames = {};

  String? cachedSpecialtyName(String id) => _specialtyNames[id];

  DoctorPage<T> _parsePage<T>(
    ApiResponse response,
    int expectedPage,
    T Function(Map<String, dynamic>) parse,
  ) {
    final data = response.data as Map<String, dynamic>;
    final rawItems = (data['items'] as List).cast<Map<String, dynamic>>();
    final pagination = response.pagination;
    if (pagination == null ||
        pagination.limit <= 0 ||
        pagination.page < 1 ||
        pagination.page != expectedPage ||
        pagination.total < 0 ||
        rawItems.length > pagination.limit ||
        (rawItems.isEmpty &&
            (expectedPage - 1) * pagination.limit < pagination.total)) {
      throw const FormatException('Invalid pagination');
    }
    return DoctorPage<T>(
      items: rawItems.map(parse).toList(growable: false),
      pagination: pagination,
    );
  }

  Future<DoctorPage<Specialty>> specialties({
    int page = 1,
    int limit = 20,
    String? q,
    RequestCancellation? cancellation,
  }) async {
    final trimmedQ = q?.trim();
    final response = await _api.get(
      '/api/v1/specialties',
      query: {
        'page': page,
        'limit': limit,
        if (trimmedQ != null && trimmedQ.isNotEmpty) 'q': trimmedQ,
      },
      cancellation: cancellation,
    );
    final result = _parsePage(response, page, Specialty.fromJson);
    for (final item in result.items) {
      _specialtyNames[item.id] = item.name;
    }
    return result;
  }

  Future<DoctorPage<Doctor>> doctors({
    int page = 1,
    int limit = 20,
    String? specialtyId,
    String? q,
    RequestCancellation? cancellation,
  }) async {
    final trimmedQ = q?.trim();
    final trimmedSpecialtyId = specialtyId?.trim();
    final response = await _api.get(
      '/api/v1/doctors',
      query: {
        'page': page,
        'limit': limit,
        if (trimmedSpecialtyId != null && trimmedSpecialtyId.isNotEmpty)
          'specialtyId': trimmedSpecialtyId,
        if (trimmedQ != null && trimmedQ.isNotEmpty) 'q': trimmedQ,
      },
      cancellation: cancellation,
    );
    return _parsePage(response, page, Doctor.fromJson);
  }

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
    final cached = _specialtyNames[id];
    if (cached != null) return cached;
    final items = await _all('/api/v1/specialties', cancellation: cancellation);
    for (final item in items) {
      final itemId = item['id'];
      final itemName = item['name'];
      if (itemId is String && itemName is String) {
        _specialtyNames[itemId] = itemName;
      }
    }
    return _specialtyNames[id];
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
    if (error.isRateLimited) {
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    if (error.code == 'NETWORK_ERROR' || error.code == 'REQUEST_TIMEOUT') {
      return 'Chưa thể kết nối máy chủ. Vui lòng thử lại.';
    }
  }
  return 'Không thể tải dữ liệu lúc này. Vui lòng thử lại.';
}
