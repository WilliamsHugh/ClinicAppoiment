import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/notifications/notifications_page.dart';
import 'package:clinic_patient_app/features/records/records_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const session = AuthSession(
    userId: 'patient-user', role: UserRole.patient, accessToken: 'test-token');

void main() {
  testWidgets('patient can open record details and prescription',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: session,
      transport: MockClient((request) async {
        expect(request.headers['Authorization'], 'Bearer test-token');
        expect(request.url.queryParameters.containsKey('patientId'), isFalse);
        return http.Response.bytes(
            utf8.encode(jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'record-12345678',
                    'appointmentId': 'appointment-1',
                    'createdAt': '2026-01-01T08:00:00Z',
                    'status': 'FINAL',
                    'diagnosis': 'Viêm họng',
                    'prescription': [
                      {
                        'medicineName': 'Paracetamol',
                        'dosage': '500mg',
                        'frequency': '2 lần/ngày',
                        'duration': '3 ngày'
                      }
                    ]
                  }
                ],
                'page': 1,
                'limit': 20,
                'total': 1
              }
            })),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );
    await tester.pumpWidget(MaterialApp(
        home:
            Scaffold(body: RecordsPage(tokenProvider: session, api: client))));
    await tester.pumpAndSettle();
    expect(find.text('Viêm họng'), findsOneWidget);
    await tester.tap(find.text('Viêm họng'));
    await tester.pumpAndSettle();
    expect(find.text('Paracetamol'), findsOneWidget);
  });

  testWidgets('notification opens the linked medical record section',
      (tester) async {
    String? openedRoute;
    final client = ClinicApiClient(
      tokenProvider: session,
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
                      'appointmentId': 'appointment-1'
                    }
                  }
                ],
                'page': 1,
                'limit': 20,
                'total': 1
              }
            })),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: NotificationsPage(
              tokenProvider: session,
              api: client,
              onOpenRoute: (route) => openedRoute = route)),
    ));
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
      tokenProvider: session,
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
                'readAt': '2026-01-01T08:06:00Z'
              }
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
                  'payload': {}
                },
                {
                  'id': 'notif-new',
                  'status': 'UNREAD',
                  'title': 'Thông báo mới',
                  'message': 'Sau cutoff',
                  'createdAt': '2026-01-01T08:10:00Z',
                  'payload': {}
                }
              ],
              'page': 1,
              'limit': 20,
              'total': 2
            }
          })),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NotificationsPage(
          tokenProvider: session,
          api: client,
          onOpenRoute: (_) {},
        ),
      ),
    ));
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
      tokenProvider: session,
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
                    'payload': {}
                  }
                ],
                'page': 1,
                'limit': 1,
                'total': 2
              }
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
                    'payload': {}
                  }
                ],
                'page': 2,
                'limit': 1,
                'total': 2
              }
            })),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
      }),
    );

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NotificationsPage(
          tokenProvider: session,
          api: client,
          onOpenRoute: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Thông báo trang 1'), findsOneWidget);
    expect(find.text('Tải thêm thông báo'), findsOneWidget);

    await tester.tap(find.text('Tải thêm thông báo'));
    await tester.pumpAndSettle();

    expect(find.text('Thông báo trang 2'), findsOneWidget);
    expect(requestedPage, 2);
  });
}
