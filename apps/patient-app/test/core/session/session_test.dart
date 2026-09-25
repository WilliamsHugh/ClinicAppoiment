import 'package:clinic_patient_app/core/session/session.dart';
import 'package:flutter_test/flutter_test.dart';

class _ThrowingProvider implements SessionProvider {
  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<AuthSession?> restoreSession() => throw StateError('broken storage');
}

class _FailingCredentialProvider
    implements SessionProvider, CredentialSessionProvider {
  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<AuthSession?> restoreSession() async => null;

  @override
  Future<AuthSession> signIn(String email, String password) {
    throw const SessionException('Email hoặc mật khẩu không đúng');
  }

  @override
  Future<AuthSession?> signUp(String fullName, String email, String password) {
    throw const SessionException('Địa chỉ email không hợp lệ');
  }

  @override
  Future<void> signOut() async {}
}

void main() {
  test('session restore failure falls back to unauthenticated', () async {
    final controller = SessionController(_ThrowingProvider());

    await controller.initialize();

    expect(controller.status, SessionStatus.unauthenticated);
    expect(controller.session, isNull);
  });

  test('failed sign in keeps the unauthenticated screen active', () async {
    final controller = SessionController(_FailingCredentialProvider());
    await controller.initialize();

    await expectLater(
      controller.signIn('patient@example.com', 'wrong-password'),
      throwsA(isA<SessionException>()),
    );

    expect(controller.status, SessionStatus.unauthenticated);
    expect(controller.session, isNull);
  });
}
