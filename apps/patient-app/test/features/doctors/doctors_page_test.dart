import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/appointments/booking_selection.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_detail_page.dart';
import 'package:clinic_patient_app/features/doctors/doctors_page.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_page_header.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_search_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'doctor_test_fixtures.dart';

class _TokenProvider implements TokenProvider {
  @override
  Future<String?> getAccessToken() async => 'test-token';
}

void main() {
  testWidgets('Doctor screen requires an injected session', (tester) async {
    await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: DoctorDirectoryPage())));
    expect(find.textContaining('Không thể truy cập phiên đăng nhập'),
        findsOneWidget);
  });

  testWidgets(
      'Doctor directory lists specialties, doctors and available slots from Gateway',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _TokenProvider(),
      transport: MockClient((request) async {
        final path = request.url.path;
        final data = switch (path) {
          '/api/v1/specialties' => {
              'items': [
                {'id': 'specialty-1', 'name': 'Tim mạch'}
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/doctors' => {
              'items': [
                {
                  'id': 'doctor-1',
                  'specialtyId': 'specialty-1',
                  'displayName': 'Bác sĩ An',
                  'bio': 'Chuyên khoa tim mạch',
                  'isActive': true,
                }
              ],
              'page': 1,
              'limit': 20,
              'total': 1,
            },
          '/api/v1/doctors/doctor-1' => {
              'id': 'doctor-1',
              'specialtyId': 'specialty-1',
              'displayName': 'Bác sĩ An',
              'bio': 'Chuyên khoa tim mạch',
              'isActive': true,
            },
          '/api/v1/doctors/doctor-1/schedules' => {
              'items': <Object>[],
              'page': 1,
              'limit': 100,
              'total': 0,
            },
          '/api/v1/doctors/doctor-1/available-slots' => [
              {
                'startAt':
                    '${request.url.queryParameters['date']}T01:00:00.000Z',
                'endAt': '${request.url.queryParameters['date']}T01:30:00.000Z',
              },
            ],
          _ => throw StateError('Unexpected Doctor API path: $path'),
        };
        return http.Response(
          jsonEncode({'success': true, 'data': data}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: DoctorDirectoryPage(apiClient: client)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Tim mạch'), findsWidgets);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    await tester.tap(find.text('Bác sĩ An'));
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết bác sĩ'), findsOneWidget);
    await tester.scrollUntilVisible(find.byTooltip('Ngày tiếp theo'), 240,
        scrollable: find
            .descendant(
                of: find.byType(DoctorDetailPage),
                matching: find.byType(Scrollable))
            .first);
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    expect(find.text('08:00–08:30'), findsOneWidget);
  });

  testWidgets(
      'DoctorsPage renders ClinicPageHeader, Doctor Card details, hides single-page pagination, and avoids isActive/empty q',
      (tester) async {
    final requests = <http.Request>[];
    var openedNotifications = false;
    final client = doctorClient(requests: requests);

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: DoctorsPage(
        tokenProvider: _TokenProvider(),
        apiClient: client,
        onOpenNotifications: () => openedNotifications = true,
        onBookingSelection: (BookingSelection _) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
    expect(find.byType(ClinicSearchField), findsNWidgets(2));
    expect(find.text('Trang 1 / 1'), findsNothing);

    // Doctor Card elements
    expect(find.text('A'), findsOneWidget);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(find.text('Tim mạch'), findsNWidgets(2)); // chip + card badge
    expect(find.text('Tư vấn và chăm sóc sức khỏe tim mạch.'), findsOneWidget);
    expect(find.text('Đang nhận lịch'), findsOneWidget);
    expect(find.text('Đặt lịch khám'), findsOneWidget);

    // Notification bell callback
    await tester.tap(find.byTooltip('Thông báo'));
    await tester.pumpAndSettle();
    expect(openedNotifications, isTrue);

    // API Contract v2 query rules
    for (final req in requests) {
      expect(req.url.path, isNot(contains('time-offs')));
      expect(req.url.queryParameters.containsKey('isActive'), isFalse);
      expect(req.url.queryParameters.containsKey('q'), isFalse);
    }
  });

  testWidgets(
      'directory shows pagination only when total > limit, filters by chip, and clears search without double fetch',
      (tester) async {
    final requests = <http.Request>[];
    final client = doctorClient(
      requests: requests,
      override: (request) async {
        if (request.url.path == '/api/v1/specialties') {
          final q = request.url.queryParameters['q'];
          final items = q == 'Nhi'
              ? [
                  {'id': 'specialty-2', 'name': 'Nhi khoa'}
                ]
              : [
                  {'id': 'specialty-1', 'name': 'Tim mạch'},
                  {'id': 'specialty-2', 'name': 'Nhi khoa'},
                ];
          return success(pageData(items, limit: 20, total: 25));
        }
        if (request.url.path == '/api/v1/doctors') {
          final q = request.url.queryParameters['q'];
          if (q == 'không có') {
            return success(pageData([], limit: 20, total: 0));
          }
          return success(pageData([doctorData], limit: 20, total: 1));
        }
        return null;
      },
    );

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: Scaffold(body: DoctorDirectoryPage(apiClient: client)),
    ));
    await tester.pumpAndSettle();

    // Only specialty pagination (>20) is visible; doctor pagination (total=1<=20) is hidden.
    expect(find.text('Trang 1 / 2'), findsOneWidget);

    // Select 'Tim mạch' chip -> sends specialtyId.
    await tester.tap(find.widgetWithText(ChoiceChip, 'Tim mạch'));
    await tester.pumpAndSettle();
    expect(
      requests
          .where((r) => r.url.path == '/api/v1/doctors')
          .last
          .url
          .queryParameters['specialtyId'],
      'specialty-1',
    );

    // Search specialty for 'Nhi' -> active selected chip 'Tim mạch' remains visible in strip.
    await tester.enterText(find.byType(TextField).first, 'Nhi');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ChoiceChip, 'Tim mạch'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Nhi khoa'), findsOneWidget);

    // Search doctor then clear using ClinicSearchField clear icon -> only 1 doctor request with no 'q'.
    await tester.enterText(find.byType(TextField).last, 'không có');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Chưa có bác sĩ'), findsOneWidget);

    final countBeforeClear = requests.length;
    await tester.tap(find.byTooltip('Xóa tìm kiếm').last);
    await tester.pumpAndSettle();
    // Expect exactly 1 pair (specialties + doctors) triggered by clear, not 2!
    expect(requests.length - countBeforeClear, 2);
    expect(
      requests
          .where((r) => r.url.path == '/api/v1/doctors')
          .last
          .url
          .queryParameters
          .containsKey('q'),
      isFalse,
    );
    expect(find.text('Bác sĩ An'), findsOneWidget);
  });

  testWidgets('DoctorsPage fits 360x740 at 1.4x text scale without overflow',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: DoctorsPage(
        tokenProvider: _TokenProvider(),
        apiClient: doctorClient(),
        onOpenNotifications: () {},
        onBookingSelection: (_) {},
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Đặt lịch khám'), findsOneWidget);
  });

  testWidgets(
      'DoctorsPage fits 360x740 at 1.4x with inactive doctor and long texts without overflow',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final client = doctorClient(
      override: (request) async {
        if (request.url.path == '/api/v1/specialties') {
          return success(pageData([
            {
              'id': 'specialty-long',
              'name': 'Nội tổng quát & Tim mạch phòng ngừa chuyên sâu',
            }
          ], limit: 20));
        }
        if (request.url.path == '/api/v1/doctors') {
          return success(pageData([
            {
              'id': 'doctor-inactive-long',
              'specialtyId': 'specialty-long',
              'displayName': 'PGS.TS.BS CKII Nguyễn Trần Hoàng Minh Khang',
              'bio':
                  'Chuyên gia đầu ngành với hơn 25 năm kinh nghiệm chẩn đoán và điều trị bệnh lý tim mạch phức tạp cho người lớn và trẻ em.',
              'isActive': false,
            }
          ], limit: 20));
        }
        return null;
      },
    );

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: DoctorsPage(
        tokenProvider: _TokenProvider(),
        apiClient: client,
        onOpenNotifications: () {},
        onBookingSelection: (_) {},
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Tạm ngưng nhận lịch'), findsOneWidget);
    expect(find.text('Đặt lịch khám'), findsOneWidget);
  });
}
