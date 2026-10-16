import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
import 'package:clinic_patient_app/features/doctors/doctor_booking_controls.dart';
import 'package:clinic_patient_app/features/doctors/doctor_detail_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:clinic_patient_app/core/theme/app_theme.dart';
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
    await tester.scrollUntilVisible(find.text('Buổi chiều / tối'), 160,
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
    expect(find.byType(ChoiceChip), findsNothing);
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
    final chip = tester.widget<ChoiceChip>(find.ancestor(
        of: find.text('08:00–08:30'), matching: find.byType(ChoiceChip)));
    expect(chip.onSelected, isNull);
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
    await tapVisible(tester, find.byTooltip('Tìm bác sĩ'));
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
}
