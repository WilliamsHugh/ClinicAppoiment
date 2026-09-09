# Clinic Appointment System

Hệ thống đặt lịch khám theo kiến trúc hướng dịch vụ cho đồ án môn Lập trình hướng dịch vụ.

## Thành Phần

- `apps/patient-web`: frontend dành cho bệnh nhân.
- `apps/clinic-management-web`: frontend dành cho bác sĩ, nhân viên phòng khám và quản trị viên.
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

## Chạy Local

```bash
npm run dev:gateway
npm run dev:patient
npm run dev:clinic
npm run dev:user
npm run dev:doctor
npm run dev:appointment
npm run dev:medical-record
npm run dev:notification
```

Mặc định:

- Patient Web: http://localhost:5173
- Clinic Management Web: http://localhost:5174
- API Gateway: http://localhost:8080
- User Service: http://localhost:3001
- Doctor Service: http://localhost:3002
- Appointment Service: http://localhost:3003
- Medical Record Service: http://localhost:3004
- Notification Service: http://localhost:3005

## Kiểm Tra

```bash
npm run build
npm run lint
npm audit --omit=dev --audit-level=high
```

## Tài Liệu

- Thiết kế hệ thống: `docs/system-design.md`
- Supabase schema: `infrastructure/supabase/schema.sql`

