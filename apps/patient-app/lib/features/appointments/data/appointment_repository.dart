import '../../../core/api/clinic_api_client.dart';
import '../../../core/api/api_models.dart';
import '../../doctors/doctor_models.dart';
import '../booking_selection.dart';
import '../appointment_models.dart';
import '../../doctors/doctor_repository.dart';

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

  Future<List<DoctorSlot>> rescheduleSlots(String doctorId, String date,
          {RequestCancellation? cancellation}) =>
      DoctorRepository(_api).slots(doctorId, date, cancellation: cancellation);

  Future<List<PatientAppointment>> fetchAll(
      {RequestCancellation? cancellation}) async {
    final items = <String, PatientAppointment>{};
    for (var page = 1;; page++) {
      final response = await _api.get('/api/v1/appointments',
          query: {'page': page, 'limit': 100}, cancellation: cancellation);
      final data = response.data as Map<String, dynamic>;
      final values = data['items'] as List;
      final total = data['total'] as int;
      final limit = data['limit'] as int;
      if (data['page'] != page ||
          limit < 1 ||
          total < 0 ||
          values.length > limit ||
          (values.isEmpty && (page - 1) * limit < total) ||
          page > 100) {
        throw const FormatException('Invalid pagination');
      }
      for (final value in values) {
        final item = PatientAppointment.fromJson(value as Map<String, dynamic>);
        items[item.id] = item;
      }
      if (page * limit >= total) break;
    }
    final ids = items.values
        .map((item) => item.doctorId)
        .toSet()
        .where((id) => !_doctorNames.containsKey(id))
        .toList();
    var next = 0;
    await Future.wait(List.generate(ids.length.clamp(0, 6), (_) async {
      while (next < ids.length) {
        final id = ids[next++];
        try {
          final response = await _api.get(
              '/api/v1/doctors/${Uri.encodeComponent(id)}',
              cancellation: cancellation);
          final name = appointmentDisplayName(
              (response.data as Map<String, dynamic>)['displayName']);
          if (name != null) _doctorNames[id] = name;
        } on ApiException catch (error) {
          if (cancellation?.isCancelled == true || error.statusCode == 401) {
            rethrow;
          }
        } catch (_) {
          /* Keep a readable fallback while the doctor service is unavailable. */
        }
      }
    }));
    return items.values
        .map((item) => item.withNames(
            doctorName: _doctorNames[item.doctorId] ?? item.doctorName,
            specialty: item.specialty))
        .toList();
  }

  Future<PatientAppointment> detail(String id,
      {RequestCancellation? cancellation}) async {
    final response = await _api.get(
        '/api/v1/appointments/${Uri.encodeComponent(id)}',
        cancellation: cancellation);
    final item =
        PatientAppointment.fromJson(response.data as Map<String, dynamic>);
    if (item.id != id) throw const FormatException('Mismatched appointment');
    return item;
  }

  Future<PatientAppointment> _change(
      String id, String action, Map<String, Object?> body) async {
    final response = await _api.patch(
        '/api/v1/appointments/${Uri.encodeComponent(id)}/$action',
        body: body);
    final item =
        PatientAppointment.fromJson(response.data as Map<String, dynamic>);
    if (item.id != id) throw const FormatException('Mismatched appointment');
    if ((action == 'cancel' && item.status != 'CANCELLED') ||
        (action == 'reschedule' &&
            (!item.canModify ||
                item.startAt !=
                    DateTime.parse(body['scheduledStartAt'] as String) ||
                item.endAt !=
                    DateTime.parse(body['scheduledEndAt'] as String)))) {
      throw const FormatException('Unconfirmed appointment change');
    }
    return item;
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

  Future<PatientAppointment> cancel(String id, {String? reason}) =>
      _change(id, 'cancel', {if (reason != null) 'reason': reason.trim()});

  Future<PatientAppointment> reschedule(String id, DateTime start, DateTime end,
      {String? reason}) async {
    if (!start.isAfter(DateTime.now().toUtc()) || !end.isAfter(start)) {
      throw const ApiException(
          code: 'APPOINTMENT_SLOT_INVALID', message: 'Khung giờ không hợp lệ.');
    }
    return _change(id, 'reschedule', {
      'scheduledStartAt': start.toUtc().toIso8601String(),
      'scheduledEndAt': end.toUtc().toIso8601String(),
      if (reason != null) 'reason': reason.trim(),
    });
  }
}

String appointmentError(Object error) {
  if (error is ApiException) {
    if (error.statusCode == 401 || error.code == 'SESSION_REQUIRED') {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    }
    if (error.statusCode == 403) {
      return 'Bạn không có quyền thực hiện thao tác với lịch hẹn này.';
    }
    if (error.statusCode == 404) {
      return 'Lịch hẹn không còn tồn tại. Vui lòng tải lại danh sách.';
    }
    if (error.code == 'APPOINTMENT_INVALID_STATUS_TRANSITION') {
      return 'Trạng thái lịch hẹn đã thay đổi. Vui lòng kiểm tra lại danh sách.';
    }
    if (error.code == 'APPOINTMENT_SLOT_UNAVAILABLE' ||
        error.code == 'APPOINTMENT_SLOT_INVALID') {
      return 'Khung giờ không còn khả dụng. Lý do đã được giữ lại; hãy chọn giờ khác.';
    }
    if (error.code == 'NETWORK_ERROR' || error.code == 'REQUEST_TIMEOUT') {
      return 'Chưa nhận được xác nhận. Hãy kiểm tra lại danh sách trước khi thử lại thao tác.';
    }
  }
  return 'Không thể hoàn thành yêu cầu lúc này. Vui lòng thử lại.';
}
