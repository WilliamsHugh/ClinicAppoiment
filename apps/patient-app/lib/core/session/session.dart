import 'package:flutter/foundation.dart';

enum SessionStatus { loading, authenticated, unauthenticated }

enum UserRole { patient, doctor, staff, admin }

@immutable
class AuthSession implements TokenProvider {
  const AuthSession({
    required this.userId,
    required this.role,
    required this.accessToken,
  });

  final String userId;
  final UserRole role;
  final String accessToken;

  @override
  Future<String?> getAccessToken() async => accessToken;
}

abstract interface class TokenProvider {
  Future<String?> getAccessToken();
}

abstract interface class SessionProvider implements TokenProvider {
  Future<AuthSession?> restoreSession();
}

abstract interface class CredentialSessionProvider {
  Future<AuthSession> signIn(String email, String password);
  Future<AuthSession?> signUp(String fullName, String email, String password);
  Future<void> signOut();
}

class SessionException implements Exception {
  const SessionException(this.message);

  final String message;

  @override
  String toString() => message;
}

class UnauthenticatedSessionProvider implements SessionProvider {
  const UnauthenticatedSessionProvider();

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<AuthSession?> restoreSession() async => null;
}

class SessionController extends ChangeNotifier implements TokenProvider {
  SessionController(this._provider);

  final SessionProvider _provider;
  SessionStatus _status = SessionStatus.loading;
  AuthSession? _session;

  SessionStatus get status => _status;
  AuthSession? get session => _session;

  Future<void> initialize() async {
    try {
      _session = await _provider.restoreSession();
      _status = _session == null
          ? SessionStatus.unauthenticated
          : SessionStatus.authenticated;
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final provider = _credentialProvider();
    try {
      _session = await provider.signIn(email, password);
      _status = SessionStatus.authenticated;
      notifyListeners();
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      rethrow;
    }
  }

  Future<bool> signUp(String fullName, String email, String password) async {
    final provider = _credentialProvider();
    try {
      _session = await provider.signUp(fullName, email, password);
      _status = _session == null
          ? SessionStatus.unauthenticated
          : SessionStatus.authenticated;
      if (_session != null) notifyListeners();
      return _session != null;
    } catch (_) {
      _session = null;
      _status = SessionStatus.unauthenticated;
      rethrow;
    }
  }

  Future<void> signOut() async {
    final provider = _credentialProvider();
    try {
      await provider.signOut();
    } finally {
      _session = null;
      _status = SessionStatus.unauthenticated;
      notifyListeners();
    }
  }

  CredentialSessionProvider _credentialProvider() {
    final provider = _provider;
    if (provider is! CredentialSessionProvider) {
      throw const SessionException(
        'Đăng nhập qua API Gateway chưa được cấu hình.',
      );
    }
    return provider as CredentialSessionProvider;
  }

  @override
  Future<String?> getAccessToken() => _provider.getAccessToken();
}
