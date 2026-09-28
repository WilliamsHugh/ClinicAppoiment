import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
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
    const labels = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Hoàn thành'];

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
}
