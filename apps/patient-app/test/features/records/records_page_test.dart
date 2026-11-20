import 'dart:async';
import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/records/record_models.dart';
import 'package:clinic_patient_app/features/records/records_page.dart';
import 'package:clinic_patient_app/shared/widgets/async_states.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_page_header.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_search_field.dart';
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

Widget _wrapWithTheme(Widget child) {
  return MaterialApp(
    theme: buildPatientTheme(),
    home: child,
  );
}

void main() {
  testWidgets('patient can open record details and prescription',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        expect(request.headers['Authorization'], 'Bearer test-token');
        expect(request.url.queryParameters.containsKey('patientId'), isFalse);
        return _jsonResponse({
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
                    'duration': '3 ngày',
                  }
                ],
              }
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
        home: Scaffold(
          body: RecordsPage(tokenProvider: _session, api: client),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Viêm họng'), findsOneWidget);
    await tester.tap(find.text('Viêm họng'));
    await tester.pumpAndSettle();
    expect(find.text('Paracetamol'), findsOneWidget);
  });

  testWidgets(
      'preserves ClinicPageHeader (#2D5BFF) and pull-to-refresh across loading, error, and empty states',
      (tester) async {
    final gate = Completer<void>();
    var phase = 0; // 0: loading -> error, 1: empty, 2: data

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (phase == 0) {
          await gate.future;
          phase = 1;
          return _jsonResponse({
            'success': false,
            'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Tạm gián đoạn'},
          }, statusCode: 503);
        }
        if (phase == 1) {
          phase = 2;
          return _jsonResponse({
            'success': true,
            'data': {
              'items': <Object>[],
              'page': 1,
              'limit': 20,
              'total': 0,
            },
          });
        }
        return _jsonResponse({
          'success': true,
          'data': {
            'items': [
              {
                'id': 'r1',
                'appointmentId': '11111111-1111-4111-8111-111111111111',
                'createdAt': '2026-01-01T18:00:00Z',
                'status': 'FINAL',
                'diagnosis': 'Khám tổng quát',
                'prescription': <Object>[],
              }
            ],
            'page': 1,
            'limit': 20,
            'total': 1,
          },
        });
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pump();

    // Loading state keeps ClinicPageHeader & RefreshIndicator
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.text('Hồ sơ khám'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.byType(AppLoadingState), findsOneWidget);
    expect(ClinicColors.primary, const Color(0xFF2D5BFF));

    // Complete request with 503 -> error state with header & pull-to-refresh
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(AppErrorState), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (w) =>
            w is SingleChildScrollView &&
            w.physics is AlwaysScrollableScrollPhysics,
      ),
      findsOneWidget,
    );

    // Pull-to-refresh from error state -> empty state
    await tester.fling(
      find.byType(SingleChildScrollView),
      const Offset(0, 300),
      1000,
    );
    await tester.pumpAndSettle();
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(AppEmptyState), findsOneWidget);
    expect(find.text('Chưa có hồ sơ khám'), findsOneWidget);

    // Pull-to-refresh from empty state -> data state
    await tester.fling(
      find.byType(SingleChildScrollView),
      const Offset(0, 300),
      1000,
    );
    await tester.pumpAndSettle();
    expect(find.text('Khám tổng quát'), findsOneWidget);
  });

  testWidgets(
      'handles short ids, null diagnosis/prescription, VN UTC+7 date boundary, localized status, and hides raw appointmentId UUID',
      (tester) async {
    expect(MedicalRecord.safeShortId('r1'), 'r1');
    expect(MedicalRecord.safeShortId(''), '');
    expect(MedicalRecord.safeShortId('abcdefghijkl'), 'abcdefgh');

    const apptUuid = '550e8400-e29b-41d4-a716-446655440000';
    const docUuid = '660e8400-e29b-41d4-a716-446655440111';
    const patientUuid = '770e8400-e29b-41d4-a716-446655440222';

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        return _jsonResponse({
          'success': true,
          'data': {
            'items': [
              {
                'id': 'r1',
                'appointmentId': apptUuid,
                'patientId': patientUuid,
                'doctorId': docUuid,
                'createdAt': '2026-01-01T18:00:00Z',
                'status': 'FINAL',
                'diagnosis': null,
                'prescription': null,
              }
            ],
            'page': 1,
            'limit': 20,
            'total': 1,
          },
        });
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pumpAndSettle();

    // 2026-01-01T18:00:00Z -> 2026-01-02 01:00 (UTC+7)
    expect(find.text('Kết quả khám ngày 02/01/2026'), findsOneWidget);
    expect(find.text('Ngày khám: 02/01/2026'), findsOneWidget);
    expect(find.text('Đã hoàn tất'), findsOneWidget);
    expect(find.textContaining('FINAL'), findsNothing);
    expect(find.textContaining(apptUuid), findsNothing);
    expect(find.textContaining(docUuid), findsNothing);
    expect(find.textContaining(patientUuid), findsNothing);

    await tester.tap(find.text('Kết quả khám ngày 02/01/2026'));
    await tester.pumpAndSettle();

    expect(find.text('Chi tiết kết quả khám'), findsOneWidget);
    expect(find.textContaining('02/01/2026 • 01:00'), findsOneWidget);
    expect(find.text('Không có đơn thuốc.'), findsOneWidget);
    expect(find.textContaining(apptUuid), findsNothing);
    expect(find.textContaining('FINAL'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'supports local search and prescription chip filter without sending q/from/to/doctorId/patientId, and keeps load more button',
      (tester) async {
    final requestedQueries = <Map<String, String>>[];
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/medical-records') {
          requestedQueries.add(request.url.queryParameters);
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-1',
                  'appointmentId': '11111111-1111-4111-8111-111111111111',
                  'doctorId': 'doc-a',
                  'createdAt': '2026-02-10T03:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Viêm mũi dị ứng',
                  'symptoms': 'Hắt hơi, sổ mũi',
                  'prescription': [
                    {
                      'medicineName': 'Loratadine',
                      'dosage': '10mg',
                      'frequency': '1 lần/ngày',
                      'duration': '5 ngày',
                    }
                  ],
                },
                {
                  'id': 'rec-2',
                  'appointmentId': '22222222-2222-4222-8222-222222222222',
                  'doctorId': 'doc-b',
                  'createdAt': '2026-02-09T03:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Kiểm tra sức khỏe',
                  'symptoms': 'Không sốt',
                  'prescription': <Object>[],
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 5,
            },
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-a') {
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-a', 'displayName': 'BS. Nguyễn Minh'},
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-b') {
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-b', 'displayName': 'BS. Trần Lan'},
          });
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pumpAndSettle();

    expect(requestedQueries, hasLength(1));
    expect(requestedQueries.first.keys, containsAll(['page', 'limit']));
    expect(requestedQueries.first.containsKey('q'), isFalse);
    expect(requestedQueries.first.containsKey('from'), isFalse);
    expect(requestedQueries.first.containsKey('to'), isFalse);
    expect(requestedQueries.first.containsKey('doctorId'), isFalse);
    expect(requestedQueries.first.containsKey('patientId'), isFalse);

    expect(find.text('Lọc cục bộ trên 2 hồ sơ đã tải'), findsOneWidget);
    expect(find.text('Tải thêm hồ sơ'), findsOneWidget);

    // Filter by medicine name
    await tester.enterText(find.byType(ClinicSearchField), 'loratadine');
    await tester.pumpAndSettle();
    expect(find.text('Viêm mũi dị ứng'), findsOneWidget);
    expect(find.text('Kiểm tra sức khỏe'), findsNothing);

    // Filter by doctor name
    await tester.enterText(find.byType(ClinicSearchField), 'trần lan');
    await tester.pumpAndSettle();
    expect(find.text('Viêm mũi dị ứng'), findsNothing);
    expect(find.text('Kiểm tra sức khỏe'), findsOneWidget);

    // Combine with 'Có đơn thuốc' chip -> filtered empty + keep 'Tải thêm hồ sơ'
    await tester.tap(find.text('Có đơn thuốc'));
    await tester.pumpAndSettle();
    expect(find.text('Không tìm thấy hồ sơ phù hợp'), findsOneWidget);
    expect(find.text('Xóa bộ lọc'), findsOneWidget);
    expect(find.text('Tải thêm hồ sơ'), findsOneWidget);

    // Clear filters
    await tester.tap(find.text('Xóa bộ lọc'));
    await tester.pumpAndSettle();
    expect(find.text('Viêm mũi dị ứng'), findsOneWidget);
    expect(find.text('Kiểm tra sức khỏe'), findsOneWidget);

    // Confirm no server search request was sent during local filtering
    expect(requestedQueries, hasLength(1));
  });

  testWidgets(
      'enriches doctor names non-blocking, caches 200 and 404, and recovers safely from 500',
      (tester) async {
    final docAGate = Completer<void>();
    var docACalls = 0;
    var doc404Calls = 0;
    var doc500Calls = 0;

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        final path = request.url.path;
        if (path == '/api/v1/medical-records') {
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-1',
                  'appointmentId': 'appt-1',
                  'doctorId': 'doc-ok',
                  'createdAt': '2026-01-10T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ 1',
                },
                {
                  'id': 'rec-2',
                  'appointmentId': 'appt-2',
                  'doctorId': 'doc-404',
                  'createdAt': '2026-01-09T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ 2',
                },
                {
                  'id': 'rec-3',
                  'appointmentId': 'appt-3',
                  'doctorId': 'doc-500',
                  'createdAt': '2026-01-08T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ 3',
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 3,
            },
          });
        }
        if (path == '/api/v1/doctors/doc-ok') {
          docACalls++;
          await docAGate.future;
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-ok', 'displayName': 'BS. Lê Hùng'},
          });
        }
        if (path == '/api/v1/doctors/doc-404') {
          doc404Calls++;
          return _jsonResponse({
            'success': false,
            'error': {'code': 'DOCTOR_NOT_FOUND', 'message': 'Not found'},
          }, statusCode: 404);
        }
        if (path == '/api/v1/doctors/doc-500') {
          doc500Calls++;
          if (doc500Calls == 1) {
            return _jsonResponse({
              'success': false,
              'error': {'code': 'INTERNAL_ERROR', 'message': 'Server error'},
            }, statusCode: 500);
          }
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-500', 'displayName': 'BS. Phạm Thảo'},
          });
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );

    // Let /medical-records complete while /doctors/doc-ok is still pending:
    // list renders immediately (non-blocking)!
    await tester.pump();
    await tester.pump();
    expect(find.text('Hồ sơ 1'), findsOneWidget);
    expect(find.text('Hồ sơ 2'), findsOneWidget);
    expect(find.text('Hồ sơ 3'), findsOneWidget);
    expect(find.text('Bác sĩ phòng khám'), findsNWidgets(3));

    // Complete doc-ok lookup -> updates doctor name on Hồ sơ 1
    docAGate.complete();
    await tester.pumpAndSettle();
    expect(find.text('BS. Lê Hùng'), findsOneWidget);
    expect(find.text('Bác sĩ phòng khám'), findsNWidgets(2));
    expect(docACalls, 1);
    expect(doc404Calls, 1);
    expect(doc500Calls, 1);

    // Refresh list: doc-ok (200) and doc-404 (negative cached) should NOT be fetched again;
    // doc-500 (transient error) IS retried and succeeds!
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();
    expect(docACalls, 1);
    expect(doc404Calls, 1);
    expect(doc500Calls, 2);
    expect(find.text('BS. Lê Hùng'), findsOneWidget);
    expect(find.text('BS. Phạm Thảo'), findsOneWidget);
  });

  testWidgets(
      'didUpdateWidget cancels in-flight request when refreshVersion changes even while loading',
      (tester) async {
    final firstGate = Completer<void>();
    var calls = 0;

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        calls++;
        final current = calls;
        if (current == 1) {
          await firstGate.future;
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'old',
                  'appointmentId': 'appt-old',
                  'createdAt': '2026-01-01T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Dữ liệu cũ',
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }
        return _jsonResponse({
          'success': true,
          'data': {
            'items': [
              {
                'id': 'new',
                'appointmentId': 'appt-new',
                'createdAt': '2026-01-02T08:00:00Z',
                'status': 'FINAL',
                'diagnosis': 'Dữ liệu mới',
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
      _wrapWithTheme(
        RecordsPage(
          tokenProvider: _session,
          api: client,
          refreshVersion: 0,
        ),
      ),
    );
    await tester.pump();
    expect(calls, 1);

    // Bump refreshVersion while first request is still pending
    await tester.pumpWidget(
      _wrapWithTheme(
        RecordsPage(
          tokenProvider: _session,
          api: client,
          refreshVersion: 1,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Dữ liệu mới'), findsOneWidget);
    expect(find.text('Dữ liệu cũ'), findsNothing);

    // Even if the first future later completes, stale data must not overwrite
    firstGate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Dữ liệu mới'), findsOneWidget);
    expect(find.text('Dữ liệu cũ'), findsNothing);
  });

  testWidgets(
      'renders cleanly without overflow at 360x640 with 1.4x text scale for RecordsPage and RecordDetailSheet',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/doctors/doc-long') {
          return _jsonResponse({
            'success': true,
            'data': {
              'id': 'doc-long',
              'displayName': 'PGS.TS.BS Nguyễn Thị Minh Phương Anh',
            },
          });
        }
        return _jsonResponse({
          'success': true,
          'data': {
            'items': [
              {
                'id': 'rec-long',
                'appointmentId': '99999999-9999-4999-8999-999999999999',
                'doctorId': 'doc-long',
                'createdAt': '2026-03-15T10:30:00Z',
                'status': 'FINAL',
                'diagnosis':
                    'Viêm xoang sàng mạn tính kèm theo viêm họng hạt kéo dài',
                'symptoms':
                    'Nghẹt mũi kéo dài nhiều tuần, đau đầu vùng trán và họng rát',
                'treatmentPlan':
                    'Uống thuốc kháng viêm theo toa, rửa mũi nước muối sinh lý 2 lần mỗi ngày',
                'notes':
                    'Tái khám sau 7 ngày hoặc ngay khi có biểu hiện sốt cao trở lại',
                'prescription': [
                  {
                    'medicineName':
                        'Amoxicillin + Clavulanic Acid 875mg/125mg',
                    'dosage': '1 viên mỗi lần',
                    'frequency': '2 lần/ngày sau ăn sáng tối',
                    'duration': '7 ngày liên tục',
                  }
                ],
              }
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
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(1.4),
          ),
          child: child!,
        ),
        home: RecordsPage(tokenProvider: _session, api: client),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(
      find.text('Viêm xoang sàng mạn tính kèm theo viêm họng hạt kéo dài'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết kết quả khám'), findsOneWidget);
    expect(
      find.text('Amoxicillin + Clavulanic Acid 875mg/125mg'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'loads more records at 360x640 with 1.4x text scale without overflow while loading more, appends page 2, and reuses doctor cache',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final page2Gate = Completer<void>();
    var doctorCalls = 0;

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/medical-records') {
          final page = request.url.queryParameters['page'] ?? '1';
          if (page == '1') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'rec-p1',
                    'appointmentId': 'appt-p1',
                    'doctorId': 'doc-shared',
                    'createdAt': '2026-03-10T08:00:00Z',
                    'status': 'FINAL',
                    'diagnosis': 'Hồ sơ trang 1',
                  },
                ],
                'page': 1,
                'limit': 1,
                'total': 2,
              },
            });
          }
          await page2Gate.future;
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-p2',
                  'appointmentId': 'appt-p2',
                  'doctorId': 'doc-shared',
                  'createdAt': '2026-03-09T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ trang 2',
                },
              ],
              'page': 2,
              'limit': 1,
              'total': 2,
            },
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-shared') {
          doctorCalls++;
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-shared', 'displayName': 'BS. Nguyễn An'},
          });
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: buildPatientTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(1.4),
          ),
          child: child!,
        ),
        home: RecordsPage(tokenProvider: _session, api: client),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Hồ sơ trang 1'), findsOneWidget);
    expect(doctorCalls, 1);

    await tester.scrollUntilVisible(
      find.text('Tải thêm hồ sơ'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Tải thêm hồ sơ'), findsOneWidget);

    await tester.tap(find.text('Tải thêm hồ sơ'));
    await tester.pump();

    expect(find.text('Đang tải thêm...'), findsOneWidget);
    expect(tester.takeException(), isNull);

    page2Gate.complete();
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.text('Hồ sơ trang 2'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Hồ sơ trang 2'), findsOneWidget);
    expect(find.text('BS. Nguyễn An'), findsWidgets);
    expect(find.text('Tải thêm hồ sơ'), findsNothing);
    expect(doctorCalls, 1);

    await tester.scrollUntilVisible(
      find.text('Lọc cục bộ trên 2 hồ sơ đã tải'),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Lọc cục bộ trên 2 hồ sơ đã tải'), findsOneWidget);
    expect(find.text('Hồ sơ trang 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'keeps existing list and shows inline error banner with retry when refresh fails',
      (tester) async {
    var phase = 0; // 0: initial success, 1: refresh 503, 2: retry success
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (phase == 0) {
          phase = 1;
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-1',
                  'appointmentId': 'appt-1',
                  'createdAt': '2026-03-01T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ ban đầu',
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }
        if (phase == 1) {
          phase = 2;
          return _jsonResponse({
            'success': false,
            'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Down'},
          }, statusCode: 503);
        }
        return _jsonResponse({
          'success': true,
          'data': {
            'items': [
              {
                'id': 'rec-2',
                'appointmentId': 'appt-2',
                'createdAt': '2026-03-02T08:00:00Z',
                'status': 'FINAL',
                'diagnosis': 'Hồ sơ mới nhất',
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
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hồ sơ ban đầu'), findsOneWidget);

    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ ban đầu'), findsOneWidget);
    expect(
      find.text('Hệ thống hồ sơ khám đang tạm gián đoạn. Vui lòng thử lại sau.'),
      findsOneWidget,
    );
    expect(find.text('Thử lại'), findsOneWidget);

    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ mới nhất'), findsOneWidget);
    expect(find.text('Thử lại'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'handles FormatException on invalid items payload and strips UUID displayName in doctor lookup',
      (tester) async {
    expect(
      cleanDoctorName('550e8400-e29b-41d4-a716-446655440000'),
      isNull,
    );
    expect(cleanDoctorName('  BS. Minh  '), 'BS. Minh');

    var phase = 0;
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/medical-records') {
          if (phase == 0) {
            phase = 1;
            return _jsonResponse({
              'success': true,
              'data': {
                'items': 'not-a-list',
                'page': 1,
                'limit': 20,
                'total': 0,
              },
            });
          }
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-uuid-doc',
                  'appointmentId': 'appt-1',
                  'doctorId': 'doc-uuid-name',
                  'createdAt': '2026-03-01T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Khám định kỳ',
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-uuid-name') {
          return _jsonResponse({
            'success': true,
            'data': {
              'id': 'doc-uuid-name',
              'displayName': '550e8400-e29b-41d4-a716-446655440000',
            },
          });
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pumpAndSettle();

    expect(find.byType(AppErrorState), findsOneWidget);
    expect(find.text('Dữ liệu hồ sơ khám không đúng định dạng.'), findsOneWidget);

    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();

    expect(find.text('Khám định kỳ'), findsOneWidget);
    expect(find.text('Bác sĩ phòng khám'), findsOneWidget);
    expect(
      find.textContaining('550e8400-e29b-41d4-a716-446655440000'),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'surfaces 401 session-expired inline error when doctor enrichment fails with 401',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/medical-records') {
          return _jsonResponse({
            'success': true,
            'data': {
              'items': [
                {
                  'id': 'rec-401',
                  'appointmentId': 'appt-401',
                  'doctorId': 'doc-401',
                  'createdAt': '2026-03-04T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ 401',
                },
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-401') {
          return _jsonResponse({
            'success': false,
            'error': {'code': 'UNAUTHORIZED', 'message': 'Expired'},
          }, statusCode: 401);
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ 401'), findsOneWidget);
    expect(
      find.text('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'load more continues enriching page 1 records whose doctor lookup was cancelled',
      (tester) async {
    final doc1Gate = Completer<void>();
    var doc1Calls = 0;

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/medical-records') {
          final page = request.url.queryParameters['page'] ?? '1';
          if (page == '1') {
            return _jsonResponse({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'rec-1',
                    'appointmentId': 'appt-1',
                    'doctorId': 'doc-slow',
                    'createdAt': '2026-03-05T08:00:00Z',
                    'status': 'FINAL',
                    'diagnosis': 'Hồ sơ 1',
                  },
                ],
                'page': 1,
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
                  'id': 'rec-2',
                  'appointmentId': 'appt-2',
                  'doctorId': 'doc-2',
                  'createdAt': '2026-03-04T08:00:00Z',
                  'status': 'FINAL',
                  'diagnosis': 'Hồ sơ 2',
                },
              ],
              'page': 2,
              'limit': 1,
              'total': 2,
            },
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-slow') {
          doc1Calls++;
          if (doc1Calls == 1) {
            await doc1Gate.future;
          }
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-slow', 'displayName': 'BS. Hoàng Dũng'},
          });
        }
        if (request.url.path == '/api/v1/doctors/doc-2') {
          return _jsonResponse({
            'success': true,
            'data': {'id': 'doc-2', 'displayName': 'BS. Thu Hà'},
          });
        }
        return _jsonResponse({'success': true, 'data': {}});
      }),
    );

    await tester.pumpWidget(
      _wrapWithTheme(RecordsPage(tokenProvider: _session, api: client)),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Hồ sơ 1'), findsOneWidget);
    expect(find.text('Tải thêm hồ sơ'), findsOneWidget);
    expect(doc1Calls, 1);

    // Trigger Load More while doc-slow lookup from page 1 is still pending
    await tester.tap(find.text('Tải thêm hồ sơ'));
    await tester.pumpAndSettle();

    // Unblock cancelled first lookup too
    doc1Gate.complete();
    await tester.pumpAndSettle();

    expect(doc1Calls, 2);
    expect(find.text('BS. Hoàng Dũng'), findsOneWidget);
    expect(find.text('BS. Thu Hà'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
