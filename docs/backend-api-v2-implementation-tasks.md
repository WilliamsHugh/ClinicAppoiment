# Kế hoạch triển khai backend theo API Contract v2 (Snapshot nghiệm thu Nhịp 4 ngày 17/11/2026)

> **Cập nhật tích hợp Nhịp 4 ngày 17/11/2026 — TV1 / M2-INTEGRATION-005:** Toàn bộ các commit từ TV2 (`b6e5797`), TV3 (`d3a88b6`), và TV4 (`40e527e`) đã được tích hợp tuần tự sạch sẽ trên branch `test/m2-integration-005-api-v2-clinic-workflow` (HEAD `be891a5`). Toàn bộ 8 workspaces đã vượt qua build (Web 12/12 static pages + tsc 7 packages), lint (0 lỗi), 466 unit tests PASS, 104 contract tests PASS, và 27/27 PostgreSQL live integration tests PASS (13 Appointment, 2 Doctor, 7 Medical Record, 5 Notification) trên cụm container disposable `clinic-test-pg` (port 5433). Xem chi tiết tại [`m2-integration-005-handoff.md`](m2-integration-005-handoff.md).

**Ngày lập:** 15/11/2026 — **Cập nhật nghiệm thu Nhịp 4:** 17/11/2026  
**Mục tiêu:** tăng tốc triển khai backend từ contract API v2 và tích hợp toàn diện trên `test/m2-integration-005-api-v2-clinic-workflow`.  
**Trạng thái hiện tại:** Đã hoàn thành Nhịp 4 tích hợp chéo; sẵn sàng cho Live E2E Smoke Test (Phase 5).  
**Checkout tích hợp backend:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi` (nhánh `test/m2-integration-005-api-v2-clinic-workflow`, HEAD `be891a5`)  
**Checkout tích hợp frontend:** `/home/Williams/Projects/ClinicAppoiment` (nhánh `feat/m3-ui-acceptance-integrated`, HEAD `bbd251a`)  
**Base quan sát ban đầu:** `dad4f96aa8d2524c6ce31bee12e6421a5ba44946` — `merge: standardize backend service logging`.

---

## 1. Mục đích và điều kiện nguồn

Tài liệu này định nghĩa phân công và thứ tự triển khai contract API v2 thành các task backend độc lập và quy trình tích hợp an toàn.
- Nguồn nghiệp vụ chuẩn: [`docs/api-contract-v2.md`](api-contract-v2.md) tại nhánh FE `feat/m3-ui-acceptance-integrated` (commit `b1d3113bd595be6a46071ec20f3d086e369a8e5e`).
- Tài liệu đối chiếu chi tiết: [`docs/compatibility-matrix-v2.md`](compatibility-matrix-v2.md) và báo cáo bàn giao kỹ thuật [`docs/m2-integration-005-handoff.md`](m2-integration-005-handoff.md).
- Kiến trúc giữ vững: Client công khai → API Gateway → Owning service → Cơ sở dữ liệu riêng (Database-per-service). Supabase Auth chỉ thuộc User Service; Gateway không sở hữu DB; không truy cập chéo DB; API nội bộ `/internal/*` tuyệt đối không expose ra ngoài Gateway.

---

## 2. Quy tắc điều phối và branch safety

- Nhánh tích hợp: `test/m2-integration-005-api-v2-clinic-workflow`.
- Quy tắc commit: Toàn bộ commit lưu cục bộ (Local commits only), không push remote, không merge tự ý vào `main`.
- Độc lập cơ sở dữ liệu: Kiểm thử thực thi trên cơ sở dữ liệu PostgreSQL test disposable (container `clinic-test-pg`, port `5433`) với 5 databases riêng biệt: `user_service_test`, `doctor_service_test`, `appointment_service_test`, `medical_record_service_test`, `notification_service_test`.
- Bảo vệ dữ liệu và bảo mật: Không ghi token, secret, mật khẩu hay dữ liệu bệnh nhân (PHI) vào log; toàn bộ log tuân thủ contract ngắn có cấu trúc chuẩn hóa JSON.

---

## 3. Baseline & Tiến độ thực hiện tổng thể

| Miền chức năng | Nhiệm vụ | Thành viên | Trạng thái | Bằng chứng thực tế |
|---|---|---|:---:|---|
| **Gateway & Cache** | `M2-INTEGRATION-004` | TV1 / Member 1 | **ACCEPTED** | RAM `VerifiedIdentityCache`, strip client spoof headers, block internal routes, 55/55 gateway tests pass. |
| **User & MFA** | `M2-USER-004` | TV2 / Member 2 | **ACCEPTED** | Session v2, MFA TOTP, fail-closed password (503), migration runner `src/migrate.ts`, 80/80 unit tests pass. |
| **Doctor & Booking** | `M2-BOOKING-006` | TV3 / Member 3 | **ACCEPTED** | `/doctors/me`, appointment summary server UTC+7, lọc scope an toàn, 14 DB integration tests pass, 134 unit tests pass. |
| **Record & Notify** | `M2-RECORD-004` + `M2-NOTIFY-003` | TV4 / Member 4 | **ACCEPTED** | Clinical grant TOTP, chống replay proof, callback hoàn tất ca, unread-count, read-all, 12 DB/HTTP integration tests pass. |
| **Tích hợp toàn diện** | `M2-INTEGRATION-005` | TV1 + TV2/3/4 | **ACCEPTED** | 104/104 contract tests pass, 27/27 DB integration tests pass, 466 backend unit tests pass, 283 FE tests pass. |

---

## 4. Chi tiết phân công và kết quả thực hiện

### TV1 / Member 1 — `M2-INTEGRATION-004`: contract v2, Gateway, integration harness
**Branch:** `test/m2-integration-004-api-v2-rollout` -> Đã tích hợp (Commit `513b699`, `aa4583e`)  
**Owned paths:** `gateway/api-gateway/**`, `packages/openapi-contract-tests/**`  
**Checklist:**
- [x] Lập compatibility matrix v1→v2: Đã ban hành [`docs/compatibility-matrix-v2.md`](compatibility-matrix-v2.md) với 45 public operations và 16 internal operations. Giữ prefix `/api/v1`.
- [x] Gateway prefix-route an toàn: Bóc tách triệt để các headers giả mạo (`x-user-id`, `x-role`, `x-session-id`, `x-internal-token`); chặn toàn bộ `/internal/*` trả `404 ROUTE_NOT_FOUND`.
- [x] Quản lý session metadata: Tiếp nhận trạng thái từ User Service (`ACTIVE`, `PENDING_MFA`, `LOCKED`, `EXPIRED`, `REVOKED`); áp dụng allowlist cho `PENDING_MFA` và `LOCKED`.
- [x] Thiết kế cache RAM `VerifiedIdentityCache`: TTL tự co theo JWT/session deadline; key là SHA-256 token digest; giới hạn bound LRU; hỗ trợ invalidation tức thì.
- [x] Invalidation Signal: Xử lý endpoint nội bộ `/internal/v1/auth/cache-invalidate` bảo vệ bằng `X-Internal-Token`.
- [x] Mở rộng Contract Test Suite: Xây dựng `v2-contract-spec.test.ts` (80 tests) và cập nhật `openapi.test.ts` (18 tests), đạt **104/104 tests PASS**.
- [x] Integration Harness: Xây dựng `test/integration-harness.test.ts` mô phỏng toàn trình 6 flows lớn (**6/6 PASS**).

---

### TV2 / Member 2 — `M2-USER-004`: session, MFA, auth và patient scope
**Branch:** `feat/m2-user-004-session-mfa-api-v2` -> Đã tích hợp (Commit `e22d7b7`, `aa4583e`, `b4c99e3`)  
**Owned paths:** `services/user-service/**`, User migrations/schema  
**Checklist:**
- [x] **1. Session persistence and transitions:** Bảng `user_service.sessions`, quản lý idle/absolute expiry, lock/revoke state, rotation refresh token an toàn.
- [x] **2. PATIENT/DOCTOR lifecycle:** PATIENT idle 30 ngày; DOCTOR idle 15 ngày; access token 3600s; chỉ foreground activity mới gia hạn idle.
- [x] **3. STAFF/ADMIN lifecycle:** Password + TOTP đầu phiên; hạn tuyệt đối 8h cố định; khóa sau 15 phút không hoạt động; mở khóa bằng TOTP bảo toàn mốc 8h ban đầu.
- [x] **4. MFA API:** Enrollment (`/auth/mfa/totp/enroll`), factors, challenge (`/auth/mfa/challenges`), verify (`/auth/mfa/verify`); mã 6 chữ số giữ số 0 đầu; secret bảo vệ tuyệt đối.
- [x] **5. Session/account APIs:** `/auth/session`, `/auth/sessions`, thu hồi phiên theo ID; password recovery fail-closed trả `503 AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED` (0 fake success).
- [x] **6. Protected actions:** Sinh và xác minh purpose-bound proof gắn actor, session, operation (`FINALIZE_MEDICAL_RECORD`, `OPEN_CLINICAL_RECORDS`).
- [x] **7. Profile/patient access:** Duy trì `GET/PATCH users/me`; API tra cứu bệnh nhân nội bộ `/internal/v1/patients/lookup` kiểm soát quyền chặt chẽ.
- [x] **8. Migration runner chuẩn hóa:** Xây dựng `src/migrate.ts` với `pg_advisory_xact_lock`, theo dõi version và SHA-256 checksums trong `user_service.schema_migrations`, hỗ trợ stub `auth` schema cho DB độc lập.

---

### TV3 / Member 3 — `M2-BOOKING-006`: Doctor + Appointment contract v2
**Branch:** `feat/m2-booking-006-appointment-doctor-api-v2` -> Đã tích hợp (Commit `8e27278`, `b4c99e3`)  
**Owned paths:** `services/doctor-service/**`, `services/appointment-service/**`  
**Checklist:**
- [x] **Doctor me:** `GET /api/v1/doctors/me` tự động map từ user identity đã xác thực; trả 404 rõ ràng khi thiếu hồ sơ.
- [x] **Schedules & Time-offs:** Phân trang chuẩn; kiểm tra xung đột lịch với occupancy hiện có (trả 409 khi có lịch hẹn bị ảnh hưởng).
- [x] **Doctor directory:** Lọc `isActive=true` cho non-ADMIN; không trả slot trống nếu dependency lỗi.
- [x] **Appointment Listing:** Hỗ trợ `view=summary` mặc định, `view=detail`, query `q`, `include=names`, `sort`, `from/to`; lọc và sắp xếp toàn tập trước phân trang.
- [x] **Appointment Summary:** `GET /api/v1/appointments/summary` tính trên server theo múi giờ `Asia/Ho_Chi_Minh` UTC+7; không trả số 0 giả khi lỗi.
- [x] **State machine & Callback:** Chặn DOCTOR tự xác nhận/tiếp đón; route cũ `/complete` trả `409 MEDICAL_RECORD_REQUIRED`; chỉ hoàn tất qua callback nội bộ `/internal/v1/appointments/:id/complete-from-record` khi có hồ sơ FINAL.
- [x] **Idempotency & Concurrency:** Bắt buộc `Idempotency-Key` cho write operations; replay trả kết quả cũ; mismatch payload trả 409; chống double-booking bằng database transaction locks.
- [x] **Sửa lỗi BUG-02 & BUG-04:** Sửa tính ranh giới ngày UTC+7 (`getVietnamDayRange`); loại bỏ `CANCELLED` và `NO_SHOW` khỏi phạm vi tra cứu bệnh nhân an toàn.

---

### TV4 / Member 4 — `M2-RECORD-004` + `M2-NOTIFY-003`: clinical grants, finalization, notification
**Branch:** `feat/m2-record-004-clinical-grants-finalization` -> Đã tích hợp (Commit `d026acc`, `b4c99e3`)  
**Owned paths:** `services/medical-record-service/**`, `services/notification-service/**`  
**Checklist:**
- [x] **Clinical Grant Guard:** Chặn đọc lâm sàng trước khi có grant: PATIENT chỉ xem FINAL của mình; DOCTOR cần `ClinicalGrant` (`X-Clinical-Grant`) cho encounter hiện tại; STAFF/ADMIN bị từ chối 403.
- [x] **Cấp Clinical Grant:** `POST /api/v1/medical-records/access-grants` kiểm tra TOTP proof + phân công bác sĩ + trạng thái lịch hẹn `CHECKED_IN`; grant có TTL 15 phút.
- [x] **Finalization Contexts & Digest Guard:** `POST /api/v1/medical-records/finalization-contexts` tính canonicalized digest nội dung và đơn thuốc; thay đổi thuốc sau khi tạo context sẽ vô hiệu hóa proof.
- [x] **FINAL Record Creation & Anti-Replay:** Chuyển trạng thái FINAL yêu cầu TOTP proof mục đích `FINALIZE_MEDICAL_RECORD`; tiêu thụ proof qua bảng `consumed_proofs` chống replay; hồ sơ FINAL là bất biến (immutable).
- [x] **Appointment Callback:** Tự động phát sinh outbox callback sang Appointment Service; trả trường `appointmentCompletion` đồng bộ.
- [x] **Notification Unread Count:** `GET /api/v1/notifications/unread-count` đếm toàn bộ thông báo chưa đọc của chính actor.
- [x] **Bulk Read-All:** `PATCH /api/v1/notifications/read-all` cập nhật theo server cutoff timestamp `readBefore`; thông báo đến sau cutoff vẫn giữ nguyên UNREAD.

---

### TV1 + Provider Owners — `M2-INTEGRATION-005`: Tích hợp qua Gateway, nghiệm thu DB thật
**Branch:** `test/m2-integration-005-api-v2-clinic-workflow` (HEAD: `04d0666`)  
**Checklist:**
- [x] **Migrations trên PostgreSQL test disposable:** Khởi chạy container `clinic-test-pg` trên port `5433`, nạp đầy đủ migration cho 5 databases riêng biệt.
- [x] **Kiểm thử tích hợp DB thật (24/24 PASS):** Bỏ skip và thực thi thành công toàn bộ 24 integration tests yêu cầu PostgreSQL live (12 Appointment, 2 Doctor, 5 Medical Record, 5 Notification).
- [x] **Đo kiểm 2 giả thuyết kỹ thuật:**
  - `HYP-01`: Chứng minh hiện tượng lệch Date OID 1082 trong `node-pg` (UTC+7) và khắc phục triệt để bằng `pg.types.setTypeParser(1082)`.
  - `HYP-02`: Xác nhận sự kiện `appointment.no_show` không sinh notification outbox là hành vi đúng đặc tả.
- [x] **Đồng bộ Contract Test Suite:** Đạt **104/104 tests PASS** (0 failed, 0 skipped).
- [x] **Backend Unit Suite:** Đạt **474/474 tests PASS** trên toàn bộ 8 backend workspaces; build & lint sạch 100%.
- [x] **Frontend Web Suite:** Đạt **283/283 tests PASS** trên 28 test files; typecheck 0 lỗi.
- [x] **Báo cáo bàn giao nghiệm thu:** Đã hoàn thiện và công bố tại [`docs/m2-integration-005-handoff.md`](m2-integration-005-handoff.md).

---

## 5. Thứ tự triển khai và chiến lược Rollout

### 5.1. Thứ tự Merge và Cherry-Pick đã hoàn thành
Theo đúng kiến trúc phụ thuộc:
1. TV2 (User / Session / MFA) -> Commit `e22d7b7`
2. TV3 (Booking / Doctor / Appointment) -> Commit `8e27278`
3. TV4 (Medical Record / Notification) -> Commit `d026acc`
4. TV1 (Gateway / Contract Tests) -> Commit `513b699`
5. Remediations & Sync -> Commit `aa4583e`
6. Integration & DB Type Parsers -> Commit `b4c99e3`
7. Handoff & Acceptance Documentation -> Commit `04d0666`

### 5.2. Chiến lược Rollout & Chuyển giao đồng bộ (Cutover Strategy)
- **Đồng bộ tiền tố định tuyến:** Toàn bộ route của API v2 tiếp tục sử dụng HTTP prefix `/api/v1` và `/internal/v1`. Không chuyển đổi URL thành `/api/v2` để tránh gãy vỡ định tuyến hạ tầng mạng.
- **Synchronous Cutover:** Thực hiện kích hoạt đồng bộ backend commit `04d0666` cùng lúc với frontend Web commit `bbd251a` (đã hỗ trợ đầy đủ luồng TOTP MFA cho Staff/Admin, date bounds UTC+7, và bulk read-all).
- **Graceful Deprecation:** Endpoint cũ `PATCH /api/v1/appointments/:id/complete` trả mã lỗi `409 MEDICAL_RECORD_REQUIRED` hướng dẫn chuyển sang quy trình lập bệnh án FINAL.

---

## 6. Trạng thái 8 Quyết định Còn Mở (Open Contract Decisions)

| # | Quyết định | Blocker cho | Trạng thái hiện tại trong mã nguồn | Chính sách áp dụng mặc định (Fail-Closed) |
|---|---|---|---|---|
| 1 | Bác sĩ mở ca: `CHECKED_IN` hay cả `CONFIRMED` gần giờ? | Doctor clinical grant | Đã triển khai kiểm tra trạng thái trong `services/medical-record-service/src/index.ts` | **Fail-Closed:** Chỉ cho phép cấp grant khi lịch hẹn đã ở trạng thái `CHECKED_IN`. Từ chối cấp grant nếu lịch hẹn đang `CONFIRMED`. |
| 2 | TTL grant và điều kiện mất quyền khi hết phiên/đổi bác sĩ | Record access/read | Đã triển khai trong `medical-record-service` (cột `expires_at` trên bảng `clinical_grants`) | **Chốt mặc định:** TTL = 15 phút (`900s`), actor-bound và encounter-bound. Tự động mất quyền khi hết hạn hoặc khi phiên của bác sĩ bị thu hồi. |
| 3 | History authored-read tồn tại 1 hay 2 năm? | Authored history access | Đã triển khai truy vấn theo mốc thời gian trong `medical-record-service` | **Tạm thời M2:** Chỉ mục authored mặc định 180 ngày; đọc nội dung chi tiết cần TOTP và grant `AUTHORED_HISTORY` gắn hồ sơ, hoặc `CURRENT_ENCOUNTER` từ ca mới đã CHECKED_IN. Chính sách quyền dài hạn 1–2 năm chưa chốt. |
| 4 | MFA challenge/proof TTL, số lần sai, backoff | User MFA acceptance | Đã triển khai trong `services/user-service/src/mfa-service.ts` | **Chốt mặc định:** Challenge TTL = 5 phút (`300s`), tối đa 5 lần thử sai liên tiếp trước khi khóa challenge, backoff delay = 30s. |
| 5 | Mất Authenticator / factor recovery identity proof | Factor recovery release | Giữ nguyên trạng thái chưa hỗ trợ | **Fail-Closed:** Không mở tính năng tự reset qua email khi mất Authenticator để tránh rủi ro chiếm quyền tài khoản; bắt buộc hỗ trợ xác minh thủ công qua Quản trị viên. |
| 6 | Sự kiện `NO_SHOW` có sinh notification không? | Event schema & Notification | Đã xác nhận trong `HYP-02` | **Chốt:** Không sinh thông báo outbox tự động; sự kiện `NO_SHOW` chỉ cập nhật trạng thái vận hành của lịch hẹn. |
| 7 | Hỗ trợ đồng thời Client cũ v1 | Breaking changes rollout | Duy trì tính tương thích ngược ở schema và format | **Chốt:** Duy trì tiền tố `/api/v1`, response envelope envelope chuẩn hóa `{success, data/error}`, chuyển đổi đồng bộ frontend Web v2. |
| 8 | Password recovery email provider & allowlist | Password recovery | Đã triển khai tại `services/user-service/src/auth.ts` | **Fail-Closed:** Trả `503 AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED` kèm thông điệp rõ ràng; tuyệt đối không trả 200 giả mạo cho đến khi cấu hình SMTP an toàn. |

---

## 7. Ranh giới ngoài phạm vi (Out of Scope)

Giữ nguyên các cam kết kiến trúc: Không bổ sung Redis cache nghiệp vụ, RabbitMQ/Kafka, microservice mới, SSO bên thứ ba, PDF export, hoặc đẩy mã lên remote repository khi chưa có phê duyệt từ Quản trị viên dự án.

---

## 8. Biểu mẫu Bàn giao Nhiệm vụ Chính thức (Section 9 Compliance)

### Biểu mẫu 1: TV1 — `M2-INTEGRATION-004` (Gateway & Contracts)
```text
Member / task ID: TV1 / Member 1 — M2-INTEGRATION-004
Branch / worktree: test/m2-integration-004-api-v2-rollout (đã merge vào test/m2-integration-005-api-v2-clinic-workflow)
Base SHA -> final SHA: dad4f96 -> 513b699 (cập nhật tại aa4583e)
Owned paths: gateway/api-gateway/**, packages/openapi-contract-tests/**
Provider/consumer dependencies: User Service (verify contract, cache invalidation signal)
Contract sections / operation IDs: Mục 1–16, Gateway routing & VerifiedIdentityCache
Schema migration and rollback: Không sở hữu cơ sở dữ liệu
Tests run (command, exit, pass/fail/skip):
  - npm test -w @clinic/api-gateway: Exit 0, 55 pass, 0 fail, 0 skip
  - npm test -w @clinic/openapi-contract-tests: Exit 0, 104 pass, 0 fail, 0 skip
Mock vs PostgreSQL/HTTP/live evidence: Synthetic harness đạt 6/6 flows; mock token verifier và live gateway integration test pass
Open contract decisions / known gaps: Rollout cutover đồng bộ với Web FE; không mở route /api/v2
Security/permission review: Strip spoofed headers (x-user-id, x-role, x-internal-token); chặn tuyệt đối /internal/*; cache invalidation an toàn
Git status clean? Local commit only? Push/merge: no: Clean. Local commit only. Push: NO.
Trạng thái: ACCEPTED
```

### Biểu mẫu 2: TV2 — `M2-USER-004` (Session, MFA & User Migration)
```text
Member / task ID: TV2 / Member 2 — M2-USER-004
Branch / worktree: feat/m2-user-004-session-mfa-api-v2 (đã merge vào test/m2-integration-005-api-v2-clinic-workflow)
Base SHA -> final SHA: dad4f96 -> e22d7b7 (cập nhật tại aa4583e, b4c99e3)
Owned paths: services/user-service/**, User migrations
Provider/consumer dependencies: API Gateway (metadata, signals), Medical Record (MFA proof verification)
Contract sections / operation IDs: Mục 10 (Auth), Mục 15 (Internal user verify & patient lookup)
Schema migration and rollback: Migration UP 20261115_session_mfa_schema áp dụng thành công qua src/migrate.ts; DOWN test pass
Tests run (command, exit, pass/fail/skip):
  - npm test -w @clinic/user-service: Exit 0, 80 pass, 0 fail, 0 skip
  - npm run db:migrate -w @clinic/user-service: Exit 0 (chạy đạt trên DB test disposable port 5433)
Mock vs PostgreSQL/HTTP/live evidence: Đã kiểm chứng trên PostgreSQL test độc lập (user_service_test); type parser OID 1082 Date hoạt động chuẩn xác
Open contract decisions / known gaps: Password recovery trả 503 fail-closed (chờ cấu hình SMTP); factor recovery mất app cần xác minh qua admin
Security/permission review: Chống replay refresh token; không lưu plain secret/token; PENDING_MFA và LOCKED chỉ gọi allowlist; 0 fake success
Git status clean? Local commit only? Push/merge: no: Clean. Local commit only. Push: NO.
Trạng thái: ACCEPTED
```

### Biểu mẫu 3: TV3 — `M2-BOOKING-006` (Doctor & Appointment Service)
```text
Member / task ID: TV3 / Member 3 — M2-BOOKING-006
Branch / worktree: feat/m2-booking-006-appointment-doctor-api-v2 (đã merge vào test/m2-integration-005-api-v2-clinic-workflow)
Base SHA -> final SHA: dad4f96 -> 8e27278 (cập nhật tại b4c99e3)
Owned paths: services/doctor-service/**, services/appointment-service/**
Provider/consumer dependencies: User Service (doctor/patient lookup), Medical Record (completion callback)
Contract sections / operation IDs: Mục 11 (Specialties/Doctors), Mục 12 (Appointments)
Schema migration and rollback: Đã nạp thành công schema trên doctor_service_test và appointment_service_test
Tests run (command, exit, pass/fail/skip):
  - Unit tests Doctor & Appointment: Exit 0, 134 pass, 0 fail
  - DB Integration tests: Exit 0, 14 pass (12 Appointment, 2 Doctor), 0 fail, 0 skip
Mock vs PostgreSQL/HTTP/live evidence: Chạy và pass 100% trên PostgreSQL container thật (concurrency booking, exclusion locking, occupancy checks)
Open contract decisions / known gaps: Sự kiện NO_SHOW không sinh notification outbox theo thiết kế; tính toán date bounds UTC+7 chuẩn xác
Security/permission review: Idempotency-Key bắt buộc; DOCTOR không tự xác nhận/tiếp đón ca; không lộ dữ liệu lâm sàng trước grant
Git status clean? Local commit only? Push/merge: no: Clean. Local commit only. Push: NO.
Trạng thái: ACCEPTED
```

### Biểu mẫu 4: TV4 — `M2-RECORD-004` & `M2-NOTIFY-003` (Medical Record & Notification)
```text
Member / task ID: TV4 / Member 4 — M2-RECORD-004 & M2-NOTIFY-003
Branch / worktree: feat/m2-record-004-clinical-grants-finalization (đã merge vào test/m2-integration-005-api-v2-clinic-workflow)
Base SHA -> final SHA: dad4f96 -> d026acc (cập nhật tại b4c99e3)
Owned paths: services/medical-record-service/**, services/notification-service/**
Provider/consumer dependencies: User Service (verify TOTP proof), Appointment Service (verify status, completion callback)
Contract sections / operation IDs: Mục 13 (Medical Records & Grants), Mục 14 (Notifications)
Schema migration and rollback: Migration 001 và 002 áp dụng thành công qua src/migrate.ts trên medical_record_service_test và notification_service_test
Tests run (command, exit, pass/fail/skip):
  - Unit tests Record & Notification: Exit 0, 66 pass, 0 fail
  - DB & HTTP Integration tests: Exit 0, 10 pass (5 Record, 5 Notification), 0 fail, 0 skip
Mock vs PostgreSQL/HTTP/live evidence: Bảng consumed_proofs chống replay hoạt động trên PostgreSQL thật; callback hoàn tất ca đồng bộ
Open contract decisions / known gaps: Grant TTL 15 phút; chỉ mở grant khi lịch hẹn CHECKED_IN; authored history 6 tháng
Security/permission review: STAFF/ADMIN bị 403 khi truy cập lâm sàng; DOCTOR bắt buộc grant; digest guard chống sửa đơn thuốc sau verify; log redact PHI
Git status clean? Local commit only? Push/merge: no: Clean. Local commit only. Push: NO.
Trạng thái: ACCEPTED
```

### Biểu mẫu 5: Tổng Hợp — `M2-INTEGRATION-005` (Tích hợp Toàn diện & Nghiệm thu)
```text
Member / task ID: TV1 + Provider Owners — M2-INTEGRATION-005
Branch / worktree: test/m2-integration-005-api-v2-clinic-workflow (/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi)
Base SHA -> final SHA: dad4f96 -> be891a5
Owned paths: Toàn bộ 8 workspaces backend và openapi-contract-tests
Provider/consumer dependencies: Tích hợp chéo toàn bộ 6 services và API Gateway
Contract sections / operation IDs: Đầy đủ 100% API Contract v2 (Mục 1–17)
Schema migration and rollback: Đã nạp và kiểm chứng an toàn trên 5 databases PostgreSQL test riêng biệt (Phương án A)
Tests run (command, exit, pass/fail/skip):
  - Build & Lint: Exit 0 (0 errors trên cả 8 workspaces)
  - Backend Unit & Domain Tests: 466 pass, 0 fail, 0 skip
  - Contract Suite: 104 pass, 0 fail, 0 skip
  - PostgreSQL / HTTP Integration Suite: 27 pass, 0 fail, 0 skip
  - Frontend Web Suite: 283 pass, 0 fail, 0 skip
Mock vs PostgreSQL/HTTP/live evidence: 27/27 integration tests pass trên PostgreSQL test thật (container clinic-test-pg port 5433); kiểm chứng 2 giả thuyết HYP-01 và HYP-02
Open contract decisions / known gaps: Đã chốt chính sách mặc định fail-closed cho cả 8 quyết định tại Mục 6
Security/permission review: Kiểm tra toàn diện 0 vi phạm bảo mật, 0 rò rỉ secret trong log, fail-closed an toàn
Git status clean? Local commit only? Push/merge: no: Clean. Local commit only. Push: NO.
Trạng thái: ACCEPTED (Đủ điều kiện nghiệm thu tích hợp local Nhịp 4)
```
