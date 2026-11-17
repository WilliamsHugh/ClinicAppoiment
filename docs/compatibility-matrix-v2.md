# Compatibility Matrix v1 → v2 (API Contract v2)

**Ngày lập:** 15/11/2026  
**Tác giả:** TV1 / Member 1 (Task M2-INTEGRATION-004)  
**Nguồn chuẩn:** `docs/api-contract-v2.md` tại commit FE `b1d3113bd595be6a46071ec20f3d086e369a8e5e` & Backend snapshot `dad4f96aa8d2524c6ce31bee12e6421a5ba44946`.  
**Quy ước phiên bản:** Toàn bộ route v2 tiếp tục dùng HTTP prefix `/api/v1` và `/internal/v1`. Số hiệu `v2` đại diện cho phiên bản thiết kế hợp đồng, không tự đổi URL thành `/api/v2`.

---

## 1. Public API Operations Matrix

| Operation | Method | Path | Owner | Status | Roles | Breaking Fields | Blocker |
|---|---|---|---|---|---|---|---|
| Health Check | GET | `/health` | Gateway (TV1) | CÓ | Public | Không | Không |
| System Health | GET | `/api/v1/system/health` | Gateway (TV1) | CÓ | ADMIN | Không | Không |
| Register Patient | POST | `/api/v1/auth/register` | User Service (TV2) | CÓ | Public | Response bổ sung session v2 | Không |
| User Login | POST | `/api/v1/auth/login` | User Service (TV2) | THAY_ĐỔI | Public | `data.session` bắt buộc; STAFF/ADMIN trả `PENDING_MFA` thay vì cấp quyền ngay | MFA TOTP Enrollment & Challenge |
| Token Refresh | POST | `/api/v1/auth/refresh` | User Service (TV2) | THAY_ĐỔI | Public / Bearer | `data.session` bắt buộc; giữ nguyên hạn tuyệt đối/trạng thái khóa, không gia hạn idle | Session persistence |
| User Logout | POST | `/api/v1/auth/logout` | User Service (TV2) | THAY_ĐỔI | Authenticated | Mặc định scope `current` (thay vì global); `scope=all` cần chỉ định rõ | User Service session revocation & Gateway cache invalidation |
| Get Current User (legacy) | GET | `/api/v1/auth/me` | User Service (TV2) | CÓ | Authenticated | Không (khuyến nghị chuyển sang `/users/me`) | Không |
| Get Current Session | GET | `/api/v1/auth/session` | User Service (TV2) | MỚI | All (kể cả PENDING_MFA, LOCKED) | Endpoint mới; trả metadata hạn & trạng thái | Session schema & state machine |
| Report Activity | POST | `/api/v1/auth/session/activity` | User Service (TV2) | MỚI | ACTIVE | Endpoint mới; chỉ nhận foreground activity | Session persistence |
| List User Sessions | GET | `/api/v1/auth/sessions` | User Service (TV2) | MỚI | All (chủ tài khoản) | Endpoint mới; trả danh sách phiên của mình | Session persistence |
| Revoke Specific Session | DELETE | `/api/v1/auth/sessions/{sessionId}` | User Service (TV2) | MỚI | All (chủ tài khoản) | Endpoint mới; thu hồi phiên theo ID | Session persistence & Invalidation |
| Enroll TOTP MFA | POST | `/api/v1/auth/mfa/totp/enroll` | User Service (TV2) | MỚI | DOCTOR, STAFF, ADMIN (kể cả PENDING_MFA) | Endpoint mới; trả QR và secret trong luồng enroll | Supabase TOTP enrollment integration |
| List MFA Factors | GET | `/api/v1/auth/mfa/factors` | User Service (TV2) | MỚI | DOCTOR, STAFF, ADMIN (kể cả PENDING_MFA, LOCKED) | Endpoint mới; không lộ secret | Factor persistence |
| Create MFA Challenge | POST | `/api/v1/auth/mfa/challenges` | User Service (TV2) | MỚI | DOCTOR, STAFF, ADMIN | Endpoint mới; purpose-bound & context-bound | Challenge policy (TTL, rate limit) |
| Verify MFA Challenge | POST | `/api/v1/auth/mfa/verify` | User Service (TV2) | MỚI | DOCTOR, STAFF, ADMIN | Endpoint mới; mã 6 số giữ số 0 đầu, trả proof hoặc update state | Purpose verification & proof generation |
| Request Password Reset | POST | `/api/v1/auth/password/forgot` | User Service (TV2) | MỚI | Public | Endpoint mới; trả accepted 200 chống enum email | Rate limit & email allowlist decision |
| Exchange Recovery Token | POST | `/api/v1/auth/password/recovery/exchange` | User Service (TV2) | MỚI | Public | Endpoint mới; tokenHash -> recoveryContextId | Recovery context TTL decision |
| Reset Password | POST | `/api/v1/auth/password/reset` | User Service (TV2) | MỚI | Public (với recoveryContextId) | Endpoint mới; một lần dùng, vô hiệu phiên cũ | Password strength decision |
| Change Password | POST | `/api/v1/auth/password/change` | User Service (TV2) | MỚI | ACTIVE | Endpoint mới; step-up verification khi cần | None |
| Get User Profile (Me) | GET | `/api/v1/users/me` | User Service (TV2) | CÓ | Authenticated | Không | Không |
| Update User Profile (Me) | PATCH | `/api/v1/users/me` | User Service (TV2) | CÓ | Authenticated | Chỉ cho phép `fullName`, `phone`; không nhận role/status/email | Không |
| List Users | GET | `/api/v1/users` | User Service (TV2) | CÓ | ADMIN | Không | Không |
| Get User By ID | GET | `/api/v1/users/{userId}` | User Service (TV2) | CÓ | ADMIN | UUID không hợp lệ trả 400 (thay vì 500) | Không |
| Update User Status | PATCH | `/api/v1/users/{userId}/status` | User Service (TV2) | THAY_ĐỔI | ADMIN | Bắt buộc `verificationProofId` (MFA); invalidation session/cache | User MFA proof & Invalidation signal |
| Update User Role | PATCH | `/api/v1/users/{userId}/role` | User Service (TV2) | THAY_ĐỔI | ADMIN | Bắt buộc `verificationProofId` (MFA); thu hồi quyền/cache cũ | User MFA proof & Invalidation signal |
| List Patients | GET | `/api/v1/patients` | User Service (TV2) | THAY_ĐỔI | STAFF, ADMIN; DOCTOR (theo ca) | DOCTOR phải có `appointmentId` và `X-Clinical-Grant`; không query tự do | TV4 Clinical Grant verification |
| Get Patient By ID | GET | `/api/v1/patients/{patientId}` | User Service (TV2) | THAY_ĐỔI | PATIENT (self), STAFF, ADMIN; DOCTOR (theo ca) | DOCTOR phải có `appointmentId` và `X-Clinical-Grant` | TV4 Clinical Grant verification |
| Update Patient Profile | PATCH | `/api/v1/patients/{patientId}` | User Service (TV2) | CÓ | PATIENT (self), ADMIN | Giới hạn field profile cho phép; không mass-assign | Không |
| List Specialties | GET | `/api/v1/specialties` | Doctor Service (TV3) | CÓ | ACTIVE | Non-ADMIN chỉ thấy `isActive=true` | Không |
| Create Specialty | POST | `/api/v1/specialties` | Doctor Service (TV3) | CÓ | ADMIN | Không | Không |
| Update Specialty | PATCH | `/api/v1/specialties/{specialtyId}` | Doctor Service (TV3) | CÓ | ADMIN | Không | Không |
| List Doctors | GET | `/api/v1/doctors` | Doctor Service (TV3) | CÓ | ACTIVE | Non-ADMIN chỉ thấy `isActive=true` | Không |
| Get Doctor Profile (Me) | GET | `/api/v1/doctors/me` | Doctor Service (TV3) | MỚI | DOCTOR | Endpoint mới; tự map doctor profile từ identity | Không |
| Create Doctor Profile | POST | `/api/v1/doctors` | Doctor Service (TV3) | CÓ | ADMIN | Không | Không |
| Get Doctor By ID | GET | `/api/v1/doctors/{doctorId}` | Doctor Service (TV3) | CÓ | ACTIVE | Không | Không |
| Update Doctor Profile | PATCH | `/api/v1/doctors/{doctorId}` | Doctor Service (TV3) | CÓ | ADMIN | Không | Không |
| List Doctor Schedules | GET | `/api/v1/doctors/{doctorId}/schedules` | Doctor Service (TV3) | CÓ | ACTIVE | Phân trang thật | Không |
| Create Doctor Schedule | POST | `/api/v1/doctors/{doctorId}/schedules` | Doctor Service (TV3) | CÓ | DOCTOR (self), STAFF, ADMIN | Giới hạn 5..240 phút; không chồng chéo schedule | Không |
| Update Schedule | PATCH | `/api/v1/schedules/{scheduleId}` | Doctor Service (TV3) | CÓ | DOCTOR (owner), STAFF, ADMIN | Kiểm tra occupancy xung đột (409) | Occupancy check dependency |
| List Doctor Time-Offs | GET | `/api/v1/doctors/{doctorId}/time-offs` | Doctor Service (TV3) | CÓ | DOCTOR (self), STAFF, ADMIN | PATIENT bị 403; phân trang thật | Không |
| Create Doctor Time-Off | POST | `/api/v1/doctors/{doctorId}/time-offs` | Doctor Service (TV3) | CÓ | DOCTOR (self), STAFF, ADMIN | Kiểm tra occupancy xung đột (409) | Occupancy check dependency |
| Update Doctor Time-Off | PATCH | `/api/v1/doctors/{doctorId}/time-offs/{timeOffId}` | Doctor Service (TV3) | CÓ | DOCTOR (self), STAFF, ADMIN | `timeOffId` phải thuộc `doctorId` | Không |
| Get Available Slots | GET | `/api/v1/doctors/{doctorId}/available-slots` | Doctor Service (TV3) | CÓ | ACTIVE | `date=YYYY-MM-DD` bắt buộc; trừ occupancy | Occupancy check dependency |
| List Appointments | GET | `/api/v1/appointments` | Appointment Service (TV3) | THAY_ĐỔI | PATIENT, DOCTOR, STAFF, ADMIN | Mặc định `view=summary`; `view=detail` bảo vệ lâm sàng; query mới: `q`, `include=names`, `sort`, `from/to` | Lookup names dependency |
| Appointment Summary | GET | `/api/v1/appointments/summary` | Appointment Service (TV3) | MỚI | DOCTOR, STAFF, ADMIN | Endpoint mới; thống kê server theo timezone `Asia/Ho_Chi_Minh` | Không |
| Create Appointment | POST | `/api/v1/appointments` | Appointment Service (TV3) | CÓ | PATIENT, STAFF, ADMIN | Bắt buộc `Idempotency-Key`; `reason` max 500 | Slot verification dependency |
| Get Appointment Detail | GET | `/api/v1/appointments/{appointmentId}` | Appointment Service (TV3) | THAY_ĐỔI | PATIENT, DOCTOR, STAFF, ADMIN | Mặc định `view=summary`; `view=detail` DOCTOR cần grant lâm sàng | TV4 Clinical Grant verification |
| Reschedule Appointment | PATCH | `/api/v1/appointments/{appointmentId}/reschedule` | Appointment Service (TV3) | CÓ | PATIENT (owner), STAFF, ADMIN | Bắt buộc `Idempotency-Key`; `reason` max 500 | Slot verification dependency |
| Cancel Appointment | PATCH | `/api/v1/appointments/{appointmentId}/cancel` | Appointment Service (TV3) | CÓ | PATIENT (owner), STAFF, ADMIN | Bắt buộc `Idempotency-Key`; `reason` max 500 | Không |
| Confirm Appointment | PATCH | `/api/v1/appointments/{appointmentId}/confirm` | Appointment Service (TV3) | CÓ | STAFF, ADMIN | Bắt buộc `Idempotency-Key`; DOCTOR không được gọi | Không |
| Check-in Appointment | PATCH | `/api/v1/appointments/{appointmentId}/check-in` | Appointment Service (TV3) | CÓ | STAFF, ADMIN | Bắt buộc `Idempotency-Key`; DOCTOR không được gọi | Không |
| No-Show Appointment | PATCH | `/api/v1/appointments/{appointmentId}/no-show` | Appointment Service (TV3) | CÓ | STAFF, ADMIN | Bắt buộc `Idempotency-Key`; DOCTOR không được gọi | Decision: Notification event for NO_SHOW |
| Complete Appointment (legacy) | PATCH | `/api/v1/appointments/{appointmentId}/complete` | Appointment Service (TV3) | CÓ (deprecated) | None | Luôn trả `409 MEDICAL_RECORD_REQUIRED`; chỉ hoàn tất qua callback nội bộ từ Medical Record | Không |
| List Medical Records | GET | `/api/v1/medical-records` | Medical Record Service (TV4) | THAY_ĐỔI | PATIENT (FINAL), DOCTOR (grant) | STAFF/ADMIN bị 403; DOCTOR detail cần grant; `scope=authored` hoặc `patient-history` | TV4 Clinical Grant & Decision 17.1 |
| Create Medical Record | POST | `/api/v1/medical-records` | Medical Record Service (TV4) | THAY_ĐỔI | DOCTOR | Bắt buộc `Idempotency-Key`; tạo FINAL cần context/proof & `expectedVersion=0` | TV2 MFA proof verification |
| Get Medical Record | GET | `/api/v1/medical-records/{recordId}` | Medical Record Service (TV4) | THAY_ĐỔI | PATIENT (self FINAL), DOCTOR (grant) | STAFF/ADMIN bị 403; DOCTOR bắt buộc grant | TV4 Clinical Grant & Decision 17.1 |
| Update Medical Record | PATCH | `/api/v1/medical-records/{recordId}` | Medical Record Service (TV4) | THAY_ĐỔI | DOCTOR | Bắt buộc `expectedVersion`; chuyển FINAL cần `verificationProofId`; tăng version | TV2 MFA proof verification |
| Create Clinical Grant | POST | `/api/v1/medical-records/access-grants` | Medical Record Service (TV4) | MỚI | DOCTOR | Endpoint mới; nhận verificationProofId -> trả ClinicalGrant | Decision 17.1 (Grant TTL & eligibility) |
| Create Finalization Context | POST | `/api/v1/medical-records/finalization-contexts` | Medical Record Service (TV4) | MỚI | DOCTOR | Endpoint mới; tạo context hash cho TOTP finalize | Không |
| List Notifications | GET | `/api/v1/notifications` | Notification Service (TV4) | CÓ | ACTIVE | Phân trang thật, chỉ trả của chính mình | Không |
| Get Unread Notification Count | GET | `/api/v1/notifications/unread-count` | Notification Service (TV4) | MỚI | ACTIVE | Endpoint mới; đếm toàn tập của actor | Không |
| Get Notification Detail | GET | `/api/v1/notifications/{notificationId}` | Notification Service (TV4) | CÓ | Chủ thông báo | Ngoài phạm vi trả 404 | Không |
| Mark Notification Read | PATCH | `/api/v1/notifications/{notificationId}/read` | Notification Service (TV4) | CÓ | Chủ thông báo | Idempotent | Không |
| Mark All Notifications Read | PATCH | `/api/v1/notifications/read-all` | Notification Service (TV4) | MỚI | ACTIVE | Endpoint mới; cutoff `readBefore` toàn tập | Không |
| Client Notification Creation | POST | `/api/v1/notifications` | Notification Service (TV4) | CÓ (reject) | None | Luôn trả `403 ACCESS_DENIED` cho public client | Không |

---

## 2. Internal Service-to-Service APIs Matrix

| Operation | Method | Path | Caller -> Owner | Status | Breaking Fields | Blocker |
|---|---|---|---|---|---|---|
| Verify Access Token | GET | `/internal/v1/auth/verify` | Gateway -> User (TV2) | THAY_ĐỔI | Bổ sung session metadata: sessionId, sessionVersion, idleExpiresAt, absoluteExpiresAt, lockAt, status ACTIVE/PENDING_MFA/LOCKED | TV2 Session Verify DTO |
| Gateway Identity Cache Invalidation | — | No public or service-facing endpoint | Gateway-local after successful MFA verification, logout, or session revocation | IMPLEMENTED | Gateway invalidates by token/session/user after proxy success; internal cache control is not exposed on the public listener | Gateway owns its in-memory cache lifecycle |
| Verify MFA Proof | POST | `/internal/v1/auth/mfa/proofs/verify` | Medical Record / Services -> User (TV2) | MỚI | Endpoint mới; xác minh proof_token, purpose, context | TV2 MFA Proof Contract |
| Verify Clinical Grant | POST | `/internal/v1/medical-records/access-grants/verify` | User / Appointment -> Medical Record (TV4) | MỚI | Endpoint mới; kiểm tra grantId còn hiệu lực | TV4 Clinical Grant Contract |
| Patient Lookup (Batch) | POST | `/internal/v1/patients/lookup` | Appointment / Medical Record -> User (TV2) | MỚI | Endpoint mới; batch tối đa 100 ID, trả PatientSummary | Không |
| Doctor Lookup (Batch) | POST | `/internal/v1/doctors/lookup` | Appointment / Medical Record -> Doctor (TV3) | MỚI | Endpoint mới; batch tối đa 100 ID, trả DoctorSummary | Không |
| Check Doctor Eligibility | GET | `/internal/v1/users/{userId}/doctor-eligibility` | Doctor -> User (TV2) | CÓ | Không | Không |
| Get Patient By User ID | GET | `/internal/v1/patients/by-user/{userId}` | Appointment / Medical Record -> User (TV2) | CÓ | Không | Không |
| Get Patient By ID | GET | `/internal/v1/patients/{patientId}` | Appointment / Medical Record -> User (TV2) | CÓ | Không | Không |
| Get Doctor By User ID | GET | `/internal/v1/doctors/by-user/{userId}` | User / Appointment / Medical Record -> Doctor (TV3) | CÓ | Không | Không |
| Verify Slot Availability | POST | `/internal/v1/doctors/verify-slot` | Appointment -> Doctor (TV3) | CÓ | Không | Không |
| Get Occupied Slots | GET | `/internal/v1/appointments/occupied-slots` | Doctor -> Appointment (TV3) | CÓ | Không | Không |
| Check Patient Scope | GET | `/internal/v1/appointments/{appointmentId}/patient-scope` | User -> Appointment (TV3) | CÓ | Không | Không |
| Verify Appointment for Medical Record | GET | `/internal/v1/appointments/{appointmentId}/verify-for-medical-record` | Medical Record -> Appointment (TV3) | CÓ | Không | Không |
| Complete Appointment from Record | POST | `/internal/v1/appointments/{appointmentId}/complete-from-record` | Medical Record -> Appointment (TV3) | CÓ | Record phải FINAL và khớp ca | Không |
| Get Medical Record By Appointment | GET | `/internal/v1/medical-records/by-appointment/{appointmentId}` | Appointment -> Medical Record (TV4) | CÓ | Không trả clinical content | Không |
| Get Reminder Context | GET | `/internal/v1/appointments/{appointmentId}/reminder-context` | Notification -> Appointment (TV3) | CÓ | Không | Không |
| Create Notification Event | POST | `/internal/v1/notifications` | Appointment / Medical Record -> Notification (TV4) | CÓ | Yêu cầu `eventId` ổn định để dedup | Không |
| Retry Notification Event | POST | `/internal/v1/notifications/{notificationId}/retry` | Ops / Producer -> Notification (TV4) | CÓ | Idempotent | Không |

---

## 3. Bảng phân loại thay đổi (Breaking Changes & Migration Impact)

1. **Bảo mật phiên & MFA bắt buộc (STAFF/ADMIN):**
   - Đăng nhập trả trạng thái `PENDING_MFA`; client không thể dùng ngay token để gọi API nghiệp vụ.
   - Phiên bị khóa (`LOCKED`) sau 15 phút idle; chỉ gọi được allowlist (`/auth/session`, `/auth/mfa/*`, `/auth/logout`, `/auth/refresh`).
   - Phiên hết hạn sau 8 giờ (`EXPIRED`); không thể refresh để kéo dài.

2. **Bảo vệ dữ liệu lâm sàng (Medical Records & Patients):**
   - Không còn quyền đọc/sửa lâm sàng mặc định cho `STAFF` hoặc `ADMIN`.
   - `DOCTOR` phải có `ClinicalGrant` (`X-Clinical-Grant` header) xác minh qua TOTP để đọc hồ sơ tiền sử `FINAL` và thông tin chi tiết bệnh nhân.
   - `POST/PATCH` bệnh án trạng thái `FINAL` bắt buộc kèm `verificationProofId` từ TOTP challenge mục đích `FINALIZE_MEDICAL_RECORD`.

3. **Hoàn tất ca khám (`CHECKED_IN` -> `COMPLETED`):**
   - Endpoint cũ `PATCH /appointments/{id}/complete` bị deprecated và trả `409 MEDICAL_RECORD_REQUIRED`.
   - Hoàn tất ca chỉ diễn ra thông qua callback nội bộ `POST /internal/v1/appointments/{id}/complete-from-record` sau khi bác sĩ chốt bệnh án `FINAL`.

4. **Idempotency bắt buộc cho mọi write:**
   - Các thao tác đặt lịch, đổi lịch, xác nhận, tiếp đón, tạo/sửa bệnh án yêu cầu header `Idempotency-Key`.
   - Replay cùng key và fingerprint payload trả lại kết quả cũ; mismatch payload trả `409 IDEMPOTENCY_KEY_REUSED`.

5. **Chuẩn hóa query và envelope:**
   - Tham số sort chỉ nhận `scheduledStartAt:asc` hoặc `desc` (thay vì sort tự do).
   - Date luôn là `YYYY-MM-DD` (không giờ); timestamp luôn là ISO 8601 UTC có `Z`.
   - Query tham số không hỗ trợ trả `400 VALIDATION_ERROR`.
