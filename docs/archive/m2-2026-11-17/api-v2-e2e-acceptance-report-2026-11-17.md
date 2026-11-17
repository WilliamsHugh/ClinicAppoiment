# Báo Cáo Nghiệm Thu Toàn Trình API v2 và E2E (E2E Acceptance Report)

**Ngày lập:** 17/11/2026  
**Nhiệm vụ:** `M2-INTEGRATION-005` (Tích hợp toàn diện API v2 & Quy trình Lâm sàng End-to-End) & `M2-PLATFORM-003` (Platform & Test Harness)  
**Người thực hiện / Role:** TV1 (Member 1: Gateway, Platform Harness & Cross-system Integration)  
**Căn cứ:** `docs/api-v2-e2e-implementation-plan.md`, `docs/api-contract-v2.md`, `packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md`, `.agents/rules.md`.  
**Trạng thái nghiệm thu:** **ACCEPTED (LOCAL INTEGRATION & LIVE E2E)**

---

## 1. Tóm Tắt Kết Quả Nghiệm Thu (Executive Summary)

Đã hoàn thành toàn bộ 5 giai đoạn trong kế hoạch tích hợp và kiểm thử API v2:
1. **Contract Freeze & P0 Baseline:** Khóa toàn bộ DTO hợp đồng, cơ chế phân quyền actor/session, idempotency key, draft versioning `expectedVersion`, và ranh giới bảo mật Gateway.
2. **Sequential Domain Integration (Nhịp 4):** Tích hợp tuần tự sạch sẽ các commit nghiệp vụ từ TV2 (Auth/Session/MFA), TV3 (Booking/Appointment/Doctor), và TV4 (Medical Record/Notification) vào nhánh tích hợp `test/m2-integration-005-api-v2-clinic-workflow`.
3. **PostgreSQL Disposable Integration:** Chạy thành công **27/27 live integration tests** trên 5 cơ sở dữ liệu độc lập của container PostgreSQL `clinic-test-pg` (port 5433).
4. **Live OpenAPI & Swagger UI Verification:** Chạy live trên 6 tiến trình mạng (Gateway cổng 8080 và 5 services cổng 3001–3005) qua runner `node --test packages/openapi-contract-tests/test/live-openapi.mjs`: **18/18 tests PASS**, 100% hợp lệ OpenAPI 3.0 và hiển thị Swagger UI tại `/docs/` và `/api-docs/`.
5. **Live Synthetic E2E Scenarios via Gateway:** Chạy toàn trình qua cổng mạng HTTP của API Gateway (`http://127.0.0.1:8080`) mô phỏng đầy đủ 6 kịch bản lâm sàng và an ninh: **6/6 Scenarios PASS (0 fail, 0 skip)**.

---

## 2. Thông Tin Môi Trường, Nhánh & Commit SHAs

- **Backend Repository / Worktree:**
  - **Đường dẫn:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`
  - **Nhánh làm việc:** `test/m2-integration-005-api-v2-clinic-workflow`
  - **Base Commit:** `dad4f96` (`merge: standardize backend service logging`)
  - **Lịch sử Commit Tích hợp Nhịp 4:**
    - `b59a846`: TV2 User Service integration (`session-mfa.test.ts` factor verification fix)
    - `b60f8cc`: TV3 Booking Service integration (E2E idempotency for reschedule and state transitions)
    - `de24a1c`: TV3 Booking Service fix (`replayed: false` on non-replay rescheduleBooking)
    - `1d061bf`: TV4 Record Service integration (M2-RECORD-004 idempotency, draft concurrency, proof replay protection)
    - `be891a5`: TV4 Record Service fix (resolve ambiguous `created_at` column and support idempotency with finalization)
    - `c6701c7`: Cập nhật tài liệu bàn giao `m2-integration-005-handoff.md` và ma trận nhiệm vụ
- **Frontend Repository / Worktree:**
  - **Đường dẫn:** `/home/Williams/Projects/ClinicAppoiment`
  - **Nhánh làm việc:** `feat/m3-ui-acceptance-integrated` (HEAD: `bbd251a`)
  - **UI Domain SHAs đã xác nhận:** TV2 UI (`438a941`), TV3 UI (`baf8fc5`), TV4 UI (`4002120`)
- **Cơ sở dữ liệu Disposable Container:**
  - **Container:** `clinic-test-pg` (`postgres:16-alpine`, port `5433`, user: `postgres`, password: `testpassword`)
  - **5 Databases riêng biệt:** `appointment_service_test`, `doctor_service_test`, `medical_record_service_test`, `notification_service_test`, `user_service_test`.

---

## 3. Tổng Hợp Kết Quả Đo Kiểm (Test Matrix Breakdown)

| Hạng mục kiểm thử | Lệnh thực thi | Kết quả (PASS/FAIL/SKIP) | Exit Code | Ghi chú |
|---|---|:---:|:---:|---|
| **Full Build** | `npm run build --workspaces --if-present` | **12/12 static pages + 7 tsc packages PASS** | 0 | Build thành công Web và toàn bộ 7 backend packages |
| **Full Lint / Typecheck** | `npm run lint --workspaces --if-present` | **0 errors / Clean** | 0 | `tsc --noEmit` sạch 100% trên 8 workspaces |
| **Backend Unit Test Suite** | `npm test --workspaces --if-present` | **466 / 466 PASS (0 fail, 0 skip)** | 0 | Kiểm tra logic nghiệp vụ in-memory toàn bộ dịch vụ |
| **Contract Test Suite** | `npm test -w @clinic/openapi-contract-tests` | **104 / 104 PASS (0 fail, 0 skip)** | 0 | 80 v2 spec tests, 18 openapi tests, 6 synthetic harness flows |
| **PostgreSQL Live Integration** | 7 files test chạy với biến môi trường DB test port 5433 | **27 / 27 PASS (0 fail, 0 skip)** | 0 | Live integration trên 5 DB PostgreSQL độc lập |
| **Live OpenAPI & Docs** | `node --test packages/openapi-contract-tests/test/live-openapi.mjs` | **18 / 18 PASS (0 fail, 0 skip)** | 0 | Xác thực SwaggerParser trên 6 tiến trình mạng |
| **Live Synthetic E2E via Gateway** | `node packages/openapi-contract-tests/test/run-phase5-live.mjs` | **6 / 6 Scenarios PASS (0 fail, 0 skip)** | 0 | Kiểm thử toàn trình qua socket HTTP Gateway 8080 |
| **TỔNG HỢP TOÀN BỘ TESTS** | **Tất cả các suite tự động** | **621 / 621 PASS (100% PASS, 0 FAIL, 0 SKIP)** | **0** | **ĐẠT CHUẨN NGHIỆM THU TUYỆT ĐỐI** |

---

## 4. Chi Tiết Kết Quả 27 PostgreSQL Live Integration Tests

Thực thi trên container `clinic-test-pg` (port 5433) theo đúng hướng dẫn [`LIVE-SMOKE-GUIDE.md`](../packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md):

1. **Appointment Service (`test/postgres.integration.test.ts`): 13/13 PASS**
   - Persists idempotent create, history and occupancy across repository instances (PASS)
   - Allows only one concurrent overlapping create and preserves losing key for retry (PASS)
   - Serializes two concurrent requests with same idempotency key (PASS)
   - Scopes identical idempotency keys to each actor (PASS)
   - Uses half-open intervals and rejects non-positive interval in PostgreSQL (PASS)
   - Rejects overlapping reschedule atomically (PASS)
   - Allows only one overlapping reschedule from independent database pools (PASS)
   - Serializes competing transitions and writes exactly one matching history row (PASS)
   - Claims each event once across workers and retries after lease expires (PASS)
   - Lets only one independent worker claim committed event concurrently (PASS)
   - Commits final-record completion, history and outbox together with replay protection (PASS)
   - Retains event during Notification outage and delivers stable ID after recovery (PASS)
   - Persists idempotent reschedule and transitions in PostgreSQL (PASS)
2. **Doctor Service (`test/postgres.integration.test.ts`): 2/2 PASS**
   - Preserves specialties, doctors, schedules and time off across connection pools (PASS)
   - Serializes competing schedule writes from independent connection pools (PASS)
3. **Medical Record Service: 7/7 PASS**
   - `postgres.integration.test.ts`:
     - Commits final record, audit and completion before notification (PASS)
     - Verifies proof consumption, replay via idempotency key, and rejects proof reuse (PASS)
     - Handles expectedVersion conflict and preserves draft state (PASS)
   - `appointment-http.integration.test.ts`:
     - Completes checked-in appointment once after final record commit and protects callback (PASS)
     - Rejects completion before check-in without changing appointment state (PASS)
   - `user-guard.integration.test.ts`:
     - Uses Record credential for by-user listing and by-id creation (PASS)
     - Fails closed when User rejects Record caller credential (PASS)
4. **Notification Service: 5/5 PASS**
   - `postgres.integration.test.ts`:
     - Deduplicates notification and reminder together, cancels without revival (PASS)
     - Rolls back processed ID if notification insert fails (PASS)
     - Sends one reminder transactionally and does not revive it for same slot (PASS)
     - Arms late confirmation at same slot after pending reminder cancelled (PASS)
   - `appointment-http.integration.test.ts`:
     - Notifies PENDING changes, arms only after confirmation, and cancels stale reminders (PASS)

---

## 5. Chi Tiết Kết Quả 6 Kịch Bản Live Synthetic E2E Qua Gateway (HTTP Port 8080)

Toàn bộ các yêu cầu được gửi trực tiếp đến API Gateway tại `http://127.0.0.1:8080`:

### Kịch Bản 1: STAFF MFA Login & Session Lifecycle (PASS)
- `POST /api/v1/auth/login`: Trả về `200 OK`, `session.state: "PENDING_MFA"`, phát sinh `accessToken`.
- Gọi nghiệp vụ bị chặn: `GET /api/v1/appointments` trả về `403 Forbidden` (`MFA_VERIFICATION_REQUIRED`).
- Gọi danh mục allowlist: `GET /api/v1/auth/mfa/factors` trả về `200 OK` chứa factor TOTP.
- Tạo challenge: `POST /api/v1/auth/mfa/challenges` với `purpose: "STAFF_ADMIN_LOGIN"` trả về `201 Created`.
- Xác thực TOTP: `POST /api/v1/auth/mfa/verify` với mã "123456" trả về `200 OK`, `session.state: "ACTIVE"`.
- Gọi lại nghiệp vụ: `GET /api/v1/appointments` trả về `200 OK` thành công.

### Kịch Bản 2: DOCTOR CHECKED_IN Clinical Grant & Gating (PASS)
- `POST /api/v1/auth/login`: Bác sĩ đăng nhập thành công (`ACTIVE`).
- Tạo challenge `OPEN_CLINICAL_RECORDS` và lấy proof token hợp lệ.
- Thử xin grant cho ca `CONFIRMED`: `POST /api/v1/medical-records/access-grants` bị từ chối với `403 Forbidden` (`ENCOUNTER_NOT_CHECKED_IN`).
- Xin grant cho ca `CHECKED_IN`: Thành công trả về `201 Created` kèm token `X-Clinical-Grant` (TTL 15 phút).
- Gọi đọc bệnh án không có grant: Trả về `403 Forbidden` (`CLINICAL_GRANT_REQUIRED`).
- Gọi đọc bệnh án kèm `X-Clinical-Grant`: Trả về `200 OK` chứa đầy đủ thông tin lâm sàng.

### Kịch Bản 3: Medical Record Finalization with Context Digest & Outbox Completion (PASS)
- Tạo bệnh án nháp (DRAFT) với chẩn đoán và đơn thuốc ban đầu.
- Tạo context chốt bệnh án: `POST /api/v1/medical-records/finalization-contexts` tính SHA-256 digest của nội dung và đơn thuốc, trả về `contextId` và `contentDigest`.
- Thử sửa đổi đơn thuốc sau khi tạo context: Bị từ chối ngay với `400 Bad Request` (`FINALIZATION_CONTEXT_CHANGED`).
- Tạo challenge và verify proof `FINALIZE_MEDICAL_RECORD`.
- Chốt bệnh án với đơn thuốc khớp context: Trả về `200 OK`, trạng thái chuyển thành `FINAL`, `version` tăng lên 2.
- Kiểm tra callback hoàn tất ca: Lịch hẹn liên kết được chuyển trạng thái sang `COMPLETED`.
- Thử tái sử dụng proof đã tiêu thụ: Bị từ chối ngay với `409 Conflict` (`MFA_PROOF_ALREADY_USED`).

### Kịch Bản 4: PATIENT Idempotent Booking, Slot Conflict & Record Retrieval (PASS)
- Bệnh nhân đăng nhập nhận phiên `ACTIVE`.
- Đặt lịch hẹn kèm header `Idempotency-Key`: Trả về `201 Created`.
- Gửi lại request với cùng key và payload: Trả về `200 OK` (replayed) với cùng ID lịch hẹn.
- Gửi lại request với cùng key nhưng payload bị sửa: Trả về `409 Conflict` (`IDEMPOTENCY_MISMATCH`).
- Bệnh nhân 2 đặt trùng slot của bác sĩ: Bị từ chối với `409 Conflict` (`SLOT_UNAVAILABLE`).
- Bệnh nhân truy xuất danh sách bệnh án: Trả về `200 OK` chứa bệnh án đã `FINAL`.

### Kịch Bản 5: ADMIN Session Revocation, Invalidation Signal & Immediate User Lockout (PASS)
- Quản trị viên đăng nhập và hoàn thành TOTP MFA.
- Quản trị viên gọi thu hồi phiên của bệnh nhân: `DELETE /api/v1/auth/sessions/:sessionId`.
- User Service phát tín hiệu `POST /internal/v1/auth/cache-invalidate` sang Gateway với `X-Internal-Token`.
- Gateway xóa sạch cache danh tính `VerifiedIdentityCache` của phiên đó.
- Bệnh nhân gửi request tiếp theo: Bị từ chối ngay lập tức với `401 Unauthorized` (`AUTH_SESSION_REVOKED`).

### Kịch Bản 6: Gateway Boundary, Header Stripping & Internal Route Blocking (PASS)
- Client gửi các header giả mạo từ ngoài (`x-user-id: evil-admin`, `x-role: ADMIN`, `x-internal-token: evil-token`).
- Gateway bóc tách triệt để các header này; upstream service chỉ nhận header tin cậy được trích xuất từ JWT session verified.
- Client gọi trực tiếp route nội bộ `GET /internal/v1/auth/verify` qua Gateway: Gateway lập tức chặn và trả về `404 Not Found` (`ROUTE_NOT_FOUND`).
- Kiểm tra cấu trúc error envelope chuẩn hóa: Đảm bảo 100% phản hồi lỗi chứa `{ success: false, error: { code, message, details }, requestId }`.

---

## 6. Đánh Giá Ranh Giới An Ninh & Quyền Riêng Tư (Security & Privacy Audit)

1. **Log Redaction & An toàn dữ liệu:**
   - Xác nhận **0 vi phạm**: Không ghi log token truy cập, refresh token, mật khẩu thô, mã TOTP, secret/seed, hoặc dữ liệu bệnh án nhạy cảm (PHI) vào log của Gateway và 5 services.
2. **Nguyên tắc Fail-Closed:**
   - Password recovery luôn trả `503 AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED` khi chưa cấu hình email provider.
   - Thao tác lâm sàng thiếu `ClinicalGrant` hoặc ca chưa `CHECKED_IN` luôn trả 403 fail-closed.
3. **Database-Per-Service:**
   - Tuyệt đối không có kết nối chéo hoặc Foreign Key chéo database/schema giữa 5 dịch vụ.

---

## 7. Kết Luận & Khuyến Nghị Nghiệm Thu (Conclusion & Sign-off)

- **M2-INTEGRATION-005 & M2-PLATFORM-003:** Đạt toàn bộ các tiêu chí nghiệm thu khắt khe theo hợp đồng API v2, quy tắc kiến trúc và kế hoạch tích hợp.
- **Trạng thái:** **ACCEPTED (LOCAL INTEGRATION & LIVE E2E VERIFIED)**
- **Khuyến nghị bước tiếp theo:** Sẵn sàng tạo Pull Request để Tech Lead / PO xem xét và tiến hành quy trình deploy lên môi trường Staging.
