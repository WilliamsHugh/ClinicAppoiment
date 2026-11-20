import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
import 'package:clinic_patient_app/shared/widgets/horizontal_date_strip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> tapVisible(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> scrollAndTapIn(
  WidgetTester tester,
  Finder scope,
  Finder target, {
  double delta = 180,
}) async {
  final scrollables = find.descendant(
    of: scope,
    matching: find.byType(Scrollable),
  );
  if (scrollables.evaluate().isNotEmpty && target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      target,
      delta,
      scrollable: scrollables.first,
    );
    await tester.pumpAndSettle();
  }
  await tapVisible(tester, target.first);
}

Future<void> tapConfirmBooking(WidgetTester tester) async {
  final sheet = find.byType(BookingConfirmationSheet);
  final confirmBtn = find.descendant(
    of: sheet,
    matching: find.widgetWithText(FilledButton, 'Xác nhận đặt lịch'),
  );
  await scrollAndTapIn(tester, sheet, confirmBtn);
}

Future<void> tapNavTab(WidgetTester tester, String label) async {
  final target = find.descendant(
    of: find.byType(NavigationBar),
    matching: find.text(label),
  );
  expect(target, findsOneWidget);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

int selectedNavIndex(WidgetTester tester) =>
    tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex;

void expectShellIntegrity(WidgetTester tester) {
  expect(ClinicColors.primary, const Color(0xFF2D5BFF));
  expect(ClinicColors.primarySoft, const Color(0xFFE9EEFF));
  expect(ClinicColors.primaryDark, const Color(0xFF1E4FE0));
  final navBarFinder = find.byType(NavigationBar);
  expect(navBarFinder, findsOneWidget);
  final navBar = tester.widget<NavigationBar>(navBarFinder);
  expect(navBar.indicatorColor, ClinicColors.primarySoft);

  final shellScaffold = tester.widget<Scaffold>(
    find.ancestor(of: navBarFinder, matching: find.byType(Scaffold)).first,
  );
  expect(shellScaffold.appBar, isNull);
  expect(find.byType(AppBar).evaluate().length, lessThanOrEqualTo(1));

  final context = tester.element(navBarFinder);
  expect(Theme.of(context).colorScheme.primary, ClinicColors.primary);
}

Future<void> enterDoctorSearch(WidgetTester tester, String query) async {
  final byDoctorLabel = find.byWidgetPredicate((widget) {
    if (widget is! TextField) return false;
    final label = widget.decoration?.labelText?.toLowerCase() ?? '';
    final hint = widget.decoration?.hintText?.toLowerCase() ?? '';
    return label.contains('bác sĩ') || hint.contains('bác sĩ');
  });
  final field = byDoctorLabel.evaluate().isNotEmpty
      ? byDoctorLabel.first
      : find.byType(TextField).last;
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.enterText(field, query);
  await tester.testTextInput.receiveAction(TextInputAction.search);
  await tester.pumpAndSettle();
}

Future<void> selectClinicDate(
  WidgetTester tester,
  Finder scope,
  String targetClinicYmd,
) async {
  final nextBtn = find.descendant(
    of: scope,
    matching: find.byTooltip('Ngày tiếp theo'),
  );
  final prevBtn = find.descendant(
    of: scope,
    matching: find.byTooltip('Ngày trước'),
  );
  final strip = find.descendant(
    of: scope,
    matching: find.byType(HorizontalDateStrip),
  );

  // Cuộn tới điều khiển ngày nếu đang nằm dưới màn hình (trên DoctorDetailPage)
  if (nextBtn.evaluate().isEmpty && strip.evaluate().isEmpty) {
    final scrollables = find.descendant(
      of: scope,
      matching: find.byType(Scrollable),
    );
    if (scrollables.evaluate().isNotEmpty) {
      for (var i = 0; i < 6; i++) {
        await tester.drag(scrollables.first, const Offset(0, -240));
        await tester.pumpAndSettle();
        if (nextBtn.evaluate().isNotEmpty || strip.evaluate().isNotEmpty) {
          break;
        }
      }
    }
  }

  if (nextBtn.evaluate().isNotEmpty) {
    final dateTextFinder = find.descendant(
      of: scope,
      matching: find.byWidgetPredicate(
        (w) =>
            w is Text &&
            w.data != null &&
            RegExp(r'Ngày khám:\s*\d{4}-\d{2}-\d{2}').hasMatch(w.data!),
      ),
    );
    if (dateTextFinder.evaluate().isNotEmpty) {
      final raw = tester.widget<Text>(dateTextFinder.first).data!;
      final match = RegExp(r'(\d{4}-\d{2}-\d{2})').firstMatch(raw)!;
      final current = DateTime.parse(match.group(1)!);
      final target = DateTime.parse(targetClinicYmd);
      final delta = target.difference(current).inDays;
      if (delta > 0) {
        for (var i = 0; i < delta; i++) {
          await tapVisible(tester, nextBtn.first);
        }
      } else if (delta < 0 && prevBtn.evaluate().isNotEmpty) {
        for (var i = 0; i < -delta; i++) {
          await tapVisible(tester, prevBtn.first);
        }
      }
      return;
    }
    await tapVisible(tester, nextBtn.first);
    return;
  }

  expect(strip, findsOneWidget);

  final parts = targetClinicYmd.split('-');
  final month = int.parse(parts[1]);
  final day = int.parse(parts[2]);
  final targetPrefix = 'Ngày $day tháng $month,';

  final bySemantics = find.descendant(
    of: strip,
    matching: find.bySemanticsLabel(RegExp('^$targetPrefix')),
  );
  if (bySemantics.evaluate().isNotEmpty) {
    await tapVisible(tester, bySemantics.first);
    return;
  }

  final scrollable = find.descendant(
    of: strip,
    matching: find.byType(Scrollable),
  );
  final dayText = find.descendant(
    of: strip,
    matching: find.text('$day'),
  );
  if (scrollable.evaluate().isNotEmpty) {
    await tester.scrollUntilVisible(
      dayText,
      100,
      scrollable: scrollable.first,
    );
  }
  await tapVisible(tester, dayText.first);
}

Future<void> selectRescheduleSlot(
  WidgetTester tester,
  Finder sheetScope,
  String slotLabel,
) async {
  final dropdown = find.descendant(
    of: sheetScope,
    matching: find.byType(DropdownButton<String>),
  );
  if (dropdown.evaluate().isNotEmpty) {
    await tapVisible(tester, dropdown.first);
    await tapVisible(tester, find.text(slotLabel).last);
    return;
  }

  final slotTarget = find.descendant(
    of: sheetScope,
    matching: find.text(slotLabel),
  );
  await scrollAndTapIn(tester, sheetScope, slotTarget);
}

Finder findMarkReadButton() {
  final oldLabel = find.text('Đã đọc');
  if (oldLabel.evaluate().isNotEmpty) return oldLabel;
  return find.text('Đánh dấu đã đọc');
}

Future<void> signOutFromProfile(WidgetTester tester) async {
  final tooltipLogout = find.byTooltip('Đăng xuất');
  if (tooltipLogout.evaluate().isNotEmpty) {
    await tapVisible(tester, tooltipLogout.first);
  } else {
    await tapVisible(tester, find.text('Đăng xuất').last);
  }

  final dialog = find.byType(AlertDialog);
  if (dialog.evaluate().isNotEmpty) {
    final confirmInsideDialog = find.descendant(
      of: dialog.last,
      matching: find.widgetWithText(FilledButton, 'Đăng xuất'),
    );
    if (confirmInsideDialog.evaluate().isNotEmpty) {
      await tester.tap(confirmInsideDialog.first);
    } else {
      final confirmText = find.descendant(
        of: dialog.last,
        matching: find.textContaining('Đăng xuất'),
      );
      await tester.tap(confirmText.last);
    }
    await tester.pumpAndSettle();
  }
}

void expectCheckedInStatusVisible() {
  final hasOld = find.text('Đã check-in').evaluate().isNotEmpty;
  final hasNew = find.text('Đã tiếp đón').evaluate().isNotEmpty;
  expect(
    hasOld || hasNew,
    isTrue,
    reason: 'Kỳ vọng hiển thị trạng thái Đã check-in hoặc Đã tiếp đón',
  );
}
