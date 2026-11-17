# Hướng dẫn kiểm tra OpenAPI, integration và live E2E

Task hiện hành: **TV1 / Member 1 — `M2-INTEGRATION-006`**. Dùng dữ liệu tổng hợp và database disposable. Không dùng production hoặc Supabase đang phục vụ người dùng cho suite có thể ghi/xóa dữ liệu.

## Phân biệt các loại bằng chứng

| Kiểm tra | Thành phần thật được chạm tới | Điều không chứng minh |
|---|---|---|
| `npm test -w @clinic/openapi-contract-tests` | Contract/spec và harness trong bộ nhớ | Không chứng minh service runtime, DB hoặc giao diện thật |
| `npm run test:live -w @clinic/openapi-contract-tests` | Các URL OpenAPI/Swagger cấu hình trong môi trường | Không chứng minh đăng nhập hay nghiệp vụ |
| `npm run test:live-e2e -w @clinic/openapi-contract-tests` | Gateway thật trong test process, nhưng năm upstream là Express fixture và dữ liệu in-memory | Không phải E2E qua năm business service runtime hoặc DB thật |
| PostgreSQL integration suites | Repository/service test với PostgreSQL disposable | Không chứng minh client → Gateway → toàn bộ services |
| Live product E2E | Flutter/Web → Gateway → business services thật → từng DB thật | Chỉ đạt khi có kết quả lưu cho từng flow và bộ SHA |

## 1. Contract và OpenAPI

Từ root repository:

```bash
npm test -w @clinic/openapi-contract-tests
npm run test:live -w @clinic/openapi-contract-tests
```

`test:live` dùng các URL `OPENAPI_GATEWAY_URL`, `OPENAPI_USER_SERVICE_URL`, `OPENAPI_DOCTOR_SERVICE_URL`, `OPENAPI_APPOINTMENT_SERVICE_URL`, `OPENAPI_MEDICAL_RECORD_SERVICE_URL`, `OPENAPI_NOTIFICATION_SERVICE_URL` nếu được đặt; nếu không, dùng mặc định trong test. Chạy nó chỉ kiểm tra OpenAPI/Swagger.

## 2. Gateway synthetic runner

```bash
npm run build --workspaces --if-present
npm run test:live-e2e -w @clinic/openapi-contract-tests
```

Runner `test/run-phase5-live.mjs` tự khởi chạy Gateway và các upstream Express tổng hợp tại localhost. Fixture login, MFA và dữ liệu nghiệp vụ được xử lý trong bộ nhớ. Kết quả chỉ được báo là **Gateway synthetic integration**. Không dùng kết quả này để xác nhận kết nối service/DB thật, TOTP thật, Flutter, Web hoặc toàn trình sản phẩm.

## 3. PostgreSQL disposable integration

Mỗi suite phải dùng database riêng có thể xóa, đã migrate theo service. Appointment và Doctor có thể truncate dữ liệu. Không bật suite trên production. Các lệnh, biến môi trường và test files cụ thể được ghi trong phần PostgreSQL integration của handoff và task `M2-INTEGRATION-006`.

Sau khi chạy, ghi command, revision, exit code, pass/fail/skip và tên DB test (không ghi password/URL có credential). Nếu suite tự skip do thiếu env, báo `SKIP`, không tính là PASS.

## 4. Live E2E qua service thật

Hiện chưa có bằng chứng trong repo này cho runner tự động dùng đồng thời Flutter/Web, Gateway và năm service runtime thật. Task [`M2-INTEGRATION-006`](../../docs/m2-integration-006-live-e2e-task.md) mô tả cách hoàn thiện và acceptance. Trước khi đánh dấu PASS cần:

1. Chạy năm service thật cùng Gateway với URL nội bộ trỏ đúng service; xác minh readiness và DB riêng.
2. Chạy Flutter PATIENT và Next.js DOCTOR/STAFF/ADMIN trên cùng bộ revision tương thích.
3. Gửi mọi request public qua Gateway; không để client gọi port service hoặc database trực tiếp.
4. Thực hiện các flow login/session, booking, check-in, clinical grant, record finalization, patient record/notification, revoke và outage/retry bằng fixture tổng hợp.
5. Kiểm tra database/outbox sau mỗi side effect; ghi request IDs/status/thời gian và loại bỏ token, mật khẩu, TOTP, secret, PHI khỏi artifacts.
6. Ghi riêng kết quả Web và Flutter, test lỗi/skip, SHA frontend/backend, migrations và trạng thái working tree. Chỉ đặt E2E PASS khi mọi flow bắt buộc qua đủ lớp.

Tài liệu nghiệm thu hiện hành: [`api-v2-e2e-acceptance-report.md`](../../docs/api-v2-e2e-acceptance-report.md). Bản hướng dẫn cũ được giữ trong [`archive/m2-2026-11-17`](archive/m2-2026-11-17/README.md).
