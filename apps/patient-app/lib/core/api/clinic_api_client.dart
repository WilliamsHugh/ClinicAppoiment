import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../session/session.dart';
import 'api_models.dart';

const defaultApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

class RequestCancellation {
  final Completer<void> _completer = Completer<void>();

  Future<void> get whenCancelled => _completer.future;
  bool get isCancelled => _completer.isCompleted;

  void cancel() {
    if (!_completer.isCompleted) _completer.complete();
  }
}

class ClinicApiClient {
  ClinicApiClient({
    required TokenProvider tokenProvider,
    http.Client? transport,
    String baseUrl = defaultApiBaseUrl,
    this.timeout = const Duration(seconds: 15),
  })  : _tokenProvider = tokenProvider,
        _transport = transport ?? http.Client(),
        _baseUri = Uri.parse(baseUrl);

  final TokenProvider _tokenProvider;
  final http.Client _transport;
  final Uri _baseUri;
  final Duration timeout;
  final Random _random = Random.secure();

  Future<ApiResponse> get(
    String path, {
    Map<String, Object?> query = const {},
    RequestCancellation? cancellation,
  }) {
    return _send(
      'GET',
      path,
      query: query,
      cancellation: cancellation,
    );
  }

  Future<ApiResponse> post(
    String path, {
    required Map<String, Object?> body,
    String? idempotencyKey,
    RequestCancellation? cancellation,
  }) {
    return _send(
      'POST',
      path,
      body: body,
      idempotencyKey: idempotencyKey,
      cancellation: cancellation,
    );
  }

  Future<ApiResponse> patch(
    String path, {
    required Map<String, Object?> body,
    String? idempotencyKey,
    RequestCancellation? cancellation,
  }) {
    return _send(
      'PATCH',
      path,
      body: body,
      idempotencyKey: idempotencyKey,
      cancellation: cancellation,
    );
  }

  Future<ApiResponse> _send(
    String method,
    String path, {
    Map<String, Object?> query = const {},
    Map<String, Object?>? body,
    String? idempotencyKey,
    RequestCancellation? cancellation,
  }) async {
    final token = await _tokenProvider.getAccessToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        code: 'SESSION_REQUIRED',
        message: 'Bạn cần đăng nhập để tiếp tục.',
      );
    }

    final uri = _buildUri(path, query);
    final abort = Completer<void>();
    var timedOut = false;
    var cancelled = false;
    final timer = Timer(timeout, () {
      timedOut = true;
      if (!abort.isCompleted) abort.complete();
    });
    cancellation?.whenCancelled.then((_) {
      cancelled = true;
      if (!abort.isCompleted) abort.complete();
    });

    final request = http.AbortableRequest(
      method,
      uri,
      abortTrigger: abort.future,
    )..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        'X-Request-Id': _newRequestId(),
        if (body != null) 'Content-Type': 'application/json',
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      });
    if (body != null) request.body = jsonEncode(body);

    try {
      final streamed = await _transport.send(request).timeout(timeout);
      final response =
          await http.Response.fromStream(streamed).timeout(timeout);
      return _decode(response);
    } on TimeoutException {
      throw const ApiException(
        code: 'REQUEST_TIMEOUT',
        message: 'Yêu cầu đã quá thời gian chờ.',
      );
    } on http.RequestAbortedException {
      if (cancelled && !timedOut) {
        throw const ApiException(
          code: 'REQUEST_CANCELLED',
          message: 'Yêu cầu đã bị hủy.',
        );
      }
      throw const ApiException(
        code: 'REQUEST_TIMEOUT',
        message: 'Yêu cầu đã quá thời gian chờ.',
      );
    } on http.ClientException {
      throw const ApiException(
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối tới máy chủ.',
      );
    } finally {
      timer.cancel();
    }
  }

  Uri _buildUri(String path, Map<String, Object?> query) {
    if (!path.startsWith('/')) {
      throw ArgumentError.value(path, 'path', 'Path must start with /.');
    }
    final queryParameters = <String, String>{};
    for (final entry in query.entries) {
      final value = entry.value;
      if (value != null) queryParameters[entry.key] = value.toString();
    }
    return _baseUri.replace(
      path: path,
      queryParameters: queryParameters.isEmpty ? null : queryParameters,
    );
  }

  ApiResponse _decode(http.Response response) {
    final requestId = response.headers['x-request-id'];
    if (response.statusCode == 204) {
      return ApiResponse(data: null, requestId: requestId);
    }

    Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_RESPONSE',
        message: 'Máy chủ trả về dữ liệu không hợp lệ.',
        requestId: requestId,
      );
    }
    if (decoded is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_RESPONSE',
        message: 'Máy chủ trả về dữ liệu không hợp lệ.',
        requestId: requestId,
      );
    }

    final rawEnvelopeRequestId = decoded['requestId'];
    final envelopeRequestId =
        rawEnvelopeRequestId is String ? rawEnvelopeRequestId : requestId;
    if (response.statusCode >= 400 || decoded['success'] != true) {
      final error = decoded['error'];
      final errorMap = error is Map<String, dynamic> ? error : null;
      final rawDetails = errorMap?['details'];
      final rawCode = errorMap?['code'];
      final rawMessage = errorMap?['message'];
      throw ApiException(
        statusCode: response.statusCode,
        code: rawCode is String ? rawCode : 'REQUEST_FAILED',
        message:
            rawMessage is String ? rawMessage : 'Yêu cầu không thành công.',
        details: rawDetails is List ? List<Object?>.from(rawDetails) : const [],
        requestId: envelopeRequestId,
      );
    }

    final data = decoded['data'];
    return ApiResponse(
      data: data,
      pagination: PageMetadata.fromData(data),
      requestId: envelopeRequestId,
    );
  }

  String _newRequestId() {
    final time = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final entropy = _random.nextInt(1 << 32).toRadixString(36);
    return 'mobile-$time-$entropy';
  }
}
