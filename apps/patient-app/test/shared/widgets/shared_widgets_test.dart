import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/shared/widgets/appointment_status_chip.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_page_header.dart';
import 'package:clinic_patient_app/shared/widgets/clinic_search_field.dart';
import 'package:clinic_patient_app/shared/widgets/horizontal_date_strip.dart';
import 'package:clinic_patient_app/shared/widgets/pagination_controls.dart';
import 'package:clinic_patient_app/shared/widgets/qr_ticket_card.dart';
import 'package:clinic_patient_app/shared/widgets/slot_grid_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';

void main() {
  group('AppointmentStatusChip (M3-UI-LEAD-003)', () {
    testWidgets('renders correct labels for each appointment status', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                AppointmentStatusChip(status: 'PENDING'),
                AppointmentStatusChip(status: 'CONFIRMED'),
                AppointmentStatusChip(status: 'CHECKED_IN'),
                AppointmentStatusChip(status: 'COMPLETED'),
                AppointmentStatusChip(status: 'CANCELLED'),
                AppointmentStatusChip(status: 'NO_SHOW'),
              ],
            ),
          ),
        ),
      );

      expect(find.text('Chờ xác nhận'), findsOneWidget);
      expect(find.text('Đã xác nhận'), findsOneWidget);
      expect(find.text('Đã tiếp đón'), findsOneWidget);
      expect(find.text('Hoàn thành'), findsOneWidget);
      expect(find.text('Đã hủy'), findsOneWidget);
      expect(find.text('Không đến'), findsOneWidget);
    });
  });

  group('HorizontalDateStrip (M3-UI-LEAD-003)', () {
    testWidgets('renders 14 days and triggers selection on tap', (tester) async {
      DateTime? selected;
      final today = DateTime(2026, 10, 20);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: HorizontalDateStrip(
              startDate: today,
              selectedDate: today,
              daysCount: 7,
              onDateSelected: (d) => selected = d,
            ),
          ),
        ),
      );

      expect(find.text('20'), findsOneWidget);
      expect(find.text('21'), findsOneWidget);

      await tester.tap(find.text('21'));
      await tester.pump();

      expect(selected, isNotNull);
      expect(selected!.day, 21);
    });

    testWidgets(
        'renders and selects date without overflow at 360x740 @ 1.4x without text clamp',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      expect(HorizontalDateStrip.tileWidth, 58.0);
      expect(HorizontalDateStrip.separatorWidth, 8.0);
      expect(HorizontalDateStrip.horizontalPadding, 16.0);

      DateTime? selected;
      final today = DateTime(2026, 10, 20);

      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(1.4),
            ),
            child: child!,
          ),
          home: Scaffold(
            body: HorizontalDateStrip(
              startDate: today,
              selectedDate: today,
              daysCount: 14,
              onDateSelected: (d) => selected = d,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      await tester.tap(find.text('22'));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(selected?.day, 22);
    });
  });

  group('SlotGridSelector (M3-UI-LEAD-003)', () {
    testWidgets('groups into morning and afternoon in UTC+7 and triggers callback on available slot',
        (tester) async {
      SlotOption? chosen;
      // 02:00 UTC == 09:00 VN (Buổi sáng)
      final morningSlot = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 2, 0),
        endAt: DateTime.utc(2026, 10, 20, 2, 30),
        isAvailable: true,
      );
      // 07:00 UTC == 14:00 VN (Buổi chiều)
      final afternoonSlot = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 7, 0),
        endAt: DateTime.utc(2026, 10, 20, 7, 30),
        isAvailable: false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SlotGridSelector(
              slots: [morningSlot, afternoonSlot],
              selectedSlot: null,
              onSlotSelected: (slot) => chosen = slot,
            ),
          ),
        ),
      );

      expect(find.text('Buổi sáng'), findsOneWidget);
      expect(find.text('Buổi chiều'), findsOneWidget);
      expect(find.text('09:00–09:30'), findsOneWidget);
      expect(find.text('14:00–14:30'), findsOneWidget);

      // Tap available morning slot
      await tester.tap(find.text('09:00–09:30'));
      await tester.pump();
      expect(chosen, equals(morningSlot));

      // Tap unavailable afternoon slot (should not trigger)
      chosen = null;
      await tester.tap(find.text('14:00–14:30'));
      await tester.pump();
      expect(chosen, isNull);
    });

    testWidgets('handles UTC to UTC+7 noon/midnight boundaries and selected state',
        (tester) async {
      // 04:30Z -> 11:30 VN (Buổi sáng)
      final lateMorning = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 4, 30),
        endAt: DateTime.utc(2026, 10, 20, 5, 0),
      );
      // 05:00Z -> 12:00 VN (Buổi chiều)
      final noon = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 5, 0),
        endAt: DateTime.utc(2026, 10, 20, 5, 30),
      );
      // 06:00Z -> 13:00 VN (Buổi chiều)
      final earlyAfternoon = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 6, 0),
        endAt: DateTime.utc(2026, 10, 20, 6, 30),
      );
      // 17:30Z -> 00:30 VN next day (Buổi sáng)
      final midnightCross = SlotOption(
        startAt: DateTime.utc(2026, 10, 20, 17, 30),
        endAt: DateTime.utc(2026, 10, 20, 18, 0),
        isAvailable: false,
      );

      final selectedLocal = SlotOption(
        startAt: lateMorning.startAt.toLocal(),
        endAt: lateMorning.endAt.toLocal(),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SlotGridSelector(
                slots: [lateMorning, noon, earlyAfternoon, midnightCross],
                selectedSlot: selectedLocal,
                onSlotSelected: (_) {},
              ),
            ),
          ),
        ),
      );

      expect(find.text('11:30–12:00'), findsOneWidget);
      expect(find.text('12:00–12:30'), findsOneWidget);
      expect(find.text('13:00–13:30'), findsOneWidget);
      expect(find.text('00:30–01:00'), findsOneWidget);

      final selectedText = tester.widget<Text>(find.text('11:30–12:00'));
      expect(selectedText.style?.color, Colors.white);

      final unavailableText = tester.widget<Text>(find.text('00:30–01:00'));
      expect(unavailableText.style?.decoration, TextDecoration.lineThrough);
    });

    testWidgets('renders empty message when no slots available', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SlotGridSelector(
              slots: const [],
              selectedSlot: null,
              onSlotSelected: (_) {},
              emptyMessage: 'Hôm nay bác sĩ không có lịch',
            ),
          ),
        ),
      );

      expect(find.text('Hôm nay bác sĩ không có lịch'), findsOneWidget);
    });
  });

  group('QrTicketCard (M3-UI-LEAD-003)', () {
    testWidgets('renders ticket with doctor name, time, status, and QR image',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: QrTicketCard(
                appointmentId: 'appt-uuid-12345',
                doctorName: 'BS. CKII Nguyễn Văn Bình',
                specialtyName: 'Tim mạch',
                dateTimeLabel: '20/10/2026 · 09:00–09:30',
                status: 'CONFIRMED',
              ),
            ),
          ),
        ),
      );

      expect(find.text('BS. CKII Nguyễn Văn Bình'), findsOneWidget);
      expect(find.text('Tim mạch'), findsOneWidget);
      expect(find.text('20/10/2026 · 09:00–09:30'), findsOneWidget);
      expect(find.text('Đã xác nhận'), findsOneWidget);
      expect(find.byType(QrImageView), findsOneWidget);
    });
  });

  group('ClinicPageHeader', () {
    testWidgets('renders gradient, light overlay style, SafeArea, and slots',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ClinicPageHeader(
              title: 'Đội ngũ bác sĩ',
              subtitle: 'Tìm kiếm chuyên khoa và đặt lịch khám',
              trailing: IconButton(
                tooltip: 'Thông báo',
                onPressed: () {},
                icon: const Icon(Icons.notifications_outlined),
              ),
              bottom: const SizedBox(
                height: 36,
                child: Text('Vùng bộ lọc'),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Đội ngũ bác sĩ'), findsOneWidget);
      expect(
        find.text('Tìm kiếm chuyên khoa và đặt lịch khám'),
        findsOneWidget,
      );
      expect(find.byTooltip('Thông báo'), findsOneWidget);
      expect(find.text('Vùng bộ lọc'), findsOneWidget);

      final safeArea = tester.widget<SafeArea>(find.byType(SafeArea));
      expect(safeArea.bottom, isFalse);

      final region = tester.widget<AnnotatedRegion<SystemUiOverlayStyle>>(
        find.byType(AnnotatedRegion<SystemUiOverlayStyle>),
      );
      expect(region.value, SystemUiOverlayStyle.light);

      final decorated = tester.widget<DecoratedBox>(find.byType(DecoratedBox));
      final decoration = decorated.decoration as BoxDecoration;
      final gradient = decoration.gradient as LinearGradient;
      expect(
        gradient.colors,
        const [ClinicColors.primary, ClinicColors.primaryDark],
      );
    });

    testWidgets('renders minimal title-only and avoids overflow at 360px @ 1.4',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ClinicPageHeader(title: 'Cá nhân'),
          ),
        ),
      );
      expect(find.text('Cá nhân'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(1.4),
            ),
            child: child!,
          ),
          home: Scaffold(
            body: ClinicPageHeader(
              title: 'Lịch sử hồ sơ khám bệnh toàn diện',
              subtitle:
                  'Xem chẩn đoán, đơn thuốc và kết quả khám gần đây của bạn',
              trailing: IconButton(
                onPressed: () {},
                icon: const Icon(Icons.refresh),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('subtitle meets WCAG AA (>= 4.5:1) contrast on header gradient',
        (tester) async {
      const subtitleText = 'Tìm kiếm chuyên khoa và đặt lịch khám';
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ClinicPageHeader(
              title: 'Đội ngũ bác sĩ',
              subtitle: subtitleText,
            ),
          ),
        ),
      );

      final subtitleWidget = tester.widget<Text>(find.text(subtitleText));
      final fgColor = subtitleWidget.style?.color;
      expect(fgColor, isNotNull);

      double contrastRatio(Color foreground, Color background) {
        final blended = Color.alphaBlend(foreground, background);
        final l1 = blended.computeLuminance();
        final l2 = background.computeLuminance();
        final lighter = l1 > l2 ? l1 : l2;
        final darker = l1 > l2 ? l2 : l1;
        return (lighter + 0.05) / (darker + 0.05);
      }

      expect(
        contrastRatio(fgColor!, ClinicColors.primary),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrastRatio(fgColor, ClinicColors.primaryDark),
        greaterThanOrEqualTo(4.5),
      );
    });
  });

  group('ClinicSearchField', () {
    testWidgets('shows and clears search text with close button and callbacks',
        (tester) async {
      final changes = <String>[];
      String? submitted;
      var cleared = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ClinicSearchField(
              hintText: 'Tìm tên bác sĩ...',
              semanticsLabel: 'Ô tìm bác sĩ',
              autofocus: true,
              onChanged: changes.add,
              onSubmitted: (val) => submitted = val,
              onClear: () => cleared = true,
            ),
          ),
        ),
      );

      expect(find.text('Tìm tên bác sĩ...'), findsOneWidget);
      expect(find.byIcon(Icons.search), findsOneWidget);
      expect(find.byTooltip('Xóa tìm kiếm'), findsNothing);

      await tester.enterText(find.byType(TextField), 'Bác sĩ An');
      await tester.pump();

      expect(changes, ['Bác sĩ An']);
      expect(find.byTooltip('Xóa tìm kiếm'), findsOneWidget);

      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      expect(submitted, 'Bác sĩ An');

      await tester.tap(find.byTooltip('Xóa tìm kiếm'));
      await tester.pump();

      expect(cleared, isTrue);
      expect(changes.last, '');
      expect(find.byTooltip('Xóa tìm kiếm'), findsNothing);
    });

    testWidgets('supports external controller without disposing it on unmount',
        (tester) async {
      final controller = TextEditingController(text: 'Tim mạch');
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ClinicSearchField(controller: controller),
          ),
        ),
      );

      expect(find.byTooltip('Xóa tìm kiếm'), findsOneWidget);

      await tester.pumpWidget(const MaterialApp(home: Scaffold()));
      expect(() => controller.text = 'Nội khoa', returnsNormally);
    });
  });

  group('PaginationControls', () {
    testWidgets('hides when single page or invalid limit', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                PaginationControls(
                  page: 1,
                  limit: 20,
                  total: 0,
                  onPageChanged: (_) {},
                ),
                PaginationControls(
                  page: 1,
                  limit: 20,
                  total: 20,
                  onPageChanged: (_) {},
                ),
                PaginationControls(
                  page: 1,
                  limit: 0,
                  total: 10,
                  onPageChanged: (_) {},
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.textContaining('Trang '), findsNothing);
      expect(find.byTooltip('Trang trước'), findsNothing);
      expect(find.byTooltip('Trang sau'), findsNothing);
    });

    testWidgets('renders and triggers page changes when total > limit',
        (tester) async {
      int? changedTo;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PaginationControls(
              page: 1,
              limit: 20,
              total: 45,
              onPageChanged: (next) => changedTo = next,
            ),
          ),
        ),
      );

      expect(find.text('Trang 1 / 3'), findsOneWidget);
      final prevButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.chevron_left),
      );
      expect(prevButton.onPressed, isNull);

      await tester.tap(find.byTooltip('Trang sau'));
      await tester.pump();
      expect(changedTo, 2);
    });

    testWidgets(
        'renders multi-digit pages without overflow at 360x740 @ 1.4x with 16px horizontal padding',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(1.4),
            ),
            child: child!,
          ),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  PaginationControls(
                    page: 1,
                    limit: 20,
                    total: 200,
                    onPageChanged: (_) {},
                  ),
                  PaginationControls(
                    page: 100,
                    limit: 20,
                    total: 4000,
                    onPageChanged: (_) {},
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Trang 1 / 10'), findsOneWidget);
      expect(find.text('Trang 100 / 200'), findsOneWidget);
      expect(find.byTooltip('Trang trước'), findsNWidgets(2));
      expect(find.byTooltip('Trang sau'), findsNWidgets(2));
    });
  });
}
