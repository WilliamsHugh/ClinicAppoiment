import 'dart:math';

import '../../../core/api/clinic_api_client.dart';
import '../../../core/api/api_models.dart';
import '../../doctors/doctor_models.dart';
import '../booking_selection.dart';
import '../appointment_models.dart';
import '../../doctors/doctor_repository.dart';

class AppointmentRepository {
  AppointmentRepository(this._api);
  final ClinicApiClient _api;
  final Random _random = Random.secure();
  final Map<String, String> _doctorNames = {};
  final Map<String, String> _doctorSpecialties = {};
  final Map<String, String> _specialtyNames = {};
  final Set<String> _lookedUpDoctors = {};

  String _resolveIdempotencyKey(String prefix, String? provided) {
    final trimmed = provided?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      return trimmed.length <= 255 ? trimmed : trimmed.substring(0, 255);
    }
    final entropy = List.generate(
      12,
      (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final key = '$prefix-${DateTime.now().microsecondsSinceEpoch}-$entropy';
    return key.length <= 255 ? key : key.substring(0, 255);
  }

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
        idempotencyKey:
            _resolveIdempotencyKey('m-appt-create', idempotencyKey));
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
    final response = await _api.get(
        '/api/v1/doctors/${Uri.encodeComponent(doctorId)}/available-slots',
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
      final response = await _api.get('/api/v1/appointments', query: {
        'page': page,
        'limit': 100,
        'view': 'detail',
        'include': 'names',
      }, cancellation: cancellation);
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
        if (item.doctorName != 'Bác sĩ phụ trách') {
          _doctorNames[item.doctorId] = item.doctorName;
        }
        if (item.specialtyId != null) {
          _doctorSpecialties.putIfAbsent(
              item.doctorId, () => item.specialtyId!);
          if (item.specialty != 'Lịch khám') {
            _specialtyNames[item.specialtyId!] = item.specialty;
          }
        }
        items[item.id] = item;
      }
      if (page * limit >= total) break;
    }

    final doctorIds = items.values
        .where((item) =>
            !_lookedUpDoctors.contains(item.doctorId) &&
            ((item.doctorName == 'Bác sĩ phụ trách' &&
                    !_doctorNames.containsKey(item.doctorId)) ||
                (item.specialty == 'Lịch khám' &&
                    item.specialtyId == null &&
                    !_doctorSpecialties.containsKey(item.doctorId))))
        .map((item) => item.doctorId)
        .toSet()
        .toList();
    var next = 0;
    await Future.wait(List.generate(doctorIds.length.clamp(0, 6), (_) async {
      while (next < doctorIds.length) {
        final id = doctorIds[next++];
        try {
          final response = await _api.get(
              '/api/v1/doctors/${Uri.encodeComponent(id)}',
              cancellation: cancellation);
          _lookedUpDoctors.add(id);
          final data = response.data as Map<String, dynamic>;
          final name = appointmentDisplayName(data['displayName']);
          if (name != null) _doctorNames[id] = name;
          final rawSpecialtyId = data['specialtyId'];
          if (rawSpecialtyId is String && rawSpecialtyId.trim().isNotEmpty) {
            _doctorSpecialties[id] = rawSpecialtyId.trim();
          }
        } on ApiException catch (error) {
          if (cancellation?.isCancelled == true || error.statusCode == 401) {
            rethrow;
          }
        } catch (_) {
          /* Keep a readable fallback while the doctor service is unavailable. */
        }
      }
    }));

    final missingSpecialtyIds = <String>{};
    for (final item in items.values) {
      if (item.specialty != 'Lịch khám') continue;
      final sid = item.specialtyId ?? _doctorSpecialties[item.doctorId];
      if (sid != null && sid.isNotEmpty && !_specialtyNames.containsKey(sid)) {
        missingSpecialtyIds.add(sid);
      }
    }
    if (missingSpecialtyIds.isNotEmpty) {
      await _loadSpecialties(missingSpecialtyIds, cancellation: cancellation);
    }

    return items.values.map(_applyCachedNames).toList();
  }

  Future<void> _loadSpecialties(Set<String> neededIds,
      {RequestCancellation? cancellation}) async {
    try {
      for (var page = 1;; page++) {
        final response = await _api.get('/api/v1/specialties',
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
        for (final entry in values) {
          if (entry is! Map<String, dynamic>) continue;
          final sid = entry['id'];
          final name = appointmentDisplayName(entry['name']);
          if (sid is String && sid.trim().isNotEmpty && name != null) {
            _specialtyNames[sid.trim()] = name;
          }
        }
        if (neededIds.every(_specialtyNames.containsKey) ||
            page * limit >= total) {
          break;
        }
      }
    } on ApiException catch (error) {
      if (cancellation?.isCancelled == true || error.statusCode == 401) {
        rethrow;
      }
    } catch (_) {
      /* Keep fallback 'Lịch khám' when specialty lookup fails or is unavailable. */
    }
  }

  PatientAppointment _applyCachedNames(PatientAppointment item) {
    final effectiveSpecialtyId =
        item.specialtyId ?? _doctorSpecialties[item.doctorId];
    final doctorName = item.doctorName != 'Bác sĩ phụ trách'
        ? item.doctorName
        : (_doctorNames[item.doctorId] ?? item.doctorName);
    final specialty = item.specialty != 'Lịch khám'
        ? item.specialty
        : (effectiveSpecialtyId != null
            ? (_specialtyNames[effectiveSpecialtyId] ?? item.specialty)
            : item.specialty);
    return item.withNames(
        doctorName: doctorName,
        specialty: specialty,
        specialtyId: effectiveSpecialtyId);
  }

  Future<PatientAppointment> detail(String id,
      {RequestCancellation? cancellation}) async {
    final response = await _api.get(
        '/api/v1/appointments/${Uri.encodeComponent(id)}',
        query: {'view': 'detail', 'include': 'names'},
        cancellation: cancellation);
    final item =
        PatientAppointment.fromJson(response.data as Map<String, dynamic>);
    if (item.id != id) throw const FormatException('Mismatched appointment');
    return _applyCachedNames(item);
  }

  Future<PatientAppointment> _change(
      String id, String action, Map<String, Object?> body,
      {String? idempotencyKey}) async {
    final response = await _api.patch(
        '/api/v1/appointments/${Uri.encodeComponent(id)}/$action',
        body: body,
        idempotencyKey: _resolveIdempotencyKey('m-appt-$action', idempotencyKey));
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

  Future<PatientAppointment> cancel(String id,
      {String? reason, String? idempotencyKey}) {
    final trimmedReason = reason?.trim();
    return _change(
        id,
        'cancel',
        {
          if (trimmedReason != null && trimmedReason.isNotEmpty)
            'reason': trimmedReason,
        },
        idempotencyKey: idempotencyKey);
  }

  Future<PatientAppointment> reschedule(String id, DateTime start, DateTime end,
      {String? reason, String? idempotencyKey}) async {
    if (!start.isAfter(DateTime.now().toUtc()) || !end.isAfter(start)) {
      throw const ApiException(
          code: 'APPOINTMENT_SLOT_INVALID', message: 'Khung giờ không hợp lệ.');
    }
    final trimmedReason = reason?.trim();
    return _change(
        id,
        'reschedule',
        {
          'scheduledStartAt': start.toUtc().toIso8601String(),
          'scheduledEndAt': end.toUtc().toIso8601String(),
          if (trimmedReason != null && trimmedReason.isNotEmpty)
            'reason': trimmedReason,
        },
        idempotencyKey: idempotencyKey);
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
