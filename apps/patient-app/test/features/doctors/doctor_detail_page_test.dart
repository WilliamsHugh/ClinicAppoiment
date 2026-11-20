import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
import 'package:clinic_patient_app/features/doctors/doctor_booking_controls.dart';
import 'package:clinic_patient_app/features/doctors/doctor_detail_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_models.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/shared/widgets/horizontal_date_strip.dart';
import 'package:clinic_patient_app/shared/widgets/slot_grid_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'doctor_test_fixtures.dart';

Future<void> showDetail(WidgetTester tester,
    {Override? override,
    List<http.Request>? requests,
    DoctorBookingWidgets widgets = const DoctorBookingWidgets()}) async {
  await tester.pumpWidget(MaterialApp(
      theme: buildPatientTheme(),
      home: DoctorDetailPage(
          doctorId: 'doctor-1',
          apiClient: doctorClient(override: override, requests: requests),
          specialtyName: 'Tim mạch',
          bookingWidgets: widgets)));
  await tester.pumpAndSettle();
}

Finder get _scroll => find
    .descendant(
        of: find.byType(DoctorDetailPage), matching: find.byType(Scrollable))
    .first;
Future<void> nextDay(WidgetTester tester) async {
  await tester.scrollUntilVisible(find.byTooltip('Ngày tiếp theo'), 200,
      scrollable: _scroll);
  await tester.ensureVisible(find.byTooltip('Ngày tiếp theo'));
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('Ngày tiếp theo'));
  await tester.pumpAndSettle();
}

Future<void> selectMorning(WidgetTester tester) async {
  await tester.scrollUntilVisible(find.text('08:00–08:30'), 120,
      scrollable: _scroll);
  await tester.tap(find.text('08:00–08:30'));
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> captureReview(
    WidgetTester tester, GlobalKey key, String name) async {
  final output = Platform.environment['CLINIC_REVIEW_OUTPUT'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUp(() => WidgetController.hitTestWarningShouldBeFatal = true);
  tearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);
  testWidgets(
      'detail shows biography, specialty and active weekly sessions without private endpoints',
      (tester) async {
    final requests = <http.Request>[];
    await showDetail(tester, requests: requests);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(find.text('Chuyên khoa: Tim mạch'), findsOneWidget);
    expect(find.text('Tư vấn và chăm sóc sức khỏe tim mạch.'), findsOneWidget);
    expect(find.text('Lịch làm việc tuần'), findsOneWidget);
    await tester.scrollUntilVisible(
        find.text('09:00–12:00 · 30 phút/lượt'), 180,
        scrollable: _scroll);
    expect(find.text('09:00–12:00 · 30 phút/lượt'), findsOneWidget);
    expect(
        requests.every((request) =>
            request.method == 'GET' &&
            !request.url.path.contains('time-offs') &&
            !request.url.path.contains('patients')),
        isTrue);
  });

  testWidgets(
      'calendar navigation fetches that clinic day and groups morning/afternoon slots',
      (tester) async {
    final requests = <http.Request>[];
    await showDetail(tester, requests: requests);
    await nextDay(tester);
    expect(requests.last.url.queryParameters['date'], dayAfter(1));
    await tester.scrollUntilVisible(find.text('Buổi chiều'), 160,
        scrollable: _scroll);
    expect(find.text('08:00–08:30'), findsOneWidget);
    expect(find.text('14:00–14:30'), findsOneWidget);
    expect(find.text('Buổi sáng'), findsOneWidget);
  });

  testWidgets('does not book inactive or unavailable doctor profiles',
      (tester) async {
    final requests = <http.Request>[];
    await showDetail(tester,
        requests: requests,
        override: (request) async =>
            request.url.path == '/api/v1/doctors/doctor-1'
                ? success({...doctorData, 'isActive': false})
                : null);
    expect(find.text('Bác sĩ hiện không nhận lịch'), findsOneWidget);
    expect(find.text('Tạm ngưng nhận lịch'), findsOneWidget);
    expect(find.byType(SlotGridSelector), findsNothing);
    expect(requests.length, 1);
  });

  testWidgets(
      'retries doctor read failures without displaying server internals',
      (tester) async {
    var fail = true;
    await showDetail(tester,
        override: (request) async =>
            request.url.path == '/api/v1/doctors/doctor-1' && fail
                ? failure('DEPENDENCY_UNAVAILABLE', 503)
                : null);
    expect(find.textContaining('Unsafe internal'), findsNothing);
    expect(find.text('Thử lại'), findsOneWidget);
    fail = false;
    await tapVisible(tester, find.text('Thử lại'));
    expect(find.text('Bác sĩ An'), findsOneWidget);
  });

  testWidgets(
      'schedule failure has its own retry and does not erase the doctor or available slots',
      (tester) async {
    var fail = true;
    await showDetail(tester,
        override: (request) async =>
            request.url.path.endsWith('/schedules') && fail
                ? failure('DEPENDENCY_UNAVAILABLE', 503)
                : null);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Thử lại'), 180,
        scrollable: _scroll);
    fail = false;
    await tapVisible(tester, find.text('Thử lại'));
    expect(find.text('09:00–12:00 · 30 phút/lượt'), findsOneWidget);
  });

  testWidgets('slot service failure cannot be mistaken for a fully booked day',
      (tester) async {
    var fail = true;
    await showDetail(tester,
        override: (request) async =>
            request.url.path.endsWith('/available-slots') && fail
                ? failure('APPOINTMENT_AVAILABILITY_UNAVAILABLE', 503)
                : null);
    await tester.scrollUntilVisible(find.text('Thử lại'), 200,
        scrollable: _scroll);
    expect(find.text('Chưa có khung giờ trống'), findsNothing);
    fail = false;
    await tapVisible(tester, find.text('Thử lại'));
    await nextDay(tester);
    expect(find.text('08:00–08:30'), findsOneWidget);
  });

  testWidgets(
      'cancelled confirmation refreshes availability and disables a disappeared slot',
      (tester) async {
    var unavailable = false;
    final requests = <http.Request>[];
    await showDetail(tester,
        requests: requests,
        override: (request) async =>
            request.url.path.endsWith('/available-slots') && unavailable
                ? success([])
                : null);
    await nextDay(tester);
    await selectMorning(tester);
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    expect(requests.where((request) => request.method == 'POST'), isEmpty);
    unavailable = true;
    await tester.tap(find.byTooltip('Đóng'));
    await tester.pumpAndSettle();
    final slotText = find.text('08:00–08:30');
    final inkWell = tester.widget<InkWell>(
        find.ancestor(of: slotText, matching: find.byType(InkWell)));
    expect(inkWell.onTap, isNull);
    expect(tester.widget<Text>(slotText).style?.decoration,
        TextDecoration.lineThrough);
    expect(
      find.byWidgetPredicate(
        (w) =>
            w is Semantics &&
            w.properties.button == true &&
            w.properties.enabled == false &&
            w.properties.label == 'Khung giờ 08:00–08:30, đã kín',
      ),
      findsOneWidget,
    );
    expect(find.text('Không còn khả dụng'), findsWidgets);
    await tester.ensureVisible(find.text('08:00–08:30'));
    await tester.pumpAndSettle();
    // A disabled chip intentionally does not receive pointer events.
    await tester.tapAt(tester.getCenter(find.text('08:00–08:30')));
    await tester.pumpAndSettle();
    expect(find.byType(BookingConfirmationSheet), findsNothing);
  });

  testWidgets('repeated slot taps open only one confirmation sheet',
      (tester) async {
    await showDetail(tester);
    await nextDay(tester);
    await tester.scrollUntilVisible(find.text('08:00–08:30'), 120,
        scrollable: _scroll);
    final point = tester.getCenter(find.text('08:00–08:30'));
    await tester.tapAt(point);
    await tester.tapAt(point);
    await tester.pumpAndSettle();
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    await tester.tap(find.byTooltip('Đóng'));
    await tester.pumpAndSettle();
    expect(find.byType(BookingConfirmationSheet), findsNothing);
  });

  testWidgets(
      'detail resolves specialty when directory did not supply its name',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home:
            DoctorDetailPage(doctorId: 'doctor-1', apiClient: doctorClient())));
    await tester.pumpAndSettle();
    expect(find.text('Chuyên khoa: Tim mạch'), findsOneWidget);
    expect(find.textContaining('specialty-1'), findsNothing);
  });

  testWidgets('rapid date changes ignore stale slots from the previous day',
      (tester) async {
    final pending = Completer<http.Response>();
    await showDetail(tester, override: (request) async {
      if (request.url.path.endsWith('/available-slots') &&
          request.url.queryParameters['date'] == dayAfter(1)) {
        return pending.future;
      }
      return null;
    });
    await tester.scrollUntilVisible(find.byTooltip('Ngày tiếp theo'), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pump();
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: ${dayAfter(2)}'), findsOneWidget);
    pending.complete(success([
      {
        'startAt': '${dayAfter(1)}T02:00:00Z',
        'endAt': '${dayAfter(1)}T02:30:00Z'
      }
    ]));
    await tester.pumpAndSettle();
    expect(find.text('09:00–09:30'), findsNothing);
    expect(find.text('08:00–08:30'), findsOneWidget);
  });

  testWidgets('detail safely ignores late work after unmount', (tester) async {
    final pending = Completer<http.Response>();
    await tester.pumpWidget(MaterialApp(
        home: DoctorDetailPage(
            doctorId: 'doctor-1',
            apiClient: doctorClient(override: (_) async => pending.future))));
    await tester.pump();
    await tester.pumpWidget(const MaterialApp(home: Text('Trang khác')));
    pending.complete(success(doctorData));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Trang khác'), findsOneWidget);
  });

  testWidgets(
      'TV1 builders receive available slots and date callbacks without owning API reads',
      (tester) async {
    DoctorDateInput? dateInput;
    DoctorSlotInput? slotInput;
    await showDetail(tester,
        widgets: DoctorBookingWidgets(
          dateStrip: (_, input) {
            dateInput = input;
            return TextButton(
                onPressed: () => input.onChanged(dayAfter(1)),
                child: const Text('Ngày từ widget TV1'));
          },
          slotSelector: (_, input) {
            slotInput = input;
            return const Text('Slots từ widget TV1');
          },
        ));
    await tester.scrollUntilVisible(find.text('Ngày từ widget TV1'), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.text('Ngày từ widget TV1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ngày từ widget TV1'));
    await tester.pumpAndSettle();
    expect(dateInput!.selectedDate, dayAfter(1));
    expect(slotInput!.slots.length, 2);
    expect(slotInput!.unavailableKeys, isEmpty);
    expect(slotInput!.enabled, isTrue);
  });

  testWidgets(
      'directory preserves its search text when returning from doctor detail',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: DoctorDirectoryPage(apiClient: doctorClient()))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'An');
    await tester.tap(find.text('Bác sĩ An'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'An');
  });

  testWidgets(
      'directory rejects invalid pagination without crashing its controls',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DoctorDirectoryPage(
                apiClient: doctorClient(
      override: (request) async => request.url.path == '/api/v1/doctors'
          ? success(pageData([doctorData], limit: 0))
          : null,
    )))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text('Bác sĩ An'), findsNothing);
  });

  testWidgets(
      'an empty search offers clearing filters and recovers real directory data',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DoctorDirectoryPage(
                apiClient: doctorClient(
      override: (request) async => request.url.path == '/api/v1/doctors' &&
              request.url.queryParameters['q'] == 'không có'
          ? success(pageData([], limit: 20))
          : null,
    )))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'không có');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Chưa có bác sĩ'), findsOneWidget);
    await tapVisible(tester, find.text('Xóa bộ lọc'));
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        '');
  });

  for (final size in [const Size(360, 740), const Size(414, 896)]) {
    testWidgets(
        'detail fits ${size.width} wide with large text; optional visual review',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      final boundaryKey = GlobalKey();
      final reviewFont = Platform.environment['CLINIC_REVIEW_FONT'];
      final reviewIcons = Platform.environment['CLINIC_REVIEW_ICONS'];
      if (reviewFont != null && reviewIcons != null) {
        await tester.runAsync(() async {
          for (final entry
              in {'Roboto': reviewFont, 'MaterialIcons': reviewIcons}.entries) {
            final bytes = await File(entry.value).readAsBytes();
            await (FontLoader(entry.key)
                  ..addFont(Future.value(ByteData.sublistView(bytes))))
                .load();
          }
        });
      }
      await tester.pumpWidget(MaterialApp(
          theme: buildPatientTheme(),
          home: RepaintBoundary(
              key: boundaryKey,
              child: DoctorDetailPage(
                  doctorId: 'doctor-1',
                  apiClient: doctorClient(),
                  specialtyName: 'Tim mạch'))));
      await tester.pumpAndSettle();
      await captureReview(
          tester, boundaryKey, 'doctor-detail-${size.width.toInt()}');
      await nextDay(tester);
      await tester.scrollUntilVisible(find.text('14:00–14:30'), 160,
          scrollable: _scroll);
      expect(tester.takeException(), isNull);
      await captureReview(
          tester, boundaryKey, 'doctor-slots-${size.width.toInt()}');
    });
  }

  testWidgets(
      'HorizontalDateStrip and SlotGridSelector display UTC+7 and forward exact UTC instants to booking API',
      (tester) async {
    final requests = <http.Request>[];
    final targetDate = dayAfter(1);
    final targetDayNumber = int.parse(targetDate.split('-').last).toString();
    await showDetail(
      tester,
      requests: requests,
      override: (request) async {
        if (request.method == 'POST' &&
            request.url.path == '/api/v1/appointments') {
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {'id': 'appt-utc-1', 'status': 'PENDING'}
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return null;
      },
    );

    expect(find.text('Đang nhận lịch'), findsOneWidget);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    expect(find.byType(HorizontalDateStrip), findsOneWidget);

    final dayFinder = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.text(targetDayNumber),
    );
    await tester.ensureVisible(dayFinder.first);
    await tester.pumpAndSettle();
    await tester.tap(dayFinder.first);
    await tester.pumpAndSettle();

    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      targetDate,
    );
    expect(find.byType(SlotGridSelector), findsOneWidget);

    await selectMorning(tester);
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    await tester.ensureVisible(find.byType(FilledButton).last);
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle();

    final post = requests.singleWhere((r) => r.method == 'POST');
    final body = jsonDecode(post.body) as Map<String, dynamic>;
    expect(body['scheduledStartAt'], '${targetDate}T01:00:00.000Z');
    expect(body['scheduledEndAt'], '${targetDate}T01:30:00.000Z');
  });

  testWidgets(
      'picking a date +20 days via calendar syncs HorizontalDateStrip to start at that date in 360px viewport',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final requests = <http.Request>[];
    final todayStr = dayAfter(0);
    final targetStr = dayAfter(20);
    final todayParts = todayStr.split('-').map(int.parse).toList();
    final targetParts = targetStr.split('-').map(int.parse).toList();

    await showDetail(tester, requests: requests);

    final calendarButton = find.text('Ngày khám: $todayStr');
    await tester.scrollUntilVisible(calendarButton, 200, scrollable: _scroll);
    await tester.ensureVisible(calendarButton);
    await tester.pumpAndSettle();
    await tester.tap(calendarButton);
    await tester.pumpAndSettle();

    final monthsDiff =
        (targetParts[0] - todayParts[0]) * 12 + (targetParts[1] - todayParts[1]);
    for (var i = 0; i < monthsDiff; i++) {
      await tester.tap(find.descendant(
        of: find.byType(DatePickerDialog),
        matching: find.byTooltip('Next month'),
      ));
      await tester.pumpAndSettle();
    }

    await tester.tap(find
        .descendant(
          of: find.byType(CalendarDatePicker),
          matching: find.text('${targetParts[2]}'),
        )
        .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(find.text('Ngày khám: $targetStr'), findsOneWidget);
    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      targetStr,
    );

    final strip = tester.widget<HorizontalDateStrip>(
      find.byType(HorizontalDateStrip),
    );
    expect(
      strip.startDate,
      DateTime(targetParts[0], targetParts[1], targetParts[2]),
    );
    expect(
      strip.selectedDate,
      DateTime(targetParts[0], targetParts[1], targetParts[2]),
    );

    final selectedTile = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(selectedTile, findsOneWidget);
    final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
    final tileRect = tester.getRect(selectedTile);
    expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
    expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
  });

  for (final dayOffset in [360, 365]) {
    testWidgets(
        'picking +$dayOffset days via calendar at 360x740 @ 1.4x keeps selected tile visible and does not exceed lastDate',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });

      final requests = <http.Request>[];
      final todayStr = clinicTodayDate();
      final targetStr = addClinicDays(todayStr, dayOffset);
      final lastStr = addClinicDays(todayStr, 365);
      final todayParts = todayStr.split('-').map(int.parse).toList();
      final targetParts = targetStr.split('-').map(int.parse).toList();
      final lastParts = lastStr.split('-').map(int.parse).toList();

      await showDetail(tester, requests: requests);

      final calendarButton = find.text('Ngày khám: $todayStr');
      await tester.scrollUntilVisible(calendarButton, 200, scrollable: _scroll);
      await tester.ensureVisible(calendarButton);
      await tester.pumpAndSettle();
      await tester.tap(calendarButton);
      await tester.pumpAndSettle();

      final monthsDiff = (targetParts[0] - todayParts[0]) * 12 +
          (targetParts[1] - todayParts[1]);
      for (var i = 0; i < monthsDiff; i++) {
        await tester.tap(find.descendant(
          of: find.byType(DatePickerDialog),
          matching: find.byTooltip('Next month'),
        ));
        await tester.pumpAndSettle();
      }

      await tester.tap(find
          .descendant(
            of: find.byType(CalendarDatePicker),
            matching: find.text('${targetParts[2]}'),
          )
          .first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Ngày khám: $targetStr'), findsOneWidget);
      expect(
        requests
            .where((r) => r.url.path.endsWith('/available-slots'))
            .last
            .url
            .queryParameters['date'],
        targetStr,
      );

      final strip = tester.widget<HorizontalDateStrip>(
        find.byType(HorizontalDateStrip),
      );
      final expectedStartOffset = math.min(dayOffset, 366 - 4);
      final expectedStartStr = addClinicDays(todayStr, expectedStartOffset);
      final expectedStartParts =
          expectedStartStr.split('-').map(int.parse).toList();
      expect(
        strip.startDate,
        DateTime(
          expectedStartParts[0],
          expectedStartParts[1],
          expectedStartParts[2],
        ),
      );
      expect(
        strip.selectedDate,
        DateTime(targetParts[0], targetParts[1], targetParts[2]),
      );
      expect(strip.daysCount, 366 - expectedStartOffset);

      final stripStart = strip.startDate!;
      final stripEnd = DateTime(
        stripStart.year,
        stripStart.month,
        stripStart.day + strip.daysCount - 1,
      );
      final lastDate = DateTime(lastParts[0], lastParts[1], lastParts[2]);
      expect(stripEnd.isAfter(lastDate), isFalse);

      final selectedTile = find.descendant(
        of: find.byType(HorizontalDateStrip),
        matching: find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.selected == true,
        ),
      );
      expect(selectedTile, findsOneWidget);
      final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
      final tileRect = tester.getRect(selectedTile);
      expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
      expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
    });
  }

  testWidgets(
      'DoctorDateControl safely clamps startOffset and daysCount for negative offset and short ranges',
      (tester) async {
    Future<HorizontalDateStrip> pumpControl({
      required String firstDate,
      required String lastDate,
      required String selectedDate,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildPatientTheme(),
          home: Scaffold(
            body: DoctorDateControl(
              input: DoctorDateInput(
                selectedDate: selectedDate,
                firstDate: firstDate,
                lastDate: lastDate,
                onChanged: (_) {},
                onOpenCalendar: () {},
                enabled: true,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      return tester.widget<HorizontalDateStrip>(
        find.byType(HorizontalDateStrip),
      );
    }

    final shortNormal = await pumpControl(
      firstDate: '2026-11-20',
      lastDate: '2026-11-22',
      selectedDate: '2026-11-21',
    );
    expect(shortNormal.startDate, DateTime(2026, 11, 20));
    expect(shortNormal.daysCount, 3);

    final shortOutOfRange = await pumpControl(
      firstDate: '2026-11-20',
      lastDate: '2026-11-22',
      selectedDate: '2026-12-10',
    );
    expect(shortOutOfRange.startDate, DateTime(2026, 11, 20));
    expect(shortOutOfRange.daysCount, 3);

    final negativeOffset = await pumpControl(
      firstDate: '2026-11-20',
      lastDate: '2026-12-10',
      selectedDate: '2026-11-18',
    );
    expect(negativeOffset.startDate, DateTime(2026, 11, 20));
    expect(negativeOffset.daysCount, 14);
  });

  testWidgets(
      'scrolling HorizontalDateStrip to +13 then tapping next day (+14) at 360x740 @ 1.4x resets scroll and keeps +14 visible',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final requests = <http.Request>[];
    final todayStr = clinicTodayDate();
    final day13Str = addClinicDays(todayStr, 13);
    final day14Str = addClinicDays(todayStr, 14);
    final day13Parts = day13Str.split('-').map(int.parse).toList();
    final day14Parts = day14Str.split('-').map(int.parse).toList();

    await showDetail(tester, requests: requests);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byType(HorizontalDateStrip));
    await tester.pumpAndSettle();

    final stripScroll = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byType(Scrollable),
    );
    final tile13 = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Semantics &&
            (w.properties.label?.startsWith(
                    'Ngày ${day13Parts[2]} tháng ${day13Parts[1]},') ??
                false),
      ),
    );
    await tester.scrollUntilVisible(tile13, 120, scrollable: stripScroll);
    await tester.ensureVisible(tile13);
    await tester.pumpAndSettle();
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      greaterThan(0),
    );

    await tester.tap(tile13);
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: $day13Str'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $day14Str'), findsOneWidget);
    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      day14Str,
    );

    final strip = tester.widget<HorizontalDateStrip>(
      find.byType(HorizontalDateStrip),
    );
    expect(
      strip.startDate,
      DateTime(day14Parts[0], day14Parts[1], day14Parts[2]),
    );
    expect(
      strip.selectedDate,
      DateTime(day14Parts[0], day14Parts[1], day14Parts[2]),
    );

    final selectedTile = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(selectedTile, findsOneWidget);
    final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
    final tileRect = tester.getRect(selectedTile);
    expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
    expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
  });

  testWidgets(
      'scrolling HorizontalDateStrip right then picking +20 via DatePickerDialog at 360x740 @ 1.4x keeps +20 visible',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final requests = <http.Request>[];
    final todayStr = clinicTodayDate();
    final targetStr = addClinicDays(todayStr, 20);
    final todayParts = todayStr.split('-').map(int.parse).toList();
    final targetParts = targetStr.split('-').map(int.parse).toList();

    await showDetail(tester, requests: requests);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byType(HorizontalDateStrip));
    await tester.pumpAndSettle();

    final stripScroll = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byType(Scrollable),
    );
    await tester.drag(find.byType(HorizontalDateStrip), const Offset(-450, 0));
    await tester.pumpAndSettle();
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      greaterThan(0),
    );

    final calendarButton = find.text('Ngày khám: $todayStr');
    await tester.ensureVisible(calendarButton);
    await tester.pumpAndSettle();
    await tester.tap(calendarButton);
    await tester.pumpAndSettle();

    final monthsDiff =
        (targetParts[0] - todayParts[0]) * 12 + (targetParts[1] - todayParts[1]);
    for (var i = 0; i < monthsDiff; i++) {
      await tester.tap(find.descendant(
        of: find.byType(DatePickerDialog),
        matching: find.byTooltip('Next month'),
      ));
      await tester.pumpAndSettle();
    }

    await tester.tap(find
        .descendant(
          of: find.byType(CalendarDatePicker),
          matching: find.text('${targetParts[2]}'),
        )
        .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $targetStr'), findsOneWidget);
    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      targetStr,
    );

    final strip = tester.widget<HorizontalDateStrip>(
      find.byType(HorizontalDateStrip),
    );
    expect(
      strip.startDate,
      DateTime(targetParts[0], targetParts[1], targetParts[2]),
    );
    expect(
      strip.selectedDate,
      DateTime(targetParts[0], targetParts[1], targetParts[2]),
    );

    final selectedTile = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(selectedTile, findsOneWidget);
    final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
    final tileRect = tester.getRect(selectedTile);
    expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
    expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
  });

  testWidgets(
      'scrolling HorizontalDateStrip to +13 then tapping previous day 8 times (+5) at 360x740 @ 1.4x keeps +5 visible',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final requests = <http.Request>[];
    final todayStr = clinicTodayDate();
    final day13Str = addClinicDays(todayStr, 13);
    final day5Str = addClinicDays(todayStr, 5);
    final day13Parts = day13Str.split('-').map(int.parse).toList();

    await showDetail(tester, requests: requests);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byType(HorizontalDateStrip));
    await tester.pumpAndSettle();

    final stripScroll = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byType(Scrollable),
    );
    final tile13 = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Semantics &&
            (w.properties.label?.startsWith(
                    'Ngày ${day13Parts[2]} tháng ${day13Parts[1]},') ??
                false),
      ),
    );
    await tester.scrollUntilVisible(tile13, 120, scrollable: stripScroll);
    await tester.ensureVisible(tile13);
    await tester.pumpAndSettle();
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      greaterThan(0),
    );

    await tester.tap(tile13);
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: $day13Str'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Ngày trước'));
    await tester.pumpAndSettle();
    for (var i = 0; i < 8; i++) {
      await tester.tap(find.byTooltip('Ngày trước'));
      await tester.pumpAndSettle();
    }

    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $day5Str'), findsOneWidget);
    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      day5Str,
    );

    final selectedTile = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(selectedTile, findsOneWidget);
    final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
    final tileRect = tester.getRect(selectedTile);
    expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
    expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
  });

  testWidgets(
      'scrolling HorizontalDateStrip to +13 then picking +0 via DatePickerDialog at 360x740 @ 1.4x keeps +0 visible',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final requests = <http.Request>[];
    final todayStr = clinicTodayDate();
    final day13Str = addClinicDays(todayStr, 13);
    final todayParts = todayStr.split('-').map(int.parse).toList();
    final day13Parts = day13Str.split('-').map(int.parse).toList();

    await showDetail(tester, requests: requests);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byType(HorizontalDateStrip));
    await tester.pumpAndSettle();

    final stripScroll = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byType(Scrollable),
    );
    final tile13 = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Semantics &&
            (w.properties.label?.startsWith(
                    'Ngày ${day13Parts[2]} tháng ${day13Parts[1]},') ??
                false),
      ),
    );
    await tester.scrollUntilVisible(tile13, 120, scrollable: stripScroll);
    await tester.ensureVisible(tile13);
    await tester.pumpAndSettle();
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      greaterThan(0),
    );

    await tester.tap(tile13);
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: $day13Str'), findsOneWidget);

    final calendarButton = find.text('Ngày khám: $day13Str');
    await tester.ensureVisible(calendarButton);
    await tester.pumpAndSettle();
    await tester.tap(calendarButton);
    await tester.pumpAndSettle();

    final monthsDiff =
        (day13Parts[0] - todayParts[0]) * 12 + (day13Parts[1] - todayParts[1]);
    for (var i = 0; i < monthsDiff; i++) {
      await tester.tap(find.descendant(
        of: find.byType(DatePickerDialog),
        matching: find.byTooltip('Previous month'),
      ));
      await tester.pumpAndSettle();
    }

    await tester.tap(find
        .descendant(
          of: find.byType(CalendarDatePicker),
          matching: find.text('${todayParts[2]}'),
        )
        .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $todayStr'), findsOneWidget);
    expect(
      requests
          .where((r) => r.url.path.endsWith('/available-slots'))
          .last
          .url
          .queryParameters['date'],
      todayStr,
    );

    final selectedTile = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(selectedTile, findsOneWidget);
    final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
    final tileRect = tester.getRect(selectedTile);
    expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
    expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
  });

  testWidgets(
      'transitioning +13 -> +14 -> +13 keeps selected visible and same-window +5 -> +6 preserves scroll offset at 360x740 @ 1.4x',
      (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });

    final todayStr = clinicTodayDate();
    final day5Str = addClinicDays(todayStr, 5);
    final day6Str = addClinicDays(todayStr, 6);
    final day13Str = addClinicDays(todayStr, 13);
    final day14Str = addClinicDays(todayStr, 14);
    final day5Parts = day5Str.split('-').map(int.parse).toList();
    final day6Parts = day6Str.split('-').map(int.parse).toList();
    final day13Parts = day13Str.split('-').map(int.parse).toList();

    await showDetail(tester);

    await tester.scrollUntilVisible(find.byType(HorizontalDateStrip), 200,
        scrollable: _scroll);
    await tester.ensureVisible(find.byType(HorizontalDateStrip));
    await tester.pumpAndSettle();

    final stripScroll = find.descendant(
      of: find.byType(HorizontalDateStrip),
      matching: find.byType(Scrollable),
    );

    Finder tileFor(List<int> parts) => find.descendant(
          of: find.byType(HorizontalDateStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Semantics &&
                (w.properties.label?.startsWith(
                        'Ngày ${parts[2]} tháng ${parts[1]},') ??
                    false),
          ),
        );

    void expectSelectedVisible() {
      final selectedTile = find.descendant(
        of: find.byType(HorizontalDateStrip),
        matching: find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.selected == true,
        ),
      );
      expect(selectedTile, findsOneWidget);
      final stripRect = tester.getRect(find.byType(HorizontalDateStrip));
      final tileRect = tester.getRect(selectedTile);
      expect(tileRect.left, greaterThanOrEqualTo(stripRect.left));
      expect(tileRect.right, lessThanOrEqualTo(stripRect.right));
    }

    // 1. Scroll to +5 and ensure +6 is also in viewport, tap +5, then next day (+6).
    final tile6 = tileFor(day6Parts);
    final tile5 = tileFor(day5Parts);
    await tester.scrollUntilVisible(tile6, 120, scrollable: stripScroll);
    await tester.ensureVisible(tile6);
    await tester.ensureVisible(tile5);
    await tester.pumpAndSettle();

    final pixelsBeforeTap5 =
        tester.state<ScrollableState>(stripScroll).position.pixels;
    expect(pixelsBeforeTap5, greaterThan(0));

    await tester.tap(tile5);
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: $day5Str'), findsOneWidget);
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      pixelsBeforeTap5,
    );

    await tester.ensureVisible(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $day6Str'), findsOneWidget);
    expect(
      tester.state<ScrollableState>(stripScroll).position.pixels,
      pixelsBeforeTap5,
    );
    expectSelectedVisible();

    // 2. Scroll to +13, tap +13, next day (+14), then previous day back to +13.
    final tile13 = tileFor(day13Parts);
    await tester.scrollUntilVisible(tile13, 120, scrollable: stripScroll);
    await tester.ensureVisible(tile13);
    await tester.pumpAndSettle();
    await tester.tap(tile13);
    await tester.pumpAndSettle();
    expect(find.text('Ngày khám: $day13Str'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ngày tiếp theo'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $day14Str'), findsOneWidget);
    expectSelectedVisible();

    await tester.tap(find.byTooltip('Ngày trước'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Ngày khám: $day13Str'), findsOneWidget);
    expectSelectedVisible();
  });
}
