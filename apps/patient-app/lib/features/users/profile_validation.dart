import '../../core/api/api_models.dart';

final RegExp phoneValidationRegex = RegExp(r'^\+?[0-9][0-9 .-]{7,19}$');
final RegExp _isoDateRegex = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

const Set<String> allowedProfileGenders = {'MALE', 'FEMALE', 'OTHER'};

String? validateFullName(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return 'Họ và tên không được để trống.';
  }
  if (trimmed.length < 2 || trimmed.length > 120) {
    return 'Họ và tên phải có từ 2 đến 120 ký tự.';
  }
  return null;
}

String? validatePhone(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  if (!phoneValidationRegex.hasMatch(trimmed)) {
    return 'Số điện thoại không đúng định dạng (8–20 ký tự số).';
  }
  return null;
}

String? validateDateOfBirth(String raw, {DateTime? now}) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  final match = _isoDateRegex.firstMatch(trimmed);
  if (match == null) {
    return 'Ngày sinh không hợp lệ. Vui lòng nhập theo định dạng YYYY-MM-DD (ví dụ: 1990-05-12).';
  }
  final year = int.tryParse(match.group(1)!);
  final month = int.tryParse(match.group(2)!);
  final day = int.tryParse(match.group(3)!);
  if (year == null ||
      month == null ||
      day == null ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31) {
    return 'Ngày sinh không hợp lệ. Vui lòng kiểm tra lại ngày, tháng, năm.';
  }
  final parsed = DateTime(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    return 'Ngày sinh không hợp lệ. Vui lòng kiểm tra lại ngày, tháng, năm.';
  }
  final current = now ?? DateTime.now();
  final today = DateTime(current.year, current.month, current.day);
  if (parsed.isAfter(today)) {
    return 'Ngày sinh không được lớn hơn ngày hiện tại.';
  }
  return null;
}

String? validateAddress(String raw) {
  if (raw.trim().length > 500) {
    return 'Địa chỉ tối đa 500 ký tự.';
  }
  return null;
}

String? validateEmergencyContact(String raw) {
  if (raw.trim().length > 120) {
    return 'Liên hệ khẩn cấp tối đa 120 ký tự.';
  }
  return null;
}

String? validateInsuranceNumber(String raw) {
  if (raw.trim().length > 50) {
    return 'Số thẻ BHYT tối đa 50 ký tự.';
  }
  return null;
}

String friendlyProfileError(Object error) {
  if (error is ApiException) {
    final status = error.statusCode;
    final code = error.code;
    if (status == 401 || code == 'SESSION_REQUIRED') {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    }
    if (status == 403 || code == 'ACCESS_DENIED') {
      return 'Bạn không có quyền thực hiện thao tác này.';
    }
    if (status == 404 ||
        code == 'PATIENT_NOT_FOUND' ||
        code == 'USER_NOT_FOUND' ||
        code == 'SESSION_NOT_FOUND') {
      return 'Không tìm thấy dữ liệu trên hệ thống.';
    }
    if (status == 400 || code == 'VALIDATION_ERROR') {
      final fieldMsg = _mapValidationDetails(error.details);
      return fieldMsg ?? 'Thông tin nhập chưa hợp lệ. Vui lòng kiểm tra lại.';
    }
    if (status == 429 || code == 'RATE_LIMIT_EXCEEDED') {
      return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    }
    if (code == 'REQUEST_TIMEOUT') {
      return 'Kết nối quá thời gian chờ. Vui lòng thử lại.';
    }
    if (code == 'NETWORK_ERROR') {
      return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra đường truyền mạng.';
    }
    if ((status != null && status >= 500) ||
        code == 'SERVICE_UNAVAILABLE' ||
        code.startsWith('UPSTREAM_')) {
      return 'Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.';
    }
    return 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại.';
  }
  return 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại.';
}

String? _mapValidationDetails(List<Object?> details) {
  for (final item in details) {
    if (item is Map) {
      final path = item['path'];
      final field = path is List && path.isNotEmpty
          ? path.first?.toString()
          : item['field']?.toString();
      switch (field) {
        case 'fullName':
          return 'Họ và tên phải có từ 2 đến 120 ký tự.';
        case 'phone':
          return 'Số điện thoại không đúng định dạng (8–20 ký tự số).';
        case 'dateOfBirth':
          return 'Ngày sinh không hợp lệ (định dạng YYYY-MM-DD).';
        case 'gender':
          return 'Giới tính không hợp lệ.';
        case 'address':
          return 'Địa chỉ tối đa 500 ký tự.';
        case 'emergencyContact':
          return 'Liên hệ khẩn cấp tối đa 120 ký tự.';
        case 'insuranceNumber':
          return 'Số thẻ BHYT tối đa 50 ký tự.';
      }
    }
  }
  return null;
}

class AuthSessionItem {
  const AuthSessionItem({
    required this.sessionId,
    required this.isCurrent,
    required this.state,
    this.role,
    this.deviceInfo,
    this.lastActiveAt,
    this.startedAt,
  });

  final String sessionId;
  final bool isCurrent;
  final String state;
  final String? role;
  final String? deviceInfo;
  final String? lastActiveAt;
  final String? startedAt;

  AuthSessionItem copyWith({bool? isCurrent}) {
    return AuthSessionItem(
      sessionId: sessionId,
      isCurrent: isCurrent ?? this.isCurrent,
      state: state,
      role: role,
      deviceInfo: deviceInfo,
      lastActiveAt: lastActiveAt,
      startedAt: startedAt,
    );
  }

  static AuthSessionItem? fromJson(
    Object? raw, {
    String? currentSessionId,
  }) {
    if (raw is! Map) return null;
    final sessionId = raw['sessionId']?.toString().trim() ?? '';
    if (sessionId.isEmpty) return null;
    final serverIsCurrent = raw['isCurrent'] == true;
    final matchedCurrent =
        currentSessionId != null && currentSessionId == sessionId;
    return AuthSessionItem(
      sessionId: sessionId,
      isCurrent: serverIsCurrent || matchedCurrent,
      state: (raw['state']?.toString().trim().isNotEmpty ?? false)
          ? raw['state'].toString().trim()
          : 'ACTIVE',
      role: raw['role']?.toString(),
      deviceInfo: raw['deviceInfo']?.toString(),
      lastActiveAt: raw['lastActiveAt']?.toString(),
      startedAt: raw['startedAt']?.toString(),
    );
  }
}

String formatSessionTimeVn(String? rawIso) {
  if (rawIso == null || rawIso.trim().isEmpty) return 'Chưa rõ';
  final parsed = DateTime.tryParse(rawIso.trim());
  if (parsed == null) return rawIso.trim();
  final vn = parsed.toUtc().add(const Duration(hours: 7));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(vn.day)}/${two(vn.month)}/${vn.year} ${two(vn.hour)}:${two(vn.minute)}';
}

String formatDeviceLabel(String? deviceInfo) {
  if (deviceInfo == null || deviceInfo.trim().isEmpty) {
    return 'Thiết bị không xác định';
  }
  final raw = deviceInfo.trim();
  final lower = raw.toLowerCase();
  if (lower.contains('android')) {
    return 'Thiết bị Android';
  }
  if (lower.contains('iphone') || lower.contains('ipad') || lower.contains('ios')) {
    return 'Thiết bị iOS';
  }
  if (lower.contains('windows')) {
    return 'Trình duyệt Windows';
  }
  if (lower.contains('macintosh') || lower.contains('mac os')) {
    return 'Trình duyệt macOS';
  }
  if (lower.contains('linux')) {
    return 'Thiết bị Linux';
  }
  if (lower.contains('dart') || lower.contains('flutter')) {
    return 'Ứng dụng Health&Human Mobile';
  }
  return raw.length > 48 ? '${raw.substring(0, 45)}...' : raw;
}
