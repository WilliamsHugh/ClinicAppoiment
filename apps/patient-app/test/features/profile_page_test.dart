import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_patient_app/features/users/profile_page.dart';

void main() {
  testWidgets('renders ProfilePage with header and section cards',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ProfilePage(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hồ sơ cá nhân'), findsOneWidget);
    expect(find.text('Thông tin liên hệ'), findsOneWidget);
    expect(find.text('Hồ sơ y tế & BHYT'), findsOneWidget);
    expect(find.text('Chỉnh sửa thông tin hồ sơ'), findsOneWidget);
  });
}
