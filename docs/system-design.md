# Clinic Appointment System Design

## 1. Tổng Quan Kiến Trúc

Hệ thống đặt lịch khám được thiết kế theo kiến trúc hướng dịch vụ. Hai frontend không gọi trực tiếp các service nội bộ mà chỉ giao tiếp qua API Gateway. Mỗi backend service sở hữu một miền nghiệp vụ và một PostgreSQL database riêng trong một Supabase project riêng, đồng thời có thể build/deploy độc lập bằng Docker.

Phạm vi MVP gồm đúng 6 backend service:

1. API Gateway
2. User Service
3. Doctor Service
4. Appointment Service
5. Medical Record Service
6. Notification Service

Hai nền tảng frontend độc lập:

1. Patient App: Flutter Android
2. Clinic Management Web: Next.js

Supabase được dùng cho PostgreSQL và có thể dùng Supabase Auth để đăng ký, đăng nhập, phát hành JWT. User Service không lưu mật khẩu, chỉ quản lý hồ sơ, vai trò và thông tin nghiệp vụ.

## 2. Sơ Đồ Kiến Trúc Hệ Thống

```text
                    +---------------------+
                    |     Patient App     |
                    +----------+----------+
                               |
                    +----------v----------+
                    | Clinic Management   |
                    | Web                 |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    |     API Gateway     |
                    | auth, role, CORS,   |
                    | rate limit, logs    |
                    +--+-----+-----+---+--+
                       |     |     |   |
       +---------------+     |     |   +----------------+
       |                     |     |                    |
+------v------+      +-------v-----+   +----------------v--+
| User Service|      | Doctor      |   | Appointment       |
| profiles,   |      | Service     |   | Service           |
| roles       |      | schedules   |   | booking workflow  |
+------+------+      +-------+-----+   +---------+---------+
       |                     |                   |
       |                     |                   |
       |              internal HTTP             | event/HTTP
       |                     |                   v
       |              +------v---------+   +-----+------------+
       |              | Medical Record |   | Notification     |
       |              | Service        |   | Service          |
       |              +------+---------+   +-----+------------+
       |                     |                   |
       +---------------------+-------------------+
                             |
                             v
                  +------------------------+
                  | Supabase PostgreSQL    |
                  | separate schemas per   |
                  | service                |
                  +------------------------+
```

## 3. Ranh Giới Và Trách Nhiệm Service

### API Gateway

Trách nhiệm:

- Là điểm truy cập duy nhất của Flutter Patient App và Clinic Management Web.
- Xác minh access token từ Supabase Auth.
- Kiểm tra quyền truy cập cơ bản theo role.
- Chuyển tiếp request đến service nội bộ phù hợp.
- Cấu hình CORS, rate limiting và request logging.
- Chuẩn hóa response lỗi.
- Cung cấp health check tổng quát.

Không làm:

- Không chứa nghiệp vụ đặt lịch.
- Không quản lý lịch làm việc bác sĩ.
- Không thao tác hồ sơ bệnh án.
- Không truy cập database nghiệp vụ thay service nội bộ.

### User Service

Quản lý:

- Tài khoản người dùng.
- Hồ sơ bệnh nhân.
- Vai trò: `PATIENT`, `DOCTOR`, `STAFF`, `ADMIN`.
- Trạng thái tài khoản.
- Thông tin liên hệ.
- Liên kết giữa người dùng và Supabase Auth thông qua `supabase_auth_user_id`.

Nếu sử dụng Supabase Auth:

- Supabase Auth chịu trách nhiệm lưu thông tin đăng nhập và phát hành JWT.
- User Service quản lý profile, role và thông tin nghiệp vụ.
- Không tự xây dựng lại hệ thống lưu mật khẩu.
- Không lưu mật khẩu trong bảng profile.

### Doctor Service

Quản lý:

- Hồ sơ bác sĩ.
- Chuyên khoa.
- Thông tin giới thiệu bác sĩ.
- Lịch làm việc.
- Ca làm việc.
- Khoảng thời gian nghỉ hoặc không nhận lịch.
- Khung giờ khám.

Cung cấp API nội bộ để Appointment Service kiểm tra:

- Bác sĩ có tồn tại hay không.
- Bác sĩ có đang hoạt động hay không.
- Khung giờ có thuộc lịch làm việc hay không.
- Khung giờ có bị khóa, nghỉ hoặc không nhận lịch hay không.

### Appointment Service

Đây là service trung tâm của nghiệp vụ đặt lịch.

Quản lý:

- Tạo lịch hẹn.
- Xem lịch hẹn.
- Đổi lịch.
- Hủy lịch.
- Xác nhận lịch.
- Check-in.
- Hoàn thành buổi khám.
- Đánh dấu bệnh nhân không đến.
- Kiểm tra trùng lịch.
- Kiểm soát trạng thái lịch hẹn.

Các trạng thái chính:

- `PENDING`
- `CONFIRMED`
- `CHECKED_IN`
- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

Luồng trạng thái hợp lệ:

```text
PENDING    -> CONFIRMED
PENDING    -> CANCELLED
CONFIRMED  -> CHECKED_IN
CONFIRMED  -> CANCELLED
CONFIRMED  -> NO_SHOW
CHECKED_IN -> COMPLETED
```

Không cho phép chuyển trạng thái tùy ý.

### Medical Record Service

Quản lý:

- Kết quả của từng lần khám.
- Triệu chứng.
- Chẩn đoán.
- Ghi chú của bác sĩ.
- Chỉ định điều trị.
- Đơn thuốc cơ bản trong MVP.
- Lịch sử khám của bệnh nhân.

Quy tắc:

- Chỉ bác sĩ phụ trách lịch hẹn hoặc người có quyền phù hợp mới được tạo hồ sơ khám.
- Chỉ tạo hồ sơ khám cho appointment hợp lệ.
- Bệnh nhân chỉ được xem hồ sơ của chính mình.
- Nhân viên thông thường không được chỉnh sửa nội dung chẩn đoán.
- Hồ sơ bệnh án không bị xóa vật lý một cách tùy tiện.
- Cần lưu `created_at`, `updated_at`, `created_by`, `updated_by`.

### Notification Service

Quản lý:

- Thông báo xác nhận đặt lịch.
- Thông báo đổi hoặc hủy lịch.
- Nhắc lịch khám.
- Thông báo kết quả khám đã được cập nhật.
- Trạng thái gửi thông báo.
- Lịch sử gửi và lỗi gửi.

Trong MVP, việc gửi email hoặc SMS được mô phỏng bằng cách lưu thông báo vào database, ghi log và hiển thị thông báo trên frontend.

## 4. Actor Và Use Case

### PATIENT

- Đăng ký và đăng nhập.
- Quản lý hồ sơ cá nhân.
- Xem danh sách chuyên khoa.
- Tìm kiếm và xem thông tin bác sĩ.
- Xem lịch làm việc và khung giờ còn trống.
- Đặt lịch khám.
- Xem danh sách lịch hẹn.
- Đổi hoặc hủy lịch hẹn khi được phép.
- Xem trạng thái lịch hẹn.
- Xem lịch sử khám và kết quả khám của chính mình.
- Xem thông báo xác nhận hoặc nhắc lịch.

### STAFF

- Xem danh sách lịch hẹn.
- Xác nhận hoặc hủy lịch.
- Check-in bệnh nhân.
- Tìm kiếm bệnh nhân.
- Quản lý lịch hẹn trong ngày.

### DOCTOR

- Xem lịch khám cá nhân.
- Xem bệnh nhân đã check-in.
- Xem thông tin cần thiết của bệnh nhân.
- Cập nhật trạng thái buổi khám.
- Tạo kết quả khám, chẩn đoán, ghi chú và đơn thuốc cơ bản.

### ADMIN

- Quản lý tài khoản và vai trò.
- Quản lý bác sĩ.
- Quản lý chuyên khoa.
- Quản lý lịch làm việc của bác sĩ.
- Theo dõi trạng thái hoạt động cơ bản của hệ thống.

## 5. Luồng Nghiệp Vụ Đặt Lịch

```text
1. Bệnh nhân đăng nhập bằng Supabase Auth.
2. Flutter Patient App gửi request qua API Gateway kèm access token.
3. Gateway yêu cầu User Service xác minh token và trả role PATIENT đáng tin cậy.
4. Bệnh nhân chọn chuyên khoa.
5. Gateway gọi Doctor Service để lấy danh sách bác sĩ.
6. Bệnh nhân chọn bác sĩ và ngày khám.
7. Gateway gọi Doctor Service để lấy khung giờ khả dụng.
8. Bệnh nhân gửi yêu cầu đặt lịch đến Gateway.
9. Gateway chuyển request đến Appointment Service.
10. Appointment Service gọi Doctor Service để xác minh bác sĩ và khung giờ.
11. Appointment Service kiểm tra xung đột lịch.
12. Appointment Service tạo appointment trong transaction.
13. Database constraint ngăn double booking.
14. Appointment Service lưu appointment ở trạng thái PENDING hoặc CONFIRMED.
15. Appointment Service phát event hoặc gọi Notification Service.
16. Notification Service tạo thông báo xác nhận.
17. Nhân viên phòng khám xác nhận và check-in bệnh nhân.
18. Bác sĩ khám và tạo medical record.
19. Medical Record Service xác minh appointment qua Appointment Service.
20. Appointment Service chuyển appointment sang COMPLETED.
21. Notification Service thông báo kết quả khám đã được cập nhật.
```

Trong MVP, hệ thống tránh distributed transaction phức tạp. Nếu Notification Service thất bại, Appointment Service vẫn giữ appointment đã tạo và ghi event để retry.

## 6. Bảng Phân Quyền

| Chức năng | PATIENT | STAFF | DOCTOR | ADMIN |
|---|---:|---:|---:|---:|
| Đăng ký/đăng nhập | Yes | Yes | Yes | Yes |
| Xem/cập nhật hồ sơ cá nhân | Own | Limited | Own | Any |
| Xem chuyên khoa | Yes | Yes | Yes | Yes |
| Xem bác sĩ | Yes | Yes | Yes | Yes |
| Quản lý bác sĩ | No | No | No | Yes |
| Quản lý chuyên khoa | No | No | No | Yes |
| Quản lý lịch làm việc bác sĩ | No | No | Own/Limited | Yes |
| Đặt lịch | Own | For patient | No | For patient |
| Xem lịch hẹn | Own | All/Clinic | Own | All |
| Đổi/hủy lịch | Own if allowed | Yes | Limited | Yes |
| Xác nhận lịch | No | Yes | No | Yes |
| Check-in | No | Yes | No | Yes |
| Đánh dấu no-show | No | Yes | Limited | Yes |
| Tạo kết quả khám | No | No | Assigned only | Yes/Limited |
| Sửa chẩn đoán | No | No | Assigned only | Yes/Limited |
| Xem medical record | Own | Limited metadata | Assigned only | All |
| Xem thông báo | Own | Related | Related | All |
| Theo dõi health hệ thống | No | No | No | Yes |

## 7. Danh Sách API Theo Service

Tất cả API public qua Gateway dùng prefix `/api/v1`.

### API Gateway

- `GET /health`
- `GET /api/v1/system/health`
- Proxy `/api/v1/auth/*` đến User Service hoặc tích hợp Supabase Auth.
- Proxy `/api/v1/users/*` đến User Service.
- Proxy `/api/v1/patients/*` đến User Service.
- Proxy `/api/v1/doctors/*` đến Doctor Service.
- Proxy `/api/v1/specialties/*` đến Doctor Service.
- Proxy `/api/v1/schedules/*` đến Doctor Service.
- Proxy `/api/v1/appointments/*` đến Appointment Service.
- Proxy `/api/v1/medical-records/*` đến Medical Record Service.
- Proxy `/api/v1/notifications/*` đến Notification Service.

### User Service

- `GET /health`
- `GET /api/v1/auth/me`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id/status`
- `PATCH /api/v1/users/:id/role`
- `GET /api/v1/patients`
- `GET /api/v1/patients/:id`
- `PATCH /api/v1/patients/:id`

### Doctor Service

- `GET /health`
- `GET /api/v1/specialties`
- `POST /api/v1/specialties`
- `PATCH /api/v1/specialties/:id`
- `GET /api/v1/doctors`
- `POST /api/v1/doctors`
- `GET /api/v1/doctors/:id`
- `PATCH /api/v1/doctors/:id`
- `GET /api/v1/doctors/:id/schedules`
- `POST /api/v1/doctors/:id/schedules`
- `PATCH /api/v1/schedules/:id`
- `GET /api/v1/doctors/:id/available-slots?date=YYYY-MM-DD`
- `POST /internal/v1/doctors/verify-slot`

### Appointment Service

- `GET /health`
- `GET /api/v1/appointments`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments/:id`
- `PATCH /api/v1/appointments/:id/reschedule`
- `PATCH /api/v1/appointments/:id/cancel`
- `PATCH /api/v1/appointments/:id/confirm`
- `PATCH /api/v1/appointments/:id/check-in`
- `PATCH /api/v1/appointments/:id/complete`
- `PATCH /api/v1/appointments/:id/no-show`
- `GET /internal/v1/appointments/:id/verify-for-medical-record`

### Medical Record Service

- `GET /health`
- `GET /api/v1/medical-records`
- `POST /api/v1/medical-records`
- `GET /api/v1/medical-records/:id`
- `PATCH /api/v1/medical-records/:id`
- `GET /api/v1/medical-records?patientId=:patientId`
- `GET /internal/v1/medical-records/by-appointment/:appointmentId`

### Notification Service

- `GET /health`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/:id`
- `PATCH /api/v1/notifications/:id/read`
- `POST /api/v1/notifications`
- `POST /internal/v1/notifications`
- `POST /internal/v1/notifications/events/appointment-created`
- `POST /internal/v1/notifications/events/appointment-updated`
- `POST /internal/v1/notifications/events/medical-record-created`

## 8. Thiết Kế Database Theo Supabase Schema

Dùng một Supabase project/database riêng cho mỗi service nghiệp vụ. Tên schema vẫn được giữ theo service để thể hiện quyền sở hữu và tránh phụ thuộc vào `public`. Migration của mỗi service nằm tại `infrastructure/supabase/<service>/schema.sql` và chỉ được chạy trên database của service đó.

### `user_service`

`users`:

- `id uuid primary key`
- `supabase_auth_user_id uuid unique not null`
- `email text not null`
- `full_name text not null`
- `phone text`
- `role text not null`
- `status text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`patient_profiles`:

- `id uuid primary key`
- `user_id uuid not null`
- `date_of_birth date`
- `gender text`
- `address text`
- `emergency_contact text`
- `insurance_number text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `doctor_service`

`specialties`:

- `id uuid primary key`
- `name text not null`
- `description text`
- `is_active boolean not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`doctors`:

- `id uuid primary key`
- `user_id uuid not null`
- `specialty_id uuid not null`
- `display_name text not null`
- `bio text`
- `is_active boolean not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`doctor_schedules`:

- `id uuid primary key`
- `doctor_id uuid not null`
- `weekday int not null`
- `start_time time not null`
- `end_time time not null`
- `slot_duration_minutes int not null`
- `is_active boolean not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`doctor_time_offs`:

- `id uuid primary key`
- `doctor_id uuid not null`
- `start_at timestamptz not null`
- `end_at timestamptz not null`
- `reason text`
- `created_at timestamptz not null`

### `appointment_service`

`appointments`:

- `id uuid primary key`
- `patient_id uuid not null`
- `doctor_id uuid not null`
- `specialty_id uuid`
- `scheduled_start_at timestamptz not null`
- `scheduled_end_at timestamptz not null`
- `reason text`
- `status text not null`
- `idempotency_key text`
- `created_by uuid not null`
- `updated_by uuid`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint:

- Unique partial index trên `(doctor_id, scheduled_start_at)` với status còn hiệu lực: `PENDING`, `CONFIRMED`, `CHECKED_IN`.
- Unique partial index trên `idempotency_key` nếu khác null.

`appointment_status_history`:

- `id uuid primary key`
- `appointment_id uuid not null`
- `from_status text`
- `to_status text not null`
- `changed_by uuid not null`
- `reason text`
- `created_at timestamptz not null`

`appointment_outbox_events`:

- `id uuid primary key`
- `event_type text not null`
- `aggregate_id uuid not null`
- `payload jsonb not null`
- `status text not null`
- `retry_count int not null`
- `created_at timestamptz not null`
- `processed_at timestamptz`

### `medical_record_service`

`medical_records`:

- `id uuid primary key`
- `appointment_id uuid not null`
- `patient_id uuid not null`
- `doctor_id uuid not null`
- `symptoms text`
- `diagnosis text`
- `notes text`
- `treatment_plan text`
- `prescription jsonb`
- `status text not null`
- `created_by uuid not null`
- `updated_by uuid`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz`

`medical_record_audit_logs`:

- `id uuid primary key`
- `medical_record_id uuid not null`
- `actor_id uuid not null`
- `action text not null`
- `changes jsonb`
- `created_at timestamptz not null`

### `notification_service`

`notifications`:

- `id uuid primary key`
- `recipient_user_id uuid not null`
- `type text not null`
- `title text not null`
- `message text not null`
- `payload jsonb`
- `status text not null`
- `read_at timestamptz`
- `created_at timestamptz not null`

`notification_deliveries`:

- `id uuid primary key`
- `notification_id uuid not null`
- `channel text not null`
- `status text not null`
- `error_message text`
- `sent_at timestamptz`
- `created_at timestamptz not null`

## 9. Quan Hệ Logic Giữa Các Bảng

Không dùng foreign key xuyên schema service. Các quan hệ dưới đây là tham chiếu logic:

- `doctor_service.doctors.user_id` tham chiếu logic đến `user_service.users.id`.
- `appointment_service.appointments.patient_id` tham chiếu logic đến `user_service.patient_profiles.id`.
- `appointment_service.appointments.doctor_id` tham chiếu logic đến `doctor_service.doctors.id`.
- `appointment_service.appointments.specialty_id` tham chiếu logic đến `doctor_service.specialties.id`.
- `medical_record_service.medical_records.appointment_id` tham chiếu logic đến `appointment_service.appointments.id`.
- `medical_record_service.medical_records.patient_id` tham chiếu logic đến User Service.
- `medical_record_service.medical_records.doctor_id` tham chiếu logic đến Doctor Service.
- `notification_service.notifications.recipient_user_id` tham chiếu logic đến `user_service.users.id`.

Khi cần dữ liệu chi tiết, service phải gọi API của service sở hữu dữ liệu.

## 10. Xác Thực Và Phân Quyền

### Xác thực

- Supabase Auth quản lý đăng ký, đăng nhập và refresh token.
- Frontend gọi các endpoint `/api/v1/auth/*` qua API Gateway; Gateway proxy tới User Service và chỉ User Service giao tiếp với Supabase Auth.
- Frontend nhận access token từ API Gateway và không nhận URL/key Supabase.
- Frontend gửi request đến API Gateway với `Authorization: Bearer <token>`.
- API Gateway gọi endpoint nội bộ của User Service để xác minh token và lấy profile/role đáng tin cậy.
- User Service xác minh token bằng Supabase Auth; có thể tối ưu bằng JWKS nội bộ ở giai đoạn sau mà không đưa Supabase credential sang Gateway.

### Phân quyền

- Gateway kiểm tra role cơ bản theo route.
- Service nội bộ vẫn kiểm tra rule nghiệp vụ quan trọng.
- Patient chỉ được xem/sửa dữ liệu của chính mình.
- Doctor chỉ được tạo record cho appointment được gán.
- Staff được thao tác lịch hẹn nhưng không được sửa chẩn đoán.
- Admin có quyền quản trị, nhưng các hành động nhạy cảm vẫn cần audit log.

### Bảo mật biến môi trường

- Frontend chỉ có URL của API Gateway, tuyệt đối không có Supabase URL/key, service URL nội bộ hoặc database URL.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` và `SUPABASE_SERVICE_ROLE_KEY` nếu dùng chỉ nằm trong env của User Service.
- Không commit `.env`.
- Log và response lỗi production không trả token, service key hoặc stack trace.

## 11. Cách Ngăn Double Booking

Appointment Service không chỉ kiểm tra bằng code rồi insert. Cần dùng database constraint và transaction.

Đề xuất:

```sql
CREATE UNIQUE INDEX unique_active_doctor_slot
ON appointment_service.appointments (doctor_id, scheduled_start_at)
WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN');
```

Luồng tạo lịch:

1. Nhận request với `Idempotency-Key`.
2. Gọi Doctor Service verify doctor và slot.
3. Bắt đầu transaction.
4. Insert appointment.
5. Nếu unique constraint conflict, trả lỗi chuẩn `APPOINTMENT_SLOT_UNAVAILABLE`.
6. Ghi outbox event trong cùng transaction.
7. Commit.

Response lỗi:

```json
{
  "success": false,
  "error": {
    "code": "APPOINTMENT_SLOT_UNAVAILABLE",
    "message": "Khung giờ đã được đặt",
    "details": []
  }
}
```

Idempotency:

- Client gửi `Idempotency-Key` khi tạo lịch.
- Appointment Service lưu key kèm patient/doctor/slot.
- Nếu retry cùng key, trả lại appointment đã tạo thay vì tạo bản ghi mới.

## 12. Cách Giao Tiếp Giữa Các Service

### MVP đề xuất

- Frontend -> API Gateway: HTTP REST.
- API Gateway -> internal services: HTTP REST.
- Appointment Service -> Doctor Service: HTTP nội bộ để verify doctor/slot.
- Medical Record Service -> Appointment Service: HTTP nội bộ để verify appointment.
- Appointment/Medical Record -> Notification: event abstraction; MVP có thể gọi HTTP nội bộ.

Ưu điểm của HTTP nội bộ trong MVP:

- Dễ cài đặt và dễ debug.
- Phù hợp tiến độ đồ án môn học.
- Không cần vận hành RabbitMQ ngay từ đầu.

Nhược điểm:

- Coupling runtime cao hơn.
- Notification có thể fail làm luồng chính chậm nếu gọi đồng bộ.
- Retry cần tự cài đặt.

Khuyến nghị:

- Viết `EventPublisher` interface trong Appointment Service và Medical Record Service.
- MVP implementation: HTTP call đến Notification Service kết hợp outbox table.
- Phase sau: thay implementation bằng RabbitMQ mà không đổi business logic.

## 13. Biến Môi Trường Cần Thiết

### API Gateway

- `GATEWAY_PORT`
- `NODE_ENV`
- `AUTH_DEV_MODE` chỉ bật cho local, bắt buộc tắt trong production
- `CORS_ORIGINS`
- `USER_SERVICE_URL`
- `DOCTOR_SERVICE_URL`
- `APPOINTMENT_SERVICE_URL`
- `MEDICAL_RECORD_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `AUTH_TIMEOUT_MS`
- `HEALTH_CHECK_TIMEOUT_MS`
- `PROXY_TIMEOUT_MS`

### User Service

- `USER_SERVICE_PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_SSL_REJECT_UNAUTHORIZED`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `LOG_LEVEL`

### Doctor Service

- `DOCTOR_SERVICE_PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `LOG_LEVEL`

### Appointment Service

- `APPOINTMENT_SERVICE_PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DOCTOR_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `LOG_LEVEL`

### Medical Record Service

- `MEDICAL_RECORD_SERVICE_PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `APPOINTMENT_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `LOG_LEVEL`

### Notification Service

- `NOTIFICATION_SERVICE_PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_SSL_REJECT_UNAUTHORIZED`
- `LOG_LEVEL`
- `EMAIL_PROVIDER_API_KEY` tùy chọn cho phase sau
- `SMS_PROVIDER_API_KEY` tùy chọn cho phase sau

### Frontend

- `NEXT_PUBLIC_API_BASE_URL` cho Clinic Management Web.
- Patient App nhận địa chỉ Gateway qua `--dart-define=API_BASE_URL=...`.

## 14. Cấu Trúc Thư Mục Monorepo

```text
clinic-appointment-system/
├── apps/
│   ├── patient-app/              # Flutter Android
│   └── clinic-management-web/    # Next.js web quản lý phòng khám
├── gateway/
│   └── api-gateway/
├── services/
│   ├── user-service/
│   ├── doctor-service/
│   ├── appointment-service/
│   ├── medical-record-service/
│   └── notification-service/
├── packages/
│   ├── shared-types/
│   └── shared-config/
├── infrastructure/
│   ├── docker/
│   ├── supabase/
│   └── compose/
├── docs/
└── README.md
```

Quy tắc `packages`:

- Được chứa shared TypeScript types cho API response/error.
- Được chứa lint/tsconfig base.
- Được chứa tiện ích kỹ thuật chung như logger interface.
- Không chứa business logic.
- Không chứa repository.
- Không chứa ORM model/database model dùng chung.

## 15. Kế Hoạch Triển Khai Theo Giai Đoạn

### Phase 1: Thiết kế và contract

- Chốt kiến trúc.
- Chốt service boundary.
- Viết OpenAPI cho Gateway và từng service.
- Viết Supabase schema SQL riêng cho từng service.
- Chốt error format, pagination format và auth strategy.

### Phase 2: Scaffold repo

- Tạo monorepo đúng cấu trúc đã chốt.
- Tạo Flutter Android Patient App và web quản lý phòng khám.
- Tạo 6 Express TypeScript service.
- Thêm Dockerfile cho từng service.
- Thêm Docker Compose cho local.
- Thêm shared config/type thuần kỹ thuật.

### Phase 3: Auth và User Service

- Tích hợp Supabase Auth.
- User Service quản lý profile/role.
- Gateway áp dụng auth policy bằng kết quả xác minh token/role từ User Service.
- Patient App đăng ký/đăng nhập.

### Phase 4: Doctor Service

- CRUD specialty.
- CRUD doctor.
- Quản lý schedule/time off.
- API available slots.
- Internal verify slot API.

### Phase 5: Appointment Service

- Tạo/xem/đổi/hủy lịch.
- State machine appointment.
- Unique constraint ngăn double booking.
- Idempotency key.
- Outbox event cho notification.

### Phase 6: Clinic Management Web

- Staff xem/xác nhận/check-in lịch.
- Doctor xem lịch khám.
- Admin quản lý doctor/specialty/schedule.

### Phase 7: Medical Record Service

- Tạo kết quả khám.
- Ghi chẩn đoán, notes, treatment và prescription cơ bản.
- Patient xem lịch sử khám của mình.
- Audit log thay đổi.

### Phase 8: Notification Service

- Lưu notification.
- Hiển thị notification trên frontend.
- Mô phỏng send bằng log.
- Retry notification failed.

### Phase 9: Hardening và demo

- Swagger cho từng service.
- Health check tổng quát.
- Logging chuẩn hóa.
- Error response chuẩn.
- Seed data demo.
- README hướng dẫn chạy local.
- Test các luồng chính.

## Quyết Định MVP Đề Xuất

- Dùng Supabase Auth cho đăng nhập, không tự xây dựng password auth.
- Dùng một Supabase PostgreSQL project/database riêng cho từng service nghiệp vụ; không dùng chung connection string.
- Dùng HTTP nội bộ trong MVP, thiết kế `EventPublisher` để sau này thay RabbitMQ.
- Appointment Service dùng transaction, unique partial index và idempotency key để ngăn double booking.
- Medical Record Service quản lý đơn thuốc cơ bản trong chính service này.
- Không thêm Payment Service, Prescription Service hay service mới trong MVP.
