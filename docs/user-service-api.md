# Tài Liệu Kỹ Thuật API: User Service & Xác Thực

> **Chủ sở hữu**: Thành viên 2 (User Service, Xác thực Supabase Auth, Hồ sơ bệnh nhân)  
> **Phiên bản**: v1.0.0  
> **Cập nhật lần cuối**: 2026-09-24  
> **Nhánh phát triển**: `feature/user-001-profile-and-auth`

---

## 1. Giới Thiệu & Nguyên Tắc Kiến Trúc

### 1.1. Phạm vi của User Service
User Service chịu trách nhiệm độc quyền:
1. **Xác thực người dùng**: Tích hợp với Supabase Auth (đăng ký, đăng nhập, làm mới token, thu hồi phiên).
2. **Cung cấp danh tính cho hệ thống**: Là nguồn chân lý (source of truth) duy nhất cho thông tin người dùng và vai trò (`Role`).
3. **Quản lý hồ sơ người dùng (`users`)**: Thông tin liên hệ (`email`, `phone`, `fullName`), trạng thái tài khoản (`status`), vai trò (`role`).
4. **Quản lý hồ sơ bệnh nhân (`patient_profiles`)**: Thông tin y tế bổ trợ (`dateOfBirth`, `gender`, `address`, `emergencyContact`, `insuranceNumber`).
5. **Cơ sở dữ liệu độc lập**: Quản lý schema `user_service` trong PostgreSQL; không chia sẻ kết nối hay truy vấn trực tiếp với database của các service khác.

### 1.2. Luồng Định Tuyến
```
[Client / Frontend]
        |
        v  (Public request qua Gateway URL: http://localhost:8080)
[API Gateway]
   |---> (Nếu cần xác thực: gọi /internal/v1/auth/verify của User Service)
   |---> (Gắn header tin cậy: X-User-Id, X-Role, X-Request-Id)
        |
        v
[User Service] (Port nội bộ 3001)
        |
   [PostgreSQL - user_service schema]
```

- **Mọi request public** từ Flutter hoặc Next.js đều phải đi qua **API Gateway**.
- **Header bảo mật**: Gateway tự động xóa bỏ `X-User-Id` và `X-Role` do client gửi lên, sau đó xác minh token và gắn lại giá trị tin cậy trước khi forward tới User Service.
- **Không lưu mật khẩu**: Mật khẩu tài khoản chỉ được xử lý qua Supabase Auth; bảng `user_service.users` tuyệt đối không lưu password hash.

---

## 2. Danh Mục Vai Trò & Trạng Thái

### 2.1. Vai trò (`Role`)
- `PATIENT`: Bệnh nhân đăng ký qua cổng công khai. Chỉ xem/sửa được dữ liệu của chính mình.
- `DOCTOR`: Bác sĩ phòng khám. Có quyền tra cứu danh sách bệnh nhân và xem hồ sơ bệnh nhân trong phạm vi khám.
- `STAFF`: Nhân viên phòng khám / lễ tân. Có quyền tìm kiếm bệnh nhân, xem hồ sơ để đặt lịch và check-in.
- `ADMIN`: Quản trị viên hệ thống. Có quyền quản lý toàn bộ tài khoản, thay đổi vai trò và cập nhật trạng thái người dùng.

### 2.2. Trạng thái tài khoản (`Status`)
- `ACTIVE`: Tài khoản hoạt động bình thường, được phép đăng nhập và thao tác.
- `INACTIVE`: Tài khoản chưa kích hoạt hoặc tạm ngưng. Bị chặn đăng nhập và từ chối các request nghiệp vụ (`403 ACCOUNT_INACTIVE`).
- `LOCKED`: Tài khoản bị khóa do vi phạm hoặc lý do an ninh. Bị chặn đăng nhập và từ chối mọi thao tác (`403 ACCOUNT_LOCKED`).

---

## 3. Danh Sách Endpoint Chi Tiết

### 3.1. Nhóm Xác Thực Public (`/api/v1/auth`)

#### 1. Đăng ký tài khoản bệnh nhân: `POST /api/v1/auth/register`
- **Quyền hạn**: Public (Không yêu cầu token).
- **Mục đích**: Người dùng tự đăng ký tài khoản. Vai trò mặc định luôn là `PATIENT`. Hệ thống ngăn chặn việc tự gán quyền đặc biệt.
- **Request Body**:
  ```json
  {
    "fullName": "Nguyễn Văn A",
    "email": "patient@example.com",
    "password": "Password123!"
  }
  ```
- **Validation**:
  - `fullName`: chuỗi, từ 2 đến 120 ký tự.
  - `email`: định dạng email hợp lệ.
  - `password`: chuỗi, từ 6 đến 128 ký tự.
- **Response thành công** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "v1.refr...",
      "expiresIn": 3600,
      "user": {
        "id": "11111111-1111-4111-8111-111111111111",
        "role": "PATIENT"
      },
      "requiresEmailConfirmation": false
    }
  }
  ```
- **Lỗi thường gặp**:
  - `400 VALIDATION_ERROR`: Body thiếu trường hoặc không đúng định dạng.
  - `400 AUTH_REGISTRATION_FAILED`: Email đã được đăng ký hoặc Supabase từ chối.

---

#### 2. Đăng nhập: `POST /api/v1/auth/login`
- **Quyền hạn**: Public.
- **Mục đích**: Đăng nhập bằng email và mật khẩu.
- **Request Body**:
  ```json
  {
    "email": "doctor@clinic.com",
    "password": "Password123!"
  }
  ```
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "v1.refr...",
      "expiresIn": 3600,
      "user": {
        "id": "22222222-2222-4222-8222-222222222222",
        "role": "DOCTOR"
      }
    }
  }
  ```
- **Lỗi thường gặp**:
  - `401 AUTH_INVALID_CREDENTIALS`: Email hoặc mật khẩu không chính xác.
  - `403 ACCOUNT_LOCKED`: Tài khoản đang bị khóa.
  - `403 ACCOUNT_INACTIVE`: Tài khoản chưa kích hoạt.
  - `403 USER_PROFILE_NOT_FOUND`: Tài khoản Supabase chưa được liên kết hồ sơ ứng dụng.

---

#### 3. Làm mới phiên: `POST /api/v1/auth/refresh`
- **Quyền hạn**: Public.
- **Request Body**:
  ```json
  {
    "refreshToken": "v1.refr..."
  }
  ```
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi...new...",
      "refreshToken": "v1.refr...new...",
      "expiresIn": 3600,
      "user": {
        "id": "22222222-2222-4222-8222-222222222222",
        "role": "DOCTOR"
      }
    }
  }
  ```
- **Lỗi thường gặp**:
  - `401 AUTH_REFRESH_INVALID`: Refresh token đã hết hạn hoặc không hợp lệ.
  - `403 ACCOUNT_LOCKED`: Tài khoản đã bị khóa kể từ lần cấp token trước.

---

#### 4. Đăng xuất: `POST /api/v1/auth/logout`
- **Quyền hạn**: Yêu cầu đã đăng nhập (`Authorization: Bearer <accessToken>`).
- **Request Body**:
  ```json
  {
    "refreshToken": "v1.refr..."
  }
  ```
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": null
  }
  ```

---

#### 5. Lấy tài khoản hiện tại: `GET /api/v1/auth/me`
- **Quyền hạn**: Bất kỳ người dùng đã đăng nhập.
- **Header**: Gateway chuyển tiếp `X-User-Id`.
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "id": "11111111-1111-4111-8111-111111111111",
      "email": "patient@example.com",
      "fullName": "Nguyễn Văn A",
      "phone": "0901234567",
      "role": "PATIENT",
      "status": "ACTIVE",
      "createdAt": "2026-09-20T08:00:00.000Z",
      "updatedAt": "2026-09-24T03:30:00.000Z"
    }
  }
  ```

---

### 3.2. Nhóm Quản Lý Hồ Sơ Cá Nhân (`/api/v1/users/me`)

#### 6. Xem hồ sơ chi tiết của tôi: `GET /api/v1/users/me`
- **Quyền hạn**: `PATIENT`, `DOCTOR`, `STAFF`, `ADMIN`.
- **Response thành công** (`200 OK`): Trả về thông tin user. Nếu là `PATIENT`, trả kèm trường `patientProfile`.
  ```json
  {
    "success": true,
    "data": {
      "id": "11111111-1111-4111-8111-111111111111",
      "email": "patient@example.com",
      "fullName": "Nguyễn Văn A",
      "phone": "0901234567",
      "role": "PATIENT",
      "status": "ACTIVE",
      "patientProfile": {
        "id": "33333333-3333-4333-8333-333333333333",
        "userId": "11111111-1111-4111-8111-111111111111",
        "dateOfBirth": "1995-05-15",
        "gender": "MALE",
        "address": "123 Lê Lợi, Quận 1, TP.HCM",
        "emergencyContact": "0988776655",
        "insuranceNumber": "DN4791234567890"
      }
    }
  }
  ```

#### 7. Cập nhật hồ sơ cá nhân: `PATCH /api/v1/users/me`
- **Quyền hạn**: `PATIENT`, `DOCTOR`, `STAFF`, `ADMIN`.
- **Request Body**:
  ```json
  {
    "fullName": "Nguyễn Văn A (Cập nhật)",
    "phone": "0912345678"
  }
  ```
- **Bảo mật**: Schema cấm tuyệt đối cập nhật `role` hoặc `status` (`strict schema`). Gửi kèm các trường này sẽ bị trả lỗi `400 VALIDATION_ERROR`.
- **Response thành công** (`200 OK`): Trả về thông tin user đã cập nhật.

---

### 3.3. Nhóm Quản Trị Người Dùng (`/api/v1/users` - Dành cho ADMIN)

#### 8. Danh sách người dùng: `GET /api/v1/users`
- **Quyền hạn**: `ADMIN`.
- **Query Parameters**:
  - `page`: số nguyên >= 1 (Mặc định: 1)
  - `limit`: số nguyên 1..100 (Mặc định: 20)
  - `role`: lọc theo vai trò (`PATIENT`, `DOCTOR`, `STAFF`, `ADMIN`)
  - `status`: lọc theo trạng thái (`ACTIVE`, `INACTIVE`, `LOCKED`)
  - `q`: từ khóa tìm kiếm (tìm gần đúng theo họ tên, email hoặc số điện thoại)
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "email": "doctor.ha@clinic.com",
          "fullName": "BS. Nguyễn Văn Hà",
          "phone": "0987654321",
          "role": "DOCTOR",
          "status": "ACTIVE",
          "createdAt": "2026-09-20T08:00:00.000Z",
          "updatedAt": "2026-09-20T08:00:00.000Z"
        }
      ],
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
  ```
- **Lỗi**: `403 ACCESS_DENIED` nếu không phải ADMIN.

#### 9. Xem chi tiết người dùng: `GET /api/v1/users/{id}`
- **Quyền hạn**: `ADMIN`.
- **Response thành công** (`200 OK`): Trả về chi tiết người dùng tương ứng với ID.
- **Lỗi**: `404 USER_NOT_FOUND` nếu ID không tồn tại.

#### 10. Khóa / Mở khóa tài khoản: `PATCH /api/v1/users/{id}/status`
- **Quyền hạn**: `ADMIN`.
- **Request Body**:
  ```json
  {
    "status": "LOCKED"
  }
  ```
- **Giá trị hợp lệ**: `"ACTIVE"`, `"INACTIVE"`, `"LOCKED"`.
- **Response thành công** (`200 OK`).

#### 11. Phân quyền vai trò người dùng: `PATCH /api/v1/users/{id}/role`
- **Quyền hạn**: `ADMIN`.
- **Request Body**:
  ```json
  {
    "role": "STAFF"
  }
  ```
- **Giá trị hợp lệ**: `"PATIENT"`, `"DOCTOR"`, `"STAFF"`, `"ADMIN"`.
- **Response thành công** (`200 OK`).

---

### 3.4. Nhóm Quản Lý Bệnh Nhân (`/api/v1/patients`)

#### 12. Danh sách / Tìm kiếm bệnh nhân: `GET /api/v1/patients`
- **Quyền hạn**: `DOCTOR`, `STAFF`, `ADMIN`.
- **Mục đích**: Cung cấp danh sách và công cụ tìm kiếm bệnh nhân cho nhân viên lễ tân đặt lịch, bác sĩ tra cứu.
- **Query Parameters**:
  - `page`: số nguyên >= 1 (Mặc định: 1)
  - `limit`: số nguyên 1..100 (Mặc định: 20)
  - `q`: từ khóa tìm kiếm (họ tên, số điện thoại, email hoặc mã thẻ BHYT)
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "33333333-3333-4333-8333-333333333333",
          "userId": "11111111-1111-4111-8111-111111111111",
          "fullName": "Nguyễn Văn A",
          "email": "patient@example.com",
          "phone": "0901234567",
          "dateOfBirth": "1995-05-15",
          "gender": "MALE",
          "address": "123 Lê Lợi, Quận 1, TP.HCM",
          "emergencyContact": "0988776655",
          "insuranceNumber": "DN4791234567890",
          "createdAt": "2026-09-20T08:00:00.000Z",
          "updatedAt": "2026-09-24T03:30:00.000Z"
        }
      ],
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
  ```

#### 13. Xem chi tiết hồ sơ bệnh nhân: `GET /api/v1/patients/{id}`
- **Quyền hạn**:
  - `PATIENT`: Chỉ xem được hồ sơ bệnh nhân của chính mình (`patient.userId === actor.userId`).
  - `DOCTOR`, `STAFF`, `ADMIN`: Được xem hồ sơ.
- **Lỗi**:
  - `403 ACCESS_DENIED`: Bệnh nhân cố tình đọc hồ sơ người khác.
  - `404 PATIENT_NOT_FOUND`: Không tìm thấy hồ sơ.

#### 14. Cập nhật hồ sơ bệnh nhân: `PATCH /api/v1/patients/{id}`
- **Quyền hạn**:
  - `PATIENT`: Chỉ cập nhật được hồ sơ của chính mình.
  - `ADMIN`: Có quyền cập nhật.
  - `STAFF`, `DOCTOR`: Không được phép cập nhật (`403 ACCESS_DENIED`).
- **Request Body**:
  ```json
  {
    "dateOfBirth": "1995-05-15",
    "gender": "MALE",
    "address": "456 Nguyễn Thị Minh Khai, Quận 3, TP.HCM",
    "emergencyContact": "0987654321",
    "insuranceNumber": "DN4791234567890"
  }
  ```
- **Response thành công** (`200 OK`).

---

### 3.5. Nhóm Endpoint Nội Bộ Giữa Các Service (`/internal/v1`)

> **Lưu ý**: Các endpoint này không public qua Gateway. Chỉ được gọi trực tiếp giữa các service trong mạng backend nội bộ.

#### 15. Gateway xác minh Token: `GET /internal/v1/auth/verify`
- **Gọi bởi**: `API Gateway` khi kiểm tra access token của request public.
- **Header**: `Authorization: Bearer <accessToken>`.
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "id": "11111111-1111-4111-8111-111111111111",
      "authUserId": "supabase-uuid-...",
      "role": "PATIENT",
      "status": "ACTIVE"
    }
  }
  ```
- **Lỗi**:
  - `401 AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID`: Token không hợp lệ hoặc hết hạn.
  - `404 USER_PROFILE_NOT_FOUND`: Token hợp lệ ở Supabase nhưng chưa có user trong hệ thống.

#### 16. Tra cứu bệnh nhân qua User ID: `GET /internal/v1/patients/by-user/{userId}`
- **Gọi bởi**: `Appointment Service`, `Medical Record Service`.
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "id": "33333333-3333-4333-8333-333333333333",
      "userId": "11111111-1111-4111-8111-111111111111"
    }
  }
  ```

#### 17. Tra cứu bệnh nhân qua Patient ID: `GET /internal/v1/patients/{id}`
- **Gọi bởi**: `Appointment Service`, `Medical Record Service`.
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "id": "33333333-3333-4333-8333-333333333333",
      "userId": "11111111-1111-4111-8111-111111111111"
    }
  }
  ```

#### 18. Health Check: `GET /health`
- **Mục đích**: Docker/k8s liveness và Gateway tổng hợp health.
- **Response thành công** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "service": "user-service",
      "status": "ok"
    }
  }
  ```

---

## 4. Ma Trận Quyền Hạn (Permission Matrix)

| Endpoint | PATIENT | DOCTOR | STAFF | ADMIN |
|---|:---:|:---:|:---:|:---:|
| `POST /api/v1/auth/register` | Public | Public | Public | Public |
| `POST /api/v1/auth/login` | Public | Public | Public | Public |
| `POST /api/v1/auth/refresh` | Public | Public | Public | Public |
| `POST /api/v1/auth/logout` | Có | Có | Có | Có |
| `GET /api/v1/auth/me` | Có | Có | Có | Có |
| `GET /api/v1/users/me` | Có | Có | Có | Có |
| `PATCH /api/v1/users/me` | Hồ sơ mình | Hồ sơ mình | Hồ sơ mình | Hồ sơ mình |
| `GET /api/v1/users` | ❌ | ❌ | ❌ | Có |
| `GET /api/v1/users/{id}` | ❌ | ❌ | ❌ | Có |
| `PATCH /api/v1/users/{id}/status` | ❌ | ❌ | ❌ | Có |
| `PATCH /api/v1/users/{id}/role` | ❌ | ❌ | ❌ | Có |
| `GET /api/v1/patients` | ❌ | Có | Có | Có |
| `GET /api/v1/patients/{id}` | Hồ sơ mình | Có | Có | Có |
| `PATCH /api/v1/patients/{id}` | Hồ sơ mình | ❌ | ❌ | Có |
| `GET /internal/v1/*` | Nội bộ | Nội bộ | Nội bộ | Nội bộ |
