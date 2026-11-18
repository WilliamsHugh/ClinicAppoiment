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

  test('G11: retains session on network error or temporary 503 during refresh',
      () async {
    int refreshAttempts = 0;
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'accessToken': 'access-token',
                'refreshToken': 'refresh-token',
                'expiresIn': -1, // Expired immediately to trigger refresh
                'user': {'id': 'user-1', 'role': 'PATIENT'},
              },
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/refresh')) {
          refreshAttempts++;
          // Return 503 temporary service unavailable
          return http.Response(
            jsonEncode({
              'success': false,
              'error': {'code': 'GATEWAY_TIMEOUT', 'message': 'Gateway timeout'},
            }),
            503,
          );
        }
        return http.Response('Not found', 404);
      }),
    );

    await provider.signIn('patient@example.com', 'secret12');

    // Refresh throws, but does NOT clear session
    await expectLater(provider.getAccessToken(), throwsA(isA<Exception>()));
    expect(refreshAttempts, 1);

    // Session remains preserved in storage
    final restored = await provider.restoreSession();
    expect(restored, isNotNull);
    expect(restored!.userId, 'user-1');
  });

  test('G11: clears session when refresh explicitly returns 401 AUTH_REFRESH_INVALID',
      () async {
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'accessToken': 'access-token',
                'refreshToken': 'refresh-token',
                'expiresIn': -1,
                'user': {'id': 'user-1', 'role': 'PATIENT'},
              },
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/refresh')) {
          return http.Response(
            jsonEncode({
              'success': false,
              'error': {'code': 'AUTH_REFRESH_INVALID', 'message': 'Refresh token expired'},
            }),
            401,
          );
        }
        return http.Response('Not found', 404);
      }),
    );

    await provider.signIn('patient@example.com', 'secret12');
    await expectLater(provider.getAccessToken(), throwsA(isA<Exception>()));

    // Storage is cleared because 401 is permanent invalidation
    final restored = await provider.restoreSession();
    expect(restored, isNull);
  });

  test('collapses concurrent refresh calls into a single in-flight request',
      () async {
    int refreshCalls = 0;
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
        if (request.url.path.endsWith('/login')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'accessToken': 'access-token',
                'refreshToken': 'refresh-token',
                'expiresIn': -1,
                'user': {'id': 'user-1', 'role': 'PATIENT'},
              },
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/refresh')) {
          refreshCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 50));
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'accessToken': 'refreshed-token',
                'refreshToken': 'new-refresh-token',
                'expiresIn': 3600,
                'user': {'id': 'user-1', 'role': 'PATIENT'},
              },
            }),
            200,
          );
        }
        return http.Response('Not found', 404);
      }),
    );

    await provider.signIn('patient@example.com', 'secret12');

    // Run 3 concurrent getAccessToken calls
    final results = await Future.wait([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);

    expect(results, ['refreshed-token', 'refreshed-token', 'refreshed-token']);
    expect(refreshCalls, 1);
  });

  test('records foreground session activity and throttles calls', () async {
    int activityCalls = 0;
    final provider = GatewaySessionProvider(
      baseUrl: 'http://gateway.test',
      transport: MockClient((request) async {
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
        if (request.url.path.endsWith('/session/activity')) {
          activityCalls++;
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {'sessionId': 'sess-1', 'state': 'ACTIVE'},
            }),
            200,
          );
        }
        return http.Response('Not found', 404);
      }),
    );

    await provider.signIn('patient@example.com', 'secret12');

    await provider.recordActivity();
    expect(activityCalls, 1);

    // Immediate second call is throttled
    await provider.recordActivity();
    expect(activityCalls, 1);

    // Force bypasses throttle
    await provider.recordActivity(force: true);
    expect(activityCalls, 2);
  });
}
