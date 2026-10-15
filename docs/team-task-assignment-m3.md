# Kế Hoạch Milestone 3 (M3): Trọng Tâm Hoàn Thiện Giao Diện (UI/UX) & Tích Hợp Hệ Thống

> **Dự án**: Clinic Appointment System (Health&Human)
> **Giai đoạn**: Milestone 3 (M3) — **UI/UX-Centric Milestone**
> **Trưởng nhóm (Team Lead)**: **WilliamsHugh** (`thuantruongtran0905@gmail.com`)
> **Cập nhật lần cuối**: 15/10/2026 (sau 2 vòng audit code + git history đầy đủ)
> **Quy chuẩn thiết kế gốc**: `docs/ui-design-contract.md`

---

## 1. Hiện Trạng Giao Diện Sau Audit (15/10/2026)

> [!NOTE]
> Kết quả audit toàn bộ file code Flutter & Next.js kết hợp với git log thực tế của từng thành viên. Bảng dưới phản ánh hiện trạng chính xác và là cơ sở duy nhất phân công M3.

### 1.1. Next.js — Clinic Management Web

| Màn hình / File | Người làm M2 | Trạng thái | Mức độ | Vấn đề cần giải quyết M3 |
| :--- | :---: | :---: | :---: | :--- |
| `app/page.tsx` (Dashboard tổng quan) | TV1 | **Placeholder trống** | **0%** | Chưa xây dựng |
| `app/appointments/page.tsx` (Queue Board) | — | **Placeholder trống** | **0%** | Chưa xây dựng |
| `app/auth/page.tsx` | TV2 | Có UI, kết nối API | 75% | Thiếu split-screen, quên mật khẩu |
| `app/doctors/page.tsx` + `doctor-panel.tsx` | TV3 | Có UI, kết nối API | 75% | Thiếu Calendar view lịch làm việc |
| `app/medical-records/page.tsx` | TV4 | Có UI, kết nối API | 65% | **Bug: raw UUID patientId/doctorId thay vì tên** |
| `app/notifications/page.tsx` | TV4 | Có UI, kết nối API | 75% | Thiếu badge Header, Popover |
| `app/profile/page.tsx` + `profile-form.tsx` | TV2 | Có UI, kết nối API | 75% | Đủ dùng |
| `app/users/page.tsx` | TV2 | Có UI, kết nối API | 75% | Thiếu Modal xác nhận khóa tài khoản |
| `app/health/page.tsx` + `health-panel.tsx` | TV1 | Đã kết nối API | 75% | Thiếu task chính thức; cần hoàn thiện cho ADMIN |
| `src/components/app-shell.tsx` | TV1 | Sidebar + Topbar | 75% | Thiếu responsive drawer, badge chuông |

### 1.2. Flutter — Patient App

| Màn hình / File | Người làm M2 | Trạng thái | Mức độ | Vấn đề cần giải quyết M3 |
| :--- | :---: | :---: | :---: | :--- |
| `onboarding/welcome_page.dart` | TV4 | Có UI Figma | 50% | Cần kết nối flow thực và cải thiện UX |
| `auth/auth_page.dart` + `widgets/` | TV4→TV2 | Có UI đẹp | 75% | Thiếu kết nối API thực |
| `appointments/appointments_page.dart` | TV4 | Có UI + TabBar | 75% | **BLOCKER: Không có nút POST tạo lịch hẹn** |
| `appointments/booking_selection.dart` | TV3 | Data Model | 25% | Thiếu màn hình Booking Confirmation |
| `doctors/doctor_directory_page.dart` | TV3 | 298 dòng, chọn slot | 75% | Sau chọn slot không có màn xác nhận |
| `records/records_page.dart` + `widgets/` | TV4 | Có UI + widgets | 80% | Thêm Health Timeline, nút PDF |
| `notifications/notifications_page.dart` + `widgets/` | TV4 | Có UI + tiles | 80% | Badge kết nối BottomNav |
| `users/profile_page.dart` | TV4→TV2 | Có UI đẹp | 80% | Thêm thẻ BHYT, masking số |
| `core/theme/app_theme.dart` | TV4 | ThemeData M3 + ClinicColors | **100%** | Hoàn chỉnh — TV1 chuẩn hoá lại tokens |

> [!CAUTION]
> **Đã xoá file rác**: `lib/features/medical_records/medical_records.dart` — chỉ là stub rỗng, code thật nằm ở `lib/features/records/`.

---

## 2. Tiêu Chuẩn Thiết Kế (Design Principles — `ui-design-contract.md`)

1. **Thương hiệu Health&Human**: Teal/Blue chủ đạo · Emerald (thành công) · Amber (cảnh báo) · Rose (hủy/khẩn cấp).
2. **Patient App (Flutter)**: Tối ưu thao tác một tay · Phông chữ to rõ cho người lớn tuổi · QR check-in.
3. **Clinic Web (Next.js)**: Sidebar cố định · Data Table đa năng · Calendar/Timeline cho lễ tân · Dual-pane layout cho bác sĩ.
4. **Trạng thái UI bắt buộc (mọi màn hình)**:
   - [ ] **Loading** → Skeleton mờ (không phải Spinner đơn điệu)
   - [ ] **Empty** → Hình minh họa + thông điệp + nút hành động gợi ý
   - [ ] **Error** → Thông báo người dùng đọc được + nút Thử lại
   - [ ] **Interactive Feedback** → Ripple/Hover · Loading on submit
5. **Bảo mật hiển thị (Privacy Rules)**:
   - Không hiển thị raw UUID cho người dùng cuối.
   - Che bớt số BHYT trong list/selector (ví dụ `DN401...***`).
   - Route Guard 403 rõ ràng khi truy cập URL ngoài quyền.
6. **Xử lý xung đột Slot (`409`)**: Giữ nguyên form nhập, tự tải lại slot trống mới — không reset toàn bộ.

---

## 3. Bảng Phân Công Chi Tiết — Milestone 3

> [!IMPORTANT]
> Ưu tiên: **P0 = BLOCKER** → **P1 = 0% cần làm mới** → **P2 = 75% cần nâng cấp** → **P3 = Polish cuối sprint**
>
> Nguyên tắc kế thừa: **Không viết lại file đã có** — refactor từ file hiện tại, ghi rõ tên file nguồn.

---

### 3.1. WilliamsHugh — Trưởng nhóm (Platform, Design System, Dashboard)

*Trách nhiệm*: Duy trì nền tảng dùng chung cho cả 2 nền tảng; xây Dashboard tổng quan (0%); code sẵn các widget phức tạp để TV3 lắp API — tránh TV3 quá tải.

| Task ID | Tên Task | Nền tảng | File nguồn cần làm việc | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `M3-UI-LEAD-001` | **Chuẩn hoá Design Tokens** | Flutter & Next.js | `app_theme.dart` · `tailwind.config.ts` | Chuẩn hoá Color Tokens theo `ui-design-contract.md` trên cả 2 nền tảng (không xây lại từ đầu). Mapping ClinicColors Flutter ↔ Tailwind CSS variables Web nhất quán. | P1 | Toàn bộ màn hình dùng chung biến style; không còn inline style thô. |
| `M3-UI-LEAD-002` | **Bộ Component dùng chung (Web)** | Next.js | `src/components/ui/` | Button (Primary/Outline/Danger/Loading), Modal, Toast, Badge, Skeleton Table, `LoadingState`, `EmptyState`, `ErrorState`, `ConfirmModal`. | P1 | Component tái sử dụng; page files không còn inline style. |
| `M3-UI-LEAD-003` | **Widget phức tạp dùng chung (App)** ⭐ | Flutter | `shared/widgets/` | Code sẵn các Widget tái sử dụng **để TV3 lắp API**: `HorizontalDateStrip`, `SlotGridSelector` (phân nhóm Sáng/Chiều), `QrTicketCard` (sinh QR từ appointment ID), `AppointmentStatusChip`. | P1 | TV3 chỉ cần gọi widget với data — không tự code slot grid/QR. |
| `M3-UI-LEAD-004` | **App Shell hoàn chỉnh** | Flutter & Next.js | `app-shell.tsx` · `patient_shell.dart` | Next.js: Sidebar responsive, badge đếm thông báo trên chuông, **chừa NotificationSlot** cho TV4 gắn Popover. Flutter: BottomNav 5 tab, giữ scroll state. | P2 | Sidebar không vỡ layout 1280–1920px; TV4 có thể inject Popover mà không sửa shell. |
| `M3-UI-DASH-001` | **Dashboard Tổng quan** ⭐ `app/page.tsx` | Next.js | `app/page.tsx` (0%) | Xây từ Placeholder: Stat Cards (Ca hôm nay / Đang chờ / Hoàn thành / Bác sĩ đang trực), danh sách 5 lịch hẹn sắp tới, biểu đồ cột 7 ngày gần đây. Phân biệt theo role: STAFF thấy toàn phòng khám, DOCTOR thấy lịch mình. | P1 | Dữ liệu từ API thực; hiển thị đúng theo role sau đăng nhập. |
| `M3-UI-HEALTH-001` | **Trang Sức khỏe Hệ thống** `app/health/` | Next.js | `app/health/page.tsx` · `health-panel.tsx` (75%) | Hoàn thiện `HealthPanel`: thêm badge trạng thái từng microservice (✅ / ⚠️ / ❌), nút Refresh thủ công, hiển thị version. Chỉ ADMIN được xem. | P3 | ADMIN thấy trạng thái 5 services; STAFF/DOCTOR bị redirect. |
| `M3-UI-LEAD-005` | **API Client Error Handling** | Gateway | `src/lib/api/client.ts` | Xử lý lỗi 401/403/500 tập trung — hiển thị Toast thay vì crash; request debounce/cancel khi chuyển trang nhanh. Trang 403 Forbidden khi truy cập URL ngoài quyền. | P2 | Không còn crash khi race condition; URL ngoài quyền hiển thị trang 403 đẹp. |

---

### 3.2. Lht09112005 — UI Xác thực, Hồ sơ & Quản trị

*Trách nhiệm*: Onboarding/Auth, Profile bệnh nhân, Admin User Management, và **Patient Lookup Drawer** (component dùng chung cho TV3 Queue Board — hoàn thành trước Tuần 2).

| Task ID | Tên Task | Nền tảng | File nguồn cần làm việc | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `M3-UI-USER-001` | **Onboarding + Auth App** | Flutter | `onboarding/welcome_page.dart` (50%) · `auth/auth_page.dart` (75%) · `auth/widgets/` | Refactor `welcome_page.dart`: 3 slide giới thiệu tính năng. Kết nối API thực cho login/register (đã có UI), validation real-time, toggle mật khẩu. | P2 | API call thành công; lưu session; chuyển vào app mượt mà. |
| `M3-UI-USER-002` | **Clinic Login nâng cấp (Web)** | Next.js | `app/auth/page.tsx` (75%) | Nâng cấp thành Split-screen (hình phòng khám trái + form đăng nhập phải). Thêm "Ghi nhớ tài khoản". | P3 | Split-screen thiết kế chuyên nghiệp; form validation đầy đủ. |
| `M3-UI-USER-003` | **Profile bệnh nhân — Thẻ BHYT** | Flutter | `users/profile_page.dart` (80%) | Thêm Card Thẻ BHYT đồ họa. **Masking số BHYT** (hiển thị `DN401...***`). Nút chỉnh sửa có Confirmation Dialog trước khi lưu. | P2 | Thẻ BHYT đẹp mắt; số BHYT được che bớt trong mọi context. |
| `M3-UI-USER-004` | **Admin User Management (Web)** | Next.js | `app/users/page.tsx` (75%) | Thêm Modal xác nhận trước khi khóa tài khoản, Badge màu (Xanh Active / Đỏ Locked), tìm kiếm debounce 300ms. | P2 | Khóa tài khoản phải qua confirm dialog; badge màu rõ ràng. |
| `M3-UI-USER-005` | **Patient Lookup Drawer (Web)** ⭐ | Next.js | `src/features/users/patient-selector.tsx` (có sẵn) | Xây từ `patient-selector.tsx`: Drawer/Panel hiển thị hồ sơ + lịch sử đặt lịch gần đây. **Export thành component dùng chung** để TV3 nhúng vào Queue Board. Masking số BHYT trong dropdown. | P2 | TV3 có thể `import PatientLookupDrawer` và nhúng vào `/appointments` không cần viết lại. |

---

### 3.3. MinhPhatVilla — UI Đặt Lịch Khám & Quản lý Lịch hẹn

> [!CAUTION]
> **BLOCKER P0**: `appointments_page.dart` nhận `BookingSelection` nhưng chỉ hiển thị text tĩnh "Lịch hẹn chưa được tạo" — **hoàn toàn không có nút POST**. Fix ngay trong Tuần 1.
>
> **Giảm tải TV3**: TV1 đã code sẵn `HorizontalDateStrip`, `SlotGridSelector`, `QrTicketCard` — TV3 **chỉ lắp data vào widget**, không tự code lại slot grid hay QR.

| Task ID | Tên Task | Nền tảng | File nguồn cần làm việc | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `M3-BUG-BOOK-001` | **[BLOCKER] Fix POST tạo lịch hẹn** ⭐ | Flutter | `appointments/appointments_page.dart` | Khi nhận `BookingSelection`: Hiển thị Confirmation Sheet với đầy đủ thông tin (bác sĩ, ngày giờ) + ô nhập lý do khám + nút **"Xác nhận đặt lịch"** → `POST /api/v1/appointments`. Xử lý lỗi `409 APPOINTMENT_SLOT_UNAVAILABLE`: **giữ nguyên lý do đã nhập**, tự tải lại slot trống mới để chọn lại. | **P0** | Chọn slot → Xác nhận → API thành công → Về danh sách lịch hẹn thấy lịch mới. |
| `M3-UI-BOOK-001` | **Booking Confirmation Screen** ⭐ | Flutter | File mới: `appointments/booking_confirmation_sheet.dart` | BottomSheet fullscreen: hiển thị toàn bộ thông tin đặt lịch + ô nhập lý do khám + nút hoàn tất. Được gọi từ `DoctorDirectoryPage` thay vì đẩy sang `AppointmentsPage` như hiện tại. | **P0** | Luồng hoàn chỉnh: Chọn slot → Sheet xác nhận → POST → Về danh sách. |
| `M3-UI-BOOK-002` | **Doctor Directory hoàn chỉnh (App)** | Flutter | `doctors/doctor_directory_page.dart` (298 dòng, 75%) | Refactor file hiện tại: Dùng `HorizontalDateStrip` + `SlotGridSelector` của TV1. Thêm trang chi tiết bác sĩ (tiểu sử, chuyên khoa, lịch làm việc tuần). Sau chọn slot → mở `BookingConfirmationSheet`. | P2 | Slot trống xanh, slot đầy disabled; flow đến Confirmation không bị gián đoạn. |
| `M3-UI-BOOK-003` | **Appointment List (App) — 3 Tab + QR Ticket** | Flutter | `appointments/appointments_page.dart` (75%) | Refactor sang 3 tab: `Sắp tới` / `Lịch sử` / `Đã hủy`. Dùng `QrTicketCard` của TV1. BottomSheet Đổi lịch (Reschedule) và Hủy lịch có Confirmation Dialog. | P2 | 3 tab load đúng dữ liệu; QR card hiển thị mã hẹn; hủy lịch có confirm. |
| `M3-UI-BOOK-004` | **Clinic Queue Board** ⭐ `appointments/page.tsx` | Next.js | `app/appointments/page.tsx` (0%) | Xây từ Placeholder: Bộ lọc ngày, Kanban columns (`Chờ xác nhận / Xác nhận / Check-in / Đang khám / Hoàn thành`). Nút: `Xác nhận`, `Check-in`, `No-show`, **`Hủy lịch (có lý do)`**, `Đổi lịch`. Nhúng `PatientLookupDrawer` của TV2. **Không có nút `Hoàn thành` cho Lễ tân** (trạng thái COMPLETED chỉ do Bác sĩ trigger qua bệnh án). | **P1** | Queue Board thay thế Placeholder; thao tác Confirm/Check-in không reload trang; hủy/đổi lịch có modal lý do. |
| `M3-UI-DOC-001` | **Doctor Management Web nâng cấp** | Next.js | `src/features/doctors/doctor-panel.tsx` (75%) | Refactor file hiện tại: Thêm Calendar view lịch làm việc tuần (không code lại logic đã có). Switch bật/tắt hoạt động bác sĩ nhanh. | P3 | Calendar hiển thị đúng lịch; switch hoạt động không reload trang. |

---

### 3.4. TehFine — UI Thăm Khám, Hồ Sơ Y Tế & Thông Báo

> [!WARNING]
> **Bug P1**: `medical-records/page.tsx` dòng 184, 223 đang render `{a.patientId}` và `{r.patientId}` raw UUID — cần resolve sang tên đầy đủ qua User Service trước khi nâng cấp layout.
>
> Quy tắc nghiệp vụ quan trọng: Trạng thái `COMPLETED` của lịch hẹn **chỉ được kích hoạt khi Bác sĩ chốt bệnh án sang `FINAL`** — không được tạo nút bấm thủ công nào khác để đổi trạng thái này.

| Task ID | Tên Task | Nền tảng | File nguồn cần làm việc | Nội dung công việc | Ưu tiên | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `M3-BUG-REC-001` | **[Fix Bug] Resolve UUID → Tên** ⭐ | Next.js | `app/medical-records/page.tsx` (65%) | Sau khi fetch records/appointments: resolve `patientId` + `doctorId` → tên đầy đủ qua `GET /api/v1/users/:id`. Cache `Map<id, name>` tránh gọi lặp. | **P1** | Bảng hiển thị "Nguyễn Văn A" thay vì UUID thô. |
| `M3-UI-REC-001` | **Doctor Consultation Workspace** ⭐ | Next.js | `app/medical-records/page.tsx` (65%) | Nâng cấp thành Dual-pane layout: Cột trái (thông tin BN, tiền sử từ records cũ). Cột phải (form nhập triệu chứng, chẩn đoán, ghi chú, tự lưu nháp DRAFT). Bộ kê đơn thuốc động (thêm/xóa dòng). | **P1** | Tự động lưu DRAFT; Bác sĩ vừa xem tiền sử vừa nhập chẩn đoán không cần chuyển tab. |
| `M3-UI-REC-002` | **Chốt ca khám & Ký bệnh án** | Next.js | `app/medical-records/page.tsx` | Nút nổi bật "Chốt kết quả & Hoàn tất ca khám" với Modal tổng kết trước khi FINAL. Sau chốt: badge "Đã chốt", form lock, appointment → COMPLETED (qua Medical Record Service gọi nội bộ). | P2 | Record = FINAL; Appointment = COMPLETED; form không thể sửa sau chốt. |
| `M3-UI-REC-003` | **Health Timeline + PDF Export (App)** | Flutter | `records/records_page.dart` (80%) · `records/widgets/` | Nâng cấp `records_page.dart`: Thêm Health Timeline view (thứ tự thời gian). Nút "Chia sẻ / Xuất PDF đơn thuốc". Tận dụng `record_card.dart` và `prescription_section.dart` đã có. | P2 | Timeline đúng thứ tự; PDF export hoạt động; `record_detail_sheet.dart` hiển thị đủ thông tin. |
| `M3-UI-NOTI-001` | **Notification Center đa năng** | Flutter & Next.js | `notifications/notifications_page.dart` (80%) · `app-shell.tsx` (TV1 để slot) | Flutter: Kết nối badge đếm chưa đọc vào BottomNav. Next.js: Inject Popover thông báo vào `NotificationSlot` của TV1 trên Header (không sửa `app-shell.tsx` trực tiếp). Bấm vào thông báo → đúng trang liên quan. | P2 | Badge đếm đúng; bấm thông báo điều hướng chính xác; Next.js Popover hoạt động qua slot. |

---

## 4. Quy Tắc Phân Định Rõ Ràng (Tránh Giao Thoa)

| Vấn đề | Quyết định |
| :--- | :--- |
| Queue Board (`TV3`) vs Patient Lookup (`TV2`) | TV2 export `PatientLookupDrawer` xong trước Tuần 2 → TV3 import và nhúng vào `/appointments` |
| Ai trigger `COMPLETED`? | **Chỉ TV4** (khi Bác sĩ chốt FINAL). TV3 không tạo nút `COMPLETED` trên Queue Board |
| Notification Popover (`TV4`) vs App Shell (`TV1`) | TV1 chừa `NotificationSlot` trong Header. TV4 inject component vào slot, không sửa `app-shell.tsx` |
| `DoctorPanel.tsx` Web (`TV3`) vs `app-shell.tsx` (`TV1`) | TV3 chỉ làm việc trong `src/features/doctors/`, không sửa `src/components/` |
| `auth_page.dart` / `welcome_page.dart` (TV4 viết M2, TV2 làm M3) | TV2 refactor file có sẵn, không tạo file mới trùng |

---

## 5. Lộ Trình Sprint 4 Tuần

```
Tuần 1 (16–22/10): BLOCKER + Nền tảng
  [TV3] M3-BUG-BOOK-001 — Fix POST tạo lịch hẹn      (P0)
  [TV3] M3-UI-BOOK-001  — Booking Confirmation Sheet  (P0)
  [TV4] M3-BUG-REC-001  — Fix UUID → tên bệnh nhân   (P1)
  [TV1] M3-UI-LEAD-001  — Chuẩn hoá Design Tokens     (P1)
  [TV1] M3-UI-LEAD-002  — UI Component Kit Web        (P1)
  [TV1] M3-UI-LEAD-003  — Widget Kit Flutter (Date/Slot/QR)  (P1)

Tuần 2 (23–29/10): Màn hình cốt lõi còn trống
  [TV1] M3-UI-DASH-001  — Dashboard page.tsx          (P1)
  [TV3] M3-UI-BOOK-004  — Clinic Queue Board           (P1)
  [TV4] M3-UI-REC-001   — Doctor Consultation Workspace(P1)
  [TV2] M3-UI-USER-005  — Patient Lookup Drawer ← TV3 cần (P2)
  [TV2] M3-UI-USER-001  — Onboarding + Auth App        (P2)

Tuần 3 (30/10–05/11): Nâng cấp nghiệp vụ
  [TV1] M3-UI-LEAD-004  — App Shell responsive + slot  (P2)
  [TV1] M3-UI-LEAD-005  — API Client Error Handling    (P2)
  [TV3] M3-UI-BOOK-002  — Doctor Directory hoàn chỉnh  (P2)
  [TV3] M3-UI-BOOK-003  — Appointment List + QR Ticket (P2)
  [TV4] M3-UI-REC-002   — Chốt ca khám & ký bệnh án   (P2)
  [TV2] M3-UI-USER-004  — Admin User Management        (P2)

Tuần 4 (06–12/11): Trải nghiệm & Đánh bóng
  [TV4] M3-UI-REC-003   — Health Timeline + PDF Export (P2)
  [TV4] M3-UI-NOTI-001  — Notification Badge + Popover (P2)
  [TV3] M3-UI-DOC-001   — Doctor Management Calendar   (P3)
  [TV2] M3-UI-USER-002  — Clinic Login split-screen    (P3)
  [TV2] M3-UI-USER-003  — Profile Thẻ BHYT + Masking  (P2)
  [TV1] M3-UI-HEALTH-001— System Health Dashboard      (P3)
  [ALL] Kiểm thử UX toàn diện — Nghiệm thu M3
```

---

## 6. Checklist Nghiệm Thu Từng Màn Hình (UI Acceptance Gates)

Mỗi màn hình trước khi merge PR **bắt buộc** đạt đủ:

1. **Responsive**: Flutter không bị `RenderFlex overflowed` (5.5"–6.7"). Next.js chuẩn 13"–24".
2. **4 trạng thái UI**: Loading (Skeleton) · Empty (hình + nút) · Error (nút Retry) · Interactive Feedback.
3. **Thẩm mỹ Y tế**: Phối màu nhã nhặn, white-space thoáng, cảm giác an tâm, chuyên nghiệp.
4. **Không raw UUID/ID** hiển thị cho người dùng cuối (phải resolve thành tên).
5. **Privacy**: Số BHYT được masking; dữ liệu nhạy cảm hiển thị tối thiểu theo role.
6. **Confirmation trước thao tác phá hoại**: Hủy lịch · Khóa tài khoản · Chốt bệnh án.
7. **Không gọi Supabase trực tiếp từ frontend** — mọi request phải qua `/api/v1/...`.
8. **Route Guard**: URL ngoài quyền → redirect hoặc trang 403 Forbidden rõ ràng.
