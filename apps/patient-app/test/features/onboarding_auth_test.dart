import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_patient_app/features/auth/auth_page.dart';
import 'package:clinic_patient_app/features/onboarding/welcome_page.dart';

void main() {
  testWidgets(
    'WelcomePage displays 3 onboarding slides with dot indicators and Bắt đầu navigates to AuthPage',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home: WelcomePage()));
      await tester.pumpAndSettle();

      expect(find.text('Đặt lịch khám dễ dàng'), findsOneWidget);
      expect(find.byKey(const Key('onboarding-dot-0')), findsOneWidget);
      expect(find.byKey(const Key('onboarding-dot-1')), findsOneWidget);
      expect(find.byKey(const Key('onboarding-dot-2')), findsOneWidget);

      await tester.tap(find.byKey(const Key('onboarding-next-button')));
      await tester.pumpAndSettle();
      expect(find.text('Theo dõi lịch hẹn'), findsOneWidget);

      await tester.tap(find.byKey(const Key('onboarding-next-button')));
      await tester.pumpAndSettle();
      expect(find.text('Hồ sơ sức khỏe của bạn'), findsOneWidget);
      expect(find.text('Bắt đầu'), findsOneWidget);

      await tester.tap(find.byKey(const Key('onboarding-start-button')));
      await tester.pumpAndSettle();
      expect(find.byType(AuthPage), findsOneWidget);
    },
  );

  testWidgets(
    'AuthPage validates email and >=8 char password in real-time and switches to Login on registration success',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: AuthPage(
            onLogin: (_, __) async {},
            onRegister: (_, __, ___) async => false,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Real-time validation on Login tab
      final loginFields = find.byType(TextFormField);
      await tester.enterText(loginFields.at(0), 'invalid-email');
      await tester.enterText(loginFields.at(1), 'short');
      await tester.pump();

      expect(find.text('Email không hợp lệ'), findsOneWidget);
      expect(find.text('Mật khẩu phải có ít nhất 8 ký tự'), findsOneWidget);

      // Switch to Register tab
      await tester.tap(find.text('Đăng ký'));
      await tester.pumpAndSettle();

      final registerFields = find.byType(TextFormField);
      await tester.enterText(registerFields.at(0), 'Nguyễn Văn A');
      await tester.enterText(registerFields.at(1), 'patient@example.com');
      await tester.enterText(registerFields.at(2), 'password123');
      await tester.enterText(registerFields.at(3), 'password123');
      await tester.tap(find.widgetWithText(FilledButton, 'Đăng ký'));
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('auth-register-success-banner')),
        findsOneWidget,
      );
      expect(
        find.text(
          'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.',
        ),
        findsOneWidget,
      );
    },
  );
}
