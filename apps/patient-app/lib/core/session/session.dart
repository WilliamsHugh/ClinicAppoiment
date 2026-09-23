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

  @override
  Future<String?> getAccessToken() => _provider.getAccessToken();
}
