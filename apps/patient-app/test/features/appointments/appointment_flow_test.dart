import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:clinic_patient_app/core/theme/app_theme.dart';
import 'package:clinic_patient_app/features/appointments/appointment_models.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
import 'package:clinic_patient_app/features/appointments/widgets/appointment_card.dart';
import 'package:clinic_patient_app/features/appointments/widgets/appointment_ticket.dart';
import 'package:clinic_patient_app/features/appointments/widgets/reschedule_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

import 'appointment_test_fixtures.dart';

Future<void> showAppointments(WidgetTester tester, AppointmentGateway gateway,
    {GlobalKey? boundary, AppointmentTicketBuilder? ticketBuilder}) async {
  var theme = buildPatientTheme();
  if (Platform.environment['CLINIC_REVIEW_FONT'] != null) {
    // The headless engine defaults fontless button styles to Ahem. Android uses
    // its system font; use the explicitly loaded review font for exports only.
    final style = theme.filledButtonTheme.style!;
    theme = theme.copyWith(
        filledButtonTheme: FilledButtonThemeData(
            style: style.copyWith(
      textStyle: WidgetStatePropertyAll(
          style.textStyle!.resolve({})!.copyWith(fontFamily: 'Roboto')),
    )));
  }
  await tester.pumpWidget(MaterialApp(
      theme: theme,
      home: AppointmentsPage(
          tokenProvider: patientSession,
          api: gateway.api,
          ticketBuilder: ticketBuilder),
      builder: boundary == null
          ? null
          : (_, child) => RepaintBoundary(key: boundary, child: child!)));
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> chooseSlot(WidgetTester tester, String label) async {
  await tapVisible(tester, find.byType(DropdownButton<String>));
  await tapVisible(tester, find.text(label).last);
}

Future<void> captureReview(
    WidgetTester tester, GlobalKey key, String name) async {
  final output = Platform.environment['CLINIC_REVIEW_OUTPUT'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final picture = await boundary.toImage(pixelRatio: 2);
    final bytes = await picture.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    picture.dispose();
  });
}

void main() {
  setUp(() => WidgetController.hitTestWarningShouldBeFatal = true);
  tearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);

  testWidgets(
      'an old account action result cannot repopulate a replaced client list',
      (tester) async {
    final response = Completer<http.Response>();
    final original = AppointmentGateway(
        override: (request) async =>
            request.method == 'PATCH' ? response.future : null);
    await showAppointments(tester, original);
    await tapVisible(tester, find.text('Hủy lịch'));
    await tester.tap(find.text('Xác nhận hủy lịch'));
    await tester.pump();
    final replacement = AppointmentGateway(appointments: []);
    await showAppointments(tester, replacement);
    response.complete(success(appointmentJson(status: 'CANCELLED')));
    await tester.pumpAndSettle();
    expect(find.byType(RescheduleSheet), findsNothing);
    expect(find.byType(AppointmentCard), findsNothing);
    expect(find.text('Đã hủy lịch hẹn.'), findsNothing);
    expect(find.text('Chưa có lịch hẹn'), findsOneWidget);
    expect(replacement.writes, isEmpty);
  });

  testWidgets('old slot response cannot overwrite the newly selected day',
      (tester) async {
    final oldResponse = Completer<http.Response>();
    final gateway = AppointmentGateway(
        override: (request) async =>
            request.url.path.endsWith('/available-slots') &&
                    request.url.queryParameters['date'] == clinicDay(1)
                ? oldResponse.future
                : null);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Đổi lịch'));
    await tapVisible(tester, find.byTooltip('Ngày tiếp theo'));
    oldResponse.complete(success([
      {
        'startAt': '${clinicDay(1)}T04:00:00Z',
        'endAt': '${clinicDay(1)}T04:30:00Z'
      }
    ]));
    await tester.pumpAndSettle();
    await chooseSlot(tester, '10:00–10:30');
    await tapVisible(tester, find.text('Xác nhận đổi lịch'));
    expect(jsonDecode(gateway.writes.single.body)['scheduledStartAt'],
        '${clinicDay(2)}T03:00:00.000Z');
  });

  testWidgets(
      'slot read failure offers retry and does not enable a fabricated time',
      (tester) async {
    var unavailable = true;
    final gateway = AppointmentGateway(
        override: (request) async =>
            unavailable && request.url.path.endsWith('/available-slots')
                ? failure('DEPENDENCY_UNAVAILABLE', status: 503)
                : null);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Đổi lịch'));
    expect(find.byType(DropdownButton<String>), findsNothing);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Xác nhận đổi lịch'))
            .onPressed,
        isNull);
    unavailable = false;
    await tapVisible(tester, find.text('Thử lại khung giờ'));
    await chooseSlot(tester, '10:00–10:30');
    expect(gateway.writes, isEmpty);
  });

  testWidgets(
      'changed appointment state requires list review before another mutation',
      (tester) async {
    final gateway = AppointmentGateway(
        override: (request) async => request.method == 'PATCH'
            ? failure('APPOINTMENT_INVALID_STATUS_TRANSITION')
            : null);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Hủy lịch'));
    await tapVisible(tester, find.text('Xác nhận hủy lịch'));
    expect(
        find.textContaining('Trạng thái lịch hẹn đã thay đổi'), findsOneWidget);
    expect(find.text('Xác nhận hủy lịch'), findsNothing);
    expect(gateway.writes.length, 1);
    await tapVisible(tester, find.text('Đóng và kiểm tra lại danh sách'));
    expect(find.byType(RescheduleSheet), findsNothing);
  });

  testWidgets(
      'ticket never shows a stale QR during detail loading or after closing',
      (tester) async {
    final detail = Completer<http.Response>();
    final gateway = AppointmentGateway(
        appointments: [appointmentJson(status: 'CONFIRMED')],
        override: (request) async =>
            request.url.path == '/api/v1/appointments/$appointmentId'
                ? detail.future
                : null);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Xem vé QR'));
    expect(find.byType(QrImageView), findsNothing);
    await tapVisible(tester, find.byTooltip('Đóng vé'));
    detail.complete(success(appointmentJson(status: 'CONFIRMED')));
    await tester.pumpAndSettle();
    expect(find.byType(AppointmentTicketSheet), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'all six statuses reach exactly three tabs, without extra tab requests',
      (tester) async {
    final gateway = AppointmentGateway(
        appointments: appointmentStatuses
            .map((status) =>
                appointmentJson(id: 'appointment-$status', status: status))
            .toList());
    await showAppointments(tester, gateway);
    expect(find.byType(AppointmentCard), findsNWidgets(3));
    expect(find.text('Hoàn thành'), findsNothing);
    final requestCount = gateway.requests.length;
    await tapVisible(tester, find.text('Lịch sử'));
    expect(find.byType(AppointmentCard), findsNWidgets(2));
    expect(find.text('Đổi lịch'), findsNothing);
    expect(find.text('Không đến'), findsOneWidget);
    await tapVisible(tester, find.text('Đã hủy').first);
    expect(find.byType(AppointmentCard), findsOneWidget);
    expect(find.text('Hủy lịch'), findsNothing);
    expect(gateway.requests.length, requestCount);
    expect(find.text(doctorId), findsNothing);
    expect(find.text(appointmentId), findsNothing);
  });

  testWidgets('read failure offers retry instead of an incorrect empty state',
      (tester) async {
    var unavailable = true;
    final gateway = AppointmentGateway(
        override: (request) async =>
            unavailable && request.url.path == '/api/v1/appointments'
                ? failure('DEPENDENCY_UNAVAILABLE', status: 503)
                : null);
    await showAppointments(tester, gateway);
    expect(find.text('Chưa có lịch hẹn'), findsNothing);
    expect(find.text('Thử lại'), findsOneWidget);
    unavailable = false;
    await tapVisible(tester, find.text('Thử lại'));
    expect(find.byType(AppointmentCard), findsOneWidget);
  });

  testWidgets('empty list remains refreshable', (tester) async {
    final gateway = AppointmentGateway(appointments: []);
    await showAppointments(tester, gateway);
    expect(find.text('Chưa có lịch hẹn'), findsOneWidget);
    gateway.items = [appointmentJson()];
    await tapVisible(tester, find.text('Kiểm tra lại'));
    expect(find.byType(AppointmentCard), findsOneWidget);
  });

  testWidgets(
      'cancelling needs explicit confirmation, sends the reason, changes tabs',
      (tester) async {
    final gateway = AppointmentGateway();
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Hủy lịch'));
    expect(gateway.writes, isEmpty);
    await tapVisible(tester, find.text('Quay lại'));
    expect(gateway.writes, isEmpty);
    await tapVisible(tester, find.text('Hủy lịch'));
    await tester.enterText(find.byType(TextField), ' Bận công việc ');
    await tapVisible(tester, find.text('Xác nhận hủy lịch'));
    expect(find.byType(RescheduleSheet), findsNothing);
    expect(find.text('Đã hủy lịch hẹn.'), findsOneWidget);
    expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 2);
    expect(jsonDecode(gateway.writes.single.body), {'reason': 'Bận công việc'});
    expect(gateway.items.single['status'], 'CANCELLED');
  });

  testWidgets(
      'pending write blocks close, system back and duplicate submission',
      (tester) async {
    final response = Completer<http.Response>();
    final gateway = AppointmentGateway(
        override: (request) async =>
            request.method == 'PATCH' ? response.future : null);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Hủy lịch'));
    final position = tester.getCenter(find.text('Xác nhận hủy lịch'));
    await tester.tapAt(position);
    await tester.pump();
    await tester.tapAt(position);
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(RescheduleSheet), findsOneWidget);
    expect(
        tester
            .widget<IconButton>(find.byWidgetPredicate(
                (widget) => widget is IconButton && widget.tooltip == 'Đóng'))
            .onPressed,
        isNull);
    expect(gateway.writes.length, 1);
    response.complete(success(appointmentJson(status: 'CANCELLED')));
    await tester.pumpAndSettle();
    expect(find.byType(RescheduleSheet), findsNothing);
    expect(gateway.writes.length, 1);
  });

  testWidgets(
      'reschedule submits only a live slot using UTC and preserves reason',
      (tester) async {
    final gateway = AppointmentGateway();
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Đổi lịch'));
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Xác nhận đổi lịch'))
            .onPressed,
        isNull);
    await chooseSlot(tester, '10:00–10:30');
    await tester.enterText(find.byType(TextField).last, 'Xin đổi giờ');
    await tapVisible(tester, find.text('Xác nhận đổi lịch'));
    expect(find.text('Đã đổi lịch thành công.'), findsOneWidget);
    expect(jsonDecode(gateway.writes.single.body), {
      'scheduledStartAt': '${clinicDay(1)}T03:00:00.000Z',
      'scheduledEndAt': '${clinicDay(1)}T03:30:00.000Z',
      'reason': 'Xin đổi giờ',
    });
    expect(find.textContaining('10:00–10:30'), findsOneWidget);
  });

  testWidgets(
      'slot conflict keeps reason, reloads availability and requires another selection',
      (tester) async {
    var conflict = false;
    final gateway = AppointmentGateway(override: (request) async {
      if (request.method == 'PATCH' && !conflict) {
        conflict = true;
        return failure('APPOINTMENT_SLOT_UNAVAILABLE');
      }
      if (request.url.path.endsWith('/available-slots') && conflict) {
        final date = request.url.queryParameters['date'];
        return success([
          {'startAt': '${date}T04:00:00.000Z', 'endAt': '${date}T04:30:00.000Z'}
        ]);
      }
      return null;
    });
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Đổi lịch'));
    await chooseSlot(tester, '10:00–10:30');
    await tester.enterText(find.byType(TextField).last, 'Giữ nguyên lý do này');
    await tapVisible(tester, find.text('Xác nhận đổi lịch'));
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Giữ nguyên lý do này');
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Xác nhận đổi lịch'))
            .onPressed,
        isNull);
    expect(gateway.writes.length, 1);
    await chooseSlot(tester, '11:00–11:30');
    await tapVisible(tester, find.text('Xác nhận đổi lịch'));
    expect(gateway.writes.length, 2);
    expect(jsonDecode(gateway.writes.last.body)['scheduledStartAt'],
        '${clinicDay(1)}T04:00:00.000Z');
  });

  testWidgets(
      'ambiguous network outcome freezes mutation until list review; no automatic retry',
      (tester) async {
    final gateway = AppointmentGateway(override: (request) async {
      if (request.method == 'PATCH') {
        throw http.ClientException('Private infrastructure detail');
      }
      return null;
    });
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Hủy lịch'));
    await tapVisible(tester, find.text('Xác nhận hủy lịch'));
    expect(find.text('Xác nhận hủy lịch'), findsNothing);
    expect(find.textContaining('Private infrastructure'), findsNothing);
    expect(gateway.writes.length, 1);
    await tapVisible(tester, find.text('Đóng và kiểm tra lại danh sách'));
    expect(find.byType(RescheduleSheet), findsNothing);
    expect(
        gateway.requests
            .where((request) => request.url.path == '/api/v1/appointments')
            .length,
        2);
    expect(gateway.writes.length, 1);
  });

  testWidgets(
      'successful cancellation stays successful when subsequent reload fails',
      (tester) async {
    var cancelled = false;
    final gateway = AppointmentGateway(override: (request) async {
      if (request.method == 'PATCH') {
        cancelled = true;
        return success(appointmentJson(status: 'CANCELLED'));
      }
      if (cancelled && request.url.path == '/api/v1/appointments') {
        return failure('DEPENDENCY_UNAVAILABLE', status: 503);
      }
      return null;
    });
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Hủy lịch'));
    await tapVisible(tester, find.text('Xác nhận hủy lịch'));
    expect(find.text('Đã hủy lịch hẹn.'), findsOneWidget);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.byType(AppointmentCard), findsOneWidget);
    expect(find.text('Hủy lịch'), findsNothing);
    expect(gateway.writes.length, 1);
  });

  testWidgets(
      'QR renders after fresh detail while readable content hides identifiers',
      (tester) async {
    final gateway = AppointmentGateway(
        appointments: [appointmentJson(status: 'CONFIRMED')]);
    await showAppointments(tester, gateway);
    await tapVisible(tester, find.text('Xem vé QR'));
    expect(find.byType(QrImageView), findsOneWidget);
    expect(
        tester
            .widget<AppointmentTicketCard>(find.byType(AppointmentTicketCard))
            .appointment
            .id,
        appointmentId);
    expect(find.text(appointmentId), findsNothing);
    expect(find.text(doctorId), findsNothing);
    expect(
        gateway.requests
            .where((request) =>
                request.url.path == '/api/v1/appointments/$appointmentId')
            .length,
        1);
    expect(gateway.writes, isEmpty);
  });

  for (final code in ['CANCELLED', 'FORBIDDEN']) {
    testWidgets('QR is withheld when fresh detail is $code', (tester) async {
      final gateway = AppointmentGateway(
          appointments: [appointmentJson(status: 'CONFIRMED')],
          override: (request) async =>
              request.url.path == '/api/v1/appointments/$appointmentId'
                  ? code == 'CANCELLED'
                      ? success(appointmentJson(status: 'CANCELLED'))
                      : failure('FORBIDDEN', status: 403)
                  : null);
      await showAppointments(tester, gateway);
      await tapVisible(tester, find.text('Xem vé QR'));
      expect(find.byType(QrImageView), findsNothing);
      expect(
          code == 'FORBIDDEN'
              ? find.text('Thử lại vé')
              : find.textContaining('chưa được xác nhận'),
          findsOneWidget);
    });
  }

  testWidgets(
      'TV1 ticket injection receives authoritative fresh appointment data',
      (tester) async {
    PatientAppointment? input;
    final gateway = AppointmentGateway(
        appointments: [appointmentJson(status: 'CONFIRMED')]);
    await showAppointments(tester, gateway, ticketBuilder: (_, appointment) {
      input = appointment;
      return const Text('Vé từ widget TV1');
    });
    await tapVisible(tester, find.text('Xem vé QR'));
    expect(find.text('Vé từ widget TV1'), findsOneWidget);
    expect(input!.id, appointmentId);
    expect(input!.doctorName, 'Bác sĩ An');
    expect(input!.status, 'CONFIRMED');
  });

  for (final size in [const Size(360, 740), const Size(414, 896)]) {
    testWidgets(
        'list, change sheet and QR fit ${size.width} with large text; visual evidence',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
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
      final boundary = GlobalKey();
      final gateway = AppointmentGateway(
          appointments: [appointmentJson(status: 'CONFIRMED')]);
      await showAppointments(tester, gateway, boundary: boundary);
      await captureReview(
          tester, boundary, 'appointment-list-${size.width.toInt()}');
      await tapVisible(tester, find.text('Đổi lịch'));
      await chooseSlot(tester, '10:00–10:30');
      await captureReview(
          tester, boundary, 'appointment-reschedule-${size.width.toInt()}');
      await tapVisible(tester, find.byTooltip('Đóng'));
      await tapVisible(tester, find.text('Hủy lịch'));
      final doctorLabel = find.descendant(
          of: find.byType(RescheduleSheet), matching: find.text('Bác sĩ An'));
      final sheetBar = find.descendant(
          of: find.byType(RescheduleSheet), matching: find.byType(AppBar));
      expect(tester.getTopLeft(doctorLabel).dy,
          greaterThanOrEqualTo(tester.getBottomLeft(sheetBar).dy));
      final content = find.descendant(
          of: find.byType(RescheduleSheet), matching: find.byType(ListView));
      expect(tester.widget<ListView>(content).controller!.offset, 0);
      await captureReview(
          tester, boundary, 'appointment-cancel-${size.width.toInt()}');
      await tapVisible(tester, find.byTooltip('Đóng'));
      await tapVisible(tester, find.text('Xem vé QR'));
      await captureReview(
          tester, boundary, 'appointment-qr-${size.width.toInt()}');
      expect(tester.takeException(), isNull);
    });
  }
}
