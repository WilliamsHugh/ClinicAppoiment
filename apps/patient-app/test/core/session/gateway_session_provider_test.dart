import 'dart:convert';

import 'package:clinic_patient_app/core/session/gateway_session_provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('signs in through API Gateway and persists the returned session',
      () async {
    late http.Request captured;
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'accessToken': 'access-token',
              'refreshToken': 'refresh-token',
              'expiresIn': 3600,
              'user': {'id': 'user-1', 'role': 'PATIENT'},
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final session = await provider.signIn('patient@example.com', 'secret12');

    expect(captured.url.toString(), 'http://gateway.test/api/v1/auth/login');
    expect(captured.headers, isNot(contains('supabase-url')));
    expect(session.userId, 'user-1');
    expect(await provider.getAccessToken(), 'access-token');
    expect(await provider.restoreSession(), isNotNull);
  });

  test('clears the local session after gateway logout', () async {
    final paths = <String>[];
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        paths.add(request.url.path);
        if (request.url.path.endsWith('/login')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'accessToken': 'access-token',
                'refreshToken': 'refresh-token',
                'expiresIn': 3600,
                'user': {'id': 'user-1', 'role': 'PATIENT'},
              },
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'success': true, 'data': null}), 200);
      }),
    );

    await provider.signIn('patient@example.com', 'secret12');
    await provider.signOut();

    expect(paths, ['/api/v1/auth/login', '/api/v1/auth/logout']);
    expect(await provider.getAccessToken(), isNull);
    expect(await provider.restoreSession(), isNull);
  });
}
