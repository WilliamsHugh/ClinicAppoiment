import 'dart:async';
import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Trả về ngày theo múi giờ phòng khám UTC+7 (YYYY-MM-DD) tính từ hiện tại.
String clinicDay(int offsetDays) {
  final nowVn = DateTime.now().toUtc().add(const Duration(hours: 7));
  final target = DateTime.utc(nowVn.year, nowVn.month, nowVn.day)
      .add(Duration(days: offsetDays));
  final y = target.year.toString().padLeft(4, '0');
  final m = target.month.toString().padLeft(2, '0');
  final d = target.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Chuyển ngày YYYY-MM-DD sang định dạng hiển thị DD/MM/YYYY.
String clinicDisplayDate(String clinicYmd) {
  final parts = clinicYmd.split('-');
  if (parts.length != 3) return clinicYmd;
  return '${parts[2]}/${parts[1]}/${parts[0]}';
}

/// Sinh cặp (startAtUtc, endAtUtc) ISO-8601 từ giờ Việt Nam (UTC+7).
({String startAt, String endAt}) vnSlotUtc(
  String clinicYmd,
  int vnHour,
  int vnMinute, {
  int durationMinutes = 30,
}) {
  final hh = vnHour.toString().padLeft(2, '0');
  final mm = vnMinute.toString().padLeft(2, '0');
  final start = DateTime.parse('${clinicYmd}T$hh:$mm:00+07:00').toUtc();
  final end = start.add(Duration(minutes: durationMinutes));
  return (
    startAt: start.toIso8601String(),
    endAt: end.toIso8601String(),
  );
}

class RecordedRequest {
  RecordedRequest({
    required this.method,
    required this.path,
    required this.queryParameters,
    required this.headers,
    required this.body,
    required this.jsonBody,
  });

  final String method;
  final String path;
  final Map<String, String> queryParameters;
  final Map<String, String> headers;
  final String body;
  final Map<String, dynamic>? jsonBody;

  String? get idempotencyKey => headers['Idempotency-Key'];
}

class FakeSessionProvider
    implements SessionProvider, CredentialSessionProvider {
  FakeSessionProvider({
    bool initialAuthenticated = true,
    this.userId = 'user-patient-1',
    this.accessToken = 'e2e-jwt-token',
  }) : _authenticated = initialAuthenticated;

  final String userId;
  final String accessToken;
  bool _authenticated;
  int signOutCount = 0;
  int signInCount = 0;

  bool get isAuthenticated => _authenticated;
  bool get signedOut => !_authenticated;

  @override
  Future<String?> getAccessToken() async => _authenticated ? accessToken : null;

  @override
  Future<AuthSession?> restoreSession() async => _authenticated
      ? AuthSession(
          userId: userId,
          role: UserRole.patient,
          accessToken: accessToken,
        )
      : null;

  @override
  Future<AuthSession> signIn(String email, String password) async {
    _authenticated = true;
    signInCount++;
    return AuthSession(
      userId: userId,
      role: UserRole.patient,
      accessToken: accessToken,
    );
  }

  @override
  Future<AuthSession?> signUp(
    String fullName,
    String email,
    String password,
  ) async {
    _authenticated = true;
    return AuthSession(
      userId: userId,
      role: UserRole.patient,
      accessToken: accessToken,
    );
  }

  @override
  Future<void> signOut() async {
    _authenticated = false;
    signOutCount++;
  }
}

typedef GatewayOverride = FutureOr<http.Response?> Function(
    http.Request request);

typedef GatewayResponseOverride = FutureOr<http.Response?> Function(
    http.Request request, http.Response response);

class FakeClinicGateway {
  FakeClinicGateway({
    required TokenProvider tokenProvider,
    bool seedDefaults = true,
    this.errorOverride,
    this.afterResponseOverride,
    this.doctorsTotalOverride,
    this.specialtiesTotalOverride,
    this.readAllCutoffIso,
  }) {
    if (seedDefaults) {
      _seedDefaultData();
    }
    apiClient = ClinicApiClient(
      tokenProvider: tokenProvider,
      baseUrl: 'http://gateway.test',
      transport: MockClient(_handleRequest),
    );
  }

  late final ClinicApiClient apiClient;
  GatewayOverride? errorOverride;
  GatewayResponseOverride? afterResponseOverride;
  int? doctorsTotalOverride;
  int? specialtiesTotalOverride;
  String? readAllCutoffIso;

  final List<RecordedRequest> requests = [];
  final List<({String method, String path, int statusCode})> responses = [];
  final List<String> forbiddenHits = [];

  final List<Map<String, dynamic>> specialties = [];
  final List<Map<String, dynamic>> doctors = [];
  final Map<String, List<Map<String, dynamic>>> schedulesByDoctor = {};
  final Map<String, List<Map<String, String>>> slotsByDoctorDate = {};
  final Set<String> occupiedSlotKeys = {};
  final List<Map<String, dynamic>> appointments = [];
  final List<Map<String, dynamic>> medicalRecords = [];
  final List<Map<String, dynamic>> notifications = [];
  final List<Map<String, dynamic>> sessions = [];

  Map<String, dynamic> userProfile = {};
  Map<String, dynamic> patientProfile = {};

  final Map<String, ({String signature, Map<String, dynamic> data})>
      _idempotencyCache = {};
  int _appointmentSeq = 100;

  void _seedDefaultData() {
    specialties.addAll([
      {
        'id': 'spec-cardio',
        'name': 'Tim mạch',
        'description': 'Chẩn đoán và điều trị bệnh lý tim mạch',
        'isActive': true,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      },
      {
        'id': 'spec-derm',
        'name': 'Da liễu',
        'description': 'Khám và điều trị các bệnh lý da liễu',
        'isActive': true,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      },
    ]);

    doctors.addAll([
      {
        'id': 'doctor-1',
        'userId': 'user-doc-1',
        'specialtyId': 'spec-cardio',
        'displayName': 'BS. Nguyễn Văn An',
        'bio': 'Bác sĩ chuyên khoa Tim mạch với 12 năm kinh nghiệm.',
        'isActive': true,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      },
      {
        'id': 'doctor-2',
        'userId': 'user-doc-2',
        'specialtyId': 'spec-derm',
        'displayName': 'BS. Trần Thị Bình',
        'bio': 'Chuyên gia Da liễu thẩm mỹ và dị ứng miễn dịch.',
        'isActive': true,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      },
    ]);

    schedulesByDoctor['doctor-1'] = [
      {
        'id': 'sched-1-active',
        'doctorId': 'doctor-1',
        'weekday': 1,
        'startTime': '09:00',
        'endTime': '12:00',
        'slotDurationMinutes': 30,
        'isActive': true,
      },
      {
        'id': 'sched-1-inactive',
        'doctorId': 'doctor-1',
        'weekday': 2,
        'startTime': '13:00',
        'endTime': '17:00',
        'slotDurationMinutes': 30,
        'isActive': false,
      },
    ];
    schedulesByDoctor['doctor-2'] = [
      {
        'id': 'sched-2-active',
        'doctorId': 'doctor-2',
        'weekday': 3,
        'startTime': '08:00',
        'endTime': '11:30',
        'slotDurationMinutes': 30,
        'isActive': true,
      },
    ];

    final d1 = clinicDay(1);
    final d2 = clinicDay(2);
    appointments.add(
      buildAppointment(
        id: 'appt-confirmed-1',
        doctorId: 'doctor-1',
        specialtyId: 'spec-cardio',
        startAt: vnSlotUtc(d1, 15, 0).startAt,
        endAt: vnSlotUtc(d1, 15, 0).endAt,
        status: 'CONFIRMED',
        reason: 'Tái khám huyết áp định kỳ',
      ),
    );
    appointments.add(
      buildAppointment(
        id: 'appt-pending-2',
        doctorId: 'doctor-2',
        specialtyId: 'spec-derm',
        startAt: vnSlotUtc(d2, 9, 0).startAt,
        endAt: vnSlotUtc(d2, 9, 0).endAt,
        status: 'PENDING',
        reason: 'Kiểm tra dị ứng da',
      ),
    );
    for (final appt in appointments) {
      if (const {'PENDING', 'CONFIRMED', 'CHECKED_IN'}
          .contains(appt['status'])) {
        occupiedSlotKeys.add(
          _slotKey(
            appt['doctorId'] as String,
            appt['scheduledStartAt'] as String,
            appt['scheduledEndAt'] as String,
          ),
        );
      }
    }

    medicalRecords.add({
      'id': 'rec-11111111-1111-4111-8111-111111111111',
      'appointmentId': 'appt-completed-0',
      'patientId': 'patient-1',
      'doctorId': 'doctor-1',
      'symptoms': 'Đau họng, sốt nhẹ',
      'diagnosis': 'Viêm họng cấp',
      'notes': 'Uống nhiều nước ấm, tái khám sau 5 ngày nếu còn sốt.',
      'treatmentPlan': 'Điều trị ngoại trú 5 ngày',
      'prescription': [
        {
          'medicineName': 'Paracetamol',
          'dosage': '500mg',
          'frequency': '2 lần/ngày',
          'duration': '3 ngày',
        },
      ],
      'status': 'FINAL',
      'version': 1,
      'createdBy': 'user-doc-1',
      'createdAt': '2026-10-15T08:00:00.000Z',
      'updatedAt': '2026-10-15T08:30:00.000Z',
    });

    notifications.addAll([
      {
        'id': 'notif-appt-1',
        'recipientUserId': 'user-patient-1',
        'type': 'APPOINTMENT_CONFIRMED',
        'title': 'Lịch hẹn đã được xác nhận',
        'message': 'Chạm để mở chi tiết lịch hẹn của bạn.',
        'status': 'UNREAD',
        'payload': {'appointmentId': 'appt-confirmed-1'},
        'createdAt': '2026-10-20T08:00:00.000Z',
      },
      {
        'id': 'notif-rec-1',
        'recipientUserId': 'user-patient-1',
        'type': 'MEDICAL_RECORD_READY',
        'title': 'Có kết quả khám mới',
        'message': 'Chạm để xem đơn thuốc và kết quả khám.',
        'status': 'UNREAD',
        'payload': {
          'recordId': 'rec-11111111-1111-4111-8111-111111111111',
        },
        'createdAt': '2026-10-20T09:00:00.000Z',
      },
    ]);

    patientProfile = {
      'id': 'patient-1',
      'userId': 'user-patient-1',
      'dateOfBirth': '1992-05-12',
      'gender': 'MALE',
      'address': '12 Lê Lợi, Q.1, TP.HCM',
      'emergencyContact': '0987654321',
      'insuranceNumber': 'DN40112345678',
      'fullName': 'Nguyễn Minh Khang',
      'email': 'patient@example.com',
      'phone': '0901234567',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
    };

    userProfile = {
      'id': 'user-patient-1',
      'email': 'patient@example.com',
      'fullName': 'Nguyễn Minh Khang',
      'phone': '0901234567',
      'role': 'PATIENT',
      'status': 'ACTIVE',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
      'patientProfile': Map<String, dynamic>.from(patientProfile),
    };

    final nowUtc = DateTime.now().toUtc();
    sessions.addAll([
      {
        'sessionId': 'session-current-1',
        'isCurrent': true,
        'role': 'PATIENT',
        'state': 'ACTIVE',
        'startedAt': nowUtc.subtract(const Duration(hours: 2)).toIso8601String(),
        'lastActiveAt': nowUtc.toIso8601String(),
        'idleExpiresAt':
            nowUtc.add(const Duration(days: 30)).toIso8601String(),
        'deviceInfo': 'Pixel 8 · Android 14',
      },
      {
        'sessionId': 'session-other-2',
        'isCurrent': false,
        'role': 'PATIENT',
        'state': 'ACTIVE',
        'startedAt': nowUtc.subtract(const Duration(days: 2)).toIso8601String(),
        'lastActiveAt':
            nowUtc.subtract(const Duration(hours: 5)).toIso8601String(),
        'idleExpiresAt':
            nowUtc.add(const Duration(days: 28)).toIso8601String(),
        'deviceInfo': 'Web Chrome · Windows',
      },
    ]);
  }

  static String _normalizeIso(String raw) =>
      DateTime.tryParse(raw)?.toUtc().toIso8601String() ?? raw.trim();

  static String _slotKey(String doctorId, String startAt, String endAt) =>
      '$doctorId|${_normalizeIso(startAt)}|${_normalizeIso(endAt)}';

  static String? _normalizeReason(Map<String, dynamic> body) {
    final raw = body['reason'];
    if (raw == null) return null;
    final trimmed = raw.toString().trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String _postFingerprint(Map<String, dynamic> body) => jsonEncode({
        'op': 'POST',
        'doctorId': body['doctorId']?.toString(),
        'specialtyId': body['specialtyId']?.toString(),
        'scheduledStartAt':
            _normalizeIso(body['scheduledStartAt']?.toString() ?? ''),
        'scheduledEndAt':
            _normalizeIso(body['scheduledEndAt']?.toString() ?? ''),
        'reason': _normalizeReason(body),
      });

  static String _rescheduleFingerprint(
    String apptId,
    Map<String, dynamic> body,
  ) =>
      jsonEncode({
        'op': 'RESCHEDULE',
        'appointmentId': apptId,
        'scheduledStartAt':
            _normalizeIso(body['scheduledStartAt']?.toString() ?? ''),
        'scheduledEndAt':
            _normalizeIso(body['scheduledEndAt']?.toString() ?? ''),
        'reason': _normalizeReason(body),
      });

  static String _cancelFingerprint(String apptId, Map<String, dynamic> body) =>
      jsonEncode({
        'op': 'CANCEL',
        'appointmentId': apptId,
        'toStatus': 'CANCELLED',
        'reason': _normalizeReason(body),
      });

  Map<String, dynamic> buildAppointment({
    required String id,
    required String doctorId,
    required String specialtyId,
    required String startAt,
    required String endAt,
    required String status,
    String? reason,
  }) {
    final doc = doctors.cast<Map<String, dynamic>?>().firstWhere(
          (d) => d?['id'] == doctorId,
          orElse: () => null,
        );
    final spec = specialties.cast<Map<String, dynamic>?>().firstWhere(
          (s) => s?['id'] == specialtyId,
          orElse: () => null,
        );
    final doctorName = doc?['displayName'] as String? ?? 'Bác sĩ phòng khám';
    final specialtyName = spec?['name'] as String? ?? 'Chuyên khoa';
    final nowIso = DateTime.now().toUtc().toIso8601String();
    return {
      'id': id,
      'patientId': 'patient-1',
      'doctorId': doctorId,
      'specialtyId': specialtyId,
      // Flat fields cho tương thích 8db4065
      'doctorName': doctorName,
      'specialty': specialtyName,
      // Summary objects theo API Contract v2 (specialtySummary.name luôn null ở BE)
      'patientSummary': {
        'id': 'patient-1',
        'fullName': userProfile['fullName'] ?? 'Nguyễn Minh Khang',
      },
      'doctorSummary': {
        'id': doctorId,
        'displayName': doctorName,
      },
      'specialtySummary': {
        'id': specialtyId,
        'name': null,
      },
      'scheduledStartAt': startAt,
      'scheduledEndAt': endAt,
      'status': status,
      'reason': reason,
      'createdBy': 'user-patient-1',
      'updatedBy': 'user-patient-1',
      'createdAt': nowIso,
      'updatedAt': nowIso,
    };
  }

  Iterable<RecordedRequest> requestsTo(String path, {String? method}) =>
      requests.where(
        (r) => r.path == path && (method == null || r.method == method),
      );

  List<Map<String, String>> _slotsFor(String doctorId, String date) {
    final explicit = slotsByDoctorDate['$doctorId|$date'];
    final source = explicit ??
        [
          {
            'startAt': vnSlotUtc(date, 8, 0).startAt,
            'endAt': vnSlotUtc(date, 8, 0).endAt,
          },
          {
            'startAt': vnSlotUtc(date, 10, 0).startAt,
            'endAt': vnSlotUtc(date, 10, 0).endAt,
          },
          {
            'startAt': vnSlotUtc(date, 14, 0).startAt,
            'endAt': vnSlotUtc(date, 14, 0).endAt,
          },
        ];
    return source
        .where((s) => !occupiedSlotKeys
            .contains(_slotKey(doctorId, s['startAt']!, s['endAt']!)))
        .toList();
  }

  static String? _readIdempotencyKey(http.Request request) {
    for (final entry in request.headers.entries) {
      if (entry.key.toLowerCase() == 'idempotency-key') {
        return entry.value;
      }
    }
    return null;
  }

  Future<http.Response> _handleRequest(http.Request request) async {
    final response = await _dispatchRequest(request);
    if (afterResponseOverride != null) {
      final overridden = await afterResponseOverride!(request, response);
      if (overridden != null) {
        responses.add((
          method: request.method,
          path: request.url.path,
          statusCode: overridden.statusCode,
        ));
        return overridden;
      }
    }
    responses.add((
      method: request.method,
      path: request.url.path,
      statusCode: response.statusCode,
    ));
    return response;
  }

  Future<http.Response> _dispatchRequest(http.Request request) async {
    final path = request.url.path;
    final method = request.method;
    final query = request.url.queryParameters;

    Map<String, dynamic>? jsonBody;
    if (request.body.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(request.body);
        if (decoded is Map<String, dynamic>) {
          jsonBody = decoded;
        }
      } catch (_) {}
    }

    requests.add(
      RecordedRequest(
        method: method,
        path: path,
        queryParameters: Map<String, String>.from(query),
        headers: Map<String, String>.from(request.headers),
        body: request.body,
        jsonBody: jsonBody,
      ),
    );

    // Chặn tuyệt đối các endpoint bị cấm theo API Contract v2
    if (path.contains('/time-offs') ||
        path == '/api/v1/appointments/summary' ||
        path.contains('/auth/password/')) {
      forbiddenHits.add('$method $path');
      throw StateError('Forbidden endpoint called: $method $path');
    }

    // Bắt buộc Authorization: Bearer <token> trên mọi route bảo vệ /api/v1/*
    if (path.startsWith('/api/v1/')) {
      final authHeader =
          (request.headers['Authorization'] ?? request.headers['authorization'])
              ?.trim();
      if (authHeader == null ||
          !authHeader.startsWith('Bearer ') ||
          authHeader.substring(7).trim().isEmpty) {
        return jsonError(401, 'AUTH_REQUIRED', 'Authentication required');
      }
    }

    // Bắt buộc tham số view=detail và include=names trên GET /appointments
    if (method == 'GET' &&
        (path == '/api/v1/appointments' ||
            path.startsWith('/api/v1/appointments/'))) {
      if (query['view'] != 'detail') {
        throw StateError(
          'Missing or unexpected view=${query['view']} on $path (expected detail)',
        );
      }
      if (query['include'] != 'names') {
        throw StateError(
          'Missing or unexpected include=${query['include']} on $path (expected names)',
        );
      }
    }

    if (errorOverride != null) {
      final overridden = await errorOverride!(request);
      if (overridden != null) return overridden;
    }

    // --- Tab 1: Specialties & Doctors ---
    if (method == 'GET' && path == '/api/v1/specialties') {
      final q = (query['q'] ?? '').trim().toLowerCase();
      final page = int.tryParse(query['page'] ?? '1') ?? 1;
      final limit = int.tryParse(query['limit'] ?? '20') ?? 20;
      final filtered = specialties
          .where((s) =>
              s['isActive'] == true &&
              (q.isEmpty ||
                  s['name'].toString().toLowerCase().contains(q)))
          .toList();
      final total = specialtiesTotalOverride ?? filtered.length;
      final start = (page - 1) * limit;
      final pageItems = start >= filtered.length
          ? <Map<String, dynamic>>[]
          : filtered.skip(start).take(limit).toList();
      return jsonOk({
        'items': pageItems,
        'page': page,
        'limit': limit,
        'total': total,
      });
    }

    if (method == 'GET' && path == '/api/v1/doctors') {
      final q = (query['q'] ?? '').trim().toLowerCase();
      final specialtyId = (query['specialtyId'] ?? '').trim();
      final page = int.tryParse(query['page'] ?? '1') ?? 1;
      final limit = int.tryParse(query['limit'] ?? '20') ?? 20;
      final filtered = doctors.where((d) {
        if (d['isActive'] != true) return false;
        if (specialtyId.isNotEmpty && d['specialtyId'] != specialtyId) {
          return false;
        }
        if (q.isNotEmpty &&
            !d['displayName'].toString().toLowerCase().contains(q)) {
          return false;
        }
        return true;
      }).toList();
      final total = doctorsTotalOverride ?? filtered.length;
      final start = (page - 1) * limit;
      final pageItems = start >= filtered.length
          ? <Map<String, dynamic>>[]
          : filtered.skip(start).take(limit).toList();
      return jsonOk({
        'items': pageItems,
        'page': page,
        'limit': limit,
        'total': total,
      });
    }

    final doctorMatch = RegExp(r'^/api/v1/doctors/([^/]+)$').firstMatch(path);
    if (method == 'GET' && doctorMatch != null) {
      final doctorId = doctorMatch.group(1)!;
      final found = doctors.cast<Map<String, dynamic>?>().firstWhere(
            (d) => d?['id'] == doctorId,
            orElse: () => null,
          );
      if (found == null) {
        return jsonError(404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ');
      }
      return jsonOk(found);
    }

    final schedulesMatch =
        RegExp(r'^/api/v1/doctors/([^/]+)/schedules$').firstMatch(path);
    if (method == 'GET' && schedulesMatch != null) {
      final doctorId = schedulesMatch.group(1)!;
      final items = schedulesByDoctor[doctorId] ?? <Map<String, dynamic>>[];
      return jsonOk({
        'items': items,
        'page': 1,
        'limit': 100,
        'total': items.length,
      });
    }

    final slotsMatch =
        RegExp(r'^/api/v1/doctors/([^/]+)/available-slots$').firstMatch(path);
    if (method == 'GET' && slotsMatch != null) {
      final doctorId = slotsMatch.group(1)!;
      final date = query['date'] ?? '';
      if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) {
        return jsonError(400, 'VALIDATION_ERROR', 'Ngày khám không hợp lệ');
      }
      return jsonOk(_slotsFor(doctorId, date));
    }

    // --- Tab 2: Appointments ---
    if (method == 'GET' && path == '/api/v1/appointments') {
      final page = int.tryParse(query['page'] ?? '1') ?? 1;
      final limit = int.tryParse(query['limit'] ?? '100') ?? 100;
      final statusFilter = query['status']
          ?.split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toSet();
      final filtered = appointments.where((a) {
        if (statusFilter != null &&
            statusFilter.isNotEmpty &&
            !statusFilter.contains(a['status'])) {
          return false;
        }
        return true;
      }).toList();
      final start = (page - 1) * limit;
      final pageItems = start >= filtered.length
          ? <Map<String, dynamic>>[]
          : filtered.skip(start).take(limit).toList();
      return jsonOk({
        'items': pageItems,
        'page': page,
        'limit': limit,
        'total': filtered.length,
      });
    }

    if (method == 'POST' && path == '/api/v1/appointments') {
      final rawKey = _readIdempotencyKey(request);
      final key = rawKey?.trim();
      if (key == null || key.isEmpty || key.length > 255) {
        return jsonError(400, 'VALIDATION_ERROR', 'Thiếu Idempotency-Key');
      }
      final body = jsonBody ?? {};
      final doctorId = body['doctorId'] as String?;
      final specialtyId = body['specialtyId'] as String? ?? 'spec-cardio';
      final startAt = body['scheduledStartAt'] as String?;
      final endAt = body['scheduledEndAt'] as String?;
      if (doctorId == null || startAt == null || endAt == null) {
        return jsonError(400, 'VALIDATION_ERROR', 'Thiếu thông tin đặt lịch');
      }
      final startDt = DateTime.tryParse(startAt)?.toUtc();
      final endDt = DateTime.tryParse(endAt)?.toUtc();
      if (startDt == null ||
          endDt == null ||
          !endDt.isAfter(startDt) ||
          !startDt.isAfter(DateTime.now().toUtc())) {
        return jsonError(
          422,
          'APPOINTMENT_SLOT_INVALID',
          'Khung giờ đặt lịch không hợp lệ hoặc đã ở quá khứ.',
        );
      }

      final cacheKey = 'POST|$key';
      final signature = _postFingerprint(body);
      final existing = _idempotencyCache[cacheKey];
      if (existing != null) {
        if (existing.signature == signature) {
          return jsonOk(existing.data, statusCode: 200);
        }
        return jsonError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key đã được dùng cho yêu cầu khác.',
        );
      }

      final slotKey = _slotKey(doctorId, startAt, endAt);
      if (occupiedSlotKeys.contains(slotKey)) {
        return jsonError(
          409,
          'APPOINTMENT_SLOT_UNAVAILABLE',
          'Khung giờ đã có người đặt.',
        );
      }

      occupiedSlotKeys.add(slotKey);
      final created = buildAppointment(
        id: 'appt-e2e-${++_appointmentSeq}',
        doctorId: doctorId,
        specialtyId: specialtyId,
        startAt: _normalizeIso(startAt),
        endAt: _normalizeIso(endAt),
        status: 'PENDING',
        reason: _normalizeReason(body),
      );
      appointments.insert(0, created);
      _idempotencyCache[cacheKey] = (signature: signature, data: created);
      return jsonOk(created, statusCode: 201);
    }

    final apptDetailMatch =
        RegExp(r'^/api/v1/appointments/([^/]+)$').firstMatch(path);
    if (method == 'GET' && apptDetailMatch != null) {
      final apptId = apptDetailMatch.group(1)!;
      final found = appointments.cast<Map<String, dynamic>?>().firstWhere(
            (a) => a?['id'] == apptId,
            orElse: () => null,
          );
      if (found == null) {
        return jsonError(
            404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn');
      }
      return jsonOk(found);
    }

    final rescheduleMatch =
        RegExp(r'^/api/v1/appointments/([^/]+)/reschedule$').firstMatch(path);
    if (method == 'PATCH' && rescheduleMatch != null) {
      final apptId = rescheduleMatch.group(1)!;
      final rawKey = _readIdempotencyKey(request);
      final key = rawKey?.trim();
      if (key == null || key.isEmpty || key.length > 255) {
        return jsonError(400, 'VALIDATION_ERROR', 'Thiếu Idempotency-Key');
      }
      final body = jsonBody ?? {};
      final newStart = body['scheduledStartAt']?.toString();
      final newEnd = body['scheduledEndAt']?.toString();
      if (newStart == null || newEnd == null) {
        return jsonError(400, 'VALIDATION_ERROR', 'Thiếu thời gian đổi lịch');
      }
      final startDt = DateTime.tryParse(newStart)?.toUtc();
      final endDt = DateTime.tryParse(newEnd)?.toUtc();
      if (startDt == null ||
          endDt == null ||
          !endDt.isAfter(startDt) ||
          !startDt.isAfter(DateTime.now().toUtc())) {
        return jsonError(
          422,
          'APPOINTMENT_SLOT_INVALID',
          'Khung giờ đổi lịch phải nằm trong tương lai và hợp lệ.',
        );
      }

      final idx = appointments.indexWhere((a) => a['id'] == apptId);
      if (idx == -1) {
        return jsonError(
            404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn');
      }

      final sig = _rescheduleFingerprint(apptId, body);
      final cacheKey = 'RESCHEDULE|$key';
      final cached = _idempotencyCache[cacheKey];
      if (cached != null) {
        if (cached.signature == sig) return jsonOk(cached.data, statusCode: 200);
        return jsonError(409, 'IDEMPOTENCY_KEY_REUSED', 'Key conflict');
      }

      final current = Map<String, dynamic>.from(appointments[idx]);
      if (!const {'PENDING', 'CONFIRMED'}.contains(current['status'])) {
        return jsonError(
          409,
          'APPOINTMENT_INVALID_STATUS_TRANSITION',
          'Không thể đổi lịch ở trạng thái hiện tại.',
        );
      }

      final doctorId = current['doctorId'] as String;
      final oldSlotKey = _slotKey(
        doctorId,
        current['scheduledStartAt'] as String,
        current['scheduledEndAt'] as String,
      );
      final newSlotKey = _slotKey(doctorId, newStart, newEnd);
      if (occupiedSlotKeys.contains(newSlotKey)) {
        return jsonError(
          409,
          'APPOINTMENT_SLOT_UNAVAILABLE',
          'Khung giờ mới đã hết.',
        );
      }
      occupiedSlotKeys.remove(oldSlotKey);
      occupiedSlotKeys.add(newSlotKey);
      current['scheduledStartAt'] = _normalizeIso(newStart);
      current['scheduledEndAt'] = _normalizeIso(newEnd);
      if (body.containsKey('reason')) {
        current['reason'] = _normalizeReason(body);
      }
      current['updatedAt'] = DateTime.now().toUtc().toIso8601String();
      appointments[idx] = current;
      _idempotencyCache[cacheKey] = (
        signature: sig,
        data: current,
      );
      return jsonOk(current);
    }

    final cancelMatch =
        RegExp(r'^/api/v1/appointments/([^/]+)/cancel$').firstMatch(path);
    if (method == 'PATCH' && cancelMatch != null) {
      final apptId = cancelMatch.group(1)!;
      final rawKey = _readIdempotencyKey(request);
      final key = rawKey?.trim();
      if (key == null || key.isEmpty || key.length > 255) {
        return jsonError(400, 'VALIDATION_ERROR', 'Thiếu Idempotency-Key');
      }
      final body = jsonBody ?? {};
      final idx = appointments.indexWhere((a) => a['id'] == apptId);
      if (idx == -1) {
        return jsonError(
            404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn');
      }

      final sig = _cancelFingerprint(apptId, body);
      final cacheKey = 'CANCEL|$key';
      final cached = _idempotencyCache[cacheKey];
      if (cached != null) {
        if (cached.signature == sig) return jsonOk(cached.data, statusCode: 200);
        return jsonError(409, 'IDEMPOTENCY_KEY_REUSED', 'Key conflict');
      }

      final current = Map<String, dynamic>.from(appointments[idx]);
      if (!const {'PENDING', 'CONFIRMED'}.contains(current['status'])) {
        return jsonError(
          409,
          'APPOINTMENT_INVALID_STATUS_TRANSITION',
          'Không thể hủy lịch ở trạng thái hiện tại.',
        );
      }
      final currentStart =
          DateTime.tryParse(current['scheduledStartAt']?.toString() ?? '')
              ?.toUtc();
      if (currentStart == null ||
          !currentStart.isAfter(DateTime.now().toUtc())) {
        return jsonError(
          422,
          'APPOINTMENT_SLOT_INVALID',
          'Không thể hủy lịch hẹn đã qua thời gian khám.',
        );
      }

      occupiedSlotKeys.remove(
        _slotKey(
          current['doctorId'] as String,
          current['scheduledStartAt'] as String,
          current['scheduledEndAt'] as String,
        ),
      );
      current['status'] = 'CANCELLED';
      if (body.containsKey('reason')) {
        current['reason'] = _normalizeReason(body);
      }
      current['updatedAt'] = DateTime.now().toUtc().toIso8601String();
      appointments[idx] = current;
      _idempotencyCache[cacheKey] = (
        signature: sig,
        data: current,
      );
      return jsonOk(current);
    }

    // --- Tab 3: Medical Records ---
    if (method == 'GET' && path == '/api/v1/medical-records') {
      final page = int.tryParse(query['page'] ?? '1') ?? 1;
      final limit = int.tryParse(query['limit'] ?? '20') ?? 20;
      final apptFilter = query['appointmentId'];
      final filtered = medicalRecords.where((r) {
        if (apptFilter != null &&
            apptFilter.isNotEmpty &&
            r['appointmentId'] != apptFilter) {
          return false;
        }
        return true;
      }).toList();
      final start = (page - 1) * limit;
      final pageItems = start >= filtered.length
          ? <Map<String, dynamic>>[]
          : filtered.skip(start).take(limit).toList();
      return jsonOk({
        'items': pageItems,
        'page': page,
        'limit': limit,
        'total': filtered.length,
      });
    }

    final recMatch =
        RegExp(r'^/api/v1/medical-records/([^/]+)$').firstMatch(path);
    if (method == 'GET' && recMatch != null) {
      final recId = recMatch.group(1)!;
      final found = medicalRecords.cast<Map<String, dynamic>?>().firstWhere(
            (r) => r?['id'] == recId,
            orElse: () => null,
          );
      if (found == null) {
        return jsonError(
            404, 'MEDICAL_RECORD_NOT_FOUND', 'Không tìm thấy hồ sơ khám');
      }
      return jsonOk(found);
    }

    // --- Tab 4: Notifications ---
    if (method == 'GET' && path == '/api/v1/notifications') {
      final page = int.tryParse(query['page'] ?? '1') ?? 1;
      final limit = int.tryParse(query['limit'] ?? '20') ?? 20;
      final statusFilter = query['status']?.trim();
      if (statusFilter != null &&
          statusFilter.isNotEmpty &&
          !const {'UNREAD', 'READ', 'FAILED'}.contains(statusFilter)) {
        return jsonError(
          400,
          'VALIDATION_ERROR',
          'Trạng thái thông báo không hợp lệ',
        );
      }
      final filtered = notifications.where((n) {
        if (statusFilter != null &&
            statusFilter.isNotEmpty &&
            n['status'] != statusFilter) {
          return false;
        }
        return true;
      }).toList();
      final start = (page - 1) * limit;
      final pageItems = start >= filtered.length
          ? <Map<String, dynamic>>[]
          : filtered.skip(start).take(limit).toList();
      return jsonOk({
        'items': pageItems,
        'page': page,
        'limit': limit,
        'total': filtered.length,
      });
    }

    if (method == 'GET' && path == '/api/v1/notifications/unread-count') {
      final count =
          notifications.where((n) => n['status'] == 'UNREAD').length;
      return jsonOk({'unreadCount': count});
    }

    if (method == 'PATCH' && path == '/api/v1/notifications/read-all') {
      final cutoffStr = (jsonBody?['readBefore'] as String?) ??
          readAllCutoffIso ??
          DateTime.now().toUtc().toIso8601String();
      final cutoff = DateTime.parse(cutoffStr);
      final nowIso = DateTime.now().toUtc().toIso8601String();
      var updated = 0;
      for (var i = 0; i < notifications.length; i++) {
        final item = Map<String, dynamic>.from(notifications[i]);
        if (item['status'] == 'UNREAD') {
          final createdAt = DateTime.parse(item['createdAt'] as String);
          if (!createdAt.isAfter(cutoff)) {
            item['status'] = 'READ';
            item['readAt'] = nowIso;
            notifications[i] = item;
            updated++;
          }
        }
      }
      final remaining =
          notifications.where((n) => n['status'] == 'UNREAD').length;
      return jsonOk({
        'updatedCount': updated,
        'unreadCount': remaining,
        'readBefore': cutoffStr,
        'readAt': nowIso,
      });
    }

    final notifReadMatch =
        RegExp(r'^/api/v1/notifications/([^/]+)/read$').firstMatch(path);
    if (method == 'PATCH' && notifReadMatch != null) {
      final notifId = notifReadMatch.group(1)!;
      final idx = notifications.indexWhere((n) => n['id'] == notifId);
      if (idx == -1) {
        return jsonError(
            404, 'NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo');
      }
      final updated = Map<String, dynamic>.from(notifications[idx]);
      updated['status'] = 'READ';
      updated['readAt'] ??= DateTime.now().toUtc().toIso8601String();
      notifications[idx] = updated;
      return jsonOk(updated);
    }

    final notifMatch =
        RegExp(r'^/api/v1/notifications/([^/]+)$').firstMatch(path);
    if (method == 'GET' && notifMatch != null) {
      final notifId = notifMatch.group(1)!;
      final found = notifications.cast<Map<String, dynamic>?>().firstWhere(
            (n) => n?['id'] == notifId,
            orElse: () => null,
          );
      if (found == null) {
        return jsonError(
            404, 'NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo');
      }
      return jsonOk(found);
    }

    // --- Tab 5: Users, Patients & Auth Sessions ---
    if (method == 'GET' && path == '/api/v1/users/me') {
      final result = Map<String, dynamic>.from(userProfile);
      result['patientProfile'] = Map<String, dynamic>.from(patientProfile);
      return jsonOk(result);
    }

    if (method == 'PATCH' && path == '/api/v1/users/me') {
      final body = jsonBody ?? {};
      final allowedKeys = {'fullName', 'phone'};
      final extraKeys = body.keys.where((k) => !allowedKeys.contains(k)).toList();
      if (extraKeys.isNotEmpty) {
        return jsonError(
          400,
          'VALIDATION_ERROR',
          'Trường không hợp lệ: ${extraKeys.join(', ')}',
        );
      }
      if (body.containsKey('fullName')) {
        userProfile['fullName'] = body['fullName'];
        patientProfile['fullName'] = body['fullName'];
      }
      if (body.containsKey('phone')) {
        userProfile['phone'] = body['phone'];
        patientProfile['phone'] = body['phone'];
      }
      userProfile['updatedAt'] = DateTime.now().toUtc().toIso8601String();
      final responseMap = Map<String, dynamic>.from(userProfile)
        ..remove('patientProfile');
      return jsonOk(responseMap);
    }

    final patientMatch =
        RegExp(r'^/api/v1/patients/([^/]+)$').firstMatch(path);
    if (patientMatch != null) {
      final patientId = patientMatch.group(1)!;
      if (patientId != patientProfile['id']) {
        return jsonError(404, 'PATIENT_NOT_FOUND', 'Không tìm thấy bệnh nhân');
      }
      if (method == 'GET') {
        return jsonOk(patientProfile);
      }
      if (method == 'PATCH') {
        final body = jsonBody ?? {};
        const allowedKeys = {
          'dateOfBirth',
          'gender',
          'address',
          'emergencyContact',
          'insuranceNumber',
        };
        final extraKeys =
            body.keys.where((k) => !allowedKeys.contains(k)).toList();
        if (extraKeys.isNotEmpty) {
          return jsonError(
            400,
            'VALIDATION_ERROR',
            'Trường không hợp lệ: ${extraKeys.join(', ')}',
          );
        }
        for (final key in allowedKeys) {
          if (body.containsKey(key)) {
            patientProfile[key] = body[key];
          }
        }
        patientProfile['updatedAt'] = DateTime.now().toUtc().toIso8601String();
        return jsonOk(patientProfile);
      }
    }

    if (method == 'GET' && path == '/api/v1/auth/session') {
      if (sessions.isEmpty) {
        return jsonError(404, 'SESSION_NOT_FOUND', 'No active session found');
      }
      final current = sessions.firstWhere(
        (s) => s['isCurrent'] == true,
        orElse: () => sessions.first,
      );
      return jsonOk({
        'sessionId': current['sessionId'],
        'state': current['state'] ?? 'ACTIVE',
        'lastActiveAt': current['lastActiveAt'],
        'idleExpiresAt': current['idleExpiresAt'],
        'idleTimeoutSeconds': 2592000,
      });
    }

    if (method == 'GET' && path == '/api/v1/auth/sessions') {
      return jsonOk({
        'items': sessions,
        'page': 1,
        'limit': 20,
        'total': sessions.length,
      });
    }

    final sessionMatch =
        RegExp(r'^/api/v1/auth/sessions/([^/]+)$').firstMatch(path);
    if (method == 'DELETE' && sessionMatch != null) {
      final sessionId = sessionMatch.group(1)!;
      final exists = sessions.any((s) => s['sessionId'] == sessionId);
      if (!exists) {
        return jsonError(404, 'SESSION_NOT_FOUND', 'Session not found');
      }
      sessions.removeWhere((s) => s['sessionId'] == sessionId);
      return jsonOk({'sessionId': sessionId, 'revoked': true});
    }

    if (method == 'POST' && path == '/api/v1/auth/logout') {
      return jsonOk(null);
    }

    throw StateError('Unmocked API route: $method $path');
  }

  static http.Response jsonOk(Object? data, {int statusCode = 200}) =>
      http.Response.bytes(
        utf8.encode(jsonEncode({'success': true, 'data': data})),
        statusCode,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );

  static http.Response jsonError(
    int statusCode,
    String code,
    String message,
  ) =>
      http.Response.bytes(
        utf8.encode(jsonEncode({
          'success': false,
          'error': {
            'code': code,
            'message': message,
            'details': <Object>[],
          },
        })),
        statusCode,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );
}
