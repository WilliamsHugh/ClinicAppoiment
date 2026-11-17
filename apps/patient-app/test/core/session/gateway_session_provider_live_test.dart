import 'dart:convert';
import 'dart:io';
import 'package:clinic_patient_app/core/session/gateway_session_provider.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;

  const gatewayUrl = 'http://127.0.0.1:8080';
  const patientEmail = 'patient.live.e2e@clinic.test';
  const patientPassword = 'Password123!';

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('M2-INTEGRATION-006: Patient Live Auth & Session via Gateway (port 8080)', () {
    test('E2E-AUTH-PATIENT: Live login -> activity -> restore -> logout lifecycle', () async {
      final realClient = http.Client();
      final provider = GatewaySessionProvider(
        baseUrl: gatewayUrl,
        transport: realClient,
      );

      // 1. Live login via Gateway
      final session = await provider.signIn(patientEmail, patientPassword);

      expect(session.userId, isNotEmpty);
      expect(session.role, UserRole.patient);
      expect(session.accessToken, isNotEmpty);

      final token = await provider.getAccessToken();
      expect(token, equals(session.accessToken));

      // 2. Verify token works against Gateway protected route
      final meRes = await realClient.get(
        Uri.parse('$gatewayUrl/api/v1/users/me'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      );
      expect(meRes.statusCode, 200);
      final meData = jsonDecode(meRes.body) as Map<String, dynamic>;
      expect(meData['success'], isTrue);
      expect(meData['data']['email'], patientEmail);

      // 3. Record foreground session activity
      await expectLater(provider.recordActivity(force: true), completes);

      // 4. Restore session from secure storage in a new provider instance
      final newProvider = GatewaySessionProvider(
        baseUrl: gatewayUrl,
        transport: realClient,
      );
      final restoredSession = await newProvider.restoreSession();
      expect(restoredSession, isNotNull);
      expect(restoredSession!.userId, equals(session.userId));
      expect(restoredSession.role, UserRole.patient);

      // 5. G11: Network error retention during restore/refresh
      // If network fails (e.g., transport throws ClientException), session remains in storage
      final failingTransport = GatewaySessionProvider(
        baseUrl: 'http://127.0.0.1:59999', // Non-existent port
      );
      // restoreSession on failing connection should preserve session without clearing
      final preserved = await failingTransport.restoreSession();
      expect(preserved, isNotNull);

      // 6. Live clean logout via Gateway
      await provider.signOut();
      expect(await provider.getAccessToken(), isNull);
      expect(await provider.restoreSession(), isNull);

      // 7. Verify session is revoked on Gateway/User Service
      final afterLogoutRes = await realClient.get(
        Uri.parse('$gatewayUrl/api/v1/users/me'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      );
      // Should be 401 because session was revoked
      expect(afterLogoutRes.statusCode, 401);

      realClient.close();
    });
  });
}
