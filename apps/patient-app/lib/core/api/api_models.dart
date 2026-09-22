import 'package:flutter/foundation.dart';

@immutable
class PageMetadata {
  const PageMetadata({
    required this.page,
    required this.limit,
    required this.total,
  });

  final int page;
  final int limit;
  final int total;

  static PageMetadata? fromData(Object? data) {
    if (data is! Map<String, dynamic>) return null;
    final page = data['page'];
    final limit = data['limit'];
    final total = data['total'];
    if (page is! int || limit is! int || total is! int) return null;
    return PageMetadata(page: page, limit: limit, total: total);
  }
}

@immutable
class ApiResponse {
  const ApiResponse({
    required this.data,
    this.pagination,
    this.requestId,
  });

  final Object? data;
  final PageMetadata? pagination;
  final String? requestId;
}

class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details = const [],
    this.requestId,
  });

  final int? statusCode;
  final String code;
  final String message;
  final List<Object?> details;
  final String? requestId;

  bool get requiresAuthentication => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isRateLimited => statusCode == 429;

  @override
  String toString() => 'ApiException($code): $message';
}
