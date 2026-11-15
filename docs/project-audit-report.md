# Báo Cáo Rà Soát Kiến Trúc, Nghiệp Vụ Và Độ Tương Thích FE–BE (Clinic Appointment System)

**Mục đích tài liệu:** Làm cơ sở phân tích kỹ thuật trước khi rà soát, chốt quyết định nghiệp vụ và cập nhật [`docs/api-contract.md`](api-contract.md) cho giai đoạn phát triển song song Frontend – Backend. Tài liệu này **không tự ý thay đổi hợp đồng API** hiện hành.

---

## 1. Phạm Vi Đánh Giá, Git Worktree Và Bằng Chứng Kiểm Thử

**Ngày đánh giá/snapshot theo yêu cầu:** 14/11/2026. SHA bên dưới xác định chính xác mã nguồn được đối chiếu; kết quả test là bằng chứng ghi nhận từ lần chạy trên các snapshot đó, không phải kết quả chạy lại trong lần chỉnh sửa báo cáo này.

Hệ thống hiện phát triển song song trên hai Git worktree tách biệt; mọi kết luận dưới đây được gắn chặt vào đúng nhánh và commit SHA đã kiểm tra:

| Thành phần | Worktree path | Nhánh Git | Commit SHA đầy đủ | Vai trò snapshot |
|---|---|---|---|---|
| **Frontend (Web + Flutter)** | `/home/Williams/Projects/ClinicAppoiment` | `feat/m3-ui-acceptance-integrated` | `b1d3113bd595be6a46071ec20f3d086e369a8e5e` (`b1d3113`) | Bản tích hợp UI M3 mới nhất (`clinic-management-web`, `patient-app`). Cây `services/` & `gateway/` nằm trong worktree này là snapshot cũ hơn. |
| **Backend + OpenAPI** | `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi` | `test/m2-integration-002-openapi-contract-tests` | `dad4f96aa8d2524c6ce31bee12e6421a5ba44946` (`dad4f96`) | Nhánh backend/integration mới nhất (`git diff b1d3113..dad4f96`: 38 files changed, 921 insertions(+), 222 deletions(-)). Chứa mã `clinic-management-web` cũ hơn (35 tests). |

### 1.1 Contract được dùng làm đối chiếu

| Snapshot | Blob SHA-1 của `docs/api-contract.md` | Phạm vi khác biệt |
|---|---|---|
| Frontend `b1d3113` | `0826f2866edf3168795b372f8c65ed290793548f` | Bản contract nghiệp vụ cũ được frontend triển khai theo. |
| Backend `dad4f96` | `8fdff618e10d259d8cc8fe0a87adf907d8b35daf` | Giữ contract nghiệp vụ cũ, đồng thời thêm 27 dòng về cache identity, logging và lệnh contract test. Không đồng nghĩa các mâu thuẫn endpoint nghiệp vụ trong báo cáo đã được giải quyết. |

Do đó, khi báo cáo nói “contract cũ”, nội dung đó chỉ phạm vi nghiệp vụ API. Những trích dẫn về cache/logging/contract-test phải ghi rõ là bổ sung ở snapshot backend `dad4f96`, không có trong bản frontend `b1d3113`.

### 1.2 Môi trường & công cụ đo kiểm

- **Node.js:** `v22.23.2` · **npm:** `10.9.8`
- **Flutter:** `3.47.3` (`stable`) · **Dart:** `3.13.3`

### 1.3 Kết quả chạy kiểm tra theo từng worktree

#### A. Worktree Frontend `b1d3113bd595be6a46071ec20f3d086e369a8e5e`

| Lệnh kiểm tra | Exit code | Kết quả ghi nhận | Phạm vi & ghi chú |
|---|---:|---|---|
| `npm run lint` | `0` | Pass (8 workspace JS/TS) | Kiểm tra type/lint tĩnh trên cây `b1d3113` |
| `npm run build` | `0` | Pass (8 workspace JS/TS; Next.js 15.5.25 xuất `13/13` static routes) | Build OK; cảnh báo nhiều lockfile do `/home/Williams/package-lock.json` ở thư mục ngoài |
| `npm run test` | `0` | **`514 passed \| 24 skipped`** | `clinic-management-web`: `254 passed` (`25/25` files)<br>`api-gateway`: `39 passed` (`2/2` files)<br>`user-service`: `62 passed` (`7/7` files)<br>`doctor-service`: `56 passed \| 2 skipped` (`7/8` files)<br>`appointment-service`: `57 passed \| 12 skipped` (`5/6` files)<br>`medical-record-service`: `22 passed \| 5 skipped` (`2/5` files)<br>`notification-service`: `24 passed \| 5 skipped` (`2/4` files) |
| `npm run analyze:patient` | `0` | `No issues found! (ran in 1.8s)` | Static analyzer cho Flutter `apps/patient-app` |
| `npm run test:patient` | `0` | `+98: All tests passed!` | Widget/unit test dùng mock API client trong `apps/patient-app` |

#### B. Worktree Backend `dad4f96aa8d2524c6ce31bee12e6421a5ba44946`

| Lệnh kiểm tra | Exit code | Kết quả ghi nhận | Phạm vi & ghi chú |
|---|---:|---|---|
| `npm run lint && npm run build` | `0` | Pass toàn bộ workspace trong `dad4f96` | Build/typecheck sạch trên nhánh backend |
| `npm run test` | **`1` (FAIL)** | Fail ở `api-gateway`: `1 failed \| 44 passed (45)` | **Test/quality gate fail:** `gateway/api-gateway/test/hardening.test.ts:392` (`SyntaxError: Unexpected token 'a', "[api-gatewa"... is not valid JSON`) vì test vẫn `JSON.parse(log)` trong khi `dad4f96` đã chuyển sang plain-text log theo `@clinic/request-logging`. Các workspace khác trong lần chạy: `appointment-service` (`57 passed \| 12 skipped`), `doctor-service` (`56 passed \| 2 skipped`), `medical-record-service` (`22 passed \| 5 skipped`), `notification-service` (`24 passed \| 5 skipped`), `user-service` (`62 passed`), `@clinic/openapi-contract-tests` (`18 passed`), `clinic-management-web` (`35 passed`, snapshot FE cũ). |
| `npm test --workspace=@clinic/openapi-contract-tests` | `0` | **`18 passed (18)`** (`test/openapi.test.ts`) | Kiểm chứng OpenAPI 3.0 tĩnh (ref, path, security, summaries) cho Gateway và 5 service. |
| `npm run test:live --workspace=@clinic/openapi-contract-tests` | Chưa chạy | Yêu cầu 6 service đang chạy thực tế | Chưa kiểm chứng `/openapi.json` và `/docs/` trên runtime sống. |

> [!IMPORTANT]
> **Giới hạn bằng chứng End-to-End:** Toàn bộ `24` test backend tích hợp PostgreSQL thật và giao tiếp HTTP liên-service live đều ở trạng thái **skipped** trong các lần chạy được ghi nhận. Các bộ test Web/Flutter và phần lớn unit test service dùng in-memory/mock. Do đó, báo cáo này **chưa thể kết luận hệ thống đã thông suốt End-to-End trên PostgreSQL và Supabase Auth thật**. Các kết quả ở đây được ghi lại từ lần chạy trước; lượt rà soát tài liệu này không chạy lại chúng.

---

## 2. Phân Loại Mức Độ Phát Hiện (Evidence Taxonomy)

Để không đánh đồng lỗi code với câu hỏi thiết kế hoặc đề xuất tính năng, các phát hiện dùng những nhãn sau:

| Nhãn phân loại | Ý nghĩa | Căn cứ sử dụng |
|---|---|---|
| `[BUG-CONFIRMED]` | Lỗi hành vi sản phẩm tái hiện được hoặc sai sót logic rõ ràng trong source hiện tại | Đã thấy trực tiếp từ source hoặc tái hiện bằng runtime; test fail đơn lẻ không tự chứng minh lỗi sản phẩm |
| `[TEST-FAILURE]` | Test/quality gate thất bại dù chưa chứng minh hành vi runtime của sản phẩm sai | Có lệnh, workspace, exit code và lỗi assertion/compiler cụ thể |
| `[HARDENING-GAP]` | Thiếu biện pháp phòng vệ hoặc hardening; chưa chứng minh thành lỗi nghiệp vụ đang xảy ra | Nêu điều kiện khai thác/ảnh hưởng và giới hạn đánh giá |
| `[CONFLICT-CONTRACT]` | Sai khác giữa FE (`b1d3113`), BE (`dad4f96`) hoặc mâu thuẫn nội bộ trong `docs/api-contract.md` | Đối chiếu trực tiếp từng route/method/payload/role |
| `[RISK-HYPOTHESIS]` | Rủi ro suy luận từ code, **chưa tái hiện được** do thiếu runtime PostgreSQL/E2E thật | Suy luận từ kiểu DB/driver/validator khi test DB đang skip |
| `[INCOMPLETE-PARTIAL]` | Đã hứa trên UI/tài liệu hoặc đã scaffold một phần nhưng chưa nối xong luồng | UI có control/copy/widget nhưng chưa gắn API hoặc thiếu phân trang |
| `[DECISION-REQUIRED]` | Vấn đề chính sách nghiệp vụ, phân quyền hoặc bảo mật cần team chốt | Không tự quy kết là lỗi trước khi chốt rule |
| `[BACKLOG-SCOPE]` | Tính năng mở rộng chưa nằm trong phạm vi API `/api/v1` hiện cam kết | Gợi ý lộ trình sản phẩm sau khi chốt core |

---

## 3. Phân Tích Các Luồng Nghiệp Vụ Cốt Lõi

### 3.1 Luồng 1: Xác thực, Phiên đăng nhập & Cache danh tính

1. **Đăng nhập / Đăng ký / Refresh / Logout:**
   - **Patient App (`b1d3113`):** `GatewaySessionProvider` (`apps/patient-app/lib/core/session/gateway_session_provider.dart`) gọi `/api/v1/auth/login`, `/register`, `/refresh`, `/logout` qua Gateway; lưu `accessToken`, `refreshToken`, `expiresAt` trong `FlutterSecureStorage`; tự refresh trước hạn 30 giây. Lưu ý `WelcomePage` (`features/onboarding/welcome_page.dart`) đã viết nhưng `patient_app.dart` đang vào thẳng `AuthPage` khi chưa đăng nhập.
   - **Clinic Web (`b1d3113`):** `SessionProvider` (`apps/clinic-management-web/src/lib/session/session-context.tsx`) gọi login/refresh/logout và tải thêm `/api/v1/users/me` để lấy `fullName`; lưu phiên trong `localStorage` (`clinic_web_session`); chặn `PATIENT` đăng nhập vào Web Management (gọi ngay `/api/v1/auth/logout` rồi báo lỗi).
   - **User Service (`dad4f96`):** Chỉ `User Service` giữ Supabase SDK (`services/user-service/src/auth.ts`). Đăng ký công khai luôn gán role `PATIENT` và tự tạo `patient_profiles` (cả trigger DB lẫn fallback trong `repository.createUser` ở `services/user-service/src/repository.ts#L148-154`).
2. **Gateway Identity Cache (`dad4f96`):**
   - `VerifiedIdentityCache` (`gateway/api-gateway/src/auth.ts#L30-72`) cache token theo digest SHA-256 trong RAM, chỉ cache tài khoản `ACTIVE`, thời hạn lấy `min(now + AUTH_IDENTITY_CACHE_TTL_MS, jwtExpiry)` (mặc định 5 phút, LRU tối đa `5000` entry) và gọi `authenticate.invalidateToken(token)` khi `POST /api/v1/auth/logout` trả `< 400` (`gateway/api-gateway/src/app.ts#L196-200`).
   - **Ràng buộc vận hành:** Nếu `ADMIN` khóa hoặc đổi role user từ `/users` (`PATCH /users/:id/status|role`), Gateway không tự xóa cache cho tới khi hết TTL 5 phút (rủi ro này đã được ghi nhận trong `docs/api-contract.md#L56-58` trên `dad4f96`).

### 3.2 Luồng 2: Quản lý Chuyên khoa, Bác sĩ, Lịch làm việc & Sinh Slot

1. **Quản trị danh mục & lịch làm việc:**
   - `ADMIN` tạo/sửa `Specialty` và `Doctor` (`services/doctor-service/src/app.ts#L176-225`), đối chiếu `userId` phải đang `DOCTOR + ACTIVE` bên `User Service` qua `/internal/v1/users/{userId}/doctor-eligibility`.
   - `DOCTOR` (cho chính mình), `STAFF`, `ADMIN` tạo/cập nhật `schedules` (giờ địa phương UTC+7, không qua nửa đêm, DB schema có trigger chống chồng lấn khung giờ) và `time-offs` (giờ ISO UTC). Trước khi sửa/tắt lịch làm việc, ngừng hoạt động bác sĩ hoặc thêm/sửa `time-off`, `Doctor Service` gọi `Appointment Service /internal/v1/appointments/occupied-slots` để chặn xung đột (`409 SCHEDULE_CONFLICT_WITH_APPOINTMENTS`, không tự hủy lịch hẹn đang có).
2. **Sinh Slot khả dụng (`GET /api/v1/doctors/:id/available-slots?date=YYYY-MM-DD`):**
   - `Doctor Service` chuyển ngày địa phương UTC+7 sang cửa sổ UTC `[from, to)`, tính slot ứng viên từ `schedules` trừ `time_offs`, rồi trừ tiếp `occupied-slots` từ `Appointment Service` (`services/doctor-service/src/app.ts#L293-304`). Danh sách slot **chỉ phản ánh thời điểm đọc, không giữ chỗ tạm thời**.

### 3.3 Luồng 3: Đặt lịch hẹn, Idempotency & Chống Double Booking

1. **Đặt lịch (`POST /api/v1/appointments`):**
   - **Patient App (`b1d3113`):** `BookingConfirmationSheet` (`apps/patient-app/lib/features/appointments/booking_confirmation_sheet.dart#L77-95`) tạo `Idempotency-Key` gắn theo fingerprint lựa chọn để giữ nguyên key khi retry cùng payload (bao gồm cả sau timeout). Không gửi `patientId` (BE tự suy ra từ `X-User-Id`).
   - **Clinic Web (`b1d3113`):** Component `PatientSelector` (`apps/clinic-management-web/src/features/users/patient-selector.tsx`) đã có sẵn để tìm bệnh nhân (`GET /api/v1/patients`), nhưng hiện **chưa có giao diện đặt lịch cho bệnh nhân (`POST /api/v1/appointments`) trên Web**; modal đặt lịch trên trang chủ (`clinic-landing-page.tsx#L980-1028`) chỉ hướng dẫn tải Patient App hoặc gọi tổng đài `1900 8899`.
   - **Appointment Service (`dad4f96`):** Kiểm tra `Idempotency-Key` bắt buộc, replay cùng key + fingerprint trả `200`, khác fingerprint trả `409 IDEMPOTENCY_KEY_REUSED`. Sau đó gọi `Doctor Service /internal/v1/doctors/verify-slot`, ghi DB trong transaction có PostgreSQL exclusion constraint (trên trạng thái active `PENDING`, `CONFIRMED`, `CHECKED_IN`) và ghi event vào `appointment_service.outbox`.

### 3.4 Luồng 4: Vận hành Hàng đợi, Khám bệnh & Hoàn tất Ca khám

```text
[PATIENT tạo lịch] ──► PENDING
                         │  (STAFF/ADMIN: PATCH /confirm)
                         ▼
                     CONFIRMED ──► NO_SHOW (STAFF/ADMIN: PATCH /no-show)
                         │  (STAFF/ADMIN: PATCH /check-in)
                         ▼
                     CHECKED_IN
                         │
          ┌──────────────┴────────────────────────────────────────────────┐
          │ Web DOCTOR chốt bệnh án FINAL:                                │
          │ POST hoặc PATCH /api/v1/medical-records (status: "FINAL")     │
          ▼                                                               │
   Medical Record Service                                                 │
   ├─ Ghi record + audit logs + 2 outbox events (cùng DB transaction):     │
   │   1. appointment.complete -> POST /internal/v1/appointments/{id}/complete-from-record
   │   2. medical-record.created|updated -> POST /internal/v1/notifications│
   │                                                                      │
   └─ Outbox worker (chu kỳ poll 5000ms + retry nếu lỗi)                  │
          │                                                               │
          └──► Appointment Service chuyển CHECKED_IN ──► COMPLETED ◄──────┘
```

- **Điểm gãy hợp đồng hiện tại:** `docs/api-contract.md#L285` vẫn mô tả `PATCH /api/v1/appointments/{id}/complete` là route chuyển `CHECKED_IN -> COMPLETED`, trong khi `services/appointment-service/src/index.ts#L359-360` cố tình khóa route public này thành `409 MEDICAL_RECORD_REQUIRED` để ép hoàn tất qua hồ sơ bệnh án `FINAL`.

### 3.5 Luồng 5: Thông báo & Nhắc lịch

1. **Outbox -> Notification Service:** `AppointmentOutboxWorker` (`dad4f96`) gửi bất đồng bộ theo chu kỳ poll (`APPOINTMENT_OUTBOX_POLL_MS`, mặc định `5000` ms) các event `created`, `confirmed`, `rescheduled`, `cancelled`, `checked_in`. `Medical Record Service` gửi `created`/`updated` sau khi xử lý xong callback hoàn tất lịch hẹn (hoặc defer nếu callback fail).
2. **Deduplicate & Reminders:** `Notification Service` kiểm tra `eventId` để chống trùng, đối chiếu `reminder-context` với `Appointment Service` trước khi tạo/hủy reminder **24 giờ trước giờ khám** (`services/notification-service/src/repository.ts#L89-98,124-134`) và chạy poll mỗi `60_000` ms (`services/notification-service/src/index.ts#L183`). Hiện chưa có reminder 1 giờ và chưa có push FCM/APNs; reminder được lưu thành notification `IN_APP` để Web/App tải qua REST (`GET /api/v1/notifications`). Điều này không khớp lời hứa 24h + 1h push trên Flutter `ReminderBanner`.

---

## 4. Ma Trận Tương Thích Endpoint: FE (`b1d3113`) ↔ Gateway / Backend / OpenAPI (`dad4f96`)

> **Chú thích cột Trạng thái:** `OK` chỉ có nghĩa là đối chiếu tĩnh thấy khớp đường dẫn, method, quyền và schema cơ bản; không xác nhận runtime/E2E hoặc mọi field response. `LECH` = lệch contract hoặc thiếu tham số/hành vi; `CHUA_DUNG` = BE đã có nhưng FE chưa tích hợp; `THIEU_BE` = FE/tài liệu nhắc tới nhưng BE không có. Khi một endpoint có nhiều phát hiện, ghi riêng từng trạng thái thay vì gộp thành một nhãn ghép.

### 4.1 System & Auth

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Gateway (`dad4f96`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|---|
| `GET /health` | Không gọi | Không gọi | Public, JSON `{service, status}` | Mỗi service có `/health` riêng | Đủ ở 6 spec (`dad4f96`) | `OK` |
| `GET /api/v1/system/health` | `health.ts`, `admin-dashboard.tsx` (`ADMIN`) | Không gọi | Xử lý trực tiếp tại Gateway (`ADMIN`) | Kiểm tra `/health` 5 service + `USER_GATEWAY_INTERNAL_API_TOKEN` | Có trong `gateway/openapi.ts`; khớp `api-contract.md` | `OK` |
| `POST /api/v1/auth/register` | Không dùng (Web cấm `PATIENT`) | `GatewaySessionProvider.signUp` | Public proxy -> User Service | `auth.ts`: chỉ tạo `PATIENT`; trả token hoặc `requiresEmailConfirmation: true` | Có trong `user-service/openapi.ts`; response schema còn là `SuccessEnvelope` chung | `OK` |
| `POST /api/v1/auth/login` | `session-context.tsx` (sau đó từ chối `PATIENT`) | `GatewaySessionProvider.signIn` | Public proxy -> User Service | `auth.ts`: `{accessToken, refreshToken, expiresIn, user}` | Có trong `user-service/openapi.ts` (`SuccessEnvelope`) | `OK` |
| `POST /api/v1/auth/refresh` | `session-context.tsx` | `GatewaySessionProvider._refreshSession` | Public proxy -> User Service | `auth.ts`: nhận `{refreshToken}`, trả session mới | Có trong `user-service/openapi.ts` (`SuccessEnvelope`) | `OK` |
| `POST /api/v1/auth/logout` | `session-context.tsx` | `GatewaySessionProvider.signOut` | Yêu cầu Bearer; xóa cache token khi proxy `< 400` (`app.ts#L196-200`) | `auth.ts`: cần cả Bearer + `{refreshToken}` | Có trong `user-service/openapi.ts` | `OK` |
| `GET /api/v1/auth/me` | Không gọi | Không gọi | Proxy `/api/v1/auth` -> User Service | Gắn với `api-contract.md#L226` (FE hiện đều dùng `/users/me` thay vì `/auth/me`) | Có trong `api-contract.md` & `user-service/openapi.ts` | `CHUA_DUNG` |

### 4.2 Users & Patients

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|
| `GET /api/v1/users/me` | `session-context.tsx`, `profile-form.tsx` | `profile_page.dart` | Trả user profile (+ `patientProfile` cho `PATIENT`) | Có trong `user-service/openapi.ts` (`SuccessEnvelope`) | `OK` |
| `PATCH /api/v1/users/me` | `profile-form.tsx` (`fullName`, `phone`) | `profile_page.dart` (`fullName`, `phone`) | Cho mọi role đã đăng nhập; cập nhật `fullName`, `phone` | Có trong `user-service/openapi.ts` | `OK` |
| `GET /api/v1/users` | `users-panel.tsx`, `admin-dashboard.tsx` (`limit=1`), `doctor-api.ts` (`role=DOCTOR&status=ACTIVE&limit=100`) | Không gọi | Chỉ `ADMIN`; hỗ trợ `page, limit, role, status, q` | Khớp `api-contract.md#L237`; có trong `openapi.ts` | `OK` |
| `GET /api/v1/users/{id}` | Không gọi | Không gọi | Chỉ `ADMIN`; thiếu check UUID param trước DB có thể dẫn tới `503` khi ID sai | Có trong `openapi.ts` (thiếu `400` response khi param không phải UUID) | `CHUA_DUNG` / `LECH` |
| `PATCH /api/v1/users/{id}/role` | `users-panel.tsx` (`ADMIN`) | Không gọi | Chỉ `ADMIN`; đổi `role` (`PATIENT`/`DOCTOR`/`STAFF`/`ADMIN`) | Khớp `api-contract.md`; **Cache Gateway có thể giữ role cũ tối đa TTL 5 phút** | `OK` (lưu ý cache TTL) |
| `PATCH /api/v1/users/{id}/status` | `users-panel.tsx` (`ADMIN`) | Không gọi | Chỉ `ADMIN`; đổi `status` (`ACTIVE`/`INACTIVE`/`LOCKED`) | Khớp `api-contract.md`; **Cache Gateway giữ trạng thái cũ tối đa TTL 5 phút** | `OK` (lưu ý cache TTL) |
| `GET /api/v1/patients` | `patient-selector.tsx` (component chưa gắn vào route UI nào) | Không gọi | `STAFF`, `ADMIN`, `DOCTOR` (bắt buộc `appointmentId`, không thuộc `CANCELLED`/`NO_SHOW`) | Khớp `api-contract.md#L241` | `CHUA_DUNG` |
| `GET /api/v1/patients/{id}` | `appointments-panel.tsx#L168`, `queue-api.ts#L121`, `medical-records-panel.tsx#L116`, `patient-lookup-drawer.tsx#L143` | Không gọi (lấy qua `/users/me`) | Patient chính mình; `STAFF`, `ADMIN`; `DOCTOR` bắt buộc `appointmentId` hợp lệ | **`appointments-panel.tsx#L167`** chọn `appointments.find(a => a.patientId === pid)` **không loại `CANCELLED`/`NO_SHOW`**, dễ gây `403` cho `DOCTOR` | `LECH` (ở FE `appointments-panel`) |
| `PATCH /api/v1/patients/{id}` | Không gọi | `profile_page.dart#L313` | `z.string().date()` cho `dateOfBirth` (`YYYY-MM-DD`) | **`[RISK-HYPOTHESIS]`**: nếu Postgres trả `dateOfBirth` dạng ISO timestamp, gửi lại không sửa ngày sẽ bị Zod `400` (chưa verify trên DB thật) | `RISK` |

### 4.3 Doctors, Specialties, Schedules & Slots

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|
| `GET /api/v1/specialties` | `doctor-api.ts`, `appointment-api.ts` | `doctor_directory_page.dart`, `doctor_repository.dart` | Mọi role; non-ADMIN luôn bị ép `isActive: true` | Khớp `api-contract.md` & `doctor-service/openapi.ts` | `OK` |
| `POST /api/v1/specialties`, `PATCH /api/v1/specialties/{id}` | `doctor-api.ts` (`ADMIN`) | Không gọi | Chỉ `ADMIN` (`name`, `description`, `isActive`) | Khớp contract & OpenAPI | `OK` |
| `GET /api/v1/doctors` | `doctor-api.ts`, `appointment-api.ts` | `doctor_directory_page.dart` | Mọi role; filter `page, limit, specialtyId, q, isActive` (non-ADMIN ép `true`) | Khớp contract & OpenAPI | `OK` |
| `POST /api/v1/doctors`, `PATCH /api/v1/doctors/{id}` | `doctor-api.ts` (`ADMIN`) | Không gọi | Chỉ `ADMIN`; tạo check `doctor-eligibility`; tắt active check `occupied` (`409`) | Khớp contract & OpenAPI | `OK` |
| `GET /api/v1/doctors/{id}` | `doctor-api.ts`, `queue-api.ts`, `patient-lookup-drawer.tsx` | `doctor_repository.dart`, `appointment_repository.dart` | Mọi role; non-ADMIN chỉ thấy bác sĩ `isActive` | Khớp contract & OpenAPI | `OK` |
| `GET/POST /api/v1/doctors/{id}/schedules` | `doctor-api.ts` (xem & tạo lịch) | `doctor_repository.dart` (chỉ `GET`) | `GET` mọi role; `POST` `DOCTOR` (mình), `STAFF`, `ADMIN` | Khớp contract & OpenAPI | `OK` |
| `PATCH /api/v1/schedules/{id}` | `doctor-api.ts` (sửa & bật/tắt `isActive`) | Không gọi | `DOCTOR` (của mình), `STAFF`, `ADMIN`; check trùng & `409` lịch tương lai | Khớp contract & OpenAPI | `OK` |
| `GET/POST /api/v1/doctors/{id}/time-offs`, `PATCH /.../time-offs/{timeOffId}` | `doctor-api.ts` (`timeOffs` chỉ tải trang 1 mặc định, không có nút chuyển trang trong `doctor-panel.tsx`) | Không gọi | `DOCTOR` (của mình), `STAFF`, `ADMIN`; `PATIENT` bị `403`; check `409` trùng lịch hẹn | Khớp contract & OpenAPI (Web thiếu phân trang time-offs nếu > 20 mục) | `OK` (`[INCOMPLETE-PARTIAL]` paging ở Web) |
| `GET /api/v1/doctors/{id}/available-slots?date=YYYY-MM-DD` | `doctor-api.ts`, `queue-api.ts` (reschedule) | `doctor_repository.dart`, `appointment_repository.dart` | Mọi role; trả mảng `[{startAt, endAt}]` (UTC) | Khớp contract & OpenAPI | `OK` |

### 4.4 Appointments

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|
| `GET /api/v1/appointments` | - `appointments-panel`: `from, to, status, page, limit=20`<br>- `queue-api`: `from, to, page, limit=100` (loop)<br>- `doctor-dashboard`, `staff-dashboard`: `page=1, limit=100` (không `from/to`)<br>- `medical-records-panel`: không gửi query (`page=1, limit=20`)<br>- `patient-lookup-drawer`: `patientId, limit=5, sort=desc` | `appointment_repository.dart`: `page, limit=100` (loop tất cả) hoặc `status, page, limit` | `listQuerySchema`: `page, limit, patientId, doctorId, status, from, to`; **KHÔNG hỗ trợ `q` và `sort`**; mặc định sort `scheduledStartAt` tăng dần | - Dashboard Web có nguy cơ sót lịch hôm nay khi vượt 100 lịch sử.<br>- `medical-records-panel` dễ sót ca `CHECKED_IN` khi vượt 20 lịch sử.<br>- `patient-lookup-drawer` gửi `sort=desc` bị BE bỏ qua -> trả 5 lịch cũ nhất nếu > 5 lịch! | `LECH` (tại các query FE) |
| `POST /api/v1/appointments` | Chưa có UI đặt lịch (`PatientSelector` chưa gắn vào trang) | `booking_confirmation_sheet.dart` + `Idempotency-Key` | `PATIENT`, `STAFF`, `ADMIN`; check slot + exclusion constraint DB + outbox | App `OK`; Web thiếu luồng đặt lịch cho `STAFF`/`ADMIN` | `OK` (App) / `CHUA_DUNG` (Web) |
| `GET /api/v1/appointments/{id}` | Định nghĩa ở `appointment-api.ts#L60`, chưa gọi trong panel | `appointment_repository.dart#L104` | Owner patient, assigned doctor, `STAFF`, `ADMIN` | Khớp contract & OpenAPI | `OK` |
| `PATCH /api/v1/appointments/{id}/reschedule` | `queue-api.ts` (`STAFF`, `ADMIN`) | `appointment_repository.dart` (`PATIENT`) | `PENDING`/`CONFIRMED`; slot mới ở tương lai; verify slot lại với Doctor Service | Khớp contract & OpenAPI | `OK` |
| `PATCH /api/v1/appointments/{id}/cancel` | `appointment-api.ts`, `queue-api.ts` | `appointment_repository.dart` | `PATIENT` (của mình), `STAFF`, `ADMIN` | Khớp contract & OpenAPI | `OK` |
| `PATCH /api/v1/appointments/{id}/confirm`, `/check-in`, `/no-show` | `appointment-api.ts`, `queue-api.ts` (`STAFF`, `ADMIN`) | Không gọi | Chỉ `STAFF`, `ADMIN`; `no-show` phát outbox bị worker bỏ qua & đánh dấu `SENT` | Khớp endpoint; cần chốt nghiệp vụ thông báo `NO_SHOW` | `OK` (lưu ý `NO_SHOW`) |
| **`PATCH /api/v1/appointments/{id}/complete`** | Không gọi | Không gọi | **`appointment-service/src/index.ts#L359-360` cố tình trả `409 MEDICAL_RECORD_REQUIRED`** | **`docs/api-contract.md#L285` vẫn ghi `DOCTOR` gọi endpoint này** (thực tế hoàn tất qua outbox từ Medical Record `FINAL`) | **`CONFLICT`** |

### 4.5 Medical Records

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|
| `GET /api/v1/medical-records` | `medical-records-panel.tsx#L164-166`: cố định `page=1, limit=20`, không UI chuyển trang | `records_page.dart#L43-46`: có phân trang `_page, limit=20` | `PATIENT` (chỉ thấy `FINAL` của mình), `DOCTOR` (ép `doctorId` của mình). **`STAFF`/`ADMIN` bị `403`** | - Thiếu validation UUID cho `patientId`/`doctorId`/`appointmentId` trên query.<br>- **`api-contract.md#L204`** nói ADMIN xem theo quyền kiểm toán nhưng `#L334` & code đều cấm `ADMIN`.<br>- `medical-records-panel.tsx` chưa nối phân trang. | `LECH` / `[INCOMPLETE-PARTIAL]` |
| `POST /api/v1/medical-records` | `medical-records-panel.tsx` (`DOCTOR`) | Không gọi | Chỉ `DOCTOR` được phân công; appointment phải `CHECKED_IN` hoặc `COMPLETED`; nếu `FINAL` sẽ ghi outbox callback hoàn tất lịch | UI báo *"Ca khám đã hoàn thành"* ngay khi `201/200` dù callback còn nằm ở outbox (poll 5000ms + retry). | `OK` (lệch trạng thái UI lạc quan) |
| `GET /api/v1/medical-records/{id}` | Không gọi | Không gọi | `PATIENT` (chỉ `FINAL` của mình), `DOCTOR` (của mình); **thiếu check UUID `:id`** trước DB dễ thành `503` | Có trong OpenAPI; FE chưa dùng | `CHUA_DUNG` / `LECH` (UUID validation) |
| `PATCH /api/v1/medical-records/{id}` | `medical-records-panel.tsx` (`DOCTOR`) | Không gọi | Chỉ `DOCTOR` sở hữu; chặn `FINAL -> DRAFT` (`409 MEDICAL_RECORD_FINAL`); **thiếu check UUID `:id`** | Khớp nghiệp vụ chính | `OK` / `LECH` (UUID validation) |

### 4.6 Notifications

| Endpoint | Next.js (`b1d3113`) | Flutter (`b1d3113`) | Backend (`dad4f96`) | OpenAPI (`dad4f96`) & Contract | Trạng thái |
|---|---|---|---|---|---|
| `GET /api/v1/notifications` | `notifications-panel.tsx` (có `page, limit=15, status`, nút phân trang) + `notification-context.tsx` (`status=UNREAD, limit=1`) | `notifications_page.dart#L46-48`: **cố định `page: 1, limit: 20`**, không load trang tiếp | Mọi role đã đăng nhập; trả `{items, page, limit, total}`; filter `status` | Mobile thiếu phân trang; Web & BE khớp | `OK` (Web) / `[INCOMPLETE-PARTIAL]` (Mobile) |
| `GET /api/v1/notifications/{id}` | Không gọi | Không gọi | Người nhận sở hữu; **thiếu check UUID `:id`** (`notification-service/src/index.ts#L117`) | Có trong OpenAPI; trả `503` nếu ID sai định dạng UUID | `CHUA_DUNG` / `LECH` (UUID validation) |
| `PATCH /api/v1/notifications/{id}/read` | `notifications-panel.tsx` (từng item + "Đọc tất cả" lặp trên **trang hiện tại**) | `notifications_page.dart` (từng item + "Đọc tất cả" lặp trên **20 mục đầu**) | Người nhận sở hữu; **thiếu check UUID `:id`** (`#L124`) | Chưa có API `read-all` hàng loạt; Mobile dễ bỏ sót từ mục 21 trở đi | `OK` (single) / `[INCOMPLETE-PARTIAL]` (bulk read) |
| `POST /api/v1/notifications` | Không gọi | Không gọi | Public trả `403 ACCESS_DENIED` (chỉ nhận event qua `/internal/v1/notifications`) | Đã khớp giữa code, OpenAPI và `api-contract.md` | `OK` |

---

## 5. Những Điểm Đã Hoàn Thiện Và Khớp Nhau Tốt

1. **Tách biệt ranh giới sở hữu dữ liệu & Gateway (`b1d3113` & `dad4f96`):**
   - Gateway chỉ định tuyến theo prefix, không kết nối PostgreSQL, ghi đè `X-User-Id`/`X-Role`, loại bỏ header giả mạo (`x-user-id`, `x-role`, `x-supabase-auth-user-id`, `x-internal-token`), bổ sung CORS/rate limit/request-id và RAM identity cache kèm invalidation khi logout (`dad4f96`).
   - 5 service giữ schema riêng (`user_service`, `doctor_service`, `appointment_service`, `medical_record_service`, `notification_service`), giao tiếp liên-service qua `/internal/v1/*` với token riêng biệt theo cặp caller-callee tối thiểu 32 byte.
2. **Bảo đảm tính toàn vẹn đặt lịch & chống trùng sự kiện (`dad4f96`):**
   - `Appointment Service` sử dụng PostgreSQL exclusion constraint (không trùng khung giờ active cùng bác sĩ), `Idempotency-Key` chống nhấn đúp khi mạng lag (được nối chuẩn từ `BookingConfirmationSheet` của Flutter), kiểm tra chéo với `Doctor Service` trước khi tạo/đổi lịch và khi thay đổi `schedule`/`time-off`.
   - `Appointment Service` và `Medical Record Service` đều dùng transactional outbox; `Notification Service` deduplicate theo `eventId`, đối chiếu `reminder-context` để không tạo nhắc lịch ma hoặc gửi thông báo lỗi thời.
3. **Chuẩn hóa OpenAPI, Logging và Kiểm thử hợp đồng (`dad4f96`):**
   - Trên nhánh `dad4f96`, cả API Gateway và **cả 5 domain service (bao gồm `services/user-service/src/openapi.ts` mới bổ sung)** đều đã có OpenAPI spec, phục vụ `/openapi.json`, `/docs` và `/api-docs`, đi kèm `@clinic/openapi-contract-tests` (18/18 tests tĩnh pass) và `@clinic/request-logging` + [`docs/logging-contract.md`](logging-contract.md).
4. **Cải thiện chất lượng UX & An toàn dữ liệu lâm sàng phía Web/App (`b1d3113`):**
   - `AppointmentsPanel` đã có lọc ngày UTC+7 (`from`/`to`), lọc trạng thái, chuyển trang (`totalCount > 20`) và `ConfirmModal` cho `confirm`/`check-in`.
   - `QueueBoard` + `queue-api.ts` lấy toàn bộ các trang trong ngày chọn (`limit=100` lặp page), chủ động loại `CANCELLED`/`NO_SHOW` khỏi lượt tra cứu bệnh nhân của `DOCTOR` (`#L119`), tích hợp `PatientLookupDrawer`.
   - `MedicalRecordsPanel` khóa trang ở role `DOCTOR`, yêu cầu `ConfirmModal` trước khi chốt `FINAL`, giữ nguyên dữ liệu form khi lỗi và chỉ chuyển `readonly` sau khi server xác nhận thành công.
   - `NotificationsPanel` (Web) có lọc trạng thái, phân trang đầy đủ và đồng bộ badge chưa đọc.

---

## 6. Những Điểm Chưa Hoàn Thiện (`[INCOMPLETE-PARTIAL]`)

1. **Thiếu phân trang ở 3 màn hình dữ liệu tăng trưởng liên tục (`b1d3113`):**
   - **Trang Hồ sơ bệnh án Web (`medical-records-panel.tsx#L140,164-166`):** (i) Danh sách bệnh án cố định `page: 1, limit: 20` và không có điều khiển chuyển trang; (ii) Danh sách lịch hẹn dùng để chọn ca khám gọi `GET /api/v1/appointments` không truyền query gì nên bị kẹt 20 bản ghi đầu tiên rồi lọc `CHECKED_IN` ở client. *(Lưu ý: `AppointmentsPanel` đã có phân trang, không gộp vào lỗi này).*
   - **Trang Thông báo Mobile (`notifications_page.dart#L48`):** Cố định `page: 1, limit: 20`, không có load-more/phân trang, dẫn tới nút `"Đọc tất cả"` chỉ xử lý tối đa 20 thông báo đầu tiên (bằng vòng lặp gọi từng request `PATCH .../read`).
   - **Danh sách Time-Off Web (`doctor-panel.tsx#L212` & `doctor-api.ts#L20`):** Gọi mặc định trang 1 (`20` mục) mà không hiển thị phân trang nếu bác sĩ có nhiều ngày nghỉ.
2. **Thành phần UI đã có hoặc hứa hẹn nhưng chưa nối luồng hoàn chỉnh (`b1d3113`):**
   - **Web `PatientSelector` (`patient-selector.tsx`):** Đã code xong tìm bệnh nhân nhưng chưa được gắn vào trang `/appointments` hay luồng đặt lịch cho `STAFF`/`ADMIN`.
   - **Web `ProfileForm` (`profile-form.tsx#L502-602`):** Tab `Bảo mật` ("Đổi mật khẩu (Sắp ra mắt)") và tab `Thông báo` (4 switch cấu hình) đang `disabled`.
   - **Flutter `ReminderBanner` (`reminder_banner.dart#L24`):** Hiển thị *"Nhắc lịch tự động: 24h và 1h trước giờ hẹn qua push notification"*, nhưng thực tế mới có in-app notification + reminder poll trong DB, chưa tích hợp push (FCM/APNs).
   - **Flutter `SsoButtons` (`sso_buttons.dart#L38-58`):** Hiển thị Google / Apple SSO nhưng bấm vào chỉ bật SnackBar thông báo sắp kết nối.
   - **Flutter `InsuranceCard` (`insurance_card.dart#L27`):** Gán cứng `expiryDate = '31/12/2027'` thay vì lấy từ API (trường này chưa tồn tại trong `PatientProfile`).
   - **Flutter `WelcomePage` & Shared Booking Widgets:** `WelcomePage` và `FeaturePlaceholder` không được gắn trong điều hướng chính (`patient_app.dart`); `HorizontalDateStrip`/`SlotGridSelector` dùng cấu trúc inject tùy chọn trong `DoctorBookingWidgets`.
3. **Độ sâu OpenAPI & Migration trên Backend (`dad4f96`):**
   - `services/user-service/src/openapi.ts` (`dad4f96`) đã giải quyết việc thiếu spec nhưng phần lớn response `200`/`201` vẫn dùng schema generic `SuccessEnvelope` (`data: {}`), chưa mô tả cấu trúc trường chi tiết của `UserProfile`, `PatientProfile`, `AuthSession` để sinh type/SDK tự động cho FE.
   - `user-service` chưa có script `migrate.ts` trong `services/user-service/package.json` như 4 service còn lại (`doctor`, `appointment`, `medical-record`, `notification`). Đây là chênh lệch về automation; cần xác nhận schema User Service có quy trình migration có version, lệnh tái lập và upgrade path được tài liệu hóa trước khi kết luận migration bị thiếu hoàn toàn.
   - Toàn bộ tích hợp **End-to-End có PostgreSQL + Supabase Auth thật** chưa được chứng minh bằng log pass; file mô tả công việc `docs/archive/m3-2026-11-15/team-task-assignment-m3.md` cũng cần rà lại với thực tế nhánh `b1d3113` / `dad4f96`.
4. **Ma trận endpoint chưa phải đối chiếu contract ở cấp field:** Ma trận ghi route, quyền và một số query quan trọng, nhưng chưa lập bảng đầy đủ cho từng operation về request/response field, nullability, enum, pagination envelope, status code và error code. OpenAPI User Service hiện còn `SuccessEnvelope` tổng quát nên không thể coi cột `OK` là đã xác nhận tương thích kiểu dữ liệu ở mọi field. Đây là khoảng trống tài liệu/contract, không phải bằng chứng rằng tất cả endpoint đang lỗi.

---

## 7. Lỗi, Xung Đột Hợp Đồng Và Rủi Ro Cần Kiểm Chứng

### 7.1 `[TEST-FAILURE]` Test hoặc quality gate thất bại

| Mã | Vị trí | Mô tả chi tiết & ảnh hưởng |
|---|---|---|
| **TEST-01** | `dad4f96`: `gateway/api-gateway/test/hardening.test.ts:392` | `npm run test` trên nhánh backend `dad4f96` **exit 1** do test mong đợi log định dạng JSON (`JSON.parse(log).path`), trong khi Gateway đã chuyển sang plain-text log (`[api-gateway] GET ...`) theo `@clinic/request-logging`. Cần cập nhật assertion của test theo `docs/logging-contract.md`. Đây là lỗi test/quality gate; kết quả này tự nó không chứng minh request runtime bị lỗi. |

### 7.2 `[BUG-CONFIRMED]` Lỗi hành vi sản phẩm hoặc sai sót logic trong source

| Mã | Vị trí | Mô tả chi tiết & ảnh hưởng |
|---|---|---|
| **BUG-02** | `b1d3113`: `doctor-dashboard.tsx#L56-58`, `staff-dashboard.tsx#L63-65` | Cả hai dashboard gọi `GET /api/v1/appointments?page=1&limit=100` **không kèm `from`/`to`** (mặc dù backend lọc/sắp theo `scheduledStartAt` tăng dần từ quá khứ). Khi tổng số lịch hẹn vượt `100`, các lịch khám hôm nay nằm ở trang sau sẽ bị cắt mất, làm sai số liệu và hàng đợi trên Dashboard. Ngoài ra dashboard không tra cứu tên bệnh nhân nên hiển thị fallback `"Bệnh nhân #XXXX"`. |
| **BUG-03** | `b1d3113`: `medical-records-panel.tsx#L140-148` | Gọi `GET /api/v1/appointments` không filter (`page=1, limit=20` mặc định) rồi mới `filter(a => a.status === "CHECKED_IN")` ở client. Khi bác sĩ có hơn 20 lịch sử cũ (`COMPLETED`/`CANCELLED`), ca `CHECKED_IN` hôm nay sẽ biến mất khỏi dropdown tạo bệnh án. |
| **BUG-04** | `b1d3113`: `appointments-panel.tsx#L167` | Khi lấy tên bệnh nhân cho bảng, FE dùng `items.find((a) => a.patientId === pid)` lấy `appointmentId` đầu tiên bất kể trạng thái. Nếu bác sĩ (`DOCTOR`) có một lịch `CANCELLED` hoặc `NO_SHOW` của bệnh nhân đó đứng trước, `User Service` sẽ từ chối với `403 PATIENT_SCOPE_DENIED` (khác với `queue-api.ts#L119` đã lọc bỏ `CANCELLED`/`NO_SHOW`). |
| **BUG-05** | `b1d3113`: `doctor-dashboard.tsx#L34`, `staff-dashboard.tsx#L40`, `admin-dashboard.tsx#L27-29`, `health.ts#L21-22` | Lưu cache ở biến **module-level** (`let cachedDoctorAppointments`, `cachedStaffAppointments`, `cachedAdminHealth`, `cachedAdminUserSummary`, `cachedSystemHealth`) không gắn với `userId`/`role`. Nếu người dùng đăng xuất rồi đăng nhập tài khoản khác trong cùng phiên SPA không reload trang, UI có thể nháy hiển thị dữ liệu của tài khoản cũ trước khi fetch xong (nguy cơ lộ thông tin lịch khám bác sĩ này cho bác sĩ khác hoặc lỗi ngữ cảnh). |
| **BUG-06** | `dad4f96`: `medical-record-service/src/index.ts#L142-153,181,195` & `notification-service/src/index.ts#L117,124` | Một số handler nhận `:id` từ path hoặc `patientId`/`doctorId`/`appointmentId` từ query chưa `safeParse` bằng `z.string().uuid()` trước khi đưa xuống PostgreSQL. Nếu truyền chuỗi không phải UUID, lỗi Postgres (`22P02`) rơi vào generic error handler và trả nhầm **`503 SERVICE_UNAVAILABLE`** thay vì `400 VALIDATION_ERROR`. |

### 7.3 `[HARDENING-GAP]` Hardening cho HTTP nội bộ

| Mã | Vị trí | Mô tả chi tiết & ảnh hưởng |
|---|---|---|
| **HARDEN-01** | `dad4f96`: `medical-record-service/src/index.ts#L98-103` | `internalGet` (`#L68`) và callback `appointment.complete` (`#L111`) đặt `redirect: "error"`, nhưng request gửi event `medical-record.created/updated` tới `notificationUrl` chưa đặt tùy chọn này. Đây là thiếu hardening, không phải lỗi tương thích FE–BE; đánh giá và xử lý theo chính sách redirect cho URL nội bộ. |

### 7.4 `[CONFLICT-CONTRACT]` Xung đột giữa Frontend, Backend & `docs/api-contract.md`

| Mã | Xung đột | Chi tiết đối chiếu |
|---|---|---|
| **CONF-01** | **Luồng hoàn tất lịch hẹn** | `docs/api-contract.md#L285` ghi `PATCH /api/v1/appointments/{id}/complete` do `DOCTOR` gọi để chuyển `CHECKED_IN -> COMPLETED`. Thực tế `appointment-service` (`#L359-360`) từ chối `409 MEDICAL_RECORD_REQUIRED`, còn hoàn tất chạy bất đồng bộ qua `POST/PATCH /api/v1/medical-records` (`status: "FINAL"`) -> outbox (`poll 5000ms` ở `medical-record-service#L227`) -> `/internal/v1/appointments/{id}/complete-from-record`. |
| **CONF-02** | **Thông báo lạc quan ở UI trước xử lý bất đồng bộ** | Sau khi lưu bệnh án `FINAL`, `medical-records-panel.tsx#L405` khẳng định ngay `"Ca khám đã hoàn thành"`, trong khi outbox của `Medical Record Service` poll theo chu kỳ **5.000 ms** (`#L227`). Khi hệ thống khỏe mạnh, chuyển trạng thái `COMPLETED` thường hoàn tất trong ~1 chu kỳ poll (~5 giây); nhưng khi Appointment/Doctor Service bận hoặc timeout phải retry, lịch hẹn vẫn ở `CHECKED_IN` lâu hơn mà UI không phản ánh trạng thái chờ đồng bộ. |
| **CONF-03** | **Quyền `ADMIN` đọc hồ sơ bệnh án trong Contract** | Bảng tổng hợp `docs/api-contract.md#L204` ghi `ADMIN` được đọc hồ sơ *"Theo quyền kiểm toán được cấp"*, nhưng bảng API `#L334, #L336` và code `medical-record-service#L139,180` đều chặn `ADMIN` (`403 ACCESS_DENIED`). Theo nguyên tắc hạn chế quyền mặc định của dự án, cần sửa contract cho đồng nhất và rõ ràng nếu chưa có cơ chế audit grant. |
| **CONF-04** | **`sort=desc` ở Patient Lookup Drawer** | `patient-lookup-drawer.tsx#L148` gọi `GET /api/v1/appointments?patientId=...&limit=5&sort=desc` với kỳ vọng lấy 5 lịch gần nhất, nhưng `appointment-service` `listQuerySchema` (`#L35-41`) không có tham số `sort` và mặc định sort tăng dần (`scheduledStartAt ASC` theo `api-contract.md#L120`). Khi bệnh nhân có > 5 lịch, drawer nhận 5 lịch **cũ nhất** rồi mới đảo ngược trên client. |
| **CONF-05** | **Tìm kiếm theo từ khóa trong `AppointmentsPanel`** | `appointment-filter-bar.tsx#L80` phải chú thích `(trong trang hiện tại)` vì `GET /api/v1/appointments` hiện chưa có query `q` (search phía server không thể khớp tên bệnh nhân nếu `Appointment Service` không lưu tên và không tích hợp lookup/denormalization). |
| **CONF-06** | **OpenAPI Discoverability tại Gateway vs quy tắc Service Ownership** | Gateway chỉ expose OpenAPI cho `/health` và `/api/v1/system/health` (`gateway/api-gateway/src/openapi.ts`), còn tài liệu nghiệp vụ nằm riêng ở `/docs/` và `/api-docs/` của từng service. Đây **không phải lỗi kiến trúc** (đúng rule mỗi service tự sở hữu OpenAPI), nhưng là điểm nghẽn DX cho FE khi phát triển tách rời. |

### 7.5 `[RISK-HYPOTHESIS]` Rủi ro suy luận từ code (CHƯA xác minh trên DB/Runtime thật)

1. **`dateOfBirth` (`DATE`) khi cập nhật hồ sơ bệnh nhân từ Flutter:**
   - **Cơ sở nghi ngờ:** Bảng `user_service.patient_profiles` định nghĩa `date_of_birth DATE`; `user-service` chọn trực tiếp cột này trong `findPatientById`/`findPatientByUserId` (`services/user-service/src/repository.ts#L248-270`). `updatePatientSchema` kiểm tra `dateOfBirth: z.string().date()` (chỉ nhận `YYYY-MM-DD`), trong khi `profile_page.dart#L71,315-318` đọc `patient['dateOfBirth']?.toString()` và gửi lại nguyên chuỗi đó khi người dùng bấm lưu. Nếu driver `node-pg` trên PostgreSQL thật trả về `Date` serializes thành `"YYYY-MM-DDT00:00:00.000Z"`, request `PATCH /api/v1/patients/{id}` sẽ gặp `400 VALIDATION_ERROR` khi user sửa trường khác mà không sửa ô ngày sinh.
   - **Lý do chưa kết luận `[BUG-CONFIRMED]`:** Test tích hợp PostgreSQL thật của `user-service`/toàn hệ thống chưa chạy thông suốt trong môi trường hiện tại; đây vẫn là giả thuyết cần ưu tiên viết test verify với Postgres thật.
2. **Hành vi `NO_SHOW` trong Appointment Outbox (`outbox-worker.ts#L7-8,23-24,39`):**
   - **Cơ chế chính xác trong code:** Danh sách `deliverable` chỉ gồm `appointment.created`, `appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled`, `appointment.checked_in`. Khi gặp `appointment.no_show`, hàm `dispatch()` thoát sớm (`return;`) và `dispatchBatch()` vẫn gọi `markOutboxSent(event.id, event.claimToken)`. Tức là event bị **bỏ qua không gửi thông báo và được đánh dấu `SENT` luôn** (chứ không bị giữ/kẹt lại trong outbox).
   - **Đánh giá:** Nếu nghiệp vụ **yêu cầu gửi thông báo cho bệnh nhân khi bị đánh dấu `NO_SHOW`** thì đây là mất thông báo thật sự; nếu nghiệp vụ chủ đích không gửi thông báo `NO_SHOW` thì chỉ cần ghi rõ vào contract để FE không kỳ vọng.

---

## 8. Phân Tích Quyết Định Nghiệp Vụ & Backlog Ngoài Phạm Vi

### 8.1 `[DECISION-REQUIRED]` Các quyết định cần chốt trước khi sửa `docs/api-contract.md`

1. **Chuẩn hóa cơ chế hoàn tất lịch hẹn (CONF-01 / CONF-02):**
   - Chốt chính thức bỏ endpoint public `PATCH /api/v1/appointments/{id}/complete` khỏi `docs/api-contract.md` (hoặc giữ ở OpenAPI với chú thích trả `409 MEDICAL_RECORD_REQUIRED`), chính thức hóa luồng hoàn tất qua bệnh án `FINAL` + outbox callback.
   - Chốt thông điệp và UX chờ đồng bộ phía Web (ví dụ: hiển thị trạng thái *"Đã chốt bệnh án, đang đồng bộ hoàn tất lịch hẹn"* và cơ chế polling/refresh nhẹ thay vì khẳng định ngay ca khám đã `COMPLETED`).
2. **Chính sách đọc bệnh án của `ADMIN` và đọc chéo giữa các `DOCTOR`:**
   - **Quyền `ADMIN`:** Xóa mâu thuẫn giữa bảng tổng hợp (`api-contract.md#L204`) và bảng endpoint (`#L334`) — mặc định cấm `ADMIN` xem nội dung lâm sàng cho đến khi có thiết kế audit grant rõ ràng.
   - **Quyền bác sĩ đọc lịch sử bệnh án của bác sĩ khác:** Hiện `Medical Record Service` chặn bác sĩ A đọc hồ sơ do bác sĩ B tạo (`doctorId` bị ép theo bác sĩ đang đăng nhập). Đây là lựa chọn bảo vệ dữ liệu nhạy cảm, không phải bug. Team cần chốt nghiệp vụ: bác sĩ đang có lịch hẹn hợp lệ (`CONFIRMED`/`CHECKED_IN`/`COMPLETED`) với bệnh nhân X có được xem tiền sử/bệnh án `FINAL` cũ của bệnh nhân X do bác sĩ khác khám hay không, kèm điều kiện audit log nếu mở.
3. **Thông báo cho trạng thái `NO_SHOW`:**
   - Chốt rõ bệnh nhân có nhận thông báo (và có được giải thích lý do) khi `STAFF`/`ADMIN` đánh dấu `NO_SHOW` hay giữ cơ chế bỏ qua & đánh dấu `SENT` hiện tại.
4. **Truy vấn Dashboard, Medical Record picker và Patient History (`sort`/`from`/`to`):**
   - Có bổ sung `sort` (ví dụ `sort=start_asc|start_desc`) vào `GET /api/v1/appointments` để phục vụ `patient-lookup-drawer.tsx` và lịch sử khám bệnh nhân hay không?
   - Chốt chuẩn bắt buộc truyền `from`/`to` UTC+7 cho Dashboard và truyền `status=CHECKED_IN` + `from`/`to` + phân trang cho `MedicalRecordsPanel`.
5. **Quy ước đồng bộ danh mục OpenAPI tổng hợp (tăng DX tách rời FE–BE):**
   - Giữ quy tắc mỗi service tự quản lý OpenAPI (`docs/api-contract.md` + `openapi-contract-tests`), đồng thời cân nhắc bổ sung script gộp static docs phục vụ đọc nhanh (hoặc cổng link 6 Swagger UI) mà không làm Gateway vi phạm ranh giới sở hữu API.

### 8.2 `[BACKLOG-SCOPE]` Đề xuất sản phẩm / ngoài phạm vi cam kết M2–M3 hiện tại

Các hạng mục dưới đây **không nên coi là lỗi tương thích** ở snapshot hiện tại (trừ các phần UI đã hứa lộ ra ngoài ở mục 6.2 cần ẩn/sửa copy cho trung thực):

1. **Đặt lịch tại quầy (Walk-in / Lễ tân tạo lịch trên Web):** Gắn `PatientSelector` vào trang `/appointments` cho `STAFF`/`ADMIN` dùng `POST /api/v1/appointments` + `Idempotency-Key` + `available-slots`.
2. **Đánh dấu đã đọc tất cả (`PATCH /api/v1/notifications/read-all`) & endpoint đếm nhanh (`unread-count`):** Hiện Web/App phải lặp `PATCH /notifications/{id}/read` trên trang đang tải; endpoint bulk giúp giảm N+1 request và sửa triệt để giới hạn trang ở Mobile.
3. **Push notification (FCM/APNs) thực thụ:** Khi triển khai thật ngoài in-app notification để khớp nội dung `ReminderBanner`.
4. **Tài khoản & hồ sơ mở rộng:** Đổi mật khẩu qua Supabase Auth, SSO Google/Apple, ngày hết hạn BHYT trên `PatientProfile`, tùy chỉnh cài đặt thông báo từng người dùng.
5. **Tiện ích bổ sung:** Check-in bằng mã QR, xuất PDF hồ sơ/đơn thuốc, `DELETE /api/v1/doctors/{doctorId}/time-offs/{timeOffId}` (nếu cần xóa hẳn thay vì `PATCH`), API summary riêng cho Dashboard nếu số lượng ca trong ngày lớn, và thao tác `POST /api/v1/users` tạo nhân sự nội bộ cho `ADMIN`.

---

## 9. Ưu Tiên, Hành Động Và Tiêu Chí Hoàn Tất

Các mức ưu tiên dưới đây xếp theo rủi ro dữ liệu và khả năng chặn nghiệm thu. Đây là kế hoạch kỹ thuật, chưa phải phân công thành viên.

### P0 — Độ đúng dữ liệu và kiểm soát truy cập

1. **Sửa truy vấn danh sách:** dashboard giới hạn theo khoảng ngày; MedicalRecordsPanel truy vấn đúng lịch `CHECKED_IN` và hỗ trợ phân trang; Patient Lookup lấy đúng lịch mới nhất (sort server hoặc lấy đủ trang rồi sắp xếp); appointments-panel chọn appointment còn hợp lệ để xác minh patient-scope.
   - **Hoàn tất khi:** dữ liệu vượt 20/100 mục vẫn hiển thị đủ dữ liệu thuộc khoảng lọc; test với nhiều lịch cũ và lịch hôm nay xác nhận không bỏ sót; bác sĩ không nhận `403` chỉ vì lịch đã hủy đứng trước.
2. **Cô lập cache FE theo danh tính:** xóa hoặc đổi cache khi logout hay khi `userId`/role thay đổi.
   - **Hoàn tất khi:** chuyển tài khoản trong cùng SPA không render dữ liệu của tài khoản trước, kể cả khi request mới đang tải.

### P1 — Chốt hợp đồng và chứng minh tích hợp

1. **Sửa TEST-01 và hardening redirect:** cập nhật assertion Gateway theo logging contract; bổ sung `redirect: "error"` cho request Notification trong Medical Record Service nếu policy yêu cầu chặn redirect.
   - **Hoàn tất khi:** Gateway test pass trên snapshot tích hợp; có test xác nhận request notification không follow redirect nếu bật policy.
2. **Chốt quyết định nghiệp vụ** ở mục 8.1 về hoàn tất ca, quyền đọc bệnh án, `NO_SHOW`, sort/filter và cách tìm tài liệu OpenAPI; cập nhật contract/OpenAPI cùng hành vi triển khai.
   - **Hoàn tất khi:** cùng một route/role/state transition không còn mô tả trái nhau; quyết định chưa triển khai được ghi rõ là ngoài phạm vi.
3. **Hoàn thiện schema và validation:** mô tả request/response/error chi tiết trong OpenAPI; validate UUID ở boundary và trả `400` chuẩn cho ID sai định dạng.
   - **Hoàn tất khi:** contract test kiểm tra schema và lỗi chính; response domain quan trọng không còn dùng schema chung `data: {}`; kiểu FE khớp response thực tế.
4. **Chạy kiểm chứng DB/runtime thật:** chạy các integration test PostgreSQL, live OpenAPI, xác thực qua Gateway và luồng `FINAL -> COMPLETED`/notification xuyên service.
   - **Hoàn tất khi:** test không còn bị skip do thiếu môi trường; lưu lệnh, commit, kết quả và log; xác nhận hoặc bác bỏ giả thuyết `dateOfBirth`.

### P2 — Hoàn thiện UX và backlog đã thống nhất

Triển khai các mục `[INCOMPLETE-PARTIAL]`/`[BACKLOG-SCOPE]` đã được duyệt phạm vi: phân trang time-off và notification Mobile, sửa copy SSO/push/BHYT, booking tại quầy, QR, PDF, read-all/unread-count. Không coi backlog là blocker contract trước khi có quyết định sản phẩm.

**Điều kiện nghiệm thu tổng thể:** FE và BE được kiểm tra trên cùng baseline contract đã ghi SHA; lint/build/test liên quan pass; không còn vấn đề P0; các luồng cần DB thật đã chạy thành công; báo cáo được cập nhật SHA và bằng chứng sau tích hợp.
