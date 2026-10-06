# Doctor branch: PR readiness

Ngày rà soát: 2026-09-30. Nhánh `feature/doctor-001-directory-and-schedules` đã chứa
`origin/main` tại `2370547`. Phạm vi PR dự kiến: `DOCTOR-001` đến `DOCTOR-006`;
phần Booking persistence và double-booking constraint thuộc nhánh Booking.

**Trạng thái: chưa đủ điều kiện merge.** Doctor database riêng chưa được cấp nên chưa
chạy migration và smoke test với PostgreSQL/Supabase thật. Các test dùng mock hoặc
repository in-memory không thay thế bằng chứng này.

## Đã kiểm tra

| Hạng mục | Bằng chứng |
| --- | --- |
| Public Doctor routes qua Gateway, gồm time-off update | Gateway proxy tests; route nằm dưới `/api/v1/doctors/{doctorId}/time-offs/{timeOffId}` |
| Liên kết User và kiểm tra occupancy | Doctor/User/Appointment contract và integration tests với HTTP test server |
| Quyền theo role và sở hữu lịch | Doctor Service API tests, Next.js interaction tests |
| Flutter route `/doctors` và chọn slot | Widget tests từ app route thật; slot được chuyển cho Booking |
| Kiểm tra mã và build | `npm test --workspaces --if-present`, `npm run lint`, `npm run build` đều đạt ngày 2026-09-30 |
| Flutter | `flutter analyze --no-pub`: không có issue; `flutter test --no-pub`: 25/25 đạt |
| User database | Kết nối đọc `SELECT 1` thành công qua file cấu hình User do thành viên cung cấp; không chạy Doctor migration trên database này |

Trên máy Windows có đường dẫn workspace chứa ký tự tiếng Việt, `flutter analyze`
trực tiếp có thể làm analysis server đọc lỗi JSON. Chạy cùng lệnh qua ổ `subst`
tạm với đường dẫn ASCII cho kết quả không có issue; ổ tạm được gỡ sau lệnh.

## Cần hoàn tất trước khi đề nghị merge

- [ ] Cấp **Doctor database thử nghiệm riêng** và file
  `services/doctor-service/.env` bị Git bỏ qua. Chạy `npm run db:migrate:doctor`
  trên database trống và chạy lại để xác nhận idempotency; nếu có scaffold cũ,
  kiểm tra migration trên bản sao của scaffold đó.
- [ ] Khởi động User, Appointment, Doctor và Gateway với URL nội bộ/token phù hợp.
  Chạy `npm run smoke:doctor` theo `services/doctor-service/README.md` với access
  token ADMIN, hai DOCTOR và PATIENT. Giữ log kết quả, không đưa token vào PR.
- [ ] Kiểm tra thực tế khi Appointment Service unavailable: thao tác sửa
  schedule/time-off phụ thuộc occupancy trả `502`/`503` và Doctor database không đổi.
- [ ] Xác nhận ảnh/video của Flutter Patient route Doctor và Next.js Doctor
  management chạy qua Gateway trên môi trường test. Không dùng ảnh mock để tuyên
  bố tích hợp backend đã đạt.
- [ ] Ghi rõ dependency Booking: Appointment repository hiện in-memory; chưa có
  persistence/constraint database để bảo đảm chống double booking qua restart
  hoặc giữa nhiều instance.
- [ ] Chạy lại các merge gate ở bảng trên sau smoke và kiểm tra `git diff --check`.

## Nội dung PR đề xuất sau khi các mục chặn được xác nhận

**Title:** `feat(doctor): complete directory, schedules and Gateway integration`

**Description:**

Doctor directory now uses its own PostgreSQL repository and schema. Admins can link
active DOCTOR accounts and manage specialties through Gateway; DOCTOR/STAFF/ADMIN
can manage schedules and time off within their allowed scope. Flutter `/doctors`
shows the real directory and passes a selected slot to Booking, while the clinic
web provides management flows with success/error handling. Doctor checks booked
slots through Appointment Service and protects future appointments when schedules
change. The internal verify-slot endpoint uses a backend-only credential.

Migration: run `npm run db:migrate:doctor` against the dedicated Doctor database
before starting Doctor Service. API change: time-off update is
`PATCH /api/v1/doctors/{doctorId}/time-offs/{timeOffId}` through the existing Gateway
prefix. Include the actual smoke output, frontend evidence, and current Booking
dependency in the final PR body; do not mark these items complete based only on
unit tests.
