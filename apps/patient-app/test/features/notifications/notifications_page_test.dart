import 'dart:async';
import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/notifications/notifications.dart';
import 'package:clinic_patient_app/features/notifications/widgets/reminder_banner.dart';
import 'package:clinic_patient_app/shared/widgets/async_states.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_page_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _session = AuthSession(
  userId: 'patient-user',
  role: UserRole.patient,
  accessToken: 'test-token',
);

http.Response _jsonResponse(Object body, {int statusCode = 200}) {
  return http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    statusCode,
    headers: const {'content-type': 'application/json; charset=utf-8'},
  );
}

class _AbortTrackingClient extends http.BaseClient {
  bool aborted = false;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final abortable = request as http.AbortableRequest;
    await abortable.abortTrigger;
    aborted = true;
    throw http.RequestAbortedException(request.url);
  }
}

void main() {
  testWidgets('notification opens the linked medical record section',
      (tester) async {
    String? openedRoute;
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.method == 'PATCH') {
          return http.Response(jsonEncode({'success': true, 'data': {}}), 200);
        }
        return http.Response.bytes(
          utf8.encode(jsonEncode({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'notification-1',
                  'status': 'UNREAD',
                  'title': 'Kết quả đã cập nhật',
                  'message': 'Xem lịch sử khám',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {
                    'recordId': 'record-1',
                    'appointmentId': 'appointment-1',
                  },
                }
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          })),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (route) => openedRoute = route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kết quả đã cập nhật'));
    await tester.pumpAndSettle();
    expect(openedRoute, '/records');
  });

  testWidgets(
      'notifications page bulk mark-all-read calls read-all endpoint and respects server cutoff',
      (tester) async {
    bool readAllCalled = false;
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.method == 'PATCH' &&
            request.url.path.endsWith('/read-all')) {
          readAllCalled = true;
          expect(request.body, '{}');
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'updatedCount': 1,
                'unreadCount': 1,
                'readBefore': '2026-01-01T08:05:00Z',
                'readAt': '2026-01-01T08:06:00Z',
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response.bytes(
          utf8.encode(jsonEncode({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'notif-old',
                  'status': 'UNREAD',
                  'title': 'Thông báo cũ',
                  'message': 'Trước cutoff',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'notif-new',
                  'status': 'UNREAD',
                  'title': 'Thông báo mới',
                  'message': 'Sau cutoff',
                  'createdAt': '2026-01-01T08:10:00Z',
                  'payload': {},
                }
              ],
              'page': 1,
              'limit': 20,
              'total': 2,
            },
          })),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Đọc tất cả'), findsOneWidget);
    await tester.tap(find.text('Đọc tất cả'));
    await tester.pumpAndSettle();

    expect(readAllCalled, isTrue);
  });

  testWidgets('notifications page supports loading more notifications',
      (tester) async {
    int requestedPage = 1;
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        final pageParam = request.url.queryParameters['page'] ?? '1';
        requestedPage = int.parse(pageParam);
        if (requestedPage == 1) {
          return http.Response.bytes(
            utf8.encode(jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'notif-p1',
                    'status': 'READ',
                    'title': 'Thông báo trang 1',
                    'message': 'Nội dung trang 1',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'payload': {},
                  }
                ],
                'page': 1,
                'limit': 1,
                'total': 2,
              },
            })),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        } else {
          return http.Response.bytes(
            utf8.encode(jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'notif-p2',
                    'status': 'READ',
                    'title': 'Thông báo trang 2',
                    'message': 'Nội dung trang 2',
                    'createdAt': '2026-01-01T07:00:00Z',
                    'payload': {},
                  }
                ],
                'page': 2,
                'limit': 1,
                'total': 2,
              },
            })),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Thông báo trang 1'), findsOneWidget);
    expect(find.text('Tải thêm thông báo'), findsOneWidget);

    await tester.tap(find.text('Tải thêm thông báo'));
    await tester.pumpAndSettle();

    expect(find.text('Thông báo trang 2'), findsOneWidget);
    expect(requestedPage, 2);
  });

  group('Header #2D5BFF & RefreshIndicator across all states', () {
    testWidgets('shows ClinicPageHeader and RefreshIndicator while loading',
        (tester) async {
      final listCompleter = Completer<http.Response>();
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 0}});
          }
          return listCompleter.future;
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(ClinicPageHeader), findsOneWidget);
      expect(find.text('Thông báo'), findsOneWidget);
      expect(find.byType(RefreshIndicator), findsOneWidget);
      expect(find.byType(AppLoadingState), findsOneWidget);
      expect(find.byType(AppBar), findsNothing);

      final scrollView = tester.widget<SingleChildScrollView>(
        find.byType(SingleChildScrollView),
      );
      expect(scrollView.physics, isA<AlwaysScrollableScrollPhysics>());

      listCompleter.complete(_jsonResponse({
        'success': true,
        'data': {'items': <Object>[], 'page': 1, 'limit': 20, 'total': 0},
      }));
      await tester.pumpAndSettle();
    });

    testWidgets(
        'shows header, requestId, RefreshIndicator on error and recovers on retry',
        (tester) async {
      var failFirst = true;
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 1}});
          }
          if (failFirst) {
            return _jsonResponse(
              {
                'success': false,
                'requestId': 'req-err-401',
                'error': {
                  'code': 'SERVICE_UNAVAILABLE',
                  'message': 'Dịch vụ thông báo tạm gián đoạn',
                },
              },
              statusCode: 500,
            );
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'notif-ok',
                  'type': 'appointment.confirmed',
                  'status': 'UNREAD',
                  'title': 'Lịch hẹn đã được xác nhận',
                  'message': 'Vui lòng đến đúng giờ.',
                  'createdAt': '2026-01-01T01:30:00Z',
                  'payload': {'appointmentId': 'appt-1'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ClinicPageHeader), findsOneWidget);
      expect(find.byType(RefreshIndicator), findsOneWidget);
      expect(find.byType(AppErrorState), findsOneWidget);
      expect(find.text('Dịch vụ thông báo tạm gián đoạn'), findsOneWidget);
      expect(find.text('Mã yêu cầu: req-err-401'), findsOneWidget);

      failFirst = false;
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();

      expect(find.byType(AppErrorState), findsNothing);
      expect(find.text('Lịch hẹn đã được xác nhận'), findsOneWidget);
    });

    testWidgets('empty state keeps header, hides mark-all, supports pull refresh',
        (tester) async {
      var listCalls = 0;
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': listCalls <= 1 ? 0 : 1},
            });
          }
          listCalls += 1;
          if (listCalls == 1) {
            return _jsonResponse({
              'success': true,
              'data': {'items': <Object>[], 'page': 1, 'limit': 20, 'total': 0},
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'notif-refreshed',
                  'type': 'appointment.created',
                  'status': 'UNREAD',
                  'title': 'Thông báo sau khi kéo làm mới',
                  'message': 'Đã đồng bộ dữ liệu.',
                  'createdAt': '2026-01-01T02:00:00Z',
                  'payload': {'appointmentId': 'appt-9'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ClinicPageHeader), findsOneWidget);
      expect(find.byType(AppEmptyState), findsOneWidget);
      expect(find.text('Đọc tất cả'), findsNothing);

      await tester.fling(
        find.byType(SingleChildScrollView),
        const Offset(0, 320),
        1000,
      );
      await tester.pumpAndSettle();

      expect(listCalls, greaterThanOrEqualTo(2));
      expect(find.text('Thông báo sau khi kéo làm mới'), findsOneWidget);
    });
  });

  group('Mark-all-read styling, double-tap guard & readBefore cutoff', () {
    testWidgets(
        'renders white text under buildPatientTheme, prevents double-tap, and respects readBefore',
        (tester) async {
      final readAllCompleter = Completer<http.Response>();
      var readAllCalls = 0;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/read-all') {
            readAllCalls += 1;
            return readAllCompleter.future;
          }
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 2}});
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'notif-old',
                  'type': 'appointment.created',
                  'status': 'UNREAD',
                  'title': 'Thông báo trước cutoff',
                  'message': 'Cũ hơn readBefore',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'notif-new',
                  'type': 'appointment.confirmed',
                  'status': 'UNREAD',
                  'title': 'Thông báo sau cutoff',
                  'message': 'Mới hơn readBefore',
                  'createdAt': '2026-01-01T08:10:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 2,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      final markAllFinder = find.widgetWithText(TextButton, 'Đọc tất cả');
      expect(markAllFinder, findsOneWidget);
      final button = tester.widget<TextButton>(markAllFinder);
      expect(button.style?.foregroundColor?.resolve({}), Colors.white);
      expect(find.text('Đã đọc'), findsNWidgets(2));

      await tester.tap(markAllFinder);
      await tester.pump();
      await tester.tap(markAllFinder, warnIfMissed: false);
      await tester.pump();
      expect(readAllCalls, 1);

      readAllCompleter.complete(_jsonResponse({
        'success': true,
        'data': {
          'updatedCount': 1,
          'unreadCount': 1,
          'readBefore': '2026-01-01T08:05:00Z',
          'readAt': '2026-01-01T08:06:00Z',
        },
      }));
      await tester.pumpAndSettle();

      expect(find.text('Đã đọc'), findsOneWidget);
      expect(find.text('Bạn có 1 thông báo chưa đọc'), findsOneWidget);
    });
  });

  group('/unread-count & safe fallback', () {
    testWidgets('uses server unreadCount in subtitle even when > page items',
        (tester) async {
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 5}});
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n1',
                  'type': 'appointment.created',
                  'status': 'UNREAD',
                  'title': 'Thông báo 1',
                  'message': 'Chi tiết 1',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Bạn có 5 thông báo chưa đọc'), findsOneWidget);
    });

    testWidgets(
        'falls back to local unread count when /unread-count errors or omits key',
        (tester) async {
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse(
              {
                'success': false,
                'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'DB down'},
              },
              statusCode: 500,
            );
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc 1',
                  'message': 'Nội dung',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n2',
                  'status': 'READ',
                  'title': 'Đã đọc 2',
                  'message': 'Nội dung',
                  'createdAt': '2026-01-01T07:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 2,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AppErrorState), findsNothing);
      expect(find.text('Bạn có 1 thông báo chưa đọc'), findsOneWidget);
    });
  });

  group('Filter bar (Tất cả / Chưa đọc), filtered empty CTA & race condition',
      () {
    testWidgets(
        'switches filter with ?status=UNREAD, shows filtered empty CTA, and prevents race condition',
        (tester) async {
      final seenStatusParams = <String?>[];
      final slowUnreadCompleter = Completer<http.Response>();
      var unreadCallCount = 0;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 0}});
          }
          final status = request.url.queryParameters['status'];
          seenStatusParams.add(status);
          if (status == 'UNREAD') {
            unreadCallCount += 1;
            if (unreadCallCount == 1) {
              return _jsonResponse({
                'success': true,
                'data': {'items': <Object>[], 'page': 1, 'limit': 20, 'total': 0},
              });
            }
            return slowUnreadCompleter.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'all-1',
                  'status': 'READ',
                  'type': 'appointment.confirmed',
                  'title': 'Thông báo thuộc tab Tất cả',
                  'message': 'Nội dung tất cả',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(seenStatusParams, [null]);
      expect(find.text('Thông báo thuộc tab Tất cả'), findsOneWidget);

      await tester.tap(find.text('Chưa đọc'));
      await tester.pumpAndSettle();

      expect(seenStatusParams, [null, 'UNREAD']);
      expect(find.text('Không có thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Xem tất cả thông báo'), findsOneWidget);

      await tester.tap(find.text('Xem tất cả thông báo'));
      await tester.pumpAndSettle();
      expect(find.text('Thông báo thuộc tab Tất cả'), findsOneWidget);

      // Race condition: slow 'Chưa đọc' followed immediately by fast 'Tất cả'
      await tester.tap(find.text('Chưa đọc'));
      await tester.pump();
      await tester.tap(find.text('Tất cả'));
      await tester.pumpAndSettle();

      slowUnreadCompleter.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'stale-unread',
              'status': 'UNREAD',
              'title': 'Dữ liệu cũ bị ghi đè',
              'message': 'Không được phép xuất hiện',
              'createdAt': '2026-01-01T09:00:00Z',
              'payload': {},
            },
          ],
          'page': 1,
          'limit': 20,
          'total': 1,
        },
      }));
      await tester.pumpAndSettle();

      expect(find.text('Dữ liệu cũ bị ghi đè'), findsNothing);
      expect(find.text('Thông báo thuộc tab Tất cả'), findsOneWidget);
    });
  });

  group('ReminderBanner accuracy', () {
    testWidgets('states 24h in-app reminder and never mentions 1h or push',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: const Scaffold(
            body: Padding(
              padding: EdgeInsets.all(16),
              child: ReminderBanner(),
            ),
          ),
        ),
      );

      expect(find.textContaining('24 giờ'), findsOneWidget);
      expect(find.textContaining('trong ứng dụng'), findsOneWidget);
      expect(find.textContaining('1h'), findsNothing);
      expect(find.textContaining('push notification'), findsNothing);
    });
  });

  group('NotificationTile types, UTC+7, mark-read, navigation & error handling',
      () {
    testWidgets(
        'renders all backend event types, UTC+7 time, appointment route, mark-read, detail modal, and PATCH error',
        (tester) async {
      String? openedRoute;
      var patchCalls = 0;
      var failPatch = false;
      var unreadCallbackCount = 0;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 2}});
          }
          if (request.method == 'PATCH') {
            patchCalls += 1;
            if (failPatch) {
              return _jsonResponse(
                {
                  'success': false,
                  'error': {
                    'code': 'SERVICE_UNAVAILABLE',
                    'message': 'Không thể cập nhật trạng thái đọc',
                  },
                },
                statusCode: 500,
              );
            }
            return _jsonResponse({
              'success': true,
              'data': {
                'id': request.url.pathSegments[3],
                'status': 'READ',
                'readAt': '2026-01-01T02:00:00Z',
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n-reminder',
                  'type': 'appointment.reminder',
                  'status': 'UNREAD',
                  'title': 'Nhắc lịch khám',
                  'message': 'Bạn có lịch khám sắp tới.',
                  'createdAt': '2026-01-01T01:30:00Z',
                  'payload': {'appointmentId': 'appt-1'},
                },
                {
                  'id': 'n-record',
                  'type': 'medical-record.created',
                  'status': 'UNREAD',
                  'title': 'Có hồ sơ khám mới',
                  'message': 'Xem tóm tắt khám bệnh.',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {'recordId': 'rec-1'},
                },
                {
                  'id': 'n-cancelled',
                  'type': 'appointment.cancelled',
                  'status': 'READ',
                  'title': 'Lịch hẹn đã được hủy',
                  'message': 'Lịch hẹn không còn hiệu lực.',
                  'createdAt': '2026-01-01T03:00:00Z',
                  'payload': {'appointmentId': 'appt-2'},
                },
                {
                  'id': 'n-created',
                  'type': 'appointment.created',
                  'status': 'READ',
                  'title': 'Yêu cầu đặt lịch đã được ghi nhận',
                  'message': 'Phòng khám sẽ xác nhận lịch.',
                  'createdAt': '2026-01-01T04:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n-confirmed',
                  'type': 'appointment.confirmed',
                  'status': 'READ',
                  'title': 'Xác nhận lịch',
                  'message': 'Đã xác nhận.',
                  'createdAt': '2026-01-01T05:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n-rescheduled',
                  'type': 'appointment.rescheduled',
                  'status': 'READ',
                  'title': 'Đổi giờ khám',
                  'message': 'Xem giờ mới.',
                  'createdAt': '2026-01-01T06:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n-checkedin',
                  'type': 'appointment.checked_in',
                  'status': 'READ',
                  'title': 'Đã tiếp nhận',
                  'message': 'Chờ gọi tên.',
                  'createdAt': '2026-01-01T07:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 7,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (route) => openedRoute = route,
            onUnreadCountChanged: () => unreadCallbackCount += 1,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Reminder type mapping + UTC+7 formatting + visible record badge
      expect(find.text('Nhắc lịch 24h'), findsOneWidget);
      expect(find.text('Hồ sơ khám mới'), findsOneWidget);
      expect(find.text('Nhắc 1h'), findsNothing);
      expect(find.text('Nhắc lịch 1h'), findsNothing);
      expect(find.text('08:30 01/01/2026'), findsOneWidget);
      expect(find.text('Xem lịch hẹn'), findsOneWidget);
      expect(find.text('Xem hồ sơ khám'), findsOneWidget);

      // Failed PATCH /read keeps item UNREAD and shows SnackBar
      failPatch = true;
      await tester.tap(find.text('Đã đọc').first);
      await tester.pumpAndSettle();
      expect(find.text('Không thể cập nhật trạng thái đọc'), findsOneWidget);
      expect(find.text('Đã đọc'), findsNWidgets(2));

      // Successful PATCH /read marks item READ without triggering navigation
      failPatch = false;
      openedRoute = null;
      await tester.tap(find.text('Đã đọc').first);
      await tester.pumpAndSettle();
      expect(openedRoute, isNull);
      expect(unreadCallbackCount, 1);
      expect(find.text('Đã đọc'), findsOneWidget);

      // Tapping READ item with appointmentId navigates without calling PATCH /read
      final patchCallsBeforeTap = patchCalls;
      await tester.scrollUntilVisible(find.text('Lịch hẹn đã được hủy'), 150);
      await tester.ensureVisible(find.text('Lịch hẹn đã được hủy'));
      await tester.pumpAndSettle();
      expect(find.text('Đã hủy lịch'), findsOneWidget);
      await tester.tap(find.text('Lịch hẹn đã được hủy'));
      await tester.pumpAndSettle();
      expect(openedRoute, '/appointments');
      expect(patchCalls, patchCallsBeforeTap);

      // Scroll through remaining backend event types & open detail modal for route-less item
      await tester.scrollUntilVisible(find.text('Lịch hẹn mới'), 150);
      expect(find.text('Lịch hẹn mới'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Đã xác nhận'), 150);
      expect(find.text('Đã xác nhận'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Đổi lịch hẹn'), 150);
      expect(find.text('Đổi lịch hẹn'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Đã check-in'), 150);
      expect(find.text('Đã check-in'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.text('Yêu cầu đặt lịch đã được ghi nhận'),
        -150,
      );
      await tester.ensureVisible(find.text('Yêu cầu đặt lịch đã được ghi nhận'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yêu cầu đặt lịch đã được ghi nhận'));
      await tester.pumpAndSettle();
      expect(find.text('Đóng'), findsOneWidget);
      await tester.tap(find.text('Đóng'));
      await tester.pumpAndSettle();
    });
  });

  group('Responsive 360px @ 1.4x, lifecycle & defensive parsing', () {
    testWidgets(
        'zero overflow and >=48px touch targets on 360px @ 1.4x text scale',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 2}});
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'long-unread',
                  'type': 'medical-record.updated',
                  'status': 'UNREAD',
                  'title':
                      'Kết quả khám chuyên khoa tim mạch định kỳ đã được bác sĩ cập nhật đầy đủ',
                  'message':
                      'Vui lòng mở hồ sơ khám để xem đơn thuốc chi tiết và hướng dẫn tái khám sau 2 tuần.',
                  'createdAt': '2026-01-01T01:30:00Z',
                  'payload': {'recordId': 'rec-long'},
                },
                {
                  'id': 'long-read',
                  'type': 'appointment.rescheduled',
                  'status': 'READ',
                  'title':
                      'Lịch hẹn khám tổng quát buổi sáng đã được điều chỉnh sang khung giờ mới',
                  'message': 'Kiểm tra thời gian mới trước khi đến phòng khám.',
                  'createdAt': '2026-01-01T03:00:00Z',
                  'payload': {'appointmentId': 'appt-long'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 2,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(360, 740),
              textScaler: TextScaler.linear(1.4),
            ),
            child: NotificationsPage(
              tokenProvider: _session,
              api: client,
              onOpenRoute: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);

      expect(
        tester.getSize(find.widgetWithText(TextButton, 'Đọc tất cả')).height,
        greaterThanOrEqualTo(48.0),
      );
      expect(
        tester.getSize(find.widgetWithText(TextButton, 'Đã đọc')).height,
        greaterThanOrEqualTo(48.0),
      );
      expect(
        tester
            .getSize(
              find.ancestor(
                of: find.text('Tất cả'),
                matching: find.byType(InkWell),
              ),
            )
            .height,
        greaterThanOrEqualTo(48.0),
      );
      expect(
        tester
            .getSize(
              find.ancestor(
                of: find.text('Chưa đọc').first,
                matching: find.byType(InkWell),
              ),
            )
            .height,
        greaterThanOrEqualTo(48.0),
      );
    });

    testWidgets(
        'handles didUpdateWidget, RequestCancellation on dispose, and malformed payload',
        (tester) async {
      final clientA = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 0}});
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': 'not-a-list',
            },
          });
        }),
      );

      final clientB = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': true, 'data': {'unreadCount': 0}});
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'from-b',
                  'status': 'READ',
                  'title': 'Tải lại từ API mới',
                  'message': 'Cập nhật widget thành công',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': null,
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientA,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Malformed payload is caught gracefully without hanging in loading
      expect(find.byType(AppErrorState), findsOneWidget);
      expect(
        find.text('Không thể tải danh sách thông báo. Vui lòng thử lại.'),
        findsOneWidget,
      );

      // Update api prop triggers reload from clientB
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientB,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Tải lại từ API mới'), findsOneWidget);

      // Dispose while a new request is in-flight aborts via RequestCancellation without throwing
      final abortTransport = _AbortTrackingClient();
      final clientC = ClinicApiClient(
        tokenProvider: _session,
        transport: abortTransport,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientC,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pump();
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pump();
      expect(abortTransport.aborted, isTrue);
      expect(tester.takeException(), isNull);
    });

    test('AppNotification.tryFromMap defends against null/dynamic maps', () {
      final rawMap = <dynamic, dynamic>{
        'id': 'n-dyn',
        'title': '',
        'message': null,
        'status': 'UNREAD',
        'payload': <dynamic, dynamic>{
          'appointmentId': '   ',
          'recordId': '  rec-99  ',
        },
      };

      final parsed = AppNotification.tryFromMap(rawMap);
      expect(parsed, isNotNull);
      expect(parsed!.title, 'Thông báo');
      expect(parsed.message, '');
      expect(parsed.appointmentId, isNull);
      expect(parsed.recordId, 'rec-99');
      expect(parsed.targetRoute, '/records');
      expect(AppNotification.tryFromMap('invalid'), isNull);

      final malformedIds = AppNotification.tryFromMap(<String, Object?>{
        'id': 'n-bad-ids',
        'status': 'UNREAD',
        'payload': <String, Object?>{
          'appointmentId': <String, Object?>{},
          'recordId': <Object?>[],
        },
      });
      expect(malformedIds, isNotNull);
      expect(malformedIds!.appointmentId, isNull);
      expect(malformedIds.recordId, isNull);
      expect(malformedIds.targetRoute, isNull);
    });
  });

  group('Iteration 2 regression tests', () {
    testWidgets(
        'interrupting _loadMore via filter switch resets _loadingMore and allows pagination',
        (tester) async {
      final slowPage2 = Completer<http.Response>();
      final requestedQueries = <String>[];

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 2},
            });
          }
          final page = request.url.queryParameters['page'] ?? '1';
          final status = request.url.queryParameters['status'] ?? 'ALL';
          requestedQueries.add('$status:$page');

          if (status == 'ALL' && page == '2') {
            return slowPage2.future;
          }
          if (status == 'UNREAD' && page == '1') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'unread-p1',
                    'status': 'UNREAD',
                    'title': 'Chưa đọc trang 1',
                    'message': 'Nội dung 1',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'payload': {},
                  },
                ],
                'page': 1,
                'limit': 1,
                'total': 2,
              },
            });
          }
          if (status == 'UNREAD' && page == '2') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'unread-p2',
                    'status': 'UNREAD',
                    'title': 'Chưa đọc trang 2',
                    'message': 'Nội dung 2',
                    'createdAt': '2026-01-01T07:00:00Z',
                    'payload': {},
                  },
                ],
                'page': 2,
                'limit': 1,
                'total': 2,
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'all-p1',
                  'status': 'READ',
                  'title': 'Tất cả trang 1',
                  'message': 'Nội dung tất cả',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 1,
              'total': 3,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pump();
      expect(find.text('Tải thêm thông báo'), findsNothing);

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      // Complete stale page 2 response from 'Tất cả'
      slowPage2.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'stale-p2',
              'status': 'READ',
              'title': 'Trang 2 cũ',
              'message': 'Không được xuất hiện',
              'createdAt': '2026-01-01T06:00:00Z',
              'payload': {},
            },
          ],
          'page': 2,
          'limit': 1,
          'total': 3,
        },
      }));
      await tester.pumpAndSettle();

      expect(find.text('Trang 2 cũ'), findsNothing);
      expect(find.text('Chưa đọc trang 1'), findsOneWidget);
      expect(find.text('Tải thêm thông báo'), findsOneWidget);

      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();

      expect(find.text('Chưa đọc trang 2'), findsOneWidget);
      expect(requestedQueries, contains('UNREAD:2'));
    });

    testWidgets(
        'didUpdateWidget clears previous user state even on error and ignores stale in-flight markRead/markAllRead',
        (tester) async {
      final staleMarkReadCompleter = Completer<http.Response>();
      final staleMarkAllCompleter = Completer<http.Response>();

      final clientUserA = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 2},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path.endsWith('/read-all')) {
            return staleMarkAllCompleter.future;
          }
          if (request.method == 'PATCH' && request.url.path.endsWith('/read')) {
            return staleMarkReadCompleter.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'a-1',
                  'status': 'UNREAD',
                  'title': 'Dữ liệu riêng tư User A',
                  'message': 'Chỉ dành cho User A',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'a-2',
                  'status': 'UNREAD',
                  'title': 'Thông báo thứ 2 của User A',
                  'message': 'Chi tiết A2',
                  'createdAt': '2026-01-01T07:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 2,
            },
          });
        }),
      );

      final clientUserBError = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': false}, statusCode: 401);
          }
          return _jsonResponse(
            {
              'success': false,
              'error': {
                'code': 'UNAUTHORIZED',
                'message': 'Phiên đăng nhập User B hết hạn',
              },
            },
            statusCode: 401,
          );
        }),
      );

      final clientUserBSuccess = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 3},
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'b-1',
                  'status': 'UNREAD',
                  'title': 'Thông báo của User B',
                  'message': 'Nội dung User B',
                  'createdAt': '2026-01-02T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientUserA,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Dữ liệu riêng tư User A'), findsOneWidget);

      // Start both in-flight mutations on User A
      await tester.tap(find.text('Đã đọc').first);
      await tester.pump();
      await tester.tap(find.text('Đọc tất cả'));
      await tester.pump();

      // Switch to User B whose API returns 401 -> User A data must vanish immediately
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientUserBError,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Dữ liệu riêng tư User A'), findsNothing);
      expect(find.byType(AppErrorState), findsOneWidget);
      expect(find.text('Phiên đăng nhập User B hết hạn'), findsOneWidget);

      // Switch to healthy User B
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: clientUserBSuccess,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Thông báo của User B'), findsOneWidget);
      expect(find.text('Bạn có 3 thông báo chưa đọc'), findsOneWidget);

      // Stale responses from User A must NOT overwrite User B's state
      staleMarkReadCompleter.complete(_jsonResponse({
        'success': true,
        'data': {'id': 'a-1', 'status': 'READ'},
      }));
      staleMarkAllCompleter.complete(_jsonResponse({
        'success': true,
        'data': {'updatedCount': 2, 'unreadCount': 0},
      }));
      await tester.pumpAndSettle();

      expect(find.text('Bạn có 3 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Thông báo của User B'), findsOneWidget);
      expect(find.text('Dữ liệu riêng tư User A'), findsNothing);
    });

    testWidgets(
        '_markAllRead in unread filter updates _pagination and hides stale Load More',
        (tester) async {
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 3},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/read-all') {
            return _jsonResponse({
              'success': true,
              'data': {
                'updatedCount': 2,
                'unreadCount': 1,
                'readBefore': '2026-01-01T08:05:00Z',
                'readAt': '2026-01-01T08:06:00Z',
              },
            });
          }
          final status = request.url.queryParameters['status'];
          if (status == 'UNREAD') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'u-old',
                    'status': 'UNREAD',
                    'title': 'Chưa đọc cũ',
                    'message': 'Trước cutoff',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'payload': {},
                  },
                  {
                    'id': 'u-new',
                    'status': 'UNREAD',
                    'title': 'Chưa đọc mới',
                    'message': 'Sau cutoff',
                    'createdAt': '2026-01-01T08:10:00Z',
                    'payload': {},
                  },
                ],
                'page': 1,
                'limit': 2,
                'total': 3,
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-old',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc cũ',
                  'message': 'Trước cutoff',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      expect(find.text('Tải thêm thông báo'), findsOneWidget);

      await tester.tap(find.text('Đọc tất cả'));
      await tester.pumpAndSettle();

      expect(find.text('Chưa đọc mới'), findsOneWidget);
      expect(find.text('Chưa đọc cũ'), findsNothing);
      expect(find.text('Bạn có 1 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Tải thêm thông báo'), findsNothing);
    });

    testWidgets(
        'pull-to-refresh error on non-empty list shows SnackBar and preserves _page',
        (tester) async {
      var failRefresh = false;
      final requestedPages = <String>[];

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 0},
            });
          }
          final page = request.url.queryParameters['page'] ?? '1';
          requestedPages.add(page);
          if (failRefresh && page == '1') {
            return _jsonResponse(
              {
                'success': false,
                'error': {
                  'code': 'SERVICE_UNAVAILABLE',
                  'message': 'Lỗi tải mới',
                },
              },
              statusCode: 503,
            );
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'item-p$page',
                  'status': 'READ',
                  'title': 'Thông báo trang $page',
                  'message': 'Nội dung trang $page',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': int.parse(page),
              'limit': 1,
              'total': 3,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Load page 2 -> _page is now 2
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();
      expect(find.text('Thông báo trang 2'), findsOneWidget);

      // Fail pull-to-refresh on page 1
      failRefresh = true;
      await tester.fling(
        find.byType(ListView),
        const Offset(0, 320),
        1000,
      );
      await tester.pumpAndSettle();

      expect(find.text('Lỗi tải mới'), findsOneWidget);
      expect(find.text('Thông báo trang 1'), findsOneWidget);
      expect(find.text('Thông báo trang 2'), findsOneWidget);

      // Next loadMore must request page 3, NOT duplicate page 2
      failRefresh = false;
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();

      expect(find.text('Thông báo trang 3'), findsOneWidget);
      expect(requestedPages, ['1', '2', '1', '3']);
    });

    testWidgets(
        'header subtitle and Đọc tất cả remain consistent when /unread-count returns 0 but page 1 has UNREAD',
        (tester) async {
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 0},
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Thông báo chưa đọc thực tế',
                  'message': 'Cần đồng bộ header',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Đọc tất cả'), findsOneWidget);
      expect(find.text('Bạn có 1 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsNothing);
    });

    testWidgets(
        '_showDetailSheet handles very long title/message on 360x560 @ 1.4x with zero overflow',
        (tester) async {
      tester.view.physicalSize = const Size(360, 560);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      const longTitle =
          'Cập nhật kết quả khám chuyên khoa tổng quát và hướng dẫn theo dõi sức khỏe định kỳ tại nhà';
      final longMessage = List.filled(
        15,
        'Vui lòng kiểm tra kỹ chỉ số huyết áp, đường huyết, lịch uống thuốc hàng ngày và liên hệ phòng khám nếu có triệu chứng bất thường.',
      ).join('\n');

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 0},
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'long-sheet',
                  'type': 'medical-record.updated',
                  'status': 'READ',
                  'title': longTitle,
                  'message': longMessage,
                  'createdAt': '2026-12-31T16:59:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(360, 560),
              textScaler: TextScaler.linear(1.4),
            ),
            child: NotificationsPage(
              tokenProvider: _session,
              api: client,
              onOpenRoute: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text(longTitle), 150);
      await tester.ensureVisible(find.text(longTitle));
      await tester.pumpAndSettle();
      await tester.tap(find.text(longTitle));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Đóng'), findsOneWidget);

      await tester.tap(find.text('Đóng'));
      await tester.pumpAndSettle();
      expect(find.text('Đóng'), findsNothing);
    });

    testWidgets(
        'double-tapping Đã đọc while PATCH /read is pending does not trigger tile onTap navigation',
        (tester) async {
      final patchCompleter = Completer<http.Response>();
      var patchCalls = 0;
      String? openedRoute;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 1},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/n-double/read') {
            patchCalls += 1;
            return patchCompleter.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n-double',
                  'type': 'medical-record.created',
                  'status': 'UNREAD',
                  'title': 'Kết quả khám mới',
                  'message': 'Chạm để mở hồ sơ',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {'recordId': 'rec-1'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (route) => openedRoute = route,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final markReadBtn = find.widgetWithText(TextButton, 'Đã đọc');
      await tester.tap(markReadBtn);
      await tester.pump();

      // Second tap on the exact same button region while markingRead == true
      await tester.tap(markReadBtn, warnIfMissed: false);
      await tester.pump();

      expect(patchCalls, 1);
      expect(openedRoute, isNull);

      patchCompleter.complete(_jsonResponse({
        'success': true,
        'data': {'id': 'n-double', 'status': 'READ'},
      }));
      await tester.pumpAndSettle();

      expect(openedRoute, isNull);
      expect(find.text('Đã đọc'), findsNothing);
    });

    testWidgets(
        'ClinicPageHeader stays compact (<190px) on 360x560 @ 1.4x with unreadCount=125 and white Đọc tất cả button >= 48px',
        (tester) async {
      tester.view.physicalSize = const Size(360, 560);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 125},
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'compact-1',
                  'type': 'appointment.confirmed',
                  'status': 'UNREAD',
                  'title': 'Xác nhận lịch hẹn',
                  'message': 'Lịch hẹn đã được xác nhận.',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {'appointmentId': 'appt-1'},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(360, 560),
              textScaler: TextScaler.linear(1.4),
            ),
            child: Scaffold(
              bottomNavigationBar: NavigationBar(
                selectedIndex: 3,
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.medical_services_outlined),
                    label: 'Bác sĩ',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.calendar_today_outlined),
                    label: 'Lịch hẹn',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.folder_outlined),
                    label: 'Hồ sơ',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.notifications_outlined),
                    label: 'Thông báo',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    label: 'Cá nhân',
                  ),
                ],
              ),
              body: NotificationsPage(
                tokenProvider: _session,
                api: client,
                onOpenRoute: (_) {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);

      final headerSize = tester.getSize(find.byType(ClinicPageHeader));
      expect(headerSize.height, lessThan(190.0));

      final markAllFinder = find.widgetWithText(TextButton, 'Đọc tất cả');
      expect(markAllFinder, findsOneWidget);
      final button = tester.widget<TextButton>(markAllFinder);
      expect(button.style?.foregroundColor?.resolve({}), Colors.white);
      expect(tester.getSize(markAllFinder).height, greaterThanOrEqualTo(48.0));

      final listRect = tester.getRect(find.byType(RefreshIndicator));
      expect(listRect.height, greaterThanOrEqualTo(200.0));
    });
  });

  group('Iteration 3 regression tests', () {
    testWidgets(
        'Bug A: _markAllRead in unread tab reloads page 1 when remainingUnread is empty but unreadCount > 0',
        (tester) async {
      var unreadListCalls = 0;
      var serverUnread = 4;
      final reloadCompleter = Completer<http.Response>();

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': serverUnread},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/read-all') {
            serverUnread = 2;
            return _jsonResponse({
              'success': true,
              'data': {
                'updatedCount': 2,
                'unreadCount': 2,
                'readBefore': '2026-01-01T09:00:00Z',
                'readAt': '2026-01-01T09:01:00Z',
              },
            });
          }
          final status = request.url.queryParameters['status'];
          if (status == 'UNREAD') {
            unreadListCalls += 1;
            if (unreadListCalls == 1) {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'id': 'u-1',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc trang 1 - mục 1',
                      'message': 'Cũ hơn readBefore',
                      'createdAt': '2026-01-01T08:00:00Z',
                      'payload': {},
                    },
                    {
                      'id': 'u-2',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc trang 1 - mục 2',
                      'message': 'Cũ hơn readBefore',
                      'createdAt': '2026-01-01T07:00:00Z',
                      'payload': {},
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 4,
                },
              });
            }
            return reloadCompleter.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc trang 1 - mục 1',
                  'message': 'Cũ hơn readBefore',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      expect(find.text('Bạn có 4 thông báo chưa đọc'), findsOneWidget);
      await tester.tap(find.text('Đọc tất cả'));
      await tester.pump();

      // While reload is in-flight, must NOT show contradictory empty state
      expect(find.text('Không có thông báo chưa đọc'), findsNothing);
      expect(find.byType(AppLoadingState), findsOneWidget);

      reloadCompleter.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'u-3',
              'status': 'UNREAD',
              'title': 'Chưa đọc còn lại 1',
              'message': 'Trang sau từ server',
              'createdAt': '2026-01-01T09:30:00Z',
              'payload': {},
            },
            {
              'id': 'u-4',
              'status': 'UNREAD',
              'title': 'Chưa đọc còn lại 2',
              'message': 'Trang sau từ server',
              'createdAt': '2026-01-01T09:20:00Z',
              'payload': {},
            },
          ],
          'page': 1,
          'limit': 2,
          'total': 2,
        },
      }));
      await tester.pumpAndSettle();

      expect(unreadListCalls, 2);
      expect(find.text('Bạn có 2 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Không có thông báo chưa đọc'), findsNothing);
      expect(find.text('Chưa đọc còn lại 1'), findsOneWidget);
      expect(find.text('Chưa đọc còn lại 2'), findsOneWidget);
    });

    testWidgets(
        'Bug B: _markRead in unread tab followed by empty page 2 hides Load More without infinite loop',
        (tester) async {
      final unreadPagesRequested = <String>[];
      var serverTotalUnread = 3;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': serverTotalUnread},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/u-1/read') {
            serverTotalUnread = 2;
            return _jsonResponse({
              'success': true,
              'data': {'id': 'u-1', 'status': 'READ'},
            });
          }
          final status = request.url.queryParameters['status'];
          final page = request.url.queryParameters['page'] ?? '1';
          if (status == 'UNREAD') {
            unreadPagesRequested.add(page);
            if (page == '1') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'id': 'u-1',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc 1',
                      'message': 'Nội dung 1',
                      'createdAt': '2026-01-01T09:00:00Z',
                      'payload': {},
                    },
                    {
                      'id': 'u-2',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc 2',
                      'message': 'Nội dung 2',
                      'createdAt': '2026-01-01T08:00:00Z',
                      'payload': {},
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 3,
                },
              });
            }
            return _jsonResponse({
              'success': true,
              'data': {
                'items': <Object>[],
                'page': int.parse(page),
                'limit': 2,
                'total': serverTotalUnread,
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc 1',
                  'message': 'Nội dung 1',
                  'createdAt': '2026-01-01T09:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Đã đọc').first);
      await tester.pumpAndSettle();

      expect(find.text('Chưa đọc 1'), findsNothing);
      expect(find.text('Chưa đọc 2'), findsOneWidget);
      expect(find.text('Tải thêm thông báo'), findsOneWidget);

      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();

      expect(unreadPagesRequested, ['1', '2']);
      expect(find.text('Tải thêm thông báo'), findsNothing);
    });

    testWidgets(
        'Bug C: concurrent _markRead completing before in-flight _loadMore prevents phantom Load More',
        (tester) async {
      final page2Completer = Completer<http.Response>();
      var page2Requested = false;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': 4},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/u-1/read') {
            return _jsonResponse({
              'success': true,
              'data': {'id': 'u-1', 'status': 'READ'},
            });
          }
          final status = request.url.queryParameters['status'];
          final page = request.url.queryParameters['page'] ?? '1';
          if (status == 'UNREAD') {
            if (page == '1') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'id': 'u-1',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc 1',
                      'message': 'Nội dung 1',
                      'createdAt': '2026-01-01T09:00:00Z',
                      'payload': {},
                    },
                    {
                      'id': 'u-2',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc 2',
                      'message': 'Nội dung 2',
                      'createdAt': '2026-01-01T08:00:00Z',
                      'payload': {},
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 4,
                },
              });
            }
            page2Requested = true;
            return page2Completer.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc 1',
                  'message': 'Nội dung 1',
                  'createdAt': '2026-01-01T09:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pump();
      expect(page2Requested, isTrue);

      // Scroll back up to tap 'Đã đọc' on u-1 while page 2 is still in-flight
      await tester.scrollUntilVisible(find.text('Chưa đọc 1'), -150);
      await tester.tap(find.text('Đã đọc').first);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Chưa đọc 1'), findsNothing);
      expect(find.text('Chưa đọc 2'), findsOneWidget);

      // Complete stale page 2 with pre-mutation snapshot total: 4
      page2Completer.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'u-3',
              'status': 'UNREAD',
              'title': 'Chưa đọc 3',
              'message': 'Nội dung 3',
              'createdAt': '2026-01-01T07:00:00Z',
              'payload': {},
            },
            {
              'id': 'u-4',
              'status': 'UNREAD',
              'title': 'Chưa đọc 4',
              'message': 'Nội dung 4',
              'createdAt': '2026-01-01T06:00:00Z',
              'payload': {},
            },
          ],
          'page': 2,
          'limit': 2,
          'total': 4,
        },
      }));
      await tester.pumpAndSettle();

      expect(find.text('Chưa đọc 2'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Chưa đọc 4'), 150);
      expect(find.text('Chưa đọc 3'), findsOneWidget);
      expect(find.text('Chưa đọc 4'), findsOneWidget);
      // Total must stay capped at 3 (not overwritten to 4), so no phantom Load More
      expect(find.text('Tải thêm thông báo'), findsNothing);
    });

    testWidgets(
        'Bug D: _loadMore deduplicates overlapping notification IDs from offset shift',
        (tester) async {
      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({'success': false}, statusCode: 500);
          }
          final page = request.url.queryParameters['page'] ?? '1';
          if (page == '1') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'n-1',
                    'status': 'READ',
                    'title': 'Thông báo 1',
                    'message': 'Nội dung 1',
                    'createdAt': '2026-01-01T09:00:00Z',
                    'payload': {},
                  },
                  {
                    'id': 'n-2',
                    'status': 'UNREAD',
                    'title': 'Thông báo 2 trùng offset',
                    'message': 'Nội dung 2',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'payload': {},
                  },
                ],
                'page': 1,
                'limit': 2,
                'total': 3,
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n-2',
                  'status': 'UNREAD',
                  'title': 'Thông báo 2 trùng offset',
                  'message': 'Nội dung 2',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n-3',
                  'status': 'UNREAD',
                  'title': 'Thông báo 3 mới',
                  'message': 'Nội dung 3',
                  'createdAt': '2026-01-01T07:00:00Z',
                  'payload': {},
                },
              ],
              'page': 2,
              'limit': 2,
              'total': 3,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();

      expect(find.text('Thông báo 2 trùng offset'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Thông báo 3 mới'), 150);
      expect(find.text('Thông báo 3 mới'), findsOneWidget);
      // Local unread count must be 2 (n-2 + n-3), not 3 from duplicate n-2
      expect(find.text('Bạn có 2 thông báo chưa đọc'), findsOneWidget);
    });
  });

  group('Iteration 4 regression tests', () {
    testWidgets(
        'Bug A3: _markRead exhausting page 1 in unread tab reloads page 1 when server still has unread items',
        (tester) async {
      var unreadListCalls = 0;
      var serverUnread = 4;
      final reloadCompleter = Completer<http.Response>();

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': serverUnread},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/u-1/read') {
            serverUnread = 3;
            return _jsonResponse({
              'success': true,
              'data': {'id': 'u-1', 'status': 'READ'},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/u-2/read') {
            serverUnread = 2;
            return _jsonResponse({
              'success': true,
              'data': {'id': 'u-2', 'status': 'READ'},
            });
          }
          final status = request.url.queryParameters['status'];
          if (status == 'UNREAD') {
            unreadListCalls += 1;
            if (unreadListCalls == 1) {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'id': 'u-1',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc A3 - 1',
                      'message': 'Nội dung 1',
                      'createdAt': '2026-01-01T09:00:00Z',
                      'payload': {},
                    },
                    {
                      'id': 'u-2',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc A3 - 2',
                      'message': 'Nội dung 2',
                      'createdAt': '2026-01-01T08:00:00Z',
                      'payload': {},
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 4,
                },
              });
            }
            return reloadCompleter.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc A3 - 1',
                  'message': 'Nội dung 1',
                  'createdAt': '2026-01-01T09:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();
      expect(find.text('Bạn có 4 thông báo chưa đọc'), findsOneWidget);

      await tester.tap(find.text('Đã đọc').first);
      await tester.pumpAndSettle();
      expect(find.text('Chưa đọc A3 - 1'), findsNothing);
      expect(find.text('Chưa đọc A3 - 2'), findsOneWidget);
      expect(find.text('Bạn có 3 thông báo chưa đọc'), findsOneWidget);

      await tester.tap(find.text('Đã đọc').first);
      await tester.pump();

      // While reloading page 1, must show loading instead of contradictory empty state
      expect(find.text('Không có thông báo chưa đọc'), findsNothing);
      expect(find.byType(AppLoadingState), findsOneWidget);

      reloadCompleter.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'u-3',
              'status': 'UNREAD',
              'title': 'Chưa đọc A3 - 3',
              'message': 'Trang sau 3',
              'createdAt': '2026-01-01T07:00:00Z',
              'payload': {},
            },
            {
              'id': 'u-4',
              'status': 'UNREAD',
              'title': 'Chưa đọc A3 - 4',
              'message': 'Trang sau 4',
              'createdAt': '2026-01-01T06:00:00Z',
              'payload': {},
            },
          ],
          'page': 1,
          'limit': 2,
          'total': 2,
        },
      }));
      await tester.pumpAndSettle();

      expect(unreadListCalls, 2);
      expect(find.text('Bạn có 2 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Không có thông báo chưa đọc'), findsNothing);
      expect(find.text('Chưa đọc A3 - 3'), findsOneWidget);
      expect(find.text('Chưa đọc A3 - 4'), findsOneWidget);
    });

    testWidgets(
        'Bug C1: _markAllRead completing before in-flight _loadMore in unread tab ignores stale UNREAD snapshot',
        (tester) async {
      final stalePage2Completer = Completer<http.Response>();
      var serverUnread = 4;
      var page2Requested = false;

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': serverUnread},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/read-all') {
            serverUnread = 0;
            return _jsonResponse({
              'success': true,
              'data': {
                'updatedCount': 4,
                'unreadCount': 0,
                'readBefore': '2026-01-01T10:00:00Z',
                'readAt': '2026-01-01T10:00:01Z',
              },
            });
          }
          final status = request.url.queryParameters['status'];
          final page = request.url.queryParameters['page'] ?? '1';
          if (status == 'UNREAD') {
            if (page == '1') {
              return _jsonResponse({
                'success': true,
                'data': {
                  'items': [
                    {
                      'id': 'u-1',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc C1 - 1',
                      'message': 'Nội dung 1',
                      'createdAt': '2026-01-01T09:00:00Z',
                      'payload': {},
                    },
                    {
                      'id': 'u-2',
                      'status': 'UNREAD',
                      'title': 'Chưa đọc C1 - 2',
                      'message': 'Nội dung 2',
                      'createdAt': '2026-01-01T08:00:00Z',
                      'payload': {},
                    },
                  ],
                  'page': 1,
                  'limit': 2,
                  'total': 4,
                },
              });
            }
            page2Requested = true;
            return stalePage2Completer.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'u-1',
                  'status': 'UNREAD',
                  'title': 'Chưa đọc C1 - 1',
                  'message': 'Nội dung 1',
                  'createdAt': '2026-01-01T09:00:00Z',
                  'payload': {},
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chưa đọc').first);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pump();
      expect(page2Requested, isTrue);

      await tester.tap(find.text('Đọc tất cả'));
      await tester.pumpAndSettle();

      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsOneWidget);
      expect(find.text('Không có thông báo chưa đọc'), findsOneWidget);

      stalePage2Completer.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'u-3',
              'status': 'UNREAD',
              'title': 'Chưa đọc C1 - 3 cũ',
              'message': 'Snapshot cũ',
              'createdAt': '2026-01-01T07:00:00Z',
              'payload': {},
            },
            {
              'id': 'u-4',
              'status': 'UNREAD',
              'title': 'Chưa đọc C1 - 4 cũ',
              'message': 'Snapshot cũ',
              'createdAt': '2026-01-01T06:00:00Z',
              'payload': {},
            },
          ],
          'page': 2,
          'limit': 2,
          'total': 4,
        },
      }));
      await tester.pumpAndSettle();

      expect(find.text('Chưa đọc C1 - 3 cũ'), findsNothing);
      expect(find.text('Chưa đọc C1 - 4 cũ'), findsNothing);
      expect(find.text('Không có thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsOneWidget);
      expect(find.text('Bạn có 2 thông báo chưa đọc'), findsNothing);
    });

    testWidgets(
        'Bug C2: _markAllRead completing before in-flight _loadMore in all tab ignores stale UNREAD snapshot and preserves page cursor',
        (tester) async {
      final stalePage2Completer = Completer<http.Response>();
      var serverUnread = 4;
      final requestedPages = <String>[];

      final client = ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient((request) async {
          if (request.url.path == '/api/v1/notifications/unread-count') {
            return _jsonResponse({
              'success': true,
              'data': {'unreadCount': serverUnread},
            });
          }
          if (request.method == 'PATCH' &&
              request.url.path == '/api/v1/notifications/read-all') {
            serverUnread = 0;
            return _jsonResponse({
              'success': true,
              'data': {
                'updatedCount': 4,
                'unreadCount': 0,
                'readBefore': '2026-01-01T10:00:00Z',
                'readAt': '2026-01-01T10:00:01Z',
              },
            });
          }
          final page = request.url.queryParameters['page'] ?? '1';
          requestedPages.add(page);
          if (page == '1') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'n-1',
                    'status': 'UNREAD',
                    'title': 'Thông báo C2 - 1',
                    'message': 'Nội dung 1',
                    'createdAt': '2026-01-01T09:00:00Z',
                    'payload': {},
                  },
                  {
                    'id': 'n-2',
                    'status': 'UNREAD',
                    'title': 'Thông báo C2 - 2',
                    'message': 'Nội dung 2',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'payload': {},
                  },
                ],
                'page': 1,
                'limit': 2,
                'total': 4,
              },
            });
          }
          if (requestedPages.where((p) => p == '2').length == 1) {
            return stalePage2Completer.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'n-3',
                  'status': 'READ',
                  'title': 'Thông báo C2 - 3 đã đọc',
                  'message': 'Dữ liệu mới sau read-all',
                  'createdAt': '2026-01-01T07:00:00Z',
                  'payload': {},
                },
                {
                  'id': 'n-4',
                  'status': 'READ',
                  'title': 'Thông báo C2 - 4 đã đọc',
                  'message': 'Dữ liệu mới sau read-all',
                  'createdAt': '2026-01-01T06:00:00Z',
                  'payload': {},
                },
              ],
              'page': 2,
              'limit': 2,
              'total': 4,
            },
          });
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: NotificationsPage(
            tokenProvider: _session,
            api: client,
            onOpenRoute: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Bạn có 4 thông báo chưa đọc'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pump();
      expect(requestedPages, ['1', '2']);

      await tester.tap(find.text('Đọc tất cả'));
      await tester.pumpAndSettle();
      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsOneWidget);

      stalePage2Completer.complete(_jsonResponse({
        'success': true,
        'data': {
          'items': [
            {
              'id': 'n-3',
              'status': 'UNREAD',
              'title': 'Thông báo C2 - 3 cũ',
              'message': 'Snapshot cũ chưa đọc',
              'createdAt': '2026-01-01T07:00:00Z',
              'payload': {},
            },
            {
              'id': 'n-4',
              'status': 'UNREAD',
              'title': 'Thông báo C2 - 4 cũ',
              'message': 'Snapshot cũ chưa đọc',
              'createdAt': '2026-01-01T06:00:00Z',
              'payload': {},
            },
          ],
          'page': 2,
          'limit': 2,
          'total': 4,
        },
      }));
      await tester.pumpAndSettle();

      // Must NOT resurrect stale UNREAD items or flip header back
      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsOneWidget);
      expect(find.text('Bạn có 2 thông báo chưa đọc'), findsNothing);
      expect(find.text('Thông báo C2 - 3 cũ'), findsNothing);
      expect(find.text('Thông báo C2 - 4 cũ'), findsNothing);

      // Load More button remains usable and fetches page=2 (not skipping to page=3)
      await tester.scrollUntilVisible(find.text('Tải thêm thông báo'), 150);
      await tester.tap(find.text('Tải thêm thông báo'));
      await tester.pumpAndSettle();

      expect(requestedPages, ['1', '2', '2']);
      await tester.scrollUntilVisible(find.text('Thông báo C2 - 4 đã đọc'), 150);
      expect(find.text('Thông báo C2 - 3 đã đọc'), findsOneWidget);
      expect(find.text('Thông báo C2 - 4 đã đọc'), findsOneWidget);
      expect(find.text('Cập nhật lịch hẹn và kết quả khám'), findsOneWidget);
    });
  });
}
