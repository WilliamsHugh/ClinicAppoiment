import 'package:clinic_patient_app/core/session/session.dart';
import 'package:flutter_test/flutter_test.dart';

class _ThrowingProvider implements SessionProvider {
  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<AuthSession?> restoreSession() => throw StateError('broken storage');
}

void main() {
  test('session restore failure falls back to unauthenticated', () async {
    final controller = SessionController(_ThrowingProvider());

    await controller.initialize();

    expect(controller.status, SessionStatus.unauthenticated);
    expect(controller.session, isNull);
  });
}
