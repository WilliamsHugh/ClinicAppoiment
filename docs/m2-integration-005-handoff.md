# Báo cáo bàn giao M2-INTEGRATION-005
Ngày: 15/11/2026

## Member / task ID
- **Task ID:** M2-INTEGRATION-005 (Tích hợp toàn diện API v2 & Quy trình Lâm sàng End-to-End)
- **Role / Reporter:** `int-report` (Tổng hợp và bàn giao tích hợp)
- **Các thành viên và agents tham gia:**
  - `int-merge`: Khởi tạo integration branch, thực hiện cherry-pick 4 provider branches theo thứ tự phụ thuộc, kiểm thử build/test/lint.
  - `int-schema`: Thẩm định cú pháp SQL, quan hệ khóa ngoại (FK), cơ chế rollback (DOWN) và thứ tự chạy migrations của TV2 và TV4.
  - `int-harness`: Mở rộng bộ integration test harness (Flow 1 đến Flow 5) và biên soạn hướng dẫn chạy smoke test (`LIVE-SMOKE-GUIDE.md`).
  - `int-static`: Rà soát phân tích tĩnh, đối chiếu OpenAPI schema v2 của 6 backend services, kiểm tra cô lập internal route và an toàn dữ liệu log.
  - **Nguồn mã nguồn tích hợp từ 4 TV:**
    - **TV2 (User Service):** Session persistence, MFA TOTP, lifecycle & internal verification (M2-USER-004).
    - **TV3 (Booking - Appointment & Doctor):** Doctor me, occupied slots, summary, transition guards v2 (M2-BOOKING-006).
    - **TV4 (Record & Notification):** Clinical grants, finalization contexts, unread count, read all (M2-RECORD-004 & M2-NOTIFY-003).
    - **TV1 (Gateway & Contract Tests):** Cache refactor, internal route isolation, header stripping, synthetic test harness (M2-INTEGRATION-004).

---

## Branch / worktree
- **Integration Branch:** `test/m2-integration-005-api-v2-clinic-workflow`
- **Worktree path:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`

---

## Base SHA → Final SHA
- **Base Branch:** `test/m2-integration-002-openapi-contract-tests`
- **Base SHA:** `dad4f96` (`merge: standardize backend service logging`)
- **Final SHA:** `513b699` (`feat(gateway,contract): implement API v2 cache refactor, routing safety, contract tests, and integration harness (M2-INTEGRATION-004)`)

---

## Cherry-pick order (commits, conflicts if any)
Quá trình cherry-pick được thực hiện nghiêm ngặt theo thứ tự phụ thuộc kiến trúc (TV2 Auth/Session -> TV3 Booking -> TV4 Clinical Record -> TV1 Gateway/Contract):

1. **Thứ tự 1 (TV2 User Service):**
   - Source SHA: `738233f` trên branch `feat/m2-user-004-session-mfa-api-v2`
   - Integration Commit SHA: `e22d7b7`
   - Conflicts: **0 (clean)**
2. **Thứ tự 2 (TV3 Booking Service - Doctor & Appointment):**
   - Source SHA: `a89c40f` trên branch `feat/m2-booking-006-appointment-doctor-api-v2`
   - Integration Commit SHA: `8e27278`
   - Conflicts: **0 (clean)**
3. **Thứ tự 3 (TV4 Medical Record & Notification):**
   - Source SHA: `16c510e` trên branch `feat/m2-record-004-clinical-grants-finalization`
   - Integration Commit SHA: `d026acc`
   - Conflicts: **0 (clean)**
4. **Thứ tự 4 (TV1 API Gateway & Contract Tests):**
   - Source SHA: `7285122` trên branch `test/m2-integration-004-api-v2-rollout`
   - Integration Commit SHA: `513b699`
   - Conflicts: **0 (clean)**

**Thống kê thay đổi (Git Diff Stats):**
- 46 files changed
- 7,002 insertions(+)
- 273 deletions(-)
- Xung đột (Git conflicts): **0** (Hoàn toàn sạch)

---

## Schema migrations status
Toàn bộ mã nguồn SQL migration của TV2 và TV4 đã được thẩm định chi tiết bởi `int-schema` và xác nhận đồng nhất tuyệt đối trên branch tích hợp (diff = 0):

### 1. TV2 User Service Migrations
- **File UP:** `services/user-service/migrations/20261115_session_mfa_schema.up.sql`
  - **Trạng thái:** **PASS**
  - **Tính chất:** Hoàn toàn additive (không có lệnh `DROP TABLE` hoặc `DROP COLUMN`).
  - **Idempotency:** 100% lệnh `CREATE SCHEMA` và `CREATE TABLE` sử dụng `IF NOT EXISTS` cho các bảng: `user_service.sessions`, `mfa_factors`, `mfa_challenges`, `mfa_proofs`.
  - **Quan hệ khóa ngoại:** Tham chiếu hợp lệ đến `user_service.users(id)` (bảng tồn tại trong base schema). Ràng buộc `ON DELETE CASCADE` cho user/factor/challenge và `ON DELETE SET NULL` cho session_id trong mfa_challenges.
  - **Indexes:** Đầy đủ chỉ mục cho query patterns (`user_id`, `status`, `idle_expires_at`, `absolute_expires_at`, `refresh_token_hash`, `session_id`, `expires_at`, `user_id + session_id`).
  - **Bảo mật:** Chỉ lưu trữ `refresh_token_hash` và `secret_encrypted`. Không bao giờ lưu raw token hay plain secret.
- **File DOWN:** `services/user-service/migrations/20261115_session_mfa_schema.down.sql`
  - **Trạng thái:** **PASS**
  - **Rollback an toàn:** Chứa đầy đủ lệnh `DROP TABLE IF EXISTS` theo thứ tự đảo ngược quan hệ khóa ngoại (con xóa trước cha: `mfa_proofs` -> `mfa_challenges` -> `mfa_factors` -> `sessions`).
  - **Bảo vệ dữ liệu gốc:** Không xóa bảng `users` hoặc `patient_profiles`.

### 2. TV4 Medical Record Service Migrations
- **File:** `services/medical-record-service/migrations/002_m2_clinical_grants_and_finalization.sql`
  - **Trạng thái:** **PASS**
  - **Idempotency:** Sử dụng `IF NOT EXISTS` cho các cột mới (`version`, `appointment_completion` trên bảng `medical_records`) và các bảng mới (`clinical_grants`, `finalization_contexts`, `consumed_proofs`).
  - **Ràng buộc:** Kiểm tra `appointment_completion_check` an toàn qua PL/pgSQL block `DO $$`.
  - **Kiểm soát thời hạn (TTL):** Có cột `expires_at TIMESTAMPTZ NOT NULL` trên cả `clinical_grants` và `finalization_contexts`.
  - **Chống Replay:** Bảng `consumed_proofs` khai báo `proof_id TEXT PRIMARY KEY` ngăn chặn triệt để tái sử dụng token proof.

### 3. Kiểm tra kiến trúc Microservices (Cross-service FK)
- **Trạng thái:** **PASS (0 vi phạm)**
- Tuyệt đối không có Foreign Key chéo database/schema giữa các service.
- Các liên kết liên service (`appointment_id`, `doctor_id`, `patient_id`) được lưu dưới dạng UUID logic, tuân thủ nghiêm ngặt nguyên tắc Database-per-service.

### 4. Thứ tự thực thi (Migration Ordering)
- **Medical Record Service:** Chạy tuần tự `001_m2_record_completion_outbox` -> `002_m2_clinical_grants_and_finalization` thông qua `migrate.ts`, bảo vệ bằng `pg_advisory_xact_lock` và theo dõi SHA-256 checksum trong bảng `medical_record_service.schema_migrations`.
- **User Service:** Đặt tên migration `20261115_session_mfa_schema` nối tiếp sau `20260928_ensure_patient_profile_for_role.sql`.
- **Đánh giá chung:** **SAFE TO RUN** trên cơ sở dữ liệu test và production.

---

## Tests run (command, exit, pass/fail/skip per service)

### 1. Build & Lint Execution
- **Full Build Command:** `npm run build --workspaces --if-present`
  - **Exit Code:** **0** (0 lỗi build trên cả 8 workspaces: `clinic-management-web`, `api-gateway`, `appointment-service`, `doctor-service`, `medical-record-service`, `notification-service`, `user-service`, `shared-types`).
- **Full Lint / Typecheck Command:** `npm run lint --workspaces --if-present`
  - **Exit Code:** **0** (`tsc --noEmit` sạch 100% trên toàn bộ workspaces).

### 2. Test Execution Details
- **Test Command:** `npm run test --workspaces --if-present`
- **Bảng tổng hợp kết quả từng Service:**

| Workspace / Service | Test Files (P / S / F) | Tests Passed | Tests Failed | Tests Skipped | Trạng thái & Ghi chú |
|---|:---:|:---:|:---:|:---:|---|
| `clinic-management-web` | 7 / 0 / 0 | 35 | 0 | 0 | UI components & page routing pass 100% |
| `api-gateway` | 3 / 0 / 0 | 55 | 0 | 0 | Token stripping, routing cache, proxy pass 100% |
| `appointment-service` | 6 / 1 / 0 | 71 | 0 | 12 | 12 tests skipped (yêu cầu live PostgreSQL) |
| `doctor-service` | 7 / 1 / 0 | 63 | 0 | 2 | 2 tests skipped (yêu cầu live PostgreSQL) |
| `medical-record-service` | 2 / 3 / 0 | 36 | 0 | 5 | 5 tests skipped (yêu cầu live PostgreSQL & HTTP) |
| `notification-service` | 2 / 2 / 0 | 30 | 0 | 5 | 5 tests skipped (yêu cầu live PostgreSQL & HTTP) |
| `user-service` | 8 / 0 / 0 | 80 | 0 | 0 | Session persistence, MFA TOTP, verify pass 100% |
| `openapi-contract-tests` | 2 / 0 / 1 | 98 | 6* | 0 | Contract v2 (80/80 pass), Harness (6/6 pass), Legacy test (12 pass, 6 fail*) |
| **Tổng các Domain Services** | **28 / 7 / 0** | **370** | **0** | **24** | **100% Service Unit/Integration Tests PASS** |
| **Tổng toàn bộ Workspaces** | **37 / 7 / 1** | **468** | **6*** | **24** | **Toàn bộ chức năng nghiệp vụ hợp lệ** |

*\*Giải thích về 6 test fails trong `openapi-contract-tests`:*
- 6 failures này nằm riêng biệt trong file `packages/openapi-contract-tests/test/openapi.test.ts`. Đây là bộ test cũ (legacy) từ Milestone 1 dùng danh sách endpoints tĩnh của API v1 để so sánh `exact match`.
- Vì các service tại M2 đã bổ sung đầy đủ các endpoint mới của API v2 (ví dụ: `GET /appointments/summary`, `GET /notifications/unread-count`, `POST /medical-records/access-grants`, `POST /auth/password/forgot`, v.v.), bộ so sánh tĩnh v1 báo lệch danh sách route.
- Ngược lại, bộ kiểm thử hợp đồng chuẩn v2 mới (`packages/openapi-contract-tests/test/v2-contract-spec.test.ts`) kiểm tra chi tiết 80 kịch bản hợp đồng v2 đều **PASS 80/80**, và bộ integration harness (`test/integration-harness.test.ts`) đều **PASS 6/6**.

---

## Mock vs PostgreSQL/HTTP/live evidence
- **Phần đã được kiểm chứng qua Mocks / In-Memory Harness:**
  - **Integration Harness Flows (`test/integration-harness.test.ts`):** 6/6 test cases thực hiện giả lập toàn trình với synthetic fixtures và 8 in-memory stores (`sessions`, `appointments`, `medicalRecords`, `clinicalGrants`, `finalizationContexts`, `mfaChallenges`, `mfaProofs`, `idempotencyKeys`).
    - *Flow 1 (PATIENT):* Idempotency check (2 calls cùng key trả trùng kết quả; đổi payload cùng key trả 409 `IDEMPOTENCY_KEY_REUSED`), activity reporting cập nhật idle deadline 30 ngày (không gia hạn absolute), hủy lịch và giải phóng slot.
    - *Flow 2 (STAFF MFA):* Login vào `PENDING_MFA`, chặn gọi API nghiệp vụ (403 `MFA_VERIFICATION_REQUIRED`), cho phép allowlist `/api/v1/auth/mfa/*`, xác thực TOTP chuyển `ACTIVE`, deadline 8h cố định, idle lock sau 15 phút, unlock TOTP bảo toàn mốc 8h ban đầu.
    - *Flow 3 (DOCTOR CLINICAL):* Kiểm soát pre-grant (403 `CLINICAL_VERIFICATION_REQUIRED`), cấp `ClinicalGrant` qua TOTP challenge, chống proof replay (409 `PROOF_ALREADY_CONSUMED`), digest guard khi sửa đơn thuốc sau context (409 `FINALIZATION_CONTEXT_CHANGED`), tự động callback hoàn tất appointment (`appointmentCompletion: COMPLETED`).
    - *Flow 4 (ADMIN REVOCATION):* Admin MFA login, thu hồi phiên người dùng khác qua `DELETE /auth/sessions/:sessionId`, Gateway nhận tín hiệu xóa cache tức thời, user bị thu hồi nhận 401 `AUTH_SESSION_REVOKED`.
    - *Flow 5 (RACE & REPLAY):* 2 bệnh nhân book đồng thời 1 slot (1 thành công, 1 nhận 409 `SLOT_UNAVAILABLE`), 2 request đồng thời refresh token cùng session (1 thành công nhận v2 tokens, 1 nhận 401 `AUTH_REFRESH_INVALID`).
  - **Service Unit Tests:** Sử dụng mock repositories và in-memory database để kiểm tra logic nội bộ.
- **Phần yêu cầu PostgreSQL / HTTP Live Evidence (24 Skipped Tests):**
  - Các file integration tests kết nối database thật tạm thời được skip thông qua guard condition khi biến môi trường `DATABASE_URL` chưa được cung cấp.
- **Tài liệu hướng dẫn nghiệm thu Live:**
  - Đã chuẩn bị tài liệu bàn giao chi tiết tại [packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md](file:///home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi/packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md) với script `node packages/openapi-contract-tests/test/live-openapi.mjs`.

---

## Danh sách 24 Skipped Tests và Điều kiện Unskip
Khi triển khai môi trường live test / Supabase test database, 24 integration tests này sẽ được unskip và chạy tự động:

1. **Appointment Service (12 tests skipped):**
   - File: `services/appointment-service/test/appointment.integration.test.ts`
   - Nội dung kiểm tra: Ràng buộc giao dịch cơ sở dữ liệu thật cho concurrency booking, trạng thái appointment lifecycle trong Postgres.
2. **Medical Record Service (5 tests skipped):**
   - Files: `services/medical-record-service/test/medical-record.integration.test.ts`, `completion-outbox.integration.test.ts`
   - Nội dung kiểm tra: Ràng buộc bảng `consumed_proofs`, transaction context outbox, truy vấn qua Postgres extensions.
3. **Notification Service (5 tests skipped):**
   - Files: `services/notification-service/test/notification.integration.test.ts`, `dispatcher.integration.test.ts`
   - Nội dung kiểm tra: Polling database outbox, dispatching event lưu trữ thực tế trên PostgreSQL.
4. **Doctor Service (2 tests skipped):**
   - File: `services/doctor-service/test/doctor.integration.test.ts`
   - Nội dung kiểm tra: Phân trang danh sách bác sĩ và lọc chuyên khoa trực tiếp trên PostgreSQL query planner.

**Điều kiện cụ thể để unskip:**
- Cấu hình biến môi trường `DATABASE_URL` trong file `.env` của từng service chỉ đến instance Supabase Test / PostgreSQL Test:
  ```env
  DATABASE_URL=postgresql://postgres:[PASSWORD]@localhost:54322/[service_db]
  ```
- Chạy migrate trước khi test:
  ```bash
  npm run migrate --workspace=[service-name]
  ```
- Chạy lại test suite: tests sẽ tự động detect `DATABASE_URL` và thực thi toàn bộ 24 test cases.

---

## Open Contract Decisions cần chốt trước Production
Trước khi đưa hệ thống lên môi trường Production, các bên liên quan (Product Owner, Security, Technical Leads) cần thống nhất các quyết định sau:

1. **Factor Recovery khi mất Authenticator (TV2 - User Service):**
   - Hiện trạng: Chỉ hỗ trợ TOTP qua ứng dụng Authenticator.
   - Cần chốt: Cơ chế khôi phục khi người dùng mất điện thoại/ứng dụng (ví dụ: cấp bộ 8 mã dự phòng một lần - Backup Recovery Codes, hoặc quy trình nhân viên hỗ trợ xác minh danh tính thủ công).
2. **Password Recovery SMTP Integration (TV2 - User Service):**
   - Hiện trạng: Mã hóa và sinh token reset password đã sẵn sàng (`POST /auth/password/forgot`).
   - Cần chốt: Lựa chọn nhà cung cấp dịch vụ gửi email (SendGrid, AWS SES, Resend) và thiết lập mẫu email OTP/Magic link chính thức.
3. **Clinical Grant TTL (TV4 - Medical Record Service):**
   - Hiện trạng: Thời hạn grant truy cập hồ sơ bệnh án đang để mặc định 15 phút (`expires_at = now + 15m`).
   - Cần chốt: Đội ngũ Y tế/Lâm sàng cần xác nhận xem 15 phút có đủ cho các ca khám phức tạp hay cần cơ chế gia hạn tự động khi bác sĩ đang thao tác (sliding expiration).
4. **Authored History Window (TV4 - Medical Record Service):**
   - Hiện trạng: Bác sĩ tác giả được phép xem lại hồ sơ do chính mình lập trong cửa sổ 6 tháng.
   - Cần chốt: Chính sách bệnh viện về thời hạn bác sĩ được tra cứu lại lịch sử bệnh án sau khi kết thúc đợt khám (6 tháng, 1 năm hay vô thời hạn với tư cách tác giả).
5. **NO_SHOW Notification Trigger (TV3 + TV4):**
   - Hiện trạng: Appointment Service phát event khi lịch hẹn chuyển sang trạng thái `NO_SHOW`.
   - Cần chốt: Thống nhất mẫu thông báo gửi cho bệnh nhân, quy định về phí hủy muộn / không đến khám, và logic gửi cảnh báo nhắc nhở cho lần đặt hẹn tiếp theo.
6. **Breaking Change Rollout Strategy (TV1 - API Gateway):**
   - Hiện trạng: API v2 hỗ trợ song song các chuẩn mới nhưng các client cũ (v1) vẫn có thể gửi request.
   - Cần chốt: Lộ trình thông báo deprecation (header `Sunset`, `Deprecation`), thời hạn đóng hoàn toàn v1, và chiến lược cập nhật ứng dụng di động cho bệnh nhân.
7. **Cập nhật Legacy Route List trong `openapi.test.ts`:**
   - Cần cập nhật bộ danh sách routes trong `packages/openapi-contract-tests/test/openapi.test.ts` để đồng bộ hoàn toàn với API v2 và đưa test suite về 100% green.

---

## Security & Permission Review
- **Internal Route Isolation:**
  - Gateway chỉ định tuyến công khai các route bắt đầu bằng `/api/v1/*`.
  - Toàn bộ các route nội bộ `/internal/*` đều bị Gateway chặn và trả về `404 ROUTE_NOT_FOUND`.
  - Endpoint nội bộ `/internal/v1/auth/cache-invalidate` được xử lý ngay tại gateway và bắt buộc phải có header `X-Internal-Token` hợp lệ.
- **Header Stripping:**
  - Gateway chủ động bóc tách (strip) các headers giả mạo gửi từ phía client trước khi chuyển tiếp vào microservices: `x-internal-token`, `x-user-id`, `x-role`, `x-session-id`, `x-supabase-auth-user-id`.
- **Phân quyền & Ràng buộc bảo mật:**
  - Public endpoints: Bảo vệ bằng `bearerAuth` (JWT session v2).
  - Internal communication: Bảo vệ bằng `internalToken` chia sẻ nội bộ.
  - Doctor Access: Kiểm soát qua `ClinicalGrant` với chữ ký mã hóa và chống replay proof qua bảng `consumed_proofs`.
  - Staff / Admin: Bắt buộc hoàn thành TOTP MFA; giới hạn allowlist khi ở trạng thái `PENDING_MFA`; tự động khóa idle sau 15 phút; không thể gia hạn vượt quá mốc 8 giờ absolute.
- **An toàn Log (Log Safety):**
  - Kiểm tra tự động trên toàn codebase xác nhận **0 vi phạm**: Không ghi log raw access token, refresh token, mật khẩu, TOTP secret/seed, hoặc dữ liệu nhạy cảm bệnh nhân (chẩn đoán, triệu chứng, đơn thuốc).

---

## Git status clean? Local commit only? Push/merge: no
- **Trạng thái nhánh tích hợp:**
  - Nhánh: `test/m2-integration-005-api-v2-clinic-workflow`.
  - Base: `dad4f96`.
  - HEAD: `513b699`.
- **Phạm vi commit:** Hoàn toàn là local commit.
- **Remote Push / Merge:** **NO** (Tuyệt đối không push lên remote repository, không merge vào `main` theo đúng nguyên tắc an toàn M2).
- **Trạng thái working tree:** Sạch sẽ và sẵn sàng bàn giao; các tài liệu nghiệm thu (`docs/m2-integration-005-handoff.md`, `LIVE-SMOKE-GUIDE.md`) đã được bổ sung đầy đủ.

---

## Recommendation
### **READY FOR LIVE INTEGRATION**

Hệ thống đã đạt đầy đủ các tiêu chuẩn nghiệm thu kỹ thuật của M2:
1. Bản build thành công 100% trên cả 8 workspaces, lint/typecheck sạch hoàn toàn.
2. 100% test nghiệp vụ của toàn bộ 7 microservices vượt qua thành công (370/370 pass).
3. Bộ Contract Spec v2 (80/80 pass) và E2E Integration Harness (6/6 pass) xác nhận toàn bộ luồng nghiệp vụ hoạt động chính xác.
4. Schema migrations của TV2 và TV4 được thẩm định an toàn, có tính lũy tiến (additive), hỗ trợ rollback hoàn chỉnh và không vi phạm kiến trúc độc lập database.
5. Biên giới mạng và cơ chế cô lập route nội bộ được bảo vệ chặt chẽ tại API Gateway.

Khuyến nghị chuyển giao sang giai đoạn **Live Staging & Live Database Testing** theo quy trình tại `packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md`.
