# Hướng dẫn chạy Live Smoke Test & Tích hợp (Health&Human API v2)

Tài liệu này hướng dẫn chi tiết quy trình chạy smoke test live trên môi trường thực tế (API Gateway + Microservices) và điều kiện để unskip 24 integration tests yêu cầu database.

---

## 1. Yêu cầu môi trường (Prerequisites)

1. **API Gateway & Microservices đang hoạt động**:
   - API Gateway: `http://localhost:8080` (hoặc cấu hình qua biến môi trường `OPENAPI_GATEWAY_URL`).
   - User Service: `http://localhost:3001`
   - Doctor Service: `http://localhost:3002`
   - Appointment Service: `http://localhost:3003`
   - Medical Record Service: `http://localhost:3004`
   - Notification Service: `http://localhost:3005`

2. **Test Accounts cấu hình trong `.env`**:
   - `PATIENT_TEST_EMAIL=patient.test@clinic.local` / `PATIENT_TEST_PASSWORD=...`
   - `STAFF_TEST_EMAIL=staff.test@clinic.local` / `STAFF_TEST_PASSWORD=...`
   - `DOCTOR_TEST_EMAIL=doctor.test@clinic.local` / `DOCTOR_TEST_PASSWORD=...`
   - `ADMIN_TEST_EMAIL=admin.test@clinic.local` / `ADMIN_TEST_PASSWORD=...`

---

## 2. Lệnh thực thi Smoke Test Live

### Chạy kiểm tra OpenAPI Schemas và Swagger UI của toàn bộ services:
```bash
node packages/openapi-contract-tests/test/live-openapi.mjs
```

### Chạy Contract Integration Harness (Synthetic):
```bash
npm --prefix packages/openapi-contract-tests test
```

---

## 3. Danh sách Endpoints bắt buộc kiểm tra Live

| # | Endpoint | Method | Role / Auth | Mục đích kiểm tra | Expected HTTP Status | Expected Response Schema / Codes |
|---|---|---|---|---|---|---|
| 1 | `/health` | `GET` | Public | Kiểm tra Gateway upstream connectivity | `200 OK` | `{"status":"ok"}` |
| 2 | `/api/v1/auth/login` | `POST` | Public | Xác thực đăng nhập và khởi tạo phiên | `200 OK` | **PATIENT**: `data.session.state="ACTIVE"`, `idleTimeoutSeconds=2592000`<br>**STAFF/ADMIN**: `data.session.state="PENDING_MFA"`, `absoluteTimeoutSeconds=28800` |
| 3 | `/api/v1/doctors` | `GET` | Bearer (Active) | Tra cứu danh sách bác sĩ đang hoạt động | `200 OK` | `{"success":true,"data":{"items":[...],"total":N}}` (chỉ trả bác sĩ `isActive=true` cho non-ADMIN) |
| 4 | `/api/v1/appointments` | `GET` | Bearer (Active) | Lấy danh sách lịch hẹn của actor | `200 OK` | `{"success":true,"data":{"items":[...],"page":1,"limit":20}}` (mặc định `view=summary`) |
| 5 | `/api/v1/appointments` | `GET` | No Auth | Kiểm tra cơ chế chặn truy cập chưa xác thực | `401 Unauthorized` | `{"success":false,"error":{"code":"AUTH_TOKEN_INVALID"}}` |
| 6 | `/api/v1/notifications/unread-count` | `GET` | Bearer (Active) | Lấy số lượng thông báo chưa đọc | `200 OK` | `{"success":true,"data":{"unreadCount":N}}` |
| 7 | `/api/v1/medical-records` | `GET` | Bearer (No Grant) | Kiểm tra rào chắn an toàn dữ liệu lâm sàng | `403 Forbidden` | `{"success":false,"error":{"code":"CLINICAL_VERIFICATION_REQUIRED"}}` |
| 8 | `/api/v1/medical-records` | `GET` | Bearer (STAFF) | Nhân viên tiếp đón không có quyền đọc lâm sàng | `403 Forbidden` | `{"success":false,"error":{"code":"CLINICAL_ACCESS_DENIED"}}` |

---

## 4. Danh sách 24 Integration Tests bị Skip và Điều kiện Unskip

Trong toàn bộ suite tích hợp của backend hiện có **24 integration tests** bị đánh dấu skip (tại các service repo) do yêu cầu phụ thuộc vào PostgreSQL instance thực tế hoặc HTTP service mock.

### Phân bổ chi tiết:

1. **Appointment Service (12 tests skipped)**:
   - *Phạm vi test*: Concurrent slot booking transactions, pessimistic locking chống double-booking, state machine transitions gắn với outbox queue event, Postgres date/time range overlaps.
   - *Nguyên nhân skip*: Môi trường CI/static chạy không có container Postgres chạy nền.
   - *Điều kiện unskip*:
     1. Khởi chạy PostgreSQL hoặc trỏ tới Supabase test database.
     2. Cấu hình biến môi trường trong `services/appointment-service/.env`:
        ```env
        DATABASE_URL=postgresql://postgres:[PASSWORD]@localhost:54322/postgres
        ```
     3. Chạy lệnh migrate: `npm run migrate`
     4. Bỏ cờ `describe.skip` hoặc `test.skip` trong `test/integration/*.test.ts`.

2. **Medical Record Service (5 tests skipped)**:
   - *Phạm vi test*: Bảng audit ghi nhận lịch sử mở bệnh án, Clinical Grant TTL expiration, Outbox message delivery đồng bộ sang Appointment Service, Finalization TOTP proof verification.
   - *Nguyên nhân skip*: Yêu cầu database schema `medical_record_service` và mock HTTP server giả lập User Service endpoint `/internal/v1/auth/mfa/proofs/verify`.
   - *Điều kiện unskip*:
     1. Cấu hình `DATABASE_URL` trong `services/medical-record-service/.env`.
     2. Chạy migration: `npm run migrate` (chạy qua `src/migrate.ts` áp dụng migration 001 và 002).
     3. Khởi chạy User Service hoặc mock endpoint xác minh TOTP proof.

3. **Notification Service (5 tests skipped)**:
   - *Phạm vi test*: Outbox processor, notification retry loop, event consumption từ Kafka/PG pub-sub, read-all cutoff timestamp update.
   - *Nguyên nhân skip*: Yêu cầu Postgres database lưu trữ bảng `notifications` và kênh sự kiện.
   - *Điều kiện unskip*:
     1. Cấu hình `DATABASE_URL` trong `services/notification-service/.env`.
     2. Áp dụng schema: `npm run migrate`.

4. **Doctor Service (2 tests skipped)**:
   - *Phạm vi test*: Trùng lặp khung giờ làm việc (`DoctorSchedule` overlap) và xung đột lịch nghỉ phép (`DoctorTimeOff` occupancy check).
   - *Nguyên nhân skip*: Cần Postgres connection để thực thi native exclusion constraints hoặc composite overlap query.
   - *Điều kiện unskip*:
     1. Cấu hình `DATABASE_URL` trong `services/doctor-service/.env`.
     2. Áp dụng schema migration cho Doctor Service.

---

## 5. Check-list nghiệm thu Live Integration

- [ ] Toàn bộ 5 microservices và API Gateway khởi động không có runtime crash.
- [ ] Endpoints OpenAPI schema `/openapi.json` trả về HTTP 200 và schema OpenAPI 3.0 hợp lệ.
- [ ] Swagger UI tại `/docs/` và `/api-docs/` truy cập được từ trình duyệt.
- [ ] Các flow xác thực (PATIENT 30 ngày idle, STAFF/ADMIN 8h absolute + 15m idle lock) hoạt động theo đúng hợp đồng `docs/api-contract-v2.md`.
- [ ] Bệnh án lâm sàng được bảo vệ tuyệt đối: Không mở nếu thiếu `X-Clinical-Grant` và TOTP verification proof.
- [ ] Khi có cơ sở dữ liệu thật, unskip toàn bộ 24 integration tests và xác nhận pass 100%.
