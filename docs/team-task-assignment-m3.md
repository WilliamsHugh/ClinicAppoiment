# Kế Hoạch Milestone 3 (M3): Trọng Tâm Hoàn Thiện Giao Diện (UI/UX) & Tích Hợp Hệ Thống

> **Dự án**: Clinic Appointment System (Health&Human)
> **Giai đoạn**: Milestone 3 (M3) — **UI/UX-Centric Milestone**
> **Trưởng nhóm (Team Lead)**: **WilliamsHugh** (`thuantruongtran0905@gmail.com`)
> **Cập nhật lần cuối**: 15/10/2026 (sau audit code toàn dự án)
> **Quy chuẩn thiết kế gốc**: `docs/ui-design-contract.md`

---

## 1. Hiện Trạng Giao Diện Sau Audit (15/10/2026)

> [!NOTE]
> Audit đã rà soát toàn bộ file code Flutter & Next.js kết hợp với git log của từng thành viên. Kết quả dưới đây phản ánh thực tế dự án và được dùng làm cơ sở phân công M3.

### 1.1. Next.js — Clinic Management Web

| Màn hình / File | Trạng thái | Mức độ | Vấn đề chính |
| :--- | :---: | :---: | :--- |
| `app/page.tsx` (Dashboard tổng quan) | **Placeholder trống** | **0%** | Hoàn toàn chưa xây dựng |
| `app/appointments/page.tsx` (Queue Board) | **Placeholder trống** | **0%** | Hoàn toàn chưa xây dựng |
| `app/auth/page.tsx` | Có UI, kết nối API | 75% | Thiếu split-screen, quên mật khẩu |
| `app/doctors/page.tsx` + `doctor-panel.tsx` | Có UI, kết nối API | 75% | Thiếu Calendar view lịch làm việc |
| `app/medical-records/page.tsx` | Có UI, kết nối API | 65% | **Bug: Hiển thị raw UUID patientId thay vì tên BN** |
| `app/notifications/page.tsx` | Có UI, kết nối API | 75% | Thiếu badge đếm chưa đọc trên Header |
| `app/profile/page.tsx` + `profile-form.tsx` | Có UI, kết nối API | 75% | Đủ dùng |
| `app/users/page.tsx` | Có UI, kết nối API | 75% | Thiếu Modal xác nhận khóa TK |
| `src/components/app-shell.tsx` | Sidebar + Topbar hoạt động | 75% | Thiếu responsive drawer, thiếu badge chuông |

### 1.2. Flutter — Patient App

| Màn hình / File | Trạng thái | Mức độ | Vấn đề chính |
| :--- | :---: | :---: | :--- |
| `auth/auth_page.dart` | Có UI đẹp | 75% | Thiếu kết nối API thực, thiếu Onboarding |
| `appointments/appointments_page.dart` | Có UI + TabBar + AppointmentCard | 75% | **BLOCKER: BookingSelection nhận được nhưng KHÔNG CÓ nút POST tạo lịch hẹn** |
| `appointments/booking_selection.dart` | Chỉ là Data Model | 25% | Thiếu màn hình Booking Confirmation |
| `doctors/doctor_directory_page.dart` | Có UI, chọn slot | 75% | Sau chọn slot không có màn hình xác nhận |
| `records/records_page.dart` | Có UI + record_card + prescription | 75% | Đủ dùng, cần polish thêm |
| `notifications/notifications_page.dart` | Có UI + notification_tile | 80% | Badge đếm cần kết nối thực |
| `users/profile_page.dart` | Có UI đẹp, kết nối API | 80% | Đủ dùng |
| `core/theme/app_theme.dart` | ThemeData M3 chuẩn, ClinicColors | **100%** | Hoàn chỉnh |

---

## 2. Tiêu Chuẩn Thiết Kế Giao Diện (Design Principles)

Tuân thủ nghiêm ngặt theo [`docs/ui-design-contract.md`](ui-design-contract.md):

1. **Thương hiệu**: **Health&Human** — Tone màu: `Teal/Blue` chủ đạo, `Emerald` thành công, `Amber` cảnh báo, `Rose` hủy/khẩn cấp.
2. **Patient App (Flutter)**: Tối ưu thao tác một tay, phông chữ to rõ cho người lớn tuổi, QR check-in.
3. **Clinic Web (Next.js)**: Sidebar cố định, Data Table đa năng, Calendar/Timeline view cho lễ tân, Dual-pane layout cho bác sĩ.
4. **Trạng thái UI bắt buộc (Every Screen Checklist)**:
   - [ ] Loading Skeleton (không dùng vòng xoay đơn điệu)
   - [ ] Empty State (hình minh họa + nút hành động gợi ý)
   - [ ] Error State (nút Thử lại, không văng stack trace)
   - [ ] Confirmation Modal trước thao tác quan trọng

---

## 3. Bảng Phân Công Chi Tiết — Milestone 3

> [!IMPORTANT]
> Ưu tiên theo thứ tự: **BLOCKER** (P0) → **0% cần làm mới** (P1) → **75% cần nâng cấp** (P2) → **Design polish** (P3)

---

### 3.1. WilliamsHugh — Trưởng nhóm (UI System, App Shell & Dashboard)

*Trách nhiệm*: Duy trì Design System, hoàn thiện App Shell đa nền tảng, và xây dựng Dashboard tổng quan (hiện 0%) cho Next.js.

| Task ID | Tên Task | Nền tảng | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `M3-UI-LEAD-001` | **Chuẩn hoá Design System** (đã có nền) | Flutter & Next.js | Không xây lại từ đầu. Mở rộng `ClinicColors` sang Tailwind CSS tokens Web; chuẩn hoá spacing, border-radius, shadow nhất quán 2 nền tảng. | P2 | Toàn bộ màn hình dùng chung biến style; không còn inline style thô. |
| `M3-UI-LEAD-002` | **Bộ Component dùng chung (Web)** | Next.js | Xây `src/components/ui/`: Button (Primary/Outline/Danger/Loading), Modal Dialog, Toast, Badge trạng thái, Skeleton Table, LoadingState, EmptyState, ErrorState chuẩn. | P2 | Component tái sử dụng, không còn inline style trong page files. |
| `M3-UI-LEAD-003` | **App Shell hoàn chỉnh** | Flutter & Next.js | - Next.js: Sidebar responsive (thu gọn/mở), badge đếm thông báo trên chuông, breadcrumbs.<br>- Flutter: BottomNav 5 tab, giữ scroll state khi chuyển tab. | P2 | Sidebar không bị vỡ layout trên 1280px và 1920px; Flutter tab không giật. |
| `M3-UI-DASH-001` | **Dashboard Tổng quan Phòng khám** ⭐ `page.tsx` | Next.js | **Xây dựng từ 0%**: Trang chủ Clinic Web với: Stat Cards (Ca khám hôm nay, Đang chờ, Đã hoàn thành, Bác sĩ đang trực), Danh sách 5 lịch hẹn sắp tới, Biểu đồ cột ca khám theo ngày (7 ngày gần đây). | P1 | Dữ liệu load từ API thực; hiển thị đúng theo quyền (STAFF thấy toàn phòng khám, DOCTOR thấy lịch của mình). |
| `M3-UI-LEAD-004` | **Tối ưu API Client & Request UX** | Gateway | Hỗ trợ request debounce/cancel trên Frontend; xử lý lỗi 401/403/500 tập trung tại API client layer (không để từng page tự xử lý). | P3 | Chuyển trang nhanh không bị race condition; lỗi mạng hiển thị Toast thay vì crash. |

---

### 3.2. Lht09112005 — UI Xác thực, Hồ sơ & Quản trị

*Trách nhiệm*: Hoàn thiện giao diện Auth/Onboarding, Hồ sơ bệnh nhân và Admin User Management.

| Task ID | Tên Task | Nền tảng | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `M3-UI-USER-001` | **Onboarding + Auth App (Flutter)** | Flutter | - Màn hình Onboarding 3 slide (giới thiệu tính năng) trước khi vào Login.<br>- Kết nối API thực cho Đăng nhập/Đăng ký (hiện đã có UI đẹp nhưng thiếu API call).<br>- Validation real-time, hiệu ứng toggle mật khẩu. | P2 | API call thành công, lưu session, chuyển vào app mượt mà. |
| `M3-UI-USER-002` | **Clinic Login nâng cấp (Web)** | Next.js | Nâng cấp màn hình đăng nhập hiện tại thành Split-screen (hình phòng khám + form), thêm tính năng "Ghi nhớ tài khoản". | P3 | Thiết kế chuyên nghiệp, form validation đầy đủ. |
| `M3-UI-USER-003` | **Profile bệnh nhân — Thẻ y tế (Flutter)** | Flutter | Nâng cấp `profile_page.dart` (đã 80%): Thêm phần hiển thị Mã bệnh nhân, Thẻ BHYT dạng Card đồ họa. Cho phép chỉnh sửa và xác nhận lưu. | P3 | Thẻ BHYT có thiết kế đẹp mắt; form chỉnh sửa có confirmation dialog. |
| `M3-UI-USER-004` | **Admin User Management (Web)** | Next.js | Nâng cấp `users/page.tsx` (đã 75%): Thêm Modal xác nhận trước khi khóa tài khoản, Badge màu trực quan (Xanh Active / Đỏ Locked), tìm kiếm debounce 300ms. | P2 | Thao tác khóa/mở khóa có confirm dialog; badge màu rõ ràng. |
| `M3-UI-USER-005` | **Patient Lookup Drawer (Web)** | Next.js | Thanh tra cứu bệnh nhân nhanh cho Lễ tân: Drawer/Modal hiển thị hồ sơ + lịch sử đặt lịch gần đây của bệnh nhân khi tìm kiếm. | P3 | Tìm kiếm phản hồi sau 300ms debounce, thông tin đầy đủ trong drawer. |

---

### 3.3. MinhPhatVilla — UI Đặt Lịch Khám & Quản lý Lịch hẹn

> [!CAUTION]
> **BLOCKER P0**: `appointments_page.dart` nhận `BookingSelection` nhưng chỉ hiển thị text "Lịch hẹn chưa được tạo" — **hoàn toàn không có nút POST để tạo lịch hẹn**. Đây là tính năng cốt lõi của ứng dụng, phải fix trước mọi task khác.

| Task ID | Tên Task | Nền tảng | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `M3-BUG-BOOK-001` | **[BLOCKER] Fix POST tạo lịch hẹn** ⭐ | Flutter | Sửa `appointments_page.dart`: Khi nhận `BookingSelection`, hiển thị màn hình xác nhận với đầy đủ thông tin (bác sĩ, ngày giờ, lý do khám) và nút **"Xác nhận đặt lịch"** gọi `POST /api/v1/appointments`. Xử lý lỗi slot đã bị đặt bằng Toast thông báo. | **P0** | Bệnh nhân chọn slot → xác nhận → API tạo appointment thành công → chuyển về danh sách lịch hẹn. |
| `M3-UI-BOOK-001` | **Booking Confirmation Screen** ⭐ | Flutter | Tạo màn hình xác nhận đặt lịch độc lập (có thể là bottom sheet fullscreen hoặc route riêng): hiển thị toàn bộ thông tin đặt lịch + ô nhập lý do khám + nút hoàn tất. Chuyển từ `DoctorDirectoryPage` vào đây thay vì đẩy sang `AppointmentsPage`. | **P0** | Luồng: Chọn slot → Booking Confirmation → POST API → Về danh sách lịch hẹn (có thể xem vé mới). |
| `M3-UI-BOOK-002` | **Luồng Khám phá Bác sĩ hoàn chỉnh (App)** | Flutter | Nâng cấp `doctor_directory_page.dart` (đã 75%): Thêm trang chi tiết bác sĩ (tiểu sử, chuyên khoa, lịch làm việc tuần). Horizontal Date Strip + Slot Grid phân nhóm Sáng/Chiều. | P2 | Slot trống viền xanh, slot đầy mờ disabled; chọn slot → chuyển vào Booking Confirmation. |
| `M3-UI-BOOK-003` | **Clinic Queue Board** ⭐ `appointments/page.tsx` | Next.js | **Xây dựng từ 0%**: Xóa Placeholder, thay bằng Queue Board cho STAFF: Bộ lọc theo ngày, Kanban columns (Chờ xác nhận / Đã xác nhận / Check-in / Đang khám / Hoàn thành), nút thao tác nhanh (Xác nhận, Check-in, No-show). | **P1** | Thay đổi trạng thái không cần reload trang; hiển thị đúng lịch hẹn theo ngày. |
| `M3-UI-DOC-001` | **Doctor Management Web nâng cấp** | Next.js | Nâng cấp `doctor-panel.tsx` (đã 75%): Thêm Calendar view trực quan cho lịch làm việc tuần, switch bật/tắt hoạt động bác sĩ nhanh. (Không cần làm lại từ đầu, chỉ bổ sung phần còn thiếu.) | P3 | Calendar view hiển thị lịch đúng; switch hoạt động nhanh không cần reload. |

---

### 3.4. TehFine — UI Thăm Khám, Hồ Sơ Y Tế & Thông Báo

> [!WARNING]
> **Bug P1**: `medical-records/page.tsx` đang render `{r.patientId}` (raw UUID) thay vì tên bệnh nhân. Cần gọi User Service để resolve trước khi nâng cấp UI.

| Task ID | Tên Task | Nền tảng | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `M3-BUG-REC-001` | **[Fix Bug] Hiển thị tên BN thay UUID** ⭐ | Next.js | Sửa `medical-records/page.tsx`: Sau khi fetch records, resolve `patientId` → tên đầy đủ bằng cách gọi `GET /api/v1/users/:id` (User Service). Cache kết quả để tránh gọi lặp. Làm tương tự cho `doctorId`. | **P1** | Bảng bệnh án hiển thị đúng "Nguyễn Văn A" thay vì UUID thô. |
| `M3-UI-REC-001` | **Doctor Consultation Workspace (Web)** ⭐ | Next.js | Giao diện Dual-pane cho bác sĩ khám bệnh: Cột trái (thông tin BN, tiền sử), Cột phải (form nhập triệu chứng, chẩn đoán, ghi chú, tự lưu nháp). Bộ kê đơn thuốc động (thêm/xóa dòng). | **P1** | Tự động lưu DRAFT; bác sĩ có thể vừa xem tiền sử vừa nhập chẩn đoán. |
| `M3-UI-REC-002` | **Chốt ca khám & Ký bệnh án (Web)** | Next.js | Nút "Chốt kết quả & Hoàn tất ca khám" với Modal tổng kết toàn bộ bệnh án + đơn thuốc trước khi FINAL. Sau chốt: badge "Đã chốt", form lock, đồng bộ appointment → COMPLETED. | P2 | Sau xác nhận chốt, record status = FINAL, appointment status = COMPLETED. |
| `M3-UI-REC-003` | **Hồ sơ sức khỏe bệnh nhân (App)** | Flutter | Nâng cấp `records_page.dart` + widgets (đã 75%, TehFine đã xây record_card & prescription_section): Thêm Health Timeline view, nút chia sẻ/xuất PDF đơn thuốc. | P2 | Timeline hiển thị đúng thứ tự; nút xuất PDF hoạt động. |
| `M3-UI-NOTI-001` | **Thông báo đa năng** | Flutter & Next.js | - Flutter: Nâng cấp `notifications_page.dart` (đã 80%): Kết nối badge đếm chưa đọc vào BottomNav.<br>- Next.js: Thêm Popover thông báo trên Header với badge đếm, tự cập nhật khi có ca mới check-in. | P2 | Badge đếm đúng số; bấm vào thông báo chuyển đúng trang. |

---

## 4. Lộ Trình Triển Khai Theo Tuần

```
Tuần 1 (16–22/10): Giải BLOCKER + Xây nền
├── [TV3] M3-BUG-BOOK-001 — Fix POST tạo lịch hẹn (P0)
├── [TV3] M3-UI-BOOK-001 — Booking Confirmation Screen (P0)
├── [TV4] M3-BUG-REC-001 — Fix UUID → tên bệnh nhân (P1)
└── [TV1] M3-UI-LEAD-001/002 — Chuẩn hoá Design System + Components

Tuần 2 (23–29/10): Màn hình cốt lõi còn trống
├── [TV1] M3-UI-DASH-001 — Dashboard tổng quan page.tsx (P1)
├── [TV3] M3-UI-BOOK-003 — Clinic Queue Board appointments/page.tsx (P1)
├── [TV4] M3-UI-REC-001 — Doctor Consultation Workspace (P1)
└── [TV2] M3-UI-USER-001 — Onboarding + Auth App kết nối API (P2)

Tuần 3 (30/10–05/11): Nâng cấp nghiệp vụ
├── [TV1] M3-UI-LEAD-003 — App Shell responsive hoàn chỉnh
├── [TV3] M3-UI-BOOK-002 — Doctor Directory + Booking Funnel hoàn chỉnh
├── [TV4] M3-UI-REC-002 — Chốt ca khám & ký bệnh án
└── [TV2] M3-UI-USER-004 — Admin User Management nâng cấp

Tuần 4 (06–12/11): Trải nghiệm & Đánh bóng
├── [TV4] M3-UI-REC-003 — Health Timeline + PDF Export
├── [TV4] M3-UI-NOTI-001 — Notification badge + Popover
├── [TV2] M3-UI-USER-003/005 — Profile thẻ y tế + Patient Lookup
├── [TV3] M3-UI-DOC-001 — Doctor Management Calendar view
└── [ALL] Kiểm thử UX toàn diện — Nghiệm thu M3
```

---

## 5. Danh Mục Kiểm Tra Trước Khi Nghiệm Thu (UI Acceptance Gates)

Mỗi màn hình trước khi merge PR **bắt buộc** đạt đủ 6 tiêu chí:

1. **Responsive & Tỷ lệ hiển thị**:
   - Flutter: Không bị tràn `RenderFlex overflowed` trên 5.5" và 6.7".
   - Next.js: Bảng và form chuẩn trên laptop 13" và màn hình phòng khám 24".
2. **Đầy đủ 4 trạng thái giao diện**:
   - `Loading` → Skeleton mờ (không phải Spinner đơn điệu).
   - `Empty` → Hình minh họa + thông điệp + nút gợi ý hành động.
   - `Error` → Thông báo người dùng hiểu được + nút Thử lại.
   - `Interactive Feedback` → Nút có ripple/hover, loading on submit.
3. **Thẩm mỹ Y tế**: Phối màu nhã nhặn, white-space thoáng, cảm giác an tâm, chuyên nghiệp.
4. **Không có raw UUID/ID** hiển thị cho người dùng (phải resolve thành tên).
5. **Confirmation trước thao tác phá hoại** (hủy lịch, khóa tài khoản, chốt bệnh án).
6. **Không trực tiếp gọi Supabase từ frontend** — mọi request phải qua `/api/v1/...`.
