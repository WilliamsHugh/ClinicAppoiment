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
npm run dev:patient
```

Mặc định:

- Patient App: Flutter Android emulator, gọi Gateway qua `http://10.0.2.2:8080`
- Clinic Management Web (Next.js): http://localhost:5174
- API Gateway: http://localhost:8080
- User Service: http://localhost:3001
- Doctor Service: http://localhost:3002
- Appointment Service: http://localhost:3003
- Medical Record Service: http://localhost:3004
- Notification Service: http://localhost:3005

## Kiểm Tra

```bash
npm run build
npm run build:patient
npm run lint
npm audit --omit=dev --audit-level=high
```

Đây là scaffold nền: các service hiện có repository in-memory để kiểm tra luồng API. Việc kết nối
Supabase thật, xác thực Supabase Auth và cơ chế chống double booking bằng transaction/constraint sẽ
được triển khai ở các phase nghiệp vụ tiếp theo.

## Tài Liệu

- Thiết kế hệ thống: `docs/system-design.md`
- Supabase schema: `infrastructure/supabase/schema.sql`
