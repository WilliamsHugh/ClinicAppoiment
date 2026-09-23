# Clinic Appointment System

Hệ thống đặt lịch khám theo kiến trúc hướng dịch vụ cho đồ án môn Lập trình hướng dịch vụ.

## Thành Phần

- `apps/patient-app`: ứng dụng Flutter Android dành cho bệnh nhân.
- `apps/clinic-management-web`: frontend Next.js dành cho bác sĩ, nhân viên phòng khám và quản trị viên.
- `gateway/api-gateway`: điểm truy cập duy nhất của hai frontend.
- `services/user-service`: tài khoản, hồ sơ người dùng, hồ sơ bệnh nhân và vai trò.
- `services/doctor-service`: bác sĩ, chuyên khoa, lịch làm việc và khung giờ khám.
- `services/appointment-service`: đặt lịch, đổi lịch, hủy lịch và quản lý trạng thái lịch hẹn.
- `services/medical-record-service`: kết quả khám, chẩn đoán, ghi chú và đơn thuốc cơ bản.
- `services/notification-service`: thông báo và lịch sử gửi thông báo.

## Cài Đặt

```bash
npm install
cp .env.example .env
docker compose -f infrastructure/compose/docker-compose.yml up -d
```

Mỗi service nghiệp vụ sở hữu một PostgreSQL database riêng. Điền các biến
`USER_DATABASE_URL`, `DOCTOR_DATABASE_URL`, `APPOINTMENT_DATABASE_URL`,
`MEDICAL_RECORD_DATABASE_URL` và `NOTIFICATION_DATABASE_URL` trong `.env` theo
project Supabase tương ứng. Chạy file `infrastructure/supabase/<service>/schema.sql`
trên đúng database của service đó. Không chạy migration của service này trên database
của service khác.

Supabase Auth thuộc project của User Service. Chỉ API Gateway nhận `SUPABASE_URL` và
`SUPABASE_ANON_KEY` ở môi trường backend để đăng ký, đăng nhập, refresh và xác minh JWT.
Flutter và Next.js chỉ nhận URL của API Gateway; hai frontend không nhận Supabase key,
database URL và không gọi trực tiếp service nội bộ. User, Medical Record và Notification
Service cần database để khởi động; Doctor và Appointment hiện vẫn là scaffold in-memory.

Flutter SDK được đặt local tại `.tools/flutter`. Nếu máy chưa nhận Flutter toàn cục, dùng trực tiếp binary này.

Để dùng lệnh `flutter` trong terminal hiện tại:

```bash
export PATH="$PWD/.tools/flutter/bin:$PATH"
flutter doctor -v
```

Để chạy Android, cần cài Android Studio và Android SDK, sau đó cấu hình bằng
`flutter config --android-sdk <đường-dẫn-android-sdk>` nếu SDK không nằm ở vị trí mặc định.

## Chạy Local

```bash
npm run dev:gateway
npm run dev:clinic
npm run dev:user
npm run dev:doctor
npm run dev:appointment
npm run dev:medical-record
npm run dev:notification
```

Chạy Patient App trên Android emulator:

```bash
npm run dev:patient -- --device emulator-5554
```

Hoặc đặt `FLUTTER_DEVICE_ID` trong `.env`. Android build cần JDK có `javac`; script ưu tiên
`JAVA_HOME`, JDK trong `.tools/jdk-17`, rồi Temurin 17 tại `~/.local/opt/temurin-17`.

Mặc định:

- Patient App: Flutter Android emulator, gọi Gateway qua `http://10.0.2.2:8080`
- Clinic Management Web (Next.js): http://localhost:5174
- API Gateway: http://localhost:8080
- User Service: http://localhost:3001
- Doctor Service: http://localhost:3002
- Appointment Service: http://localhost:3003
- Medical Record Service: http://localhost:3004
- Notification Service: http://localhost:3005

API Gateway cung cấp OpenAPI JSON tại `http://localhost:8080/openapi.json` và Swagger UI tại
`http://localhost:8080/docs`. `AUTH_DEV_MODE=true` chỉ dành cho local scaffold; khi triển khai thật
phải đặt `AUTH_DEV_MODE=false` và cấu hình Supabase Auth.

## Kiểm Tra

```bash
npm run build
npm run build:patient
npm run lint
npm audit --omit=dev --audit-level=high
```

Doctor và Appointment Service vẫn là scaffold in-memory. Các service này cần được
chuyển sang Supabase theo task của thành viên 2–3 trước khi kiểm thử luồng khám
end-to-end với Medical Record/Notification trên dữ liệu thật.

## Tài Liệu

- Thiết kế hệ thống: `docs/system-design.md`
- Hợp đồng API v1: `docs/api-contract.md`
- Supabase migrations riêng từng service: `infrastructure/supabase/<service>/schema.sql`
