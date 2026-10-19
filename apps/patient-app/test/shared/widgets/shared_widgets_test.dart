import 'package:clinic_patient_app/shared/widgets/appointment_status_chip.dart';
import 'package:clinic_patient_app/shared/widgets/horizontal_date_strip.dart';
import 'package:clinic_patient_app/shared/widgets/qr_ticket_card.dart';
import 'package:clinic_patient_app/shared/widgets/slot_grid_selector.dart';
import 'package:flutter/material.dart';
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
  });

  group('SlotGridSelector (M3-UI-LEAD-003)', () {
    testWidgets('groups into morning and afternoon and triggers callback on available slot',
        (tester) async {
      SlotOption? chosen;
      final morningSlot = SlotOption(
        startAt: DateTime(2026, 10, 20, 9, 0),
        endAt: DateTime(2026, 10, 20, 9, 30),
        isAvailable: true,
      );
      final afternoonSlot = SlotOption(
        startAt: DateTime(2026, 10, 20, 14, 0),
        endAt: DateTime(2026, 10, 20, 14, 30),
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
}
