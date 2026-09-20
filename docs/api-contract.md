# API Contract v1

Tài liệu này là hợp đồng API chuẩn cho các nhánh triển khai tiếp theo của Clinic Appointment System. Frontend và service phải tuân thủ hợp đồng này; nếu cần thay đổi, cập nhật tài liệu trước hoặc cùng pull request có thay đổi API.

## 1. Phạm Vi Và Nguyên Tắc

- API public chỉ truy cập qua API Gateway, prefix `/api/v1`.
- Frontend không gọi trực tiếp service nghiệp vụ hoặc truy vấn bảng Supabase.
- API nội bộ dùng prefix `/internal/v1`, chỉ được gọi trong mạng backend và không được expose qua Gateway.
- Mỗi service là chủ sở hữu duy nhất của dữ liệu trong schema riêng.
- ID là chuỗi opaque đối với client. Không phụ thuộc định dạng ID nội bộ.
- Request/response dùng JSON UTF-8. Ngày giờ truyền giữa service theo ISO 8601 UTC, ví dụ `2026-09-20T03:30:00.000Z`.
- API v1 không hard-delete hồ sơ bệnh án.

Base URL local: `http://localhost:8080`.

## 2. Quy Ước Request

### Headers

Request có body JSON:

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <supabase_access_token>
```

`Authorization` bắt buộc với mọi route public, trừ `GET /health`. Gateway tạo hoặc chuyển tiếp `X-Request-Id`; service ghi ID này vào log và response. Client không được dùng các header nội bộ `X-User-Id`, `X-Role` để tự xác định danh tính.

Tạo lịch hẹn phải có:

```http
Idempotency-Key: <client-generated-unique-key>
```

Key nên là UUID hoặc chuỗi ngẫu nhiên tối thiểu 16 ký tự, được giữ nguyên khi retry cùng một yêu cầu.

### Phân trang và lọc

API danh sách nhận:

| Query | Mặc định | Quy tắc |
|---|---:|---|
| `page` | `1` | Số nguyên, tối thiểu 1 |
| `limit` | `20` | Số nguyên từ 1 đến 100 |

List endpoint có thể nhận filter được định nghĩa ở từng endpoint. Thứ tự mặc định là mới nhất trước với tài nguyên có thời gian tạo; lịch hẹn sắp theo `scheduledStartAt` tăng dần. Filter theo patient/doctor phải luôn được giới hạn bởi quyền của actor.

## 3. Response Chung

### Thành công

```json
{
  "success": true,
  "data": {
    "id": "opaque-id"
  }
}
```

Danh sách luôn đặt trong `data.items` và có metadata phân trang:

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

### Lỗi

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "scheduledStartAt", "code": "invalid_datetime", "message": "Expected ISO 8601 datetime" }
    ]
  },
  "requestId": "request-id"
}
```

`details` luôn là mảng; không trả stack trace, token, secret hoặc thông tin kết nối nội bộ.

### HTTP status

| Status | Ý nghĩa |
|---:|---|
| `200` | Đọc/cập nhật thành công hoặc retry idempotent đã được xử lý |
| `201` | Tạo tài nguyên thành công |
| `204` | Thành công không có body, chỉ dùng khi endpoint được định nghĩa rõ |
| `400` | JSON hoặc query không hợp lệ |
| `401` | Thiếu hoặc access token không hợp lệ/hết hạn |
| `403` | Actor không đủ quyền |
| `404` | Không tìm thấy tài nguyên hoặc không thuộc phạm vi actor được xem |
| `409` | Xung đột trạng thái, slot hoặc idempotency key |
| `422` | Request hợp lệ về cấu trúc nhưng không hợp lệ theo nghiệp vụ |
| `429` | Vượt rate limit |
| `502` | Service upstream không khả dụng |
| `503` | Service đang không sẵn sàng |

## 4. Xác Thực Và Phân Quyền

- Supabase Auth chịu trách nhiệm đăng ký, đăng nhập, refresh và phát hành access token. Hai frontend dùng Supabase Auth SDK cho các thao tác này; không gửi mật khẩu qua User Service.
- Với API nghiệp vụ, frontend gửi Supabase access token tới Gateway.
- Gateway xác minh token, lấy `sub`, sau đó tra profile/role có thẩm quyền từ User Service. Không lấy role có thể tự sửa từ user metadata làm nguồn phân quyền.
- Gateway truyền danh tính đã xác minh tới service nội bộ qua header do Gateway tự ghi đè: `X-User-Id`, `X-Role`, `X-Request-Id`.
- Các service vẫn kiểm tra quyền nghiệp vụ nhạy cảm, đặc biệt quyền sở hữu patient, doctor phụ trách và trạng thái appointment.
- Trong development chỉ được phép có auth giả lập bằng header khi bật chế độ dev rõ ràng. Tuyệt đối không bật fallback này trong production.

Role: `PATIENT`, `DOCTOR`, `STAFF`, `ADMIN`.

| Use case | PATIENT | DOCTOR | STAFF | ADMIN |
|---|---:|---:|---:|---:|
| Xem chuyên khoa/bác sĩ/slot | Có | Có | Có | Có |
| Xem/sửa hồ sơ cá nhân | Hồ sơ mình | Hồ sơ mình | Hồ sơ mình | Tài khoản theo quyền quản trị |
| Tạo lịch cho bệnh nhân | Cho mình | Không | Có | Có |
| Xem lịch hẹn | Lịch của mình | Lịch được phân công | Theo phạm vi phòng khám | Tất cả |
| Xác nhận/hủy/check-in/no-show | Hủy lịch của mình theo trạng thái | Không | Có | Có |
| Hoàn thành buổi khám | Không | Appointment được phân công | Không | Không mặc định |
| Đọc hồ sơ khám | Hồ sơ của mình | Hồ sơ bệnh nhân thuộc buổi khám được phân công | Không đọc nội dung lâm sàng | Theo quyền kiểm toán được cấp |
| Tạo/sửa chẩn đoán và đơn thuốc | Không | Appointment được phân công | Không | Không mặc định |
| Quản lý user/role | Không | Không | Không | Có |
| Quản lý bác sĩ/chuyên khoa/lịch | Không | Lịch của mình | Theo quyền được cấp | Có |
| Theo dõi health tổng hợp | Không | Không | Không | Có |

Không được xem `403` là biện pháp duy nhất cho dữ liệu riêng tư: truy vấn service phải lọc theo danh tính và phạm vi được phép.

## 5. API Public Qua Gateway

Trong bảng dưới, “đã scaffold” chỉ nói route hiện có trong mã tại thời điểm viết tài liệu; không có nghĩa đã đáp ứng đầy đủ auth, lọc quyền, phân trang hoặc persistence.

### Gateway Và Auth/Profile

| Method | Path | Quyền | Mục đích | Trạng thái scaffold |
|---|---|---|---|---|
| `GET` | `/health` | Public | Health của Gateway; không lộ URL nội bộ | Có |
| `GET` | `/api/v1/system/health` | `ADMIN` | Health tổng hợp, chỉ trả trạng thái từng service | Có, cần tránh trả URL nội bộ |
| `GET` | `/api/v1/auth/me` | Bất kỳ role đã đăng nhập | Profile nghiệp vụ tương ứng với Supabase Auth user | Có |
| `GET` | `/api/v1/users/me` | Bất kỳ role đã đăng nhập | Lấy profile của actor hiện tại | Có |
| `PATCH` | `/api/v1/users/me` | Bất kỳ role đã đăng nhập | Cập nhật tên/điện thoại của actor | Có |

Supabase Auth SDK là nơi thực hiện sign-up/sign-in/sign-out/refresh. Không tạo endpoint backend để nhận hoặc lưu mật khẩu trong phạm vi MVP.

### User Và Patient

| Method | Path | Quyền | Query/body |
|---|---|---|---|
| `GET` | `/api/v1/users` | `ADMIN` | `page`, `limit`, `role`, `status`, `q` |
| `GET` | `/api/v1/users/{userId}` | `ADMIN` | Không có |
| `PATCH` | `/api/v1/users/{userId}/status` | `ADMIN` | `{ "status": "ACTIVE" \| "INACTIVE" \| "LOCKED" }` |
| `PATCH` | `/api/v1/users/{userId}/role` | `ADMIN` | `{ "role": "PATIENT" \| "DOCTOR" \| "STAFF" \| "ADMIN" }` |
| `GET` | `/api/v1/patients` | `STAFF`, `ADMIN`; `DOCTOR` trong phạm vi lịch khám | `page`, `limit`, `q` |
| `GET` | `/api/v1/patients/{patientId}` | Bệnh nhân chính mình; `DOCTOR`/`STAFF`/`ADMIN` theo phạm vi | Không có |
| `PATCH` | `/api/v1/patients/{patientId}` | Bệnh nhân chính mình hoặc `ADMIN` | Patient profile fields |

`UserProfile` response gồm `id`, `supabaseAuthUserId` không trả cho frontend, `email`, `fullName`, `phone`, `role`, `status`, `createdAt`, `updatedAt`. `PatientProfile` gồm `id`, `userId`, `dateOfBirth`, `gender`, `address`, `emergencyContact`, `insuranceNumber`, timestamps. Chỉ trả field patient profile cần thiết cho actor; không đưa `insuranceNumber` vào màn hình/response không cần thiết.

### Doctor, Specialty Và Schedule

| Method | Path | Quyền | Query/body |
|---|---|---|---|
| `GET` | `/api/v1/specialties` | Bất kỳ role đã đăng nhập | `page`, `limit`, `q`, `isActive` |
| `POST` | `/api/v1/specialties` | `ADMIN` | `{ "name": string, "description"?: string }` |
| `PATCH` | `/api/v1/specialties/{specialtyId}` | `ADMIN` | `{ "name"?: string, "description"?: string, "isActive"?: boolean }` |
| `GET` | `/api/v1/doctors` | Bất kỳ role đã đăng nhập | `page`, `limit`, `specialtyId`, `q`, `isActive` |
| `POST` | `/api/v1/doctors` | `ADMIN` | `{ "userId": string, "specialtyId": string, "displayName": string, "bio"?: string }` |
| `GET` | `/api/v1/doctors/{doctorId}` | Bất kỳ role đã đăng nhập | Không có |
| `PATCH` | `/api/v1/doctors/{doctorId}` | `ADMIN` | Doctor fields có thể cập nhật |
| `GET` | `/api/v1/doctors/{doctorId}/schedules` | Bất kỳ role đã đăng nhập | `page`, `limit` nếu danh sách có phân trang |
| `POST` | `/api/v1/doctors/{doctorId}/schedules` | Bác sĩ chính mình, `STAFF`, `ADMIN` | `{ "weekday": 0..6, "startTime": "HH:mm", "endTime": "HH:mm", "slotDurationMinutes": integer }` |
| `PATCH` | `/api/v1/schedules/{scheduleId}` | Bác sĩ sở hữu lịch, `STAFF`, `ADMIN` | Các trường lịch có thể cập nhật |
| `GET` | `/api/v1/doctors/{doctorId}/available-slots?date=YYYY-MM-DD` | Bất kỳ role đã đăng nhập | `date` bắt buộc; trả `[{ "startAt": ISODateTime, "endAt": ISODateTime }]` |

`weekday`: Chủ Nhật `0`, Thứ Hai `1`, ..., Thứ Bảy `6`. `startTime`/`endTime` là giờ địa phương của phòng khám; response slot luôn là UTC. Doctor phải tồn tại và `isActive=true`; slot phải nằm trọn trong schedule và ngoài time-off.

### Appointment

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/appointments` | Tất cả role đã đăng nhập, dữ liệu được giới hạn theo actor | Danh sách; filters `page`, `limit`, `patientId`, `doctorId`, `status`, `from`, `to` |
| `POST` | `/api/v1/appointments` | `PATIENT`, `STAFF`, `ADMIN` | Tạo lịch; bắt buộc `Idempotency-Key` |
| `GET` | `/api/v1/appointments/{appointmentId}` | Owner patient, doctor được phân công, `STAFF`, `ADMIN` | Chi tiết lịch |
| `PATCH` | `/api/v1/appointments/{appointmentId}/reschedule` | Owner patient, `STAFF`, `ADMIN` | Đổi khung giờ khi trạng thái cho phép |
| `PATCH` | `/api/v1/appointments/{appointmentId}/cancel` | Owner patient, `STAFF`, `ADMIN` | Chuyển `PENDING`/`CONFIRMED` sang `CANCELLED` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/confirm` | `STAFF`, `ADMIN` | `PENDING` sang `CONFIRMED` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/check-in` | `STAFF`, `ADMIN` | `CONFIRMED` sang `CHECKED_IN` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/complete` | Doctor được phân công | `CHECKED_IN` sang `COMPLETED` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/no-show` | `STAFF`, `ADMIN` | `CONFIRMED` sang `NO_SHOW` |

Tạo lịch:

```json
{
  "patientId": "patient-id",
  "doctorId": "doctor-id",
  "specialtyId": "specialty-id",
  "scheduledStartAt": "2026-09-21T01:00:00.000Z",
  "scheduledEndAt": "2026-09-21T01:30:00.000Z",
  "reason": "Khám tổng quát"
}
```

`patientId` có thể bỏ qua khi PATIENT tự đặt; service suy ra patient từ actor đã xác thực. Nếu client gửi ID, service phải xác nhận actor có quyền đặt cho patient đó. `doctorId`, `scheduledStartAt`, `scheduledEndAt` là bắt buộc. Thời gian kết thúc phải sau thời gian bắt đầu.

Tạo lịch lần đầu trả `201`. Retry cùng `Idempotency-Key` và cùng payload trả lại appointment đã tạo với `200`. Dùng lại key cho payload khác trả `409 IDEMPOTENCY_KEY_REUSED`. Slot không còn trống trả `409 APPOINTMENT_SLOT_UNAVAILABLE`; ngoài lịch bác sĩ trả `422 APPOINTMENT_SLOT_INVALID`.

Đổi lịch body:

```json
{
  "scheduledStartAt": "2026-09-21T02:00:00.000Z",
  "scheduledEndAt": "2026-09-21T02:30:00.000Z",
  "reason": "Đổi giờ theo yêu cầu"
}
```

Body transition/cancel nhận `{ "reason"?: string }`. Body rỗng tương thích scaffold hiện tại nhưng client mới nên gửi JSON object.

State transition hợp lệ duy nhất:

```text
PENDING -> CONFIRMED | CANCELLED
CONFIRMED -> CHECKED_IN | CANCELLED | NO_SHOW
CHECKED_IN -> COMPLETED
COMPLETED, CANCELLED, NO_SHOW -> không chuyển tiếp
```

Chuyển trạng thái không hợp lệ trả `409 APPOINTMENT_INVALID_STATUS_TRANSITION`. Appointment response gồm `id`, `patientId`, `doctorId`, `specialtyId?`, `scheduledStartAt`, `scheduledEndAt`, `reason?`, `status`, `createdAt`, `updatedAt`.

### Medical Record

| Method | Path | Quyền | Query/body |
|---|---|---|---|
| `GET` | `/api/v1/medical-records` | Patient chỉ bản thân; doctor theo lịch được phân công | `page`, `limit`, `patientId`, `doctorId`, `appointmentId` |
| `POST` | `/api/v1/medical-records` | Doctor được phân công cho appointment | Medical record body bên dưới |
| `GET` | `/api/v1/medical-records/{recordId}` | Patient sở hữu; doctor phụ trách | Không có |
| `PATCH` | `/api/v1/medical-records/{recordId}` | Doctor tạo/phụ trách record theo policy | Chỉ các trường lâm sàng được phép sửa; ghi audit |

Lịch sử khám của một bệnh nhân dùng `GET /api/v1/medical-records?patientId={patientId}&page=1&limit=20`. Với PATIENT, service phải tự áp dụng patient ID từ profile actor; nếu query chỉ định ID khác, trả `403` hoặc `404` theo policy thống nhất, không trả dữ liệu người khác.

Tạo/cập nhật record:

```json
{
  "appointmentId": "appointment-id",
  "patientId": "patient-id",
  "doctorId": "doctor-id",
  "symptoms": "Đau đầu",
  "diagnosis": "...",
  "notes": "...",
  "treatmentPlan": "...",
  "prescription": [
    { "medicineName": "...", "dosage": "...", "frequency": "...", "duration": "..." }
  ],
  "status": "DRAFT"
}
```

Service phải xác minh appointment và doctor/patient ownership qua Appointment Service; không query schema của Appointment Service. Một appointment tối đa có một record active. Không có endpoint xóa vật lý. Patient chỉ đọc, không tạo/sửa clinical record.

Response gồm `id`, `appointmentId`, `patientId`, `doctorId`, `symptoms?`, `diagnosis?`, `notes?`, `treatmentPlan?`, `prescription`, `status` (`DRAFT`/`FINAL`), `createdBy`, `updatedBy?`, `createdAt`, `updatedAt`.

### Notification

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | Bất kỳ role đã đăng nhập; chỉ notification của actor | `page`, `limit`, `status` |
| `GET` | `/api/v1/notifications/{notificationId}` | Người nhận | Lấy notification |
| `PATCH` | `/api/v1/notifications/{notificationId}/read` | Người nhận | Đánh dấu đã đọc |

Notification response gồm `id`, `recipientUserId`, `type`, `title`, `message`, `payload?`, `status` (`UNREAD`/`READ`/`FAILED`), `readAt?`, `createdAt`.

Public client không được tạo notification trực tiếp. Tạo notification chỉ qua API nội bộ từ event producer.

## 6. API Nội Bộ Service-to-Service

Các route này không được mount vào Gateway public router. Trong MVP gọi HTTP trên private Docker network; không expose port nội bộ ra internet. Mỗi request mang `X-Request-Id` và identity context tối thiểu cần thiết. Trước production cần xác thực workload/service identity.

| Caller -> Owner | Method/path | Request | Response |
|---|---|---|---|
| Appointment -> Doctor | `POST /internal/v1/doctors/verify-slot` | `{ "doctorId": string, "startAt": ISODateTime, "endAt": ISODateTime }` | `{ "valid": boolean, "reason"?: string }` |
| Medical Record -> Appointment | `GET /internal/v1/appointments/{appointmentId}/verify-for-medical-record` | Không có | `{ "valid": boolean, "appointment"?: { "id", "patientId", "doctorId", "status" } }` |
| Appointment/Medical Record -> Notification | `POST /internal/v1/notifications` | `{ "eventId": string, "type": string, "payload": object }` | `201` khi nhận lần đầu; `200` khi event đã nhận trước đó |

Notification tối thiểu xử lý event types `appointment.created`, `appointment.rescheduled`, `appointment.cancelled`, `appointment.confirmed`, `medical-record.created`. `eventId` dùng để deduplicate retry. Gửi HTTP đồng bộ không phải durable queue; caller cần timeout, retry có giới hạn và idempotency. Lỗi notification không được rollback appointment/medical record đã commit.

## 7. Error Code Tối Thiểu

| Code | HTTP | Dùng khi |
|---|---:|---|
| `AUTH_TOKEN_MISSING` | 401 | Không gửi bearer token |
| `AUTH_TOKEN_INVALID` | 401 | Token sai/hết hạn |
| `ACCESS_DENIED` | 403 | Không đủ quyền |
| `VALIDATION_ERROR` | 400 | Field/query sai cấu trúc |
| `ROUTE_NOT_FOUND` | 404 | Không tồn tại route |
| `USER_NOT_FOUND` | 404 | Không tìm thấy profile |
| `DOCTOR_NOT_FOUND` | 404 | Không tìm thấy bác sĩ |
| `APPOINTMENT_NOT_FOUND` | 404 | Không tìm thấy lịch |
| `MEDICAL_RECORD_NOT_FOUND` | 404 | Không tìm thấy record |
| `NOTIFICATION_NOT_FOUND` | 404 | Không tìm thấy notification |
| `APPOINTMENT_INVALID_STATUS_TRANSITION` | 409 | Chuyển trạng thái không hợp lệ |
| `APPOINTMENT_SLOT_UNAVAILABLE` | 409 | Slot đã bị đặt; ở database phải được bảo vệ bằng constraint/transaction |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key được dùng lại với payload khác |
| `APPOINTMENT_SLOT_INVALID` | 422 | Slot ngoài lịch hoặc bác sĩ không hoạt động |
| `UPSTREAM_SERVICE_UNAVAILABLE` | 502 | Gateway không gọi được service |
| `RATE_LIMIT_EXCEEDED` | 429 | Vượt ngưỡng request |

## 8. Gateway Routing Và Ownership

| Public prefix | Owner service |
|---|---|
| `/api/v1/auth`, `/api/v1/users`, `/api/v1/patients` | User Service |
| `/api/v1/specialties`, `/api/v1/doctors`, `/api/v1/schedules` | Doctor Service |
| `/api/v1/appointments` | Appointment Service |
| `/api/v1/medical-records` | Medical Record Service |
| `/api/v1/notifications` | Notification Service |

Gateway chịu trách nhiệm xác thực, rate limit, request ID, CORS, routing và error normalization ở biên. Gateway không thực hiện nghiệp vụ, không đọc schema nghiệp vụ và không ghi database.

## 9. Các Sai Khác Cần Xử Lý Khi Triển Khai

Các mục dưới đây là gap giữa scaffold hiện tại và contract; không phải ngoại lệ của contract:

- Gateway hiện lấy role từ JWT user metadata và khi thiếu cấu hình Supabase chấp nhận `X-Role`/`X-User-Id`. `GW-001`/`GW-002` phải chuyển sang profile role có thẩm quyền và khóa dev fallback khỏi production.
- Gateway health hiện trả các URL service nội bộ. `GW-004` phải đổi thành trạng thái service, không trả host/URL nội bộ.
- Service repositories hiện dùng in-memory arrays; persistence Supabase thuộc các task service tương ứng.
- Doctor list/specialty/available slot và một số list endpoint hiện chưa áp dụng pagination/filter đầy đủ.
- Appointment hiện chỉ kiểm tra conflict bằng memory trước khi insert; `BOOK-004` phải dùng transaction và constraint PostgreSQL.
- `POST /api/v1/notifications` hiện được implement trong Notification Service; contract v1 không cho client gọi route này, cần bỏ hoặc chặn qua Gateway.
- Internal notification hiện nhận `{ type, payload }` và chưa deduplicate event; bổ sung `eventId` trước khi dựa vào retry.
- Medical Record Service scaffold có route `/api/v1/patients/{patientId}/medical-records`, nhưng prefix `/api/v1/patients` thuộc User Service ở Gateway. Không expose route này; dùng filter `patientId` trên `/api/v1/medical-records` theo contract.
- Một số route được liệt kê trong `system-design.md` chưa được code. Triển khai route theo bảng trong tài liệu này và bổ sung Swagger/OpenAPI.
- Patient App hiện gửi `patientId` cố định và chưa có Supabase Auth; chuyển sang danh tính actor sau `CLIENT-003`/User Auth.

## 10. Quy Trình Thay Đổi Contract

1. Thành viên đề xuất thay đổi trong pull request và nêu lý do/ảnh hưởng.
2. Cập nhật `docs/api-contract.md`, API schema/Swagger và test contract trong cùng pull request.
3. Breaking change phải tăng version prefix ở phase sau; không đổi âm thầm API `/api/v1`.
4. Bên gọi và bên sở hữu service cùng review trước khi merge.

## 11. Thứ Tự Áp Dụng Cho Nhóm

1. **Member 1 / Gateway:** chốt và triển khai auth, role, error, request ID, health và Swagger theo contract.
2. **Member 2 / User:** dùng `UserProfile`/`PatientProfile`, Auth user mapping và quyền theo contract.
3. **Member 3 / Doctor + Appointment:** triển khai endpoint và state machine; bắt buộc transaction/constraint cho slot.
4. **Member 4 / Clients + Records + Notification:** tích hợp endpoint public, chỉ dùng Gateway; triển khai internal event theo contract.
5. **Cả nhóm:** chạy contract/integration test, build và Docker Compose; rà soát không có truy vấn xuyên schema.

## 12. Contract Test Checklist

- [ ] Mọi public endpoint có OpenAPI operation, request schema, response schema và error response.
- [ ] Thiếu/sai token trả đúng `401`; sai role trả `403`.
- [ ] Patient không đọc/ghi dữ liệu của patient khác bằng cách đổi ID/query.
- [ ] Tất cả list endpoint có pagination thống nhất.
- [ ] Timestamps là ISO 8601 UTC; enum đúng contract.
- [ ] Appointment transition sai trả `409`.
- [ ] Hai request đồng thời cho cùng doctor/slot không thể cùng thành công.
- [ ] Retry cùng idempotency key không tạo lịch thứ hai.
- [ ] Internal route không truy cập được qua Gateway public path.
- [ ] Error response không lộ stack trace, secret hoặc URL nội bộ.
- [ ] Test service-to-service timeout/retry không làm mất appointment đã commit.
