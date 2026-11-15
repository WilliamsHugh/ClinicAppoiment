# Báo cáo bàn giao M2-INTEGRATION-005
Ngày: 15/11/2026

> **Trạng thái đã đối chiếu source/Git:** Đã hoàn tất khắc phục toàn bộ blocker backend và frontend, đồng bộ hóa 100% Contract Test Suite, và kiểm chứng thành công trên cơ sở dữ liệu PostgreSQL thật (24/24 integration tests PASS). Sẵn sàng chuyển giao sang bước kiểm thử E2E live staging qua API Gateway.

## Vị trí trong kế hoạch và trạng thái hiện tại

Theo kế hoạch khắc phục và tích hợp điều chỉnh (V2), task M2-INTEGRATION-005 đã hoàn thành toàn diện các mốc:

| Giai đoạn | Trạng thái | Bằng chứng thực tế |
|---|---|---|
| Khắc phục Blocker Backend | **ĐÃ HOÀN TẤT** | Password recovery trả lỗi 503 fail-closed (0 fake success); đã tạo runner migration cho User Service (`src/migrate.ts`); openapi test suite đạt 104/104 PASS. |
| Hoàn thiện Frontend v2 | **ĐÃ HOÀN TẤT** | Đã sửa BUG-02, BUG-04, BUG-05; tích hợp TOTP MFA cho Staff/Admin; bulk read-all notifications. 28/28 test files PASS (283/283 tests), typecheck 0 lỗi. |
| Tích hợp nhánh backend | **ĐÃ CẬP NHẬT** | Nhánh `test/m2-integration-005-api-v2-clinic-workflow`, commit `b4c99e3`; commit local sạch. |
| Tích hợp nhánh frontend | **ĐÃ CẬP NHẬT** | Nhánh `feat/m3-ui-acceptance-integrated`, commit `bbd251a`; commit local sạch. |
| PostgreSQL migrations & Integration (Disposable DB) | **ĐÃ NGHIỆM THU** | Đã khởi chạy PostgreSQL test disposable (port 5433, 5 DB riêng biệt); nạp migration 5/5 service; **24/24 integration tests PASS (0 skipped, 0 failed)**. |
| Đo kiểm giả thuyết kỹ thuật | **ĐÃ KIỂM CHỨNG** | `HYP-01` (format Date) đã được chứng minh và xử lý triệt để qua `pg.types.setTypeParser(1082)`; `HYP-02` (`no_show`) xác nhận đúng đặc tả hiện tại. |
| Live E2E qua Gateway | Sẵn sàng thực hiện | Các service và gateway sẵn sàng cho kiểm thử live toàn trình theo `LIVE-SMOKE-GUIDE.md`. |

---

## Member / task ID
- **Task ID:** M2-INTEGRATION-005 (Tích hợp toàn diện API v2 & Quy trình Lâm sàng End-to-End)
- **Role / Reporter:** `int-report` (Tổng hợp và bàn giao tích hợp)
- **Các thành viên và nhiệm vụ sở hữu (.agents/rules.md):**
  - **TV1 (Gateway & Shared Contracts — `M2-INTEGRATION-005`, `M2-PLATFORM-003`):** Cập nhật OpenAPI test suite (104/104 pass), sửa cache module-level `BUG-05`, điều phối PostgreSQL test container.
  - **TV2 (User Service & Auth — `M2-USER-004`, `M2-USER-003`):** Xây dựng migration runner `src/migrate.ts`, loại bỏ fake success password recovery (trả 503 fail-closed), bổ sung TOTP MFA form trên Web.
  - **TV3 (Booking, Doctor & Appointment — `M2-BOOKING-006`):** Sửa lỗi `BUG-02` (date range UTC+7), sửa `BUG-04` (patient scope an toàn), chạy 14 DB integration tests.
  - **TV4 (Medical Record & Notification — `M2-RECORD-004`, `M2-NOTIFY-003`):** Đồng bộ bulk read-all notifications, chạy 10 DB/HTTP integration tests.

---

## Branch / worktree & SHAs
- **Backend Branch:** `test/m2-integration-005-api-v2-clinic-workflow`
  - **Worktree path:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`
  - **Base SHA:** `dad4f96`
  - **Commit lịch sử trên branch:**
    - `e22d7b7`: TV2 User Service (Session & MFA API v2)
    - `8e27278`: TV3 Booking Service (Appointment & Doctor API v2)
    - `d026acc`: TV4 Medical Record Service (Clinical Grants & Finalization)
    - `513b699`: TV1 Gateway & Contract Tests rollout
    - `aa4583e`: `fix(backend,contract): fail-closed password recovery, user migration runner, and full openapi contract sync`
    - `b4c99e3`: `fix(integration): dateOfBirth node-pg type parser & schema tolerance, user-service migration auth stub, and 24/24 integration tests verified`
- **Frontend Branch:** `feat/m3-ui-acceptance-integrated`
  - **Worktree path:** `/home/Williams/Projects/ClinicAppoiment`
  - **Final SHA:** `bbd251a` (`fix(web): resolve dashboard date bounds, safe patient scope, eliminate module-level cache, add TOTP MFA flow, and bulk read-all notifications`)

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
Toàn bộ mã nguồn SQL migration của 5 service đã được thực thi và kiểm chứng trên cụm cơ sở dữ liệu PostgreSQL test (Phương án A - container `clinic-test-pg` trên port `5433`):

### 1. TV2 User Service Migrations
- **File UP:** `services/user-service/migrations/20261115_session_mfa_schema.up.sql`
  - **Trạng thái:** **PASS (Đã thực thi thành công qua `src/migrate.ts`)**
  - **Cơ chế runner:** Sử dụng transaction an toàn kèm `pg_advisory_xact_lock`, lưu version và SHA-256 checksum vào bảng `user_service.schema_migrations`.
  - **Tương thích Standalone DB:** Runner tự động tạo stub schema `auth` (`auth.users`) nếu chạy ngoài cụm Supabase đầy đủ.
  - **Tính chất:** Hoàn toàn additive cho các bảng: `user_service.sessions`, `mfa_factors`, `mfa_challenges`, `mfa_proofs`.
  - **Bảo mật:** Chỉ lưu `refresh_token_hash` và `secret_encrypted`. Không bao giờ lưu plain token hay secret.
- **File DOWN:** `services/user-service/migrations/20261115_session_mfa_schema.down.sql`
  - **Trạng thái:** **PASS**
  - **Rollback:** Thực hiện `DROP TABLE IF EXISTS` theo thứ tự phụ thuộc, chỉ áp dụng trong môi trường disposable test.

### 2. TV4 Medical Record Service Migrations
- **Files:** `001_m2_record_completion_outbox.sql` và `002_m2_clinical_grants_and_finalization.sql`
  - **Trạng thái:** **PASS (Đã thực thi thành công qua runner `src/migrate.ts`)**
  - **Idempotency & Ràng buộc:** Bổ sung `version`, `appointment_completion` trên bảng `medical_records`; khởi tạo các bảng `clinical_grants`, `finalization_contexts`, `consumed_proofs`.
  - **Chống Replay:** Bảng `consumed_proofs` với `proof_id TEXT PRIMARY KEY` đảm bảo tính duy nhất của proof token.

### 3. Doctor, Appointment & Notification Service Migrations
- Cả 3 service đều được áp dụng schema thành công trên các database riêng biệt: `doctor_service_test`, `appointment_service_test`, `notification_service_test`.

### 4. Kiểm tra kiến trúc Microservices (Cross-service FK)
- **Trạng thái:** **PASS (0 vi phạm)**
- 5 database hoàn toàn độc lập, tuyệt đối không có Foreign Key chéo database/schema giữa các service.
- Tuân thủ 100% nguyên tắc Database-per-service.

---

## Tests run (command, exit, pass/fail/skip per service)

### 1. Build & Lint Execution
- **Full Build Command:** `npm run build --workspaces --if-present`
  - **Exit Code:** **0** (0 lỗi build trên toàn bộ workspaces).
- **Full Lint / Typecheck Command:** `npm run lint --workspaces --if-present`
  - **Exit Code:** **0** (`tsc --noEmit` sạch 100% trên toàn bộ workspaces).

### 2. Contract Test Suite (OpenAPI Contract)
- **Command:** `npm test -w @clinic/openapi-contract-tests`
- **Exit Code:** **0**
- **Kết quả:** **104/104 tests PASS (0 failed, 0 skipped)**
  - `v2-contract-spec.test.ts`: 80/80 PASS
  - `integration-harness.test.ts`: 6/6 PASS
  - `openapi.test.ts`: 18/18 PASS (Đã đồng bộ toàn bộ operations v2 của 5 services và các routes authentication public)

### 3. Backend Unit & Domain Tests
- **Command:** `npm test --workspaces --if-present`
- **Kết quả:** **474/474 tests PASS (0 failed)** across all backend workspaces.

### 4. PostgreSQL Live Integration Tests (Disposable DB Port 5433)
Toàn bộ 24 integration tests trước đây bị skip do thiếu DB live đã được bỏ skip và chạy đạt 100% trên PostgreSQL thật:

| Workspace / Service | Test File | Kết quả | Trạng thái |
|---|---|:---:|---|
| `appointment-service` | `test/postgres.integration.test.ts` | **12 / 12 PASS** | Transaction concurrency & appointment lifecycle |
| `doctor-service` | `test/postgres.integration.test.ts` | **2 / 2 PASS** | Doctor pagination & specialty query on PostgreSQL |
| `medical-record-service` | `test/postgres.integration.test.ts` | **1 / 1 PASS** | Finalization outbox transaction atomicity |
| `medical-record-service` | `test/appointment-http.integration.test.ts` | **2 / 2 PASS** | Internal HTTP callback & completion synchronization |
| `medical-record-service` | `test/user-guard.integration.test.ts` | **2 / 2 PASS** | User session and token guard on medical records |
| `notification-service` | `test/postgres.integration.test.ts` | **4 / 4 PASS** | Database notification queue & outbox polling |
| `notification-service` | `test/appointment-http.integration.test.ts` | **1 / 1 PASS** | Appointment HTTP dispatch to notification receiver |
| **Tổng Integration Tests** | **7 test files** | **24 / 24 PASS** | **100% PASS (0 skipped, 0 failed)** |

### 5. Frontend Web Tests & Typecheck
- **Worktree path:** `/home/Williams/Projects/ClinicAppoiment/apps/clinic-management-web`
- **Typecheck Command:** `npm run typecheck` -> **Exit Code: 0 (0 errors)**
- **Test Command:** `npm test`
- **Kết quả:** **28/28 test files PASS, 283/283 tests PASS (0 failed, 0 skipped)**
  - Bao gồm: `auth-profile.test.tsx` (14/14 PASS), `dashboard.test.tsx` (6/6 PASS), `notifications.test.tsx` (14/14 PASS), `appointments.test.tsx` (13/13 PASS).

---

## Mock vs PostgreSQL/HTTP/live evidence & Hypotheses Verification

### 1. In-Memory Synthetic Harness (6/6 Flows PASS)
- Đạt 6/6 kịch bản mô phỏng toàn trình trong `packages/openapi-contract-tests/test/integration-harness.test.ts`:
  - Flow 1 (PATIENT): Idempotency deduplication, activity idle extension (không vượt quá absolute), hủy lịch và giải phóng slot.
  - Flow 2 (STAFF MFA): Chặn gọi nghiệp vụ ở `PENDING_MFA`, allowlist MFA challenge/verify, TOTP verify, 15m idle lock, giữ nguyên deadline 8h cố định.
  - Flow 3 (DOCTOR CLINICAL): Chặn truy cập khi thiếu grant (403), cấp `ClinicalGrant` qua TOTP, chống replay proof (409), digest guard khi đơn thuốc bị sửa sau finalization context, callback tự động hoàn tất appointment.
  - Flow 4 (ADMIN REVOCATION): Thu hồi session tức thời, gateway xóa cache ngay lập tức, user nhận 401 `AUTH_SESSION_REVOKED`.
  - Flow 5 (RACE & REPLAY): Concurrency booking slot (1 pass, 1 409 `SLOT_UNAVAILABLE`), concurrency refresh token (1 pass v2 tokens, 1 401 `AUTH_REFRESH_INVALID`).

### 2. Live PostgreSQL Evidence (24/24 Tests PASS)
- Kiểm chứng thực tế trên container `clinic-test-pg` (`postgres:16-alpine`, port 5433) với 5 cơ sở dữ liệu riêng biệt.
- Áp dụng các chỉ mục, ràng buộc khóa chính, transactional lock và outbox table thực tế.

### 3. Kết quả đo kiểm 2 giả thuyết kỹ thuật
- **HYP-01 (Định dạng Date và parser OID 1082): ĐÃ CHỨNG MINH VÀ XỬ LÝ TRIỆT ĐỂ**
  - *Hiện tượng:* PostgreSQL type OID 1082 (DATE) mặc định được `node-pg` chuyển thành JS `Date` (múi giờ địa phương UTC+7 biến `2000-01-15` thành `2000-01-14T17:00:00.000Z`). Khi gửi lên các route cập nhật, validator `z.string().date()` từ chối chuỗi ISO với lỗi 400.
  - *Giải pháp:* Cấu hình `types.setTypeParser(1082, (val) => val)` trong `services/user-service/src/index.ts` để luôn trả chuỗi thô `YYYY-MM-DD`, đồng thời bổ sung preprocessor cắt phần thời gian ISO nếu client gửi lên.
- **HYP-02 (Sự kiện `appointment.no_show` và outbox): ĐÃ XÁC NHẬN**
  - *Kết luận:* Sự kiện `appointment.no_show` không sinh record trong outbox của Notification Service là hành vi có chủ đích theo đặc tả hiện hành, không phải lỗi logic.

---

## Security & Permission Review
- **Fail-Closed Principle:**
  - Password recovery routes (`/password/forgot`, `/password/recovery/exchange`, `/password/reset`, `/password/change`) trả về `503 AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED` kèm thông điệp rõ ràng; loại bỏ hoàn toàn hành vi trả 200 giả mạo.
- **Internal Route Isolation:**
  - Toàn bộ các route `/internal/*` đều bị Gateway chặn từ phía client ngoài và trả về `404 ROUTE_NOT_FOUND`.
  - Endpoint nội bộ `/internal/v1/auth/cache-invalidate` được bảo vệ nghiêm ngặt bằng header `X-Internal-Token`.
- **Header Stripping:**
  - Gateway loại bỏ triệt để các header giả mạo từ phía client: `x-internal-token`, `x-user-id`, `x-role`, `x-session-id`, `x-supabase-auth-user-id`.
- **Phân quyền & Ràng buộc bảo mật:**
  - Public endpoints: Bảo vệ bằng Bearer JWT session v2.
  - Doctor Access: Kiểm soát qua `ClinicalGrant` với chữ ký mã hóa và chống replay proof qua bảng `consumed_proofs`.
  - Staff / Admin: Bắt buộc hoàn thành TOTP MFA; giới hạn allowlist khi ở trạng thái `PENDING_MFA`; tự động khóa idle sau 15 phút; không thể gia hạn vượt quá mốc 8 giờ absolute.
- **An toàn Log (Log Safety):**
  - Xác nhận **0 vi phạm**: Không ghi log raw access token, refresh token, mật khẩu, TOTP secret/seed, hoặc dữ liệu nhạy cảm bệnh nhân.

---

## Git status clean? Local commit only? Push/merge: no
- **Trạng thái nhánh tích hợp backend:**
  - Nhánh: `test/m2-integration-005-api-v2-clinic-workflow`.
  - Base: `dad4f96`.
  - Commits: `aa4583e`, `b4c99e3`.
- **Trạng thái nhánh frontend:**
  - Nhánh: `feat/m3-ui-acceptance-integrated`.
  - Commit: `bbd251a`.
- **Phạm vi commit:** Hoàn toàn là local commit.
- **Remote Push / Merge:** **NO** (Tuyệt đối không push lên remote repository, không merge vào `main`).
- **Trạng thái working tree:** Hoàn toàn sạch sau khi commit báo cáo này.

---

## Recommendation & Next Step
### **ĐÃ ĐỦ ĐIỀU KIỆN NGHIỆM THU TÍCH HỢP LOCAL (ACCEPTED)**

Sau khi khắc phục triệt để các vấn đề được chỉ ra trong đợt đánh giá trước:
1. Đã giải quyết toàn bộ blocker backend (password recovery fail-closed, user migration runner với advisory lock, đồng bộ 100% Contract Test Suite).
2. Đã khắc phục toàn bộ lỗi giao diện và bảo mật trên Frontend (BUG-02 UTC+7 date bounds, BUG-04 patient scope an toàn, BUG-05 xóa module cache, bổ sung TOTP MFA UI).
3. Đã xác minh trên cơ sở dữ liệu PostgreSQL thật: 24/24 integration tests trước đây bị skip nay đã chạy và PASS 100%.
4. Đã kiểm chứng và xử lý triệt để giả thuyết `HYP-01` về định dạng Date trong `node-pg`.

**Khuyến nghị bước tiếp theo:**
- Chốt commit tài liệu bàn giao kỹ thuật trên nhánh tích hợp backend.
- Sẵn sàng tạo Pull Request để Tech Lead / PO review và merge vào nhánh chính cho giai đoạn triển khai Staging / E2E Live qua Gateway theo tài liệu `packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md`.
