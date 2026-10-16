import 'dart:async';
import 'dart:convert';

import 'package:clinic_patient_app/core/api/clinic_api_client.dart';
import 'package:clinic_patient_app/core/session/session.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
import 'package:clinic_patient_app/features/appointments/booking_selection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _session = AuthSession(
    userId: 'patient-test', role: UserRole.patient, accessToken: 'test-token');
final _selection = BookingSelection(
    doctorId: 'doctor-1',
    doctorName: 'Bác sĩ An',
    specialtyId: 'specialty-1',
    startAt: DateTime.utc(2030, 1, 7, 1),
    endAt: DateTime.utc(2030, 1, 7, 1, 30));

http.Response _success(Object data, {int status = 200}) =>
    http.Response(jsonEncode({'success': true, 'data': data}), status,
        headers: {'content-type': 'application/json; charset=utf-8'});

http.Response _failure(String code, int status) => http.Response(
    jsonEncode({
      'success': false,
      'error': {'code': code, 'message': code}
    }),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'});

ClinicApiClient _api(Future<http.Response> Function(http.Request) handler) =>
    ClinicApiClient(
        tokenProvider: _session,
        transport: MockClient(handler),
        baseUrl: 'http://gateway.test');

Future<void> _open(WidgetTester tester, ClinicApiClient api,
    {ValueChanged<BookingSelection?>? onResult}) async {
  await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: Builder(
    builder: (context) => TextButton(
        onPressed: () async {
          final result = await showBookingConfirmationSheet(context,
              selection: _selection, api: api);
          onResult?.call(result);
        },
        child: const Text('Đặt lịch')),
  ))));
  await tester.tap(find.text('Đặt lịch'));
  await tester.pumpAndSettle();
}

Future<void> _submit(WidgetTester tester) async {
  await tester.scrollUntilVisible(find.byType(FilledButton), 150,
      scrollable: find
          .descendant(
              of: find.byType(BookingConfirmationSheet),
              matching: find.byType(Scrollable))
          .first);
  await tester.tap(find.byType(FilledButton));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
      'submits UTC times and patient actor with a key; returns only on success',
      (tester) async {
    final requests = <http.Request>[];
    BookingSelection? booked;
    await _open(tester, _api((request) async {
      requests.add(request);
      return _success({'id': 'appointment-1', 'status': 'PENDING'},
          status: 201);
    }), onResult: (result) => booked = result);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(find.textContaining('08:00–08:30 (giờ Việt Nam)'), findsOneWidget);
    expect(requests, isEmpty);
    await tester.enterText(find.byType(TextField), '  Khám tổng quát  ');
    await _submit(tester);
    expect(requests, hasLength(1));
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/v1/appointments');
    expect(requests.single.headers['Authorization'], 'Bearer test-token');
    expect(requests.single.headers['Idempotency-Key'], isNotEmpty);
    expect(jsonDecode(requests.single.body), {
      'doctorId': 'doctor-1',
      'specialtyId': 'specialty-1',
      'scheduledStartAt': '2030-01-07T01:00:00.000Z',
      'scheduledEndAt': '2030-01-07T01:30:00.000Z',
      'reason': 'Khám tổng quát',
    });
    expect(booked, same(_selection));
    expect(find.byType(BookingConfirmationSheet), findsNothing);
  });

  testWidgets('duplicate taps and back cannot close a pending submission',
      (tester) async {
    final response = Completer<http.Response>();
    var writes = 0;
    await _open(tester, _api((request) {
      writes++;
      return response.future;
    }));
    await tester.ensureVisible(find.byType(FilledButton));
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
    expect(
        tester
            .widget<IconButton>(find.byWidgetPredicate(
                (widget) => widget is IconButton && widget.tooltip == 'Đóng'))
            .onPressed,
        isNull);
    await tester.tap(find.byType(FilledButton));
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    expect(writes, 1);
    response.complete(_success({'id': 'appointment-1'}));
    await tester.pumpAndSettle();
    expect(find.byType(BookingConfirmationSheet), findsNothing);
  });

  testWidgets(
      'slot conflict preserves reason, reloads slots, uses new key for replacement',
      (tester) async {
    final writes = <http.Request>[];
    var slotReads = 0;
    BookingSelection? booked;
    await _open(tester, _api((request) async {
      if (request.method == 'POST') {
        writes.add(request);
        return writes.length == 1
            ? _failure('APPOINTMENT_SLOT_UNAVAILABLE', 409)
            : _success({'id': 'appointment-2'}, status: 201);
      }
      expect(request.url.path, '/api/v1/doctors/doctor-1/available-slots');
      expect(request.url.queryParameters['date'], '2030-01-07');
      slotReads++;
      return _success([
        {'startAt': '2030-01-07T01:00:00Z', 'endAt': '2030-01-07T01:30:00Z'},
        {'startAt': '2030-01-07T02:00:00Z', 'endAt': '2030-01-07T02:30:00Z'},
      ]);
    }), onResult: (result) => booked = result);
    await tester.enterText(find.byType(TextField), 'Đau đầu');
    await _submit(tester);
    expect(slotReads, 1);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Đau đầu');
    expect(find.textContaining('lý do khám đã được giữ lại'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
    expect(find.text('08:00–08:30'), findsNothing);
    await tester.ensureVisible(find.text('09:00–09:30'));
    await tester.tap(find.text('09:00–09:30'));
    await tester.pumpAndSettle();
    await _submit(tester);
    expect(writes, hasLength(2));
    expect(writes[1].headers['Idempotency-Key'],
        isNot(writes[0].headers['Idempotency-Key']));
    expect(jsonDecode(writes[1].body)['reason'], 'Đau đầu');
    expect(jsonDecode(writes[1].body)['scheduledStartAt'],
        '2030-01-07T02:00:00.000Z');
    expect(booked!.startAt, DateTime.utc(2030, 1, 7, 2));
  });

  testWidgets(
      'network retry preserves key and input; changed payload gets a new key',
      (tester) async {
    final requests = <http.Request>[];
    await _open(tester, _api((request) async {
      requests.add(request);
      throw http.ClientException('offline');
    }));
    await tester.enterText(find.byType(TextField), 'Tư vấn sức khỏe');
    await _submit(tester);
    await _submit(tester);
    expect(requests, hasLength(2));
    expect(requests[1].headers['Idempotency-Key'],
        requests[0].headers['Idempotency-Key']);
    expect(requests[1].body, requests[0].body);
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Khám lại');
    await _submit(tester);
    expect(requests[2].headers['Idempotency-Key'],
        isNot(requests[1].headers['Idempotency-Key']));
  });

  testWidgets(
      'empty slots and failed refresh offer recovery without losing input',
      (tester) async {
    var slotReads = 0;
    await _open(tester, _api((request) async {
      if (request.method == 'POST') {
        return _failure('APPOINTMENT_SLOT_UNAVAILABLE', 409);
      }
      slotReads++;
      return slotReads == 1
          ? _failure('UPSTREAM_SERVICE_UNAVAILABLE', 502)
          : _success([]);
    }));
    await tester.enterText(find.byType(TextField), 'Giữ nội dung');
    await _submit(tester);
    expect(
        find.textContaining('Không thể tải khung giờ trống'), findsOneWidget);
    await tester.ensureVisible(find.text('Thử lại'));
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Ngày này đã hết khung giờ trống'), findsOneWidget);
    expect(find.text('Chọn ngày khác'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Giữ nội dung');
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
  });

  testWidgets('closing confirmation does not create an appointment',
      (tester) async {
    var writes = 0;
    await _open(tester, _api((request) async {
      writes++;
      return _success({'id': 'unexpected'});
    }));
    await tester.tap(find.byTooltip('Đóng'));
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.byType(BookingConfirmationSheet), findsNothing);
  });

  testWidgets('patient can choose another date when all slots are taken',
      (tester) async {
    final dates = <String>[];
    await _open(tester, _api((request) async {
      if (request.method == 'POST') {
        return _failure('APPOINTMENT_SLOT_UNAVAILABLE', 409);
      }
      final date = request.url.queryParameters['date']!;
      dates.add(date);
      return _success(dates.length == 1
          ? []
          : [
              {
                'startAt': '${date}T02:00:00Z',
                'endAt': '${date}T02:30:00Z',
              }
            ]);
    }));
    await tester.enterText(find.byType(TextField), 'Khám lại');
    await _submit(tester);
    await tester.ensureVisible(find.text('Chọn ngày khác'));
    await tester.tap(find.text('Chọn ngày khác'));
    await tester.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(dates, hasLength(2));
    expect(dates.last, isNot(dates.first));
    expect(find.text('09:00–09:30'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Khám lại');
  });

  testWidgets(
      'legacy BookingSelection opens confirmation and reloads list on success',
      (tester) async {
    var created = false;
    final api = _api((request) async {
      if (request.method == 'POST') {
        created = true;
        return _success({'id': 'appointment-1'}, status: 201);
      }
      if (request.url.path == '/api/v1/doctors/doctor-1') {
        return _success({'displayName': 'Bác sĩ An'});
      }
      return _success({
        'items': created
            ? [
                {
                  'id': 'appointment-1',
                  'doctorId': 'doctor-1',
                  'status': 'PENDING',
                  'scheduledStartAt': '2030-01-07T01:00:00Z',
                  'scheduledEndAt': '2030-01-07T01:30:00Z',
                }
              ]
            : [],
        'page': 1,
        'limit': 20,
        'total': created ? 1 : 0
      });
    });
    await tester.pumpWidget(MaterialApp(
        home: AppointmentsPage(
            tokenProvider: _session, api: api, bookingSelection: _selection)));
    await tester.pumpAndSettle();
    expect(find.byType(BookingConfirmationSheet), findsOneWidget);
    await _submit(tester);
    expect(created, isTrue);
    expect(find.byType(BookingConfirmationSheet), findsNothing);
    expect(find.text('Bác sĩ An'), findsOneWidget);
    expect(find.text('Xem và xác nhận đặt lịch'), findsNothing);
  });

  testWidgets('confirmation fits a narrow screen with keyboard and large text',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await _open(tester, _api((_) async => _success({'id': 'appointment-1'})));
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    await tester.enterText(find.byType(TextField), 'Khám tổng quát');
    await tester.pumpAndSettle();
    await _submit(tester);
    expect(tester.takeException(), isNull);
    tester.view.resetViewInsets();
  });
}
