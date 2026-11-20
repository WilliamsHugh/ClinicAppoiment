import 'package:clinic_patient_app/app/patient_app.dart';
import 'package:clinic_patient_app/features/appointments/appointments_page.dart';
import 'package:clinic_patient_app/features/appointments/booking_confirmation_sheet.dart';
import 'package:clinic_patient_app/features/appointments/widgets/appointment_card.dart';
import 'package:clinic_patient_app/features/appointments/widgets/appointment_ticket.dart';
import 'package:clinic_patient_app/features/appointments/widgets/reschedule_sheet.dart';
import 'package:clinic_patient_app/features/doctors/doctor_detail_page.dart';
import 'package:clinic_patient_app/features/doctors/doctor_directory_page.dart';
import 'package:clinic_patient_app/features/doctors/doctors_page.dart';
import 'package:clinic_patient_app/features/notifications/notifications_page.dart';
import 'package:clinic_patient_app/features/records/widgets/record_detail_sheet.dart';
import 'package:clinic_patient_app/features/users/profile_page.dart';
import 'package:clinic_patient_app/shared/widgets/pagination_controls.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

import '../e2e/e2e_helpers.dart';
import '../e2e/fake_clinic_gateway.dart';

void main() {
  setUp(() => WidgetController.hitTestWarningShouldBeFatal = true);
  tearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);

  Future<({FakeSessionProvider session, FakeClinicGateway gateway})>
      pumpAuthenticatedApp(
    WidgetTester tester, {
    FakeSessionProvider? session,
    FakeClinicGateway? gateway,
  }) async {
    final s = session ?? FakeSessionProvider();
    final g = gateway ?? FakeClinicGateway(tokenProvider: s);
    await tester.pumpWidget(
      PatientApp(key: ValueKey(g), sessionProvider: s, apiClient: g.apiClient),
    );
    await tester.pumpAndSettle();
    return (session: s, gateway: g);
  }

  group('Tier 1 — Feature Coverage (Cả 5 Tab & API Contract v2)', () {
    testWidgets(
        'T1.1 Shell 5 tab giữ màu #2D5BFF, NavigationBar.indicatorColor, không double AppBar và 0 endpoint cấm',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);

      for (final label in const [
        'Bác sĩ',
        'Lịch hẹn',
        'Hồ sơ khám',
        'Thông báo',
        'Cá nhân',
      ]) {
        await tapNavTab(tester, label);
        expectShellIntegrity(tester);
      }

      expect(find.text('Hồ sơ cá nhân'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
      expect(
        gateway.requests.any((r) => r.path.contains('/time-offs')),
        isFalse,
      );
      expect(
        gateway.requests.any((r) => r.path == '/api/v1/appointments/summary'),
        isFalse,
      );
      expect(
        gateway.requests.any((r) => r.path.contains('/auth/password/')),
        isFalse,
      );
    });

    testWidgets(
        'T1.2 Tab 1 Bác sĩ: lọc chuyên khoa, tìm bác sĩ, ẩn/hiện phân trang theo total > limit, chi tiết chỉ hiện lịch isActive=true',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);

      // Mặc định 2 bản ghi (total <= limit=20) -> PaginationControls ẩn giao diện
      expect(find.textContaining('Trang 1 /'), findsNothing);
      expect(find.byTooltip('Trang sau'), findsNothing);
      expect(find.text('BS. Nguyễn Văn An'), findsOneWidget);
      expect(find.text('BS. Trần Thị Bình'), findsOneWidget);

      // Lọc chuyên khoa Tim mạch
      final timMachChip = find.descendant(
        of: find.byType(DoctorDirectoryPage),
        matching: find.text('Tim mạch'),
      );
      await tapVisible(tester, timMachChip.first);
      expect(find.text('BS. Nguyễn Văn An'), findsOneWidget);
      expect(find.text('BS. Trần Thị Bình'), findsNothing);
      expect(
        gateway
            .requestsTo('/api/v1/doctors', method: 'GET')
            .last
            .queryParameters['specialtyId'],
        'spec-cardio',
      );

      // Tìm kiếm bác sĩ theo tên
      await enterDoctorSearch(tester, 'An');
      expect(
        gateway
            .requestsTo('/api/v1/doctors', method: 'GET')
            .last
            .queryParameters['q'],
        'An',
      );
      expect(find.text('BS. Nguyễn Văn An'), findsOneWidget);

      // Mở chi tiết bác sĩ: chỉ hiện schedule isActive=true (09:00–12:00), ẩn isActive=false (13:00–17:00)
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      expect(find.byType(DoctorDetailPage), findsOneWidget);
      final detailScroll = find
          .descendant(
            of: find.byType(DoctorDetailPage),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('09:00–12:00 · 30 phút/lượt'),
        180,
        scrollable: detailScroll,
      );
      expect(find.text('09:00–12:00 · 30 phút/lượt'), findsOneWidget);
      expect(find.text('13:00–17:00 · 30 phút/lượt'), findsNothing);
      expect(gateway.forbiddenHits, isEmpty);

      // Kiểm chứng hiện PaginationControls khi total > limit (tuần tự chuyên khoa ở đầu và bác sĩ ở cuối)
      final s2 = FakeSessionProvider();
      final g2 = FakeClinicGateway(
        tokenProvider: s2,
        doctorsTotalOverride: 25,
        specialtiesTotalOverride: 25,
      );
      await pumpAuthenticatedApp(tester, session: s2, gateway: g2);
      final dirScroll = find
          .descendant(
            of: find.byType(DoctorDirectoryPage),
            matching: find.byType(Scrollable),
          )
          .first;

      // 1. Đầu danh sách: PaginationControls chuyên khoa hiển thị cùng 'Trang 1 / 2' và nằm trên tiêu đề 'Bác sĩ'
      final specialtyPagination = find.byType(PaginationControls).first;
      expect(specialtyPagination, findsOneWidget);
      expect(
        find.descendant(
          of: specialtyPagination,
          matching: find.text('Trang 1 / 2'),
        ),
        findsOneWidget,
      );
      final doctorsHeading = find
          .descendant(
            of: find.byType(DoctorDirectoryPage),
            matching: find.text('Bác sĩ'),
          )
          .first;
      expect(
        tester.getTopLeft(specialtyPagination).dy,
        lessThan(tester.getTopLeft(doctorsHeading).dy),
      );

      // 2. Cuối danh sách: cuộn xuống đáy ListView, kiểm chứng PaginationControls bác sĩ nằm dưới 'BS. Trần Thị Bình'
      await tester.drag(dirScroll, const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(find.text('BS. Trần Thị Bình'), findsOneWidget);
      final doctorPagination = find.byType(PaginationControls).last;
      expect(
        find.descendant(
          of: doctorPagination,
          matching: find.text('Trang 1 / 2'),
        ),
        findsOneWidget,
      );
      expect(
        tester.getTopLeft(doctorPagination).dy,
        greaterThan(tester.getTopLeft(find.text('BS. Trần Thị Bình')).dy),
      );
      expect(g2.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T1.3 Tab 2 Lịch hẹn: 3 tab đủ 6 trạng thái, vé QR QrImageView ẩn UUID thô, đổi lịch & hủy lịch có Idempotency-Key',
        (tester) async {
      final session = FakeSessionProvider();
      final gateway =
          FakeClinicGateway(tokenProvider: session, seedDefaults: false);
      gateway.specialties.add({
        'id': 'spec-cardio',
        'name': 'Tim mạch',
        'isActive': true,
      });
      gateway.doctors.add({
        'id': 'doctor-1',
        'specialtyId': 'spec-cardio',
        'displayName': 'BS. Nguyễn Văn An',
        'bio': 'Chuyên khoa Tim mạch',
        'isActive': true,
      });
      final d1 = clinicDay(1);
      final d2 = clinicDay(2);
      const confirmedId = '550e8400-e29b-41d4-a716-446655440001';
      gateway.appointments.addAll([
        gateway.buildAppointment(
          id: 'appt-status-pending',
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: vnSlotUtc(d1, 8, 0).startAt,
          endAt: vnSlotUtc(d1, 8, 0).endAt,
          status: 'PENDING',
          reason: 'Khám mới',
        ),
        gateway.buildAppointment(
          id: confirmedId,
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: vnSlotUtc(d1, 9, 0).startAt,
          endAt: vnSlotUtc(d1, 9, 0).endAt,
          status: 'CONFIRMED',
          reason: 'Đã xác nhận',
        ),
        gateway.buildAppointment(
          id: 'appt-status-checked-in',
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: vnSlotUtc(d1, 10, 0).startAt,
          endAt: vnSlotUtc(d1, 10, 0).endAt,
          status: 'CHECKED_IN',
        ),
        gateway.buildAppointment(
          id: 'appt-status-completed',
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: '2026-01-10T02:00:00.000Z',
          endAt: '2026-01-10T02:30:00.000Z',
          status: 'COMPLETED',
        ),
        gateway.buildAppointment(
          id: 'appt-status-no-show',
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: '2026-01-11T02:00:00.000Z',
          endAt: '2026-01-11T02:30:00.000Z',
          status: 'NO_SHOW',
        ),
        gateway.buildAppointment(
          id: 'appt-status-cancelled',
          doctorId: 'doctor-1',
          specialtyId: 'spec-cardio',
          startAt: vnSlotUtc(d2, 11, 0).startAt,
          endAt: vnSlotUtc(d2, 11, 0).endAt,
          status: 'CANCELLED',
        ),
      ]);
      gateway.userProfile = {
        'id': 'user-patient-1',
        'email': 'patient@example.com',
        'fullName': 'Nguyễn Minh Khang',
        'phone': '0901234567',
        'role': 'PATIENT',
        'status': 'ACTIVE',
      };
      gateway.patientProfile = {
        'id': 'patient-1',
        'userId': 'user-patient-1',
        'insuranceNumber': 'DN40112345678',
      };

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);
      await tapNavTab(tester, 'Lịch hẹn');

      // Tab Sắp tới: cuộn để xác minh đủ cả 3 trạng thái PENDING, CONFIRMED, CHECKED_IN
      expect(find.text('Chờ xác nhận'), findsOneWidget);
      expect(find.text('Đã xác nhận'), findsOneWidget);
      final apptScroll = find
          .descendant(
            of: find.byType(AppointmentsPage),
            matching: find.byType(Scrollable),
          )
          .first;
      final checkedInFinder = find.byWidgetPredicate(
        (w) =>
            w is Text &&
            (w.data == 'Đã check-in' || w.data == 'Đã tiếp đón'),
      );
      await tester.scrollUntilVisible(
        checkedInFinder,
        200,
        scrollable: apptScroll,
      );
      expectCheckedInStatusVisible();

      // Cuộn lên lại đầu danh sách để mở vé QR của lịch CONFIRMED
      await tester.scrollUntilVisible(
        find.text('Xem vé QR'),
        -200,
        scrollable: apptScroll,
      );
      await tapVisible(tester, find.text('Xem vé QR'));
      expect(find.byType(AppointmentTicketSheet), findsOneWidget);
      expect(find.byType(QrImageView), findsOneWidget);
      expect(find.text(confirmedId), findsNothing);
      await tapVisible(tester, find.byTooltip('Đóng vé'));

      // Tab Lịch sử: 2 lịch (COMPLETED, NO_SHOW)
      await tapVisible(tester, find.text('Lịch sử'));
      expect(find.byType(AppointmentCard), findsNWidgets(2));
      expect(find.text('Hoàn thành'), findsOneWidget);
      expect(find.text('Không đến'), findsOneWidget);

      // Tab Đã hủy: 1 lịch (CANCELLED)
      await tapVisible(tester, find.text('Đã hủy').first);
      expect(find.byType(AppointmentCard), findsOneWidget);

      // Quay về Sắp tới -> Đổi lịch hẹn đầu tiên sang ngày d2
      await tapVisible(tester, find.text('Sắp tới'));
      await tapVisible(tester, find.text('Đổi lịch').first);
      expect(find.byType(RescheduleSheet), findsOneWidget);
      await selectClinicDate(tester, find.byType(RescheduleSheet), d2);
      await selectRescheduleSlot(
        tester,
        find.byType(RescheduleSheet),
        '10:00–10:30',
      );
      await tapVisible(tester, find.text('Xác nhận đổi lịch'));
      final rescheduleReq = gateway.requests
          .where((r) => r.method == 'PATCH' && r.path.endsWith('/reschedule'))
          .single;
      expect(rescheduleReq.idempotencyKey, isNotNull);
      expect(
        rescheduleReq.jsonBody!['scheduledStartAt'],
        vnSlotUtc(d2, 10, 0).startAt,
      );

      // Hủy lịch
      await tapVisible(tester, find.text('Hủy lịch').first);
      await tapVisible(tester, find.text('Xác nhận hủy lịch'));
      final cancelReq = gateway.requests
          .where((r) => r.method == 'PATCH' && r.path.endsWith('/cancel'))
          .single;
      expect(cancelReq.idempotencyKey, isNotNull);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T1.4 Tab 3 Hồ sơ khám: tải danh sách và mở RecordDetailSheet xem đơn thuốc',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      await tapNavTab(tester, 'Hồ sơ khám');

      expect(gateway.requestsTo('/api/v1/medical-records', method: 'GET'),
          isNotEmpty);
      expect(find.text('Viêm họng cấp'), findsOneWidget);

      await tapVisible(tester, find.text('Viêm họng cấp'));
      expect(find.byType(RecordDetailSheet), findsOneWidget);
      expect(find.text('Paracetamol'), findsOneWidget);
      expect(find.textContaining('500mg'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T1.5 Tab 4 Thông báo: danh sách thông báo, PATCH .../read và PATCH .../read-all',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      await tapNavTab(tester, 'Thông báo');

      expect(find.text('Lịch hẹn đã được xác nhận'), findsOneWidget);
      expect(find.text('Có kết quả khám mới'), findsOneWidget);

      await tapVisible(tester, findMarkReadButton().first);
      expect(
        gateway.requests.any(
          (r) => r.method == 'PATCH' && r.path.endsWith('/read'),
        ),
        isTrue,
      );

      // Khi M4 có bộ lọc "Chưa đọc", kiểm chứng GET /notifications?status=UNREAD
      final unreadFilter = find.text('Chưa đọc');
      if (unreadFilter.evaluate().isNotEmpty) {
        await tapVisible(tester, unreadFilter.first);
        expect(
          gateway
              .requestsTo('/api/v1/notifications', method: 'GET')
              .last
              .queryParameters['status'],
          'UNREAD',
        );
        expect(find.text('Có kết quả khám mới'), findsOneWidget);
        expect(find.text('Lịch hẹn đã được xác nhận'), findsNothing);
        await tapVisible(tester, find.text('Tất cả').first);
      }

      await tapVisible(tester, find.text('Đọc tất cả'));
      expect(
        gateway.requestsTo('/api/v1/notifications/read-all', method: 'PATCH'),
        hasLength(1),
      );
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T1.6 Tab 5 Cá nhân: hiển thị hồ sơ, validation lỗi trước PATCH, cập nhật 2 bước PATCH /users/me (chỉ fullName+phone) + PATCH /patients/{id}',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      await tapNavTab(tester, 'Cá nhân');

      expect(find.text('NGUYỄN MINH KHANG'), findsOneWidget);
      expect(find.text('DN401...***'), findsNWidgets(2));
      expect(find.text('DN40112345678'), findsNothing);

      // Khi M5 tải /api/v1/auth/session & /api/v1/auth/sessions, kiểm chứng hiển thị phiên hiện tại & phiên khác
      if (gateway.requestsTo('/api/v1/auth/sessions', method: 'GET').isNotEmpty) {
        final profileScroll = find
            .descendant(
              of: find.byType(ProfilePage),
              matching: find.byType(Scrollable),
            )
            .first;
        await tester.scrollUntilVisible(
          find.text('Phiên hiện tại'),
          200,
          scrollable: profileScroll,
        );
        expect(find.text('Phiên hiện tại'), findsOneWidget);
        expect(find.text('Thu hồi'), findsOneWidget);
      }

      await tapVisible(tester, find.text('Chỉnh sửa thông tin hồ sơ'));

      // Nhập tên rỗng -> báo lỗi validation và không gửi PATCH
      final nameField = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Họ và tên',
      );
      await tester.enterText(nameField, '   ');
      await tapVisible(tester, find.text('Lưu thay đổi'));
      expect(find.byKey(const Key('profile-validation-error')), findsOneWidget);
      expect(gateway.requests.where((r) => r.method == 'PATCH'), isEmpty);

      // Nhập tên hợp lệ -> confirm -> PATCH /users/me (đúng 2 key) + PATCH /patients/{id}
      await tester.enterText(nameField, 'Nguyễn Minh Khang Mới');
      await tapVisible(tester, find.text('Lưu thay đổi'));
      expect(find.text('Xác nhận cập nhật hồ sơ?'), findsOneWidget);
      await tapVisible(
        tester,
        find.byKey(const Key('confirm-save-profile-button')),
      );

      final userPatch =
          gateway.requestsTo('/api/v1/users/me', method: 'PATCH').single;
      expect(userPatch.jsonBody!.keys.toSet(), {'fullName', 'phone'});
      expect(userPatch.jsonBody!['fullName'], 'Nguyễn Minh Khang Mới');

      final patientPatch =
          gateway.requestsTo('/api/v1/patients/patient-1', method: 'PATCH').single;
      expect(patientPatch.jsonBody, isNotNull);
      expect(find.text('NGUYỄN MINH KHANG MỚI'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });
  });

  group('Tier 2 — Boundary, Error Handling, Conflict 409 & UTC+7', () {
    testWidgets(
        'T2.1 Empty states trên cả 4 tab danh sách & khôi phục sau Xóa bộ lọc ở Tab 1',
        (tester) async {
      final session = FakeSessionProvider();
      final gateway =
          FakeClinicGateway(tokenProvider: session, seedDefaults: false);
      gateway.specialties.add(
          {'id': 'spec-1', 'name': 'Nội tổng quát', 'isActive': true});
      gateway.doctors.add({
        'id': 'doctor-1',
        'specialtyId': 'spec-1',
        'displayName': 'BS. Lê Văn Cường',
        'isActive': true,
      });
      gateway.userProfile = {
        'id': 'user-patient-1',
        'email': 'patient@example.com',
        'fullName': 'Nguyễn Minh Khang',
        'role': 'PATIENT',
        'status': 'ACTIVE',
      };
      gateway.patientProfile = {'id': 'patient-1', 'userId': 'user-patient-1'};

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);

      // Tab 1: tìm không ra bác sĩ -> empty state + Xóa bộ lọc khôi phục
      await enterDoctorSearch(tester, 'KhongTonTai');
      expect(find.text('Chưa có bác sĩ'), findsOneWidget);
      await tapVisible(tester, find.text('Xóa bộ lọc'));
      expect(find.text('BS. Lê Văn Cường'), findsOneWidget);

      // Tab 1 Detail: hết slot trống
      final d1 = clinicDay(1);
      gateway.slotsByDoctorDate['doctor-1|$d1'] = [];
      await tapVisible(tester, find.text('BS. Lê Văn Cường'));
      await selectClinicDate(tester, find.byType(DoctorDetailPage), d1);
      final detailScroll = find
          .descendant(
            of: find.byType(DoctorDetailPage),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.byIcon(Icons.event_busy_outlined),
        180,
        scrollable: detailScroll,
      );
      expect(find.byIcon(Icons.event_busy_outlined), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      // Tab 2 rỗng
      await tapNavTab(tester, 'Lịch hẹn');
      expect(find.text('Chưa có lịch hẹn'), findsOneWidget);

      // Tab 3 rỗng (tương thích cả 8db4065 và M3)
      await tapNavTab(tester, 'Hồ sơ khám');
      final hasLegacyRecordsEmpty =
          find.text('Chưa có lịch sử khám').evaluate().isNotEmpty;
      final hasM3RecordsEmpty =
          find.text('Chưa có hồ sơ khám').evaluate().isNotEmpty;
      expect(
        hasLegacyRecordsEmpty || hasM3RecordsEmpty,
        isTrue,
        reason:
            'Kỳ vọng hiển thị empty state Tab 3 ("Chưa có lịch sử khám" hoặc "Chưa có hồ sơ khám")',
      );

      // Tab 4 rỗng
      await tapNavTab(tester, 'Thông báo');
      expect(find.text('Chưa có thông báo'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T2.2 Error handling: 401/503 + Thử lại ở Tab 1/2/3/4, 400 + Thử lại ở available-slots, 403/404 ở NotificationsPage hiện SnackBar không crash',
        (tester) async {
      final session = FakeSessionProvider();
      var failDirectory401 = true;
      var failDirectory = true;
      var failSlots = true;
      var failAppointments = true;
      var failRecords = true;
      var failNotifications = true;
      var failReadNotifCode = 403;

      final gateway = FakeClinicGateway(tokenProvider: session);
      gateway.errorOverride = (request) {
        final path = request.url.path;
        if (failDirectory401 && path == '/api/v1/doctors') {
          return FakeClinicGateway.jsonError(
            401,
            'AUTH_REQUIRED',
            'Phiên đăng nhập đã hết hạn',
          );
        }
        if (failDirectory && path == '/api/v1/doctors') {
          return FakeClinicGateway.jsonError(
            503,
            'DEPENDENCY_UNAVAILABLE',
            'Dịch vụ bác sĩ tạm thời gián đoạn',
          );
        }
        if (failAppointments && path == '/api/v1/appointments') {
          return FakeClinicGateway.jsonError(
            503,
            'DEPENDENCY_UNAVAILABLE',
            'Không thể tải lịch hẹn lúc này',
          );
        }
        if (failRecords && path == '/api/v1/medical-records') {
          return FakeClinicGateway.jsonError(
            503,
            'SERVICE_UNAVAILABLE',
            'Không thể tải hồ sơ khám lúc này',
          );
        }
        if (failNotifications && path == '/api/v1/notifications') {
          return FakeClinicGateway.jsonError(
            503,
            'SERVICE_UNAVAILABLE',
            'Không thể tải thông báo lúc này',
          );
        }
        if (failSlots && path == '/api/v1/doctors/doctor-1/available-slots') {
          return FakeClinicGateway.jsonError(
            400,
            'VALIDATION_ERROR',
            'Ngày khám không hợp lệ',
          );
        }
        if (request.method == 'PATCH' && path.endsWith('/read')) {
          if (failReadNotifCode == 403) {
            return FakeClinicGateway.jsonError(
              403,
              'ACCESS_DENIED',
              'Không có quyền thao tác thông báo này',
            );
          }
          return FakeClinicGateway.jsonError(
            404,
            'NOTIFICATION_NOT_FOUND',
            'Thông báo không tồn tại',
          );
        }
        return null;
      };

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);

      // Tab 1: 401 AUTH_REQUIRED -> Thử lại -> 503 -> Thử lại -> thành công
      expect(find.text('Thử lại'), findsOneWidget);
      expect(find.text('Chưa có bác sĩ'), findsNothing);
      failDirectory401 = false;
      await tapVisible(tester, find.text('Thử lại'));
      expect(find.text('Thử lại'), findsOneWidget);
      expect(find.text('Chưa có bác sĩ'), findsNothing);
      failDirectory = false;
      await tapVisible(tester, find.text('Thử lại'));
      expect(find.text('BS. Nguyễn Văn An'), findsOneWidget);

      // Tab 1 Detail: 400 ở available-slots -> hiện Thử lại (không nhầm là hết slot) -> bấm Thử lại phục hồi slot
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      await selectClinicDate(
        tester,
        find.byType(DoctorDetailPage),
        clinicDay(1),
      );
      final detailScroll = find
          .descendant(
            of: find.byType(DoctorDetailPage),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('Thử lại'),
        180,
        scrollable: detailScroll,
      );
      expect(find.text('Chưa có khung giờ trống'), findsNothing);
      failSlots = false;
      await tapVisible(tester, find.text('Thử lại'));
      await tester.scrollUntilVisible(
        find.text('08:00–08:30'),
        180,
        scrollable: detailScroll,
      );
      expect(find.text('08:00–08:30'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      // Tab 2: 503 -> Thử lại
      await tapNavTab(tester, 'Lịch hẹn');
      expect(find.text('Thử lại'), findsOneWidget);
      expect(find.text('Chưa có lịch hẹn'), findsNothing);
      failAppointments = false;
      await tapVisible(tester, find.text('Thử lại'));
      expect(find.byType(AppointmentCard), findsNWidgets(2));

      // Tab 3: 503 -> Thử lại
      await tapNavTab(tester, 'Hồ sơ khám');
      expect(find.text('Thử lại'), findsOneWidget);
      failRecords = false;
      await tapVisible(tester, find.text('Thử lại'));
      expect(find.text('Viêm họng cấp'), findsOneWidget);

      // Tab 4: 503 -> Thử lại -> 403/404 SnackBar khi đánh dấu đọc
      await tapNavTab(tester, 'Thông báo');
      expect(find.text('Thử lại'), findsOneWidget);
      failNotifications = false;
      await tapVisible(tester, find.text('Thử lại'));
      expect(find.text('Lịch hẹn đã được xác nhận'), findsOneWidget);

      // Tap Đã đọc -> 403 -> SnackBar không crash
      await tapVisible(tester, findMarkReadButton().first);
      expect(tester.takeException(), isNull);
      expect(find.byType(SnackBar), findsOneWidget);
      expect(
        find.textContaining('Không có quyền thao tác thông báo này'),
        findsOneWidget,
      );

      // Đổi sang 404 -> SnackBar không crash
      ScaffoldMessenger.of(tester.element(find.byType(NotificationsPage)))
          .clearSnackBars();
      await tester.pumpAndSettle();
      failReadNotifCode = 404;
      await tapVisible(tester, findMarkReadButton().first);
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Thông báo không tồn tại'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T2.3 Conflict 409 APPOINTMENT_SLOT_UNAVAILABLE khi đặt & đổi lịch (sinh Idempotency-Key mới) và retry lỗi mạng giữ cùng Idempotency-Key',
        (tester) async {
      final session = FakeSessionProvider();
      var bookingAttempt = 0;
      var rescheduleAttempt = 0;

      final gateway = FakeClinicGateway(tokenProvider: session);
      gateway.errorOverride = (request) {
        if (request.method == 'POST' &&
            request.url.path == '/api/v1/appointments') {
          bookingAttempt++;
          if (bookingAttempt == 1) {
            throw http.ClientException('Simulated network reset');
          }
          if (bookingAttempt == 2) {
            return FakeClinicGateway.jsonError(
              409,
              'APPOINTMENT_SLOT_UNAVAILABLE',
              'Khung giờ vừa có người khác đặt.',
            );
          }
        }
        if (request.method == 'PATCH' &&
            request.url.path.endsWith('/reschedule')) {
          rescheduleAttempt++;
          if (rescheduleAttempt == 1) {
            return FakeClinicGateway.jsonError(
              409,
              'APPOINTMENT_SLOT_UNAVAILABLE',
              'Khung giờ đổi lịch vừa hết.',
            );
          }
        }
        return null;
      };

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);

      // Mở bác sĩ -> chọn ngày mai -> chọn slot 08:00–08:30
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      await selectClinicDate(tester, find.byType(DoctorDetailPage), clinicDay(1));
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('08:00–08:30'),
      );
      expect(find.byType(BookingConfirmationSheet), findsOneWidget);

      await tester.enterText(
        find.descendant(
          of: find.byType(BookingConfirmationSheet),
          matching: find.byType(TextField),
        ),
        'Đau ngực nhẹ buổi sáng',
      );

      // Lần 1: Lỗi mạng
      await tapConfirmBooking(tester);
      expect(find.byType(BookingConfirmationSheet), findsOneWidget);

      // Lần 2: Retry cùng payload -> phải giữ CÙNG Idempotency-Key -> gặp 409
      await tapConfirmBooking(tester);
      final postReqsAfter409 =
          gateway.requestsTo('/api/v1/appointments', method: 'POST').toList();
      expect(postReqsAfter409, hasLength(2));
      expect(
        postReqsAfter409[1].idempotencyKey,
        postReqsAfter409[0].idempotencyKey,
      );

      // Lý do khám được giữ lại & tải lại slot thay thế
      expect(
        tester
            .widget<TextField>(find.descendant(
              of: find.byType(BookingConfirmationSheet),
              matching: find.byType(TextField),
            ))
            .controller!
            .text,
        'Đau ngực nhẹ buổi sáng',
      );
      expect(
        find.textContaining('Khung giờ này không còn khả dụng'),
        findsOneWidget,
      );

      // Chọn slot thay thế 10:00–10:30 -> sinh Idempotency-Key MỚI và đặt thành công 201
      await scrollAndTapIn(
        tester,
        find.byType(BookingConfirmationSheet),
        find.descendant(
          of: find.byType(BookingConfirmationSheet),
          matching: find.text('10:00–10:30'),
        ),
      );
      await tapConfirmBooking(tester);

      final postReqsFinal =
          gateway.requestsTo('/api/v1/appointments', method: 'POST').toList();
      expect(postReqsFinal, hasLength(3));
      expect(
        postReqsFinal[2].idempotencyKey,
        isNot(postReqsFinal[1].idempotencyKey),
      );
      expect(selectedNavIndex(tester), 1);

      // Đổi lịch gặp 409 -> giữ reason, reload slots, chọn slot mới và thành công
      await tapVisible(tester, find.text('Đổi lịch').first);
      await selectClinicDate(
        tester,
        find.byType(RescheduleSheet),
        clinicDay(2),
      );
      await selectRescheduleSlot(
        tester,
        find.byType(RescheduleSheet),
        '08:00–08:30',
      );
      await tester.enterText(
        find.descendant(
          of: find.byType(RescheduleSheet),
          matching: find.byType(TextField),
        ),
        'Đổi sang sáng sớm',
      );
      await tapVisible(tester, find.text('Xác nhận đổi lịch'));

      expect(find.byType(RescheduleSheet), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.descendant(
              of: find.byType(RescheduleSheet),
              matching: find.byType(TextField),
            ))
            .controller!
            .text,
        'Đổi sang sáng sớm',
      );
      await selectRescheduleSlot(
        tester,
        find.byType(RescheduleSheet),
        '14:00–14:30',
      );
      await tapVisible(tester, find.text('Xác nhận đổi lịch'));

      final reschedReqs = gateway.requests
          .where((r) => r.method == 'PATCH' && r.path.endsWith('/reschedule'))
          .toList();
      expect(reschedReqs, hasLength(2));
      expect(
        reschedReqs[1].idempotencyKey,
        isNot(reschedReqs[0].idempotencyKey),
      );
      expect(find.byType(RescheduleSheet), findsNothing);
      expect(gateway.forbiddenHits, isEmpty);

      // Trường hợp rớt mạng sau khi server đã ghi nhận POST /api/v1/appointments (201)
      // -> retry cùng payload & cùng Idempotency-Key phải nhận replay 200 OK và KHÔNG tạo trùng lịch
      final sessionReplay = FakeSessionProvider();
      final gatewayReplay = FakeClinicGateway(tokenProvider: sessionReplay);
      final initialApptCount = gatewayReplay.appointments.length;
      var dropFirstPostResponse = true;
      gatewayReplay.afterResponseOverride = (request, response) {
        if (dropFirstPostResponse &&
            request.method == 'POST' &&
            request.url.path == '/api/v1/appointments' &&
            response.statusCode == 201) {
          dropFirstPostResponse = false;
          throw http.ClientException('Connection dropped after server commit');
        }
        return null;
      };

      await pumpAuthenticatedApp(
        tester,
        session: sessionReplay,
        gateway: gatewayReplay,
      );
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      await selectClinicDate(
        tester,
        find.byType(DoctorDetailPage),
        clinicDay(1),
      );
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('14:00–14:30'),
      );
      await tester.enterText(
        find.descendant(
          of: find.byType(BookingConfirmationSheet),
          matching: find.byType(TextField),
        ),
        'Kiểm tra replay idempotency',
      );

      // Lần 1: Server tạo 201 nhưng rớt mạng khi trả response về client
      await tapConfirmBooking(tester);
      expect(find.byType(BookingConfirmationSheet), findsOneWidget);
      expect(gatewayReplay.appointments, hasLength(initialApptCount + 1));

      // Lần 2: Retry cùng payload -> cùng Idempotency-Key -> nhận replay 200 OK, vẫn chỉ có +1 lịch
      await tapConfirmBooking(tester);
      final replayPosts = gatewayReplay
          .requestsTo('/api/v1/appointments', method: 'POST')
          .toList();
      expect(replayPosts, hasLength(2));
      expect(replayPosts[1].idempotencyKey, replayPosts[0].idempotencyKey);
      final postResponses = gatewayReplay.responses
          .where((r) =>
              r.method == 'POST' && r.path == '/api/v1/appointments')
          .toList();
      expect(postResponses.last.statusCode, 200);
      expect(gatewayReplay.appointments, hasLength(initialApptCount + 1));
      expect(selectedNavIndex(tester), 1);
      expect(gatewayReplay.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T2.4 Ranh giới ngày UTC -> UTC+7: 17:30Z thành 00:30 VN hôm sau, 04:30Z (11:30 Sáng) vs 05:00Z (12:00 Chiều), POST đúng UTC gốc',
        (tester) async {
      final session = FakeSessionProvider();
      final gateway = FakeClinicGateway(tokenProvider: session);
      final targetDate = clinicDay(2);
      final midnightBoundary = vnSlotUtc(targetDate, 0, 30);
      final morningEdge = vnSlotUtc(targetDate, 11, 30);
      final afternoonEdge = vnSlotUtc(targetDate, 12, 0);

      // Xác nhận 00:30 VN ngày targetDate có ngày UTC là ngày hôm trước (17:30Z)
      expect(midnightBoundary.startAt.endsWith('T17:30:00.000Z'), isTrue);
      expect(
        midnightBoundary.startAt.substring(0, 10),
        clinicDay(1),
      );

      gateway.slotsByDoctorDate['doctor-1|$targetDate'] = [
        {'startAt': midnightBoundary.startAt, 'endAt': midnightBoundary.endAt},
        {'startAt': morningEdge.startAt, 'endAt': morningEdge.endAt},
        {'startAt': afternoonEdge.startAt, 'endAt': afternoonEdge.endAt},
      ];

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      await selectClinicDate(tester, find.byType(DoctorDetailPage), targetDate);

      final detailScroll = find
          .descendant(
            of: find.byType(DoctorDetailPage),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('12:00–12:30'),
        150,
        scrollable: detailScroll,
      );

      expect(find.text('Buổi sáng'), findsOneWidget);
      expect(find.textContaining('Buổi chiều'), findsOneWidget);
      expect(find.text('00:30–01:00'), findsOneWidget);
      expect(find.text('11:30–12:00'), findsOneWidget);
      expect(find.text('12:00–12:30'), findsOneWidget);

      final yMorning = tester.getTopLeft(find.text('Buổi sáng')).dy;
      final ySlot0030 = tester.getTopLeft(find.text('00:30–01:00')).dy;
      final ySlot1130 = tester.getTopLeft(find.text('11:30–12:00')).dy;
      final yAfternoon =
          tester.getTopLeft(find.textContaining('Buổi chiều')).dy;
      final ySlot1200 = tester.getTopLeft(find.text('12:00–12:30')).dy;
      expect(yMorning, lessThan(ySlot0030));
      expect(ySlot0030, lessThanOrEqualTo(ySlot1130));
      expect(ySlot1130, lessThan(yAfternoon));
      expect(yAfternoon, lessThan(ySlot1200));

      // Đặt slot 00:30–01:00 -> kiểm tra ngày/giờ VN trong BookingConfirmationSheet -> POST phải gửi đúng timestamp UTC 17:30Z gốc
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('00:30–01:00'),
      );
      final bookingSheet = find.byType(BookingConfirmationSheet);
      expect(bookingSheet, findsOneWidget);
      expect(
        find.descendant(
          of: bookingSheet,
          matching: find.textContaining('00:30–01:00'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: bookingSheet,
          matching: find.textContaining(targetDate),
        ),
        findsOneWidget,
      );
      await tapConfirmBooking(tester);

      final postReq =
          gateway.requestsTo('/api/v1/appointments', method: 'POST').single;
      expect(postReq.jsonBody!['scheduledStartAt'], midnightBoundary.startAt);
      expect(postReq.jsonBody!['scheduledEndAt'], midnightBoundary.endAt);

      // Sang Tab 2 thấy lịch mới hiển thị ngày VN của targetDate
      expect(selectedNavIndex(tester), 1);
      expect(
        find.textContaining(clinicDisplayDate(targetDate)),
        findsWidgets,
      );
      expect(find.textContaining('00:30–01:00'), findsWidgets);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T2.5 Tab 3 short appointmentId (apt-1) & short record id (rec-1, diagnosis null) an toàn không crash',
        (tester) async {
      final session = FakeSessionProvider();
      final gateway = FakeClinicGateway(tokenProvider: session);
      gateway.medicalRecords.clear();
      gateway.medicalRecords.addAll([
        {
          'id': 'rec-22222222-2222-4222-8222-222222222222',
          'appointmentId': 'apt-1',
          'patientId': 'patient-1',
          'doctorId': 'doctor-1',
          'diagnosis': 'Khám tổng quát định kỳ',
          'prescription': <Object>[],
          'status': 'FINAL',
          'version': 1,
          'createdAt': '2026-10-16T08:00:00.000Z',
        },
        {
          'id': 'rec-1',
          'appointmentId': 'apt-2',
          'patientId': 'patient-1',
          'doctorId': 'doctor-1',
          'diagnosis': null,
          'prescription': <Object>[],
          'status': 'FINAL',
          'version': 1,
          'createdAt': '2026-10-17T08:00:00.000Z',
        },
      ]);

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);
      await tapNavTab(tester, 'Hồ sơ khám');

      expect(tester.takeException(), isNull);
      expect(find.text('Khám tổng quát định kỳ'), findsOneWidget);
      expect(find.text('Kết quả khám ngày 17/10/2026'), findsOneWidget);

      await tapVisible(tester, find.text('Khám tổng quát định kỳ'));
      expect(tester.takeException(), isNull);
      expect(find.byType(RecordDetailSheet), findsOneWidget);
      expect(find.text('Không có đơn thuốc.'), findsOneWidget);
      Navigator.of(tester.element(find.byType(RecordDetailSheet))).pop();
      await tester.pumpAndSettle();

      await tapVisible(tester, find.text('Kết quả khám ngày 17/10/2026'));
      expect(tester.takeException(), isNull);
      expect(find.byType(RecordDetailSheet), findsOneWidget);
      expect(find.text('Chưa ghi nhận'), findsWidgets);
      expect(find.text('Không có đơn thuốc.'), findsOneWidget);
      Navigator.of(tester.element(find.byType(RecordDetailSheet))).pop();
      await tester.pumpAndSettle();
      expect(gateway.forbiddenHits, isEmpty);
    });
  });

  group('Tier 3 — Cross-Feature Combinations (Liên thông 5 Tab)', () {
    testWidgets(
        'T3.1 Luồng đặt lịch đầu-cuối: Tab 1 chọn chuyên khoa -> bác sĩ -> chi tiết -> chọn ngày -> slot UTC+7 -> xác nhận -> tự chuyển Tab 2 & hiển thị lịch mới',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      expect(selectedNavIndex(tester), 0);

      final chip = find.descendant(
        of: find.byType(DoctorDirectoryPage),
        matching: find.text('Tim mạch'),
      );
      await tapVisible(tester, chip.first);
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      expect(find.byType(DoctorDetailPage), findsOneWidget);

      await selectClinicDate(tester, find.byType(DoctorDetailPage), clinicDay(1));
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('08:00–08:30'),
      );
      expect(find.byType(BookingConfirmationSheet), findsOneWidget);

      await tester.enterText(
        find.descendant(
          of: find.byType(BookingConfirmationSheet),
          matching: find.byType(TextField),
        ),
        'Khám tim mạch định kỳ',
      );
      final apptGetsBefore =
          gateway.requestsTo('/api/v1/appointments', method: 'GET').length;
      await tapConfirmBooking(tester);

      final postReq =
          gateway.requestsTo('/api/v1/appointments', method: 'POST').single;
      expect(postReq.idempotencyKey, isNotNull);
      expect(postReq.jsonBody!['reason'], 'Khám tim mạch định kỳ');

      // Tự động chuyển sang Tab 2 và tải lại danh sách lịch hẹn
      expect(selectedNavIndex(tester), 1);
      expect(find.byType(AppointmentsPage), findsOneWidget);
      expect(
        gateway.requestsTo('/api/v1/appointments', method: 'GET').length,
        greaterThan(apptGetsBefore),
      );
      expect(find.textContaining('Khám tim mạch định kỳ'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T3.2 Tab 1 nút chuông thông báo chuyển sang Tab 4 (selectedIndex == 3)',
        (tester) async {
      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      expect(selectedNavIndex(tester), 0);

      final bell = find.descendant(
        of: find.byType(DoctorsPage),
        matching: find.byTooltip('Thông báo'),
      );
      await tapVisible(tester, bell.first);
      expect(selectedNavIndex(tester), 3);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T3.3 Tab 4 tap thông báo appointmentId -> Tab 2 + PATCH read; tap thông báo recordId -> Tab 3 + refresh + PATCH read; read-all (readBefore)',
        (tester) async {
      final session = FakeSessionProvider();
      final gateway = FakeClinicGateway(tokenProvider: session);
      gateway.readAllCutoffIso = '2026-10-20T09:30:00.000Z';
      gateway.notifications.add({
        'id': 'notif-after-cutoff',
        'recipientUserId': 'user-patient-1',
        'type': 'APPOINTMENT_REMINDER',
        'title': 'Thông báo mới sau cutoff',
        'message': 'Nhắc lịch tái khám',
        'status': 'UNREAD',
        'payload': <String, dynamic>{},
        'createdAt': '2026-10-20T10:00:00.000Z',
      });

      await pumpAuthenticatedApp(tester, session: session, gateway: gateway);
      await tapNavTab(tester, 'Thông báo');

      // Tap thông báo appointmentId -> Tab 2 + PATCH read
      await tapVisible(tester, find.text('Lịch hẹn đã được xác nhận'));
      expect(selectedNavIndex(tester), 1);
      expect(
        gateway.requestsTo(
          '/api/v1/notifications/notif-appt-1/read',
          method: 'PATCH',
        ),
        hasLength(1),
      );

      // Quay lại Tab 4 -> tap thông báo recordId -> Tab 3 + refresh records + PATCH read
      await tapNavTab(tester, 'Thông báo');
      final recordsGetBefore =
          gateway.requestsTo('/api/v1/medical-records', method: 'GET').length;
      await tapVisible(tester, find.text('Có kết quả khám mới'));
      expect(selectedNavIndex(tester), 2);
      expect(
        gateway.requestsTo('/api/v1/medical-records', method: 'GET').length,
        greaterThan(recordsGetBefore),
      );
      expect(
        gateway.requestsTo(
          '/api/v1/notifications/notif-rec-1/read',
          method: 'PATCH',
        ),
        hasLength(1),
      );

      // Quay lại Tab 4 -> Đọc tất cả theo server cutoff readBefore
      await tapNavTab(tester, 'Thông báo');
      await tapVisible(tester, find.text('Đọc tất cả'));
      expect(
        gateway.requestsTo('/api/v1/notifications/read-all', method: 'PATCH'),
        hasLength(1),
      );
      // Thông báo sau cutoff vẫn giữ UNREAD cả trên state giả lập lẫn trên UI
      final afterCutoff = gateway.notifications.firstWhere(
        (n) => n['id'] == 'notif-after-cutoff',
      );
      expect(afterCutoff['status'], 'UNREAD');
      expect(find.text('Thông báo mới sau cutoff'), findsOneWidget);
      expect(findMarkReadButton(), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });
  });

  group('Tier 4 — Real-World Patient Journey & Narrow Screen 360x640 @ 1.4x',
      () {
    testWidgets(
        'T4.1 Hành trình bệnh nhân liên hoàn: Đặt lịch -> Xem vé QR / Đổi lịch -> Thông báo & Hồ sơ khám -> Cập nhật hồ sơ Tab 5 -> Đăng xuất về AuthPage',
        (tester) async {
      final (:gateway, :session) = await pumpAuthenticatedApp(tester);

      // 1. Tab 1: Tìm bác sĩ & đặt lịch
      await enterDoctorSearch(tester, 'An');
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      await selectClinicDate(tester, find.byType(DoctorDetailPage), clinicDay(1));
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('08:00–08:30'),
      );
      await tester.enterText(
        find.descendant(
          of: find.byType(BookingConfirmationSheet),
          matching: find.byType(TextField),
        ),
        'Khám tổng quát E2E',
      );
      await tapConfirmBooking(tester);
      expect(selectedNavIndex(tester), 1);
      expect(find.textContaining('Khám tổng quát E2E'), findsOneWidget);

      // 2. Tab 2: Xem vé QR trên lịch đã xác nhận & đổi lịch hẹn mới
      await tapVisible(tester, find.text('Xem vé QR').first);
      expect(find.byType(QrImageView), findsOneWidget);
      await tapVisible(tester, find.byTooltip('Đóng vé'));

      await tapVisible(tester, find.text('Đổi lịch').first);
      await selectClinicDate(
        tester,
        find.byType(RescheduleSheet),
        clinicDay(2),
      );
      await selectRescheduleSlot(
        tester,
        find.byType(RescheduleSheet),
        '10:00–10:30',
      );
      await tapVisible(tester, find.text('Xác nhận đổi lịch'));
      expect(find.byType(RescheduleSheet), findsNothing);

      // 3. Tab 4 -> Tab 3: Mở thông báo kết quả khám -> xem đơn thuốc
      await tapNavTab(tester, 'Thông báo');
      await tapVisible(tester, find.text('Có kết quả khám mới'));
      expect(selectedNavIndex(tester), 2);
      await tapVisible(tester, find.text('Viêm họng cấp'));
      expect(find.text('Paracetamol'), findsOneWidget);
      // Đóng bottom sheet chi tiết hồ sơ
      Navigator.of(tester.element(find.byType(RecordDetailSheet))).pop();
      await tester.pumpAndSettle();

      // 4. Tab 5: Cập nhật hồ sơ cá nhân & Đăng xuất
      await tapNavTab(tester, 'Cá nhân');
      expect(find.byType(ProfilePage), findsOneWidget);
      await tapVisible(tester, find.text('Chỉnh sửa thông tin hồ sơ'));
      final nameField = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Họ và tên',
      );
      await tester.enterText(nameField, 'Nguyễn Minh Khang E2E');
      await tapVisible(tester, find.text('Lưu thay đổi'));
      await tapVisible(
        tester,
        find.byKey(const Key('confirm-save-profile-button')),
      );
      expect(find.text('NGUYỄN MINH KHANG E2E'), findsOneWidget);

      await signOutFromProfile(tester);
      expect(session.signedOut, isTrue);
      expect(find.widgetWithText(FilledButton, 'Đăng nhập'), findsOneWidget);
      expect(gateway.forbiddenHits, isEmpty);
    });

    testWidgets(
        'T4.2 Responsive màn hình hẹp 360x640 với textScaleFactor = 1.4 trong luồng đặt lịch & thao tác chính',
        (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });

      final (:gateway, session: _) = await pumpAuthenticatedApp(tester);
      expect(tester.takeException(), isNull);
      expectShellIntegrity(tester);

      // Luồng Tab 1 -> Chi tiết -> Đặt lịch -> Tab 2 trên 360x640 @ 1.4x
      await tapVisible(tester, find.text('BS. Nguyễn Văn An'));
      expect(tester.takeException(), isNull);

      await selectClinicDate(tester, find.byType(DoctorDetailPage), clinicDay(1));
      await scrollAndTapIn(
        tester,
        find.byType(DoctorDetailPage),
        find.text('08:00–08:30'),
      );
      expect(find.byType(BookingConfirmationSheet), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tapConfirmBooking(tester);
      expect(selectedNavIndex(tester), 1);
      expect(tester.takeException(), isNull);

      // Tab 3 & Tab 4 trên 360x640 @ 1.4x
      await tapNavTab(tester, 'Hồ sơ khám');
      expect(tester.takeException(), isNull);
      await tapVisible(tester, find.text('Viêm họng cấp'));
      expect(tester.takeException(), isNull);
      Navigator.of(tester.element(find.byType(RecordDetailSheet))).pop();
      await tester.pumpAndSettle();

      // Tab 4 & Tab 5 trên 360x640 @ 1.4x phải đạt 0 lỗi layout/overflow
      final tab4Errors = <FlutterErrorDetails>[];
      final tab5Errors = <FlutterErrorDetails>[];
      final previousOnError = FlutterError.onError;
      try {
        FlutterError.onError = tab4Errors.add;
        await tapNavTab(tester, 'Thông báo');

        FlutterError.onError = tab5Errors.add;
        await tapNavTab(tester, 'Cá nhân');
      } finally {
        FlutterError.onError = previousOnError;
      }
      expect(tab4Errors, isEmpty);
      expect(tab5Errors, isEmpty);
      // Mở form chỉnh sửa hồ sơ trên Tab 5 ở 360x640 @ 1.4x
      ScaffoldMessenger.of(tester.element(find.byType(ProfilePage)))
          .clearSnackBars();
      await tester.pumpAndSettle();
      final profileScroll = find
          .descendant(
            of: find.byType(ProfilePage),
            matching: find.byType(Scrollable),
          )
          .first;
      final editProfileBtn =
          find.widgetWithText(OutlinedButton, 'Chỉnh sửa thông tin hồ sơ');
      await tester.scrollUntilVisible(
        editProfileBtn,
        200,
        scrollable: profileScroll,
      );
      await tapVisible(tester, editProfileBtn);
      expect(find.text('Chỉnh sửa hồ sơ cá nhân'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(gateway.forbiddenHits, isEmpty);
    });
  });
}
