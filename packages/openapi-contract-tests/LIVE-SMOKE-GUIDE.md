# Live smoke test API v2

Task: **TV1 / M2-INTEGRATION-005**. Các lệnh dưới đây là hướng dẫn chạy; kết quả live trên máy khác phải được ghi lại riêng. Không dùng cơ sở dữ liệu production hoặc Supabase đang phục vụ người dùng cho integration test có `TRUNCATE`.

## 1. Kiểm tra OpenAPI và Swagger

Chạy Gateway cổng 8080 và 5 service cổng 3001–3005 (hoặc đặt các biến `OPENAPI_GATEWAY_URL`, `OPENAPI_USER_SERVICE_URL`, `OPENAPI_DOCTOR_SERVICE_URL`, `OPENAPI_APPOINTMENT_SERVICE_URL`, `OPENAPI_MEDICAL_RECORD_SERVICE_URL`, `OPENAPI_NOTIFICATION_SERVICE_URL`). Từ thư mục gốc repository:

```bash
node packages/openapi-contract-tests/test/live-openapi.mjs
npm test -w @clinic/openapi-contract-tests
```

Lệnh thứ nhất chỉ kiểm tra `/openapi.json`, `/docs/` và `/api-docs/` của 6 tiến trình. Lệnh thứ hai chạy contract/harness tổng hợp trong bộ nhớ. **Hai lệnh này không xác nhận đăng nhập, TOTP, đặt lịch, grant hoặc chốt bệnh án qua Gateway thật.**

## 2. Integration test với PostgreSQL disposable

Mỗi service dùng một database test riêng, đã áp dụng schema tương ứng. Appointment và Doctor test sẽ khởi tạo/truncate dữ liệu; tuyệt đối chỉ trỏ tới database có thể xóa. Không chỉnh `describe.skip` bằng tay: các suite tự bật khi có đúng biến môi trường.

| Test file | Điều kiện bật | Lệnh chạy trong thư mục gốc |
|---|---|---|
| Appointment `postgres.integration.test.ts` | `APPOINTMENT_TEST_DATABASE_URL`, `APPOINTMENT_TEST_DATABASE_DISPOSABLE=1` | `npm test -w @clinic/appointment-service -- test/postgres.integration.test.ts` |
| Doctor `postgres.integration.test.ts` | `DOCTOR_TEST_DATABASE_URL`, `DOCTOR_TEST_DATABASE_DISPOSABLE=1` | `npm test -w @clinic/doctor-service -- test/postgres.integration.test.ts` |
| Record `postgres.integration.test.ts` | `TEST_DATABASE_URL` | `npm test -w @clinic/medical-record-service -- test/postgres.integration.test.ts` |
| Record `appointment-http.integration.test.ts` | `TEST_DATABASE_URL`, `TEST_APPOINTMENT_DATABASE_URL`, `TEST_DOCTOR_DATABASE_URL` | `npm test -w @clinic/medical-record-service -- test/appointment-http.integration.test.ts` |
| Record `user-guard.integration.test.ts` | `TEST_USER_PROVIDER_ROOT` trỏ tới root repository | `npm test -w @clinic/medical-record-service -- test/user-guard.integration.test.ts` |
| Notification `postgres.integration.test.ts` | `TEST_DATABASE_URL` | `npm test -w @clinic/notification-service -- test/postgres.integration.test.ts` |
| Notification `appointment-http.integration.test.ts` | `TEST_DATABASE_URL`, `TEST_APPOINTMENT_DATABASE_URL` | `npm test -w @clinic/notification-service -- test/appointment-http.integration.test.ts` |

Đặt biến môi trường ngay trước lệnh trong cùng terminal, ví dụ:

```bash
APPOINTMENT_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5433/appointment_test' \
APPOINTMENT_TEST_DATABASE_DISPOSABLE=1 \
npm test -w @clinic/appointment-service -- test/postgres.integration.test.ts
```

Migration thông thường dùng các script `npm run db:migrate:user`, `db:migrate:doctor`, `db:migrate:appointment`, `db:migrate:medical-record`, `db:migrate:notification` từ root với `.env` riêng. Chỉ chạy chúng trên database test đã chọn. User Service cần migration `004_mfa_challenge_backoff` trước khi chạy luồng MFA mới.

## 3. Kịch bản live qua API Gateway cần ghi bằng chứng

Hiện repository **chưa có runner tự động** cho các bước này. Dùng tài khoản test và gửi mọi request public đến Gateway; ghi HTTP status, `requestId`, thời gian, và trạng thái database/outbox, không ghi token, mật khẩu, mã TOTP hoặc nội dung bệnh án vào log bàn giao.

1. Đăng nhập STAFF/ADMIN: `PENDING_MFA`; gọi `GET /api/v1/auth/mfa/factors`, `POST /api/v1/auth/mfa/challenges` với `factorId`, rồi `POST /api/v1/auth/mfa/verify`. Trước xác minh, nghiệp vụ bị chặn; sau xác minh, được phép theo role.
2. Đăng nhập DOCTOR; chọn lịch `CHECKED_IN`. Challenge `OPEN_CLINICAL_RECORDS` phải gắn `appointmentId`, `patientId`, `accessMode`. Chỉ sau proof hợp lệ mới xin grant. Thử lại với lịch `CONFIRMED`, sai phiên hoặc sai hồ sơ: phải bị từ chối.
3. Gọi danh sách authored mặc định: chỉ có metadata. `GET /api/v1/medical-records/:id?view=summary` không chứa chẩn đoán/đơn thuốc. Muốn đọc chi tiết phải gửi `X-Clinical-Grant` hợp lệ trong cùng phiên. `AUTHORED_HISTORY` chỉ dành cho hồ sơ do chính bác sĩ lập trong 180 ngày; `CURRENT_ENCOUNTER` cần ca đã `CHECKED_IN`.
4. Tạo `finalization-context` từ nội dung cuối; challenge `FINALIZE_MEDICAL_RECORD` phải gắn `contextId`, `contentDigest` và `recordId` nếu sửa nháp. Dùng proof để chốt FINAL; đổi đơn thuốc sau context hoặc dùng lại proof phải bị từ chối. Kiểm tra outbox hoàn thành appointment.
5. Đăng xuất/thu hồi phiên, thử dùng lại grant/proof; kiểm tra mất quyền. Ghi cả trường hợp upstream tạm mất kết nối và phục hồi.

Chỉ đánh dấu nghiệm thu live E2E khi đã chạy và lưu kết quả thực tế của từng bước trên cùng một revision backend/frontend.
