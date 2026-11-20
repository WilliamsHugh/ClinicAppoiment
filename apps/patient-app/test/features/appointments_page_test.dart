import 'dart:async';
import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
import 'package:clinic_patient_app/features/appointments/widgets/appointment_card.dart';
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

void main() {
  testWidgets('appointment tabs fill the available width evenly',
      (tester) async {
    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((_) async => http.Response(
            jsonEncode({
              'success': true,
              'data': {'items': <Object>[], 'page': 1, 'limit': 20, 'total': 0},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )),
      baseUrl: 'http://gateway.test',
    );

    await tester.pumpWidget(MaterialApp(
      home: AppointmentsPage(tokenProvider: _session, api: client),
    ));
    await tester.pumpAndSettle();

    final tabBar = tester.widget<TabBar>(find.byType(TabBar));
    final tabBarRect = tester.getRect(find.byType(TabBar));
    const labels = ['Sắp tới', 'Lịch sử', 'Đã hủy'];

    expect(tabBar.isScrollable, isFalse);
    expect(tabBarRect.left, closeTo(0, 0.1));
    expect(tabBarRect.right, closeTo(800, 0.1));
    for (var index = 0; index < labels.length; index++) {
      final expectedCenter =
          tabBarRect.left + (tabBarRect.width / labels.length) * (index + 0.5);
      expect(
        tester.getCenter(find.text(labels[index])).dx,
        closeTo(expectedCenter, 0.1),
      );
    }
  });

  testWidgets(
      'ClinicPageHeader and RefreshIndicator remain visible across loading, empty, error and data states',
      (tester) async {
    final firstLoad = Completer<http.Response>();
    var mode = 'loading';
    final futureDay = DateTime.now().add(const Duration(days: 2));
    final dayStr =
        '${futureDay.year.toString().padLeft(4, '0')}-${futureDay.month.toString().padLeft(2, '0')}-${futureDay.day.toString().padLeft(2, '0')}';

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        if (request.url.path == '/api/v1/appointments') {
          if (mode == 'loading') return firstLoad.future;
          if (mode == 'error') {
            return http.Response(
              jsonEncode({
                'success': false,
                'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'down'}
              }),
              503,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          if (mode == 'empty') {
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {'items': <Object>[], 'page': 1, 'limit': 100, 'total': 0}
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'appt-1',
                    'doctorId': 'doc-1',
                    'status': 'CONFIRMED',
                    'scheduledStartAt': '${dayStr}T01:00:00.000Z',
                    'scheduledEndAt': '${dayStr}T01:30:00.000Z',
                    'reason': 'Khám định kỳ',
                    'doctorSummary': {'id': 'doc-1', 'displayName': 'Bác sĩ Bình'},
                  }
                ],
                'page': 1,
                'limit': 100,
                'total': 1,
              }
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({'success': true, 'data': {}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
      baseUrl: 'http://gateway.test',
    );

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: AppointmentsPage(tokenProvider: _session, api: client),
    ));
    await tester.pump();
    // 1) Loading state
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.text('Lịch hẹn'), findsOneWidget);

    // 2) Empty state
    mode = 'empty';
    firstLoad.complete(http.Response(
      jsonEncode({
        'success': true,
        'data': {'items': <Object>[], 'page': 1, 'limit': 100, 'total': 0}
      }),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    ));
    await tester.pumpAndSettle();
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.text('Chưa có lịch hẹn'), findsOneWidget);

    // 3) Error state
    mode = 'error';
    await tester.tap(find.byTooltip('Tải lại lịch hẹn'));
    await tester.pumpAndSettle();
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.text('Thử lại'), findsOneWidget);

    // 4) Data state
    mode = 'data';
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.byType(ClinicPageHeader), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.byType(AppointmentCard), findsOneWidget);
  });

  testWidgets(
      'ClinicSearchField filters locally by doctor, specialty, and reason without sending q to network',
      (tester) async {
    final requests = <http.Request>[];
    final futureDay = DateTime.now().add(const Duration(days: 2));
    final dayStr =
        '${futureDay.year.toString().padLeft(4, '0')}-${futureDay.month.toString().padLeft(2, '0')}-${futureDay.day.toString().padLeft(2, '0')}';

    final client = ClinicApiClient(
      tokenProvider: _session,
      transport: MockClient((request) async {
        requests.add(request);
        if (request.url.path == '/api/v1/appointments') {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {
                    'id': 'appt-1',
                    'doctorId': 'doc-1',
                    'status': 'CONFIRMED',
                    'scheduledStartAt': '${dayStr}T01:00:00.000Z',
                    'scheduledEndAt': '${dayStr}T01:30:00.000Z',
                    'reason': 'Đau ngực nhẹ',
                    'doctorSummary': {'id': 'doc-1', 'displayName': 'Bác sĩ An'},
                    'specialtySummary': {'id': 'spec-1', 'name': null},
                  },
                  {
                    'id': 'appt-2',
                    'doctorId': 'doc-2',
                    'status': 'PENDING',
                    'scheduledStartAt': '${dayStr}T03:00:00.000Z',
                    'scheduledEndAt': '${dayStr}T03:30:00.000Z',
                    'reason': 'Khám da liễu định kỳ',
                    'doctorSummary': {'id': 'doc-2', 'displayName': 'Bác sĩ Chi'},
                    'specialtySummary': {'id': 'spec-2', 'name': null},
                  },
                ],
                'page': 1,
                'limit': 100,
                'total': 2,
              }
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (request.url.path == '/api/v1/specialties') {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'items': [
                  {'id': 'spec-1', 'name': 'Tim mạch'},
                  {'id': 'spec-2', 'name': 'Da liễu'},
                ],
                'page': 1,
                'limit': 100,
                'total': 2,
              }
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({'success': true, 'data': {}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
      baseUrl: 'http://gateway.test',
    );

    await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: AppointmentsPage(tokenProvider: _session, api: client),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(ClinicSearchField), findsOneWidget);
    expect(find.byType(AppointmentCard), findsNWidgets(2));
    final initialCount = requests.length;

    // Filter by doctor name
    await tester.enterText(find.byType(TextField), 'Bác sĩ Chi');
    await tester.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsOneWidget);
    expect(
        find.descendant(
            of: find.byType(AppointmentCard), matching: find.text('Bác sĩ Chi')),
        findsOneWidget);

    // Filter by specialty
    await tester.enterText(find.byType(TextField), 'Tim mạch');
    await tester.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsOneWidget);
    expect(find.text('Bác sĩ An'), findsOneWidget);

    // Filter by reason
    await tester.enterText(find.byType(TextField), 'da liễu');
    await tester.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsOneWidget);

    // No matching result -> distinct search empty state + Xóa tìm kiếm
    await tester.enterText(find.byType(TextField), 'Không tồn tại');
    await tester.pumpAndSettle();
    expect(find.text('Không tìm thấy lịch hẹn phù hợp'), findsOneWidget);
    expect(find.text('Chưa có lịch hẹn'), findsNothing);

    await tester.tap(find.text('Xóa tìm kiếm'));
    await tester.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsNWidgets(2));
    expect(requests.length, initialCount);
  });
}
