import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../api/clinic_api_client.dart';
import 'session.dart';

class GatewaySessionProvider
    implements SessionProvider, CredentialSessionProvider {
  GatewaySessionProvider({
    http.Client? transport,
    FlutterSecureStorage? storage,
    String baseUrl = defaultApiBaseUrl,
  })  : _transport = transport ?? http.Client(),
        _storage = storage ?? const FlutterSecureStorage(),
        _baseUri = Uri.parse(baseUrl);

  static const _sessionStorageKey = 'health_and_human_session';

  final http.Client _transport;
  final FlutterSecureStorage _storage;
  final Uri _baseUri;
  AuthSession? _session;
  String? _refreshToken;
  DateTime? _expiresAt;

  @override
  Future<String?> getAccessToken() async {
    final session = _session;
    if (session == null) return null;
    final expiresAt = _expiresAt;
    if (expiresAt != null &&
        DateTime.now()
            .isAfter(expiresAt.subtract(const Duration(seconds: 30)))) {
      return (await _refreshSession()).accessToken;
    }
    return session.accessToken;
  }

  @override
  Future<AuthSession?> restoreSession() async {
    final encoded = await _storage.read(key: _sessionStorageKey);
    if (encoded == null) return null;
    try {
      final stored = jsonDecode(encoded) as Map<String, dynamic>;
      _session = _sessionFromJson(stored);
      _refreshToken = stored['refreshToken'] as String;
      _expiresAt = DateTime.parse(stored['expiresAt'] as String).toUtc();
      return await _refreshSessionIfNeeded();
    } catch (_) {
      await _clearSession();
      return null;
    }
  }

  @override
  Future<AuthSession> signIn(String email, String password) async {
    final data = await _post('/api/v1/auth/login', {
      'email': email,
      'password': password,
    });
    return _saveSession(data);
  }

  @override
  Future<AuthSession?> signUp(
    String fullName,
    String email,
    String password,
  ) async {
    final data = await _post('/api/v1/auth/register', {
      'fullName': fullName,
      'email': email,
      'password': password,
    });
    if (data['requiresEmailConfirmation'] == true) return null;
    return _saveSession(data);
  }

  @override
  Future<void> signOut() async {
    final accessToken = _session?.accessToken;
    final refreshToken = _refreshToken;
    try {
      if (accessToken != null && refreshToken != null) {
        await _post(
          '/api/v1/auth/logout',
          {'refreshToken': refreshToken},
          accessToken: accessToken,
          allowNullData: true,
        );
      }
    } finally {
      await _clearSession();
    }
  }

  Future<AuthSession?> _refreshSessionIfNeeded() async {
    final expiresAt = _expiresAt;
    if (expiresAt == null ||
        DateTime.now()
            .isBefore(expiresAt.subtract(const Duration(seconds: 30)))) {
      return _session;
    }
    return _refreshSession();
  }

  Future<AuthSession> _refreshSession() async {
    final refreshToken = _refreshToken;
    if (refreshToken == null) {
      throw const SessionException('Phiên đăng nhập không hợp lệ.');
    }
    try {
      final data = await _post('/api/v1/auth/refresh', {
        'refreshToken': refreshToken,
      });
      return await _saveSession(data);
    } catch (_) {
      await _clearSession();
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body, {
    String? accessToken,
    bool allowNullData = false,
  }) async {
    final uri = _baseUri.resolve(path);
    late http.Response response;
    try {
      response = await _transport
          .post(
            uri,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              if (accessToken != null) 'Authorization': 'Bearer $accessToken',
            },
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      throw const SessionException(
        'Không thể kết nối đến hệ thống. Vui lòng thử lại.',
      );
    }

    Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const SessionException('Phản hồi từ hệ thống không hợp lệ.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const SessionException('Phản hồi từ hệ thống không hợp lệ.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded['error'];
      final message =
          error is Map<String, dynamic> ? error['message']?.toString() : null;
      throw SessionException(message ?? 'Yêu cầu xác thực thất bại.');
    }
    final data = decoded['data'];
    if (allowNullData && data == null) return {};
    if (data is! Map<String, dynamic>) {
      throw const SessionException('Phản hồi xác thực không hợp lệ.');
    }
    return data;
  }

  Future<AuthSession> _saveSession(Map<String, dynamic> data) async {
    final user = data['user'];
    final accessToken = data['accessToken'];
    final refreshToken = data['refreshToken'];
    final expiresIn = data['expiresIn'];
    if (user is! Map<String, dynamic> ||
        accessToken is! String ||
        refreshToken is! String ||
        expiresIn is! num) {
      throw const SessionException('Phản hồi xác thực không hợp lệ.');
    }
    final role = _parseRole(user['role']?.toString());
    final userId = user['id']?.toString();
    if (role == null || userId == null || userId.isEmpty) {
      throw const SessionException('Thông tin người dùng không hợp lệ.');
    }
    final session = AuthSession(
      userId: userId,
      role: role,
      accessToken: accessToken,
    );
    _session = session;
    _refreshToken = refreshToken;
    _expiresAt = DateTime.now().toUtc().add(
          Duration(seconds: expiresIn.toInt()),
        );
    await _persistSession();
    return session;
  }

  AuthSession _sessionFromJson(Map<String, dynamic> data) {
    final role = _parseRole(data['role']?.toString());
    final userId = data['userId']?.toString();
    final accessToken = data['accessToken']?.toString();
    if (role == null || userId == null || accessToken == null) {
      throw const FormatException('Invalid stored session');
    }
    return AuthSession(
      userId: userId,
      role: role,
      accessToken: accessToken,
    );
  }

  Future<void> _persistSession() async {
    final session = _session;
    final refreshToken = _refreshToken;
    final expiresAt = _expiresAt;
    if (session == null || refreshToken == null || expiresAt == null) return;
    await _storage.write(
      key: _sessionStorageKey,
      value: jsonEncode({
        'userId': session.userId,
        'role': session.role.name.toUpperCase(),
        'accessToken': session.accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt.toIso8601String(),
      }),
    );
  }

  Future<void> _clearSession() async {
    _session = null;
    _refreshToken = null;
    _expiresAt = null;
    await _storage.delete(key: _sessionStorageKey);
  }

  static UserRole? _parseRole(String? role) => switch (role) {
        'PATIENT' => UserRole.patient,
        'DOCTOR' => UserRole.doctor,
        'STAFF' => UserRole.staff,
        'ADMIN' => UserRole.admin,
        _ => null,
      };
}
