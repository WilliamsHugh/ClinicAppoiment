import 'dart:convert';

import 'package:clinic_patient_app/core/api/api_models.dart';
import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _TokenProvider implements TokenProvider {
  const _TokenProvider(this.token);

  final String? token;

  @override
  Future<String?> getAccessToken() async => token;
}

void main() {
  test('requires a token before sending a request', () async {
    var called = false;
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider(null),
      transport: MockClient((_) async {
        called = true;
        return http.Response('{}', 200);
      }),
    );

    await expectLater(
      client.get('/api/v1/users/me'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.code, 'code', 'SESSION_REQUIRED'),
      ),
    );
    expect(called, isFalse);
  });

  test('sends bearer token, query and a non-personal request id', () async {
    late http.Request captured;
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      transport: MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {'items': [], 'page': 2, 'limit': 10, 'total': 21},
          }),
          200,
          headers: {'x-request-id': 'gateway-request'},
        );
      }),
    );

    final response = await client.get(
      '/api/v1/appointments',
      query: {'page': 2, 'limit': 10, 'status': null},
    );

    expect(captured.headers['Authorization'], 'Bearer access-token');
    expect(captured.headers, isNot(contains('X-User-Id')));
    expect(captured.headers, isNot(contains('X-Role')));
    expect(captured.headers['X-Request-Id'], startsWith('mobile-'));
    expect(captured.url.queryParameters, {'page': '2', 'limit': '10'});
    expect(response.requestId, 'gateway-request');
    expect(response.pagination?.page, 2);
    expect(response.pagination?.total, 21);
  });

  test('POST carries JSON and idempotency key', () async {
    late http.Request captured;
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      transport: MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {'id': 'appointment-1'}
          }),
          201,
        );
      }),
    );

    await client.post(
      '/api/v1/appointments',
      body: {'doctorId': 'doctor-1'},
      idempotencyKey: 'unique-key-123456',
    );

    expect(captured.method, 'POST');
    expect(captured.headers['Idempotency-Key'], 'unique-key-123456');
    expect(jsonDecode(captured.body), {'doctorId': 'doctor-1'});
  });

  test('PATCH sends the requested partial update', () async {
    late http.Request captured;
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      transport: MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {'fullName': 'New name'}
          }),
          200,
        );
      }),
    );

    await client.patch(
      '/api/v1/users/me',
      body: {'fullName': 'New name'},
    );

    expect(captured.method, 'PATCH');
    expect(jsonDecode(captured.body), {'fullName': 'New name'});
  });

  for (final status in [401, 403, 429, 502]) {
    test('preserves structured error data for HTTP $status', () async {
      final client = ClinicApiClient(
        tokenProvider: const _TokenProvider('access-token'),
        transport: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'success': false,
              'error': {
                'code': 'ERROR_$status',
                'message': 'Failed',
                'details': [
                  {'field': 'value'}
                ],
              },
              'requestId': 'request-$status',
            }),
            status,
          ),
        ),
      );

      await expectLater(
        client.get('/api/v1/appointments'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.statusCode, 'statusCode', status)
              .having((error) => error.code, 'code', 'ERROR_$status')
              .having(
                (error) => error.requestId,
                'requestId',
                'request-$status',
              )
              .having((error) => error.details, 'details', hasLength(1)),
        ),
      );
    });
  }

  test('reports malformed JSON without exposing parser details', () async {
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      transport: MockClient(
        (_) async => http.Response('not-json', 502),
      ),
    );

    await expectLater(
      client.get('/api/v1/appointments'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 502)
            .having((error) => error.code, 'code', 'INVALID_RESPONSE'),
      ),
    );
  });

  test('normalizes transport failures', () async {
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      transport: MockClient(
        (request) async =>
            throw http.ClientException('socket failed', request.url),
      ),
    );

    await expectLater(
      client.get('/api/v1/appointments'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.code,
          'code',
          'NETWORK_ERROR',
        ),
      ),
    );
  });

  test('reports request timeout', () async {
    final client = ClinicApiClient(
      tokenProvider: const _TokenProvider('access-token'),
      timeout: const Duration(milliseconds: 10),
      transport: MockClient((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        return http.Response('{}', 200);
      }),
    );

    await expectLater(
      client.get('/api/v1/appointments'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.code,
          'code',
          'REQUEST_TIMEOUT',
        ),
      ),
    );
  });
}
