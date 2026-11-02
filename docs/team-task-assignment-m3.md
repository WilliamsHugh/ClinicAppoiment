# Kế Hoạch Milestone 3 (M3): Trọng Tâm Hoàn Thiện Giao Diện (UI/UX) & Tích Hợp Hệ Thống

> **Dự án**: Clinic Appointment System (Health&Human)  
> **Giai đoạn**: Milestone 3 (M3) — **UI/UX-Centric Milestone**  
> **Trưởng nhóm (Team Lead)**: **WilliamsHugh** (`thuantruongtran0905@gmail.com`)  
> **Cập nhật lần cuối**: 02/11/2026 (sau khi hoàn thành toàn diện 4 Milestone Web UI Next.js M1–M4)  
> **Quy chuẩn thiết kế gốc**: [`docs/ui-design-contract.md`](ui-design-contract.md) v2.0  

---

## 1. Hiện Trạng Giao Diện Cập Nhật (02/11/2026)

> [!NOTE]
> Toàn bộ các màn hình Web Next.js trong phạm vi M3 đã được triển khai, kiểm thử tự động (118/118 tests pass, build thành công 12/12 routes static) và hợp nhất hoàn chỉnh vào nhánh `feat/tv1-m3-platform-ui`. Phần giao diện Mobile Flutter của bệnh nhân tiếp tục bám sát phân công dưới đây.

### 1.1. Next.js — Clinic Management Web (ĐÃ HOÀN THÀNH 100%)

| Màn hình / File | Người phụ trách M3 | Trạng thái hiện tại | Mức độ | Kết quả nghiệm thu |
| :--- | :---: | :---: | :---: | :--- |
| `app/page.tsx` (Dashboard tổng quan) | TV1 | **Hoàn thành** (`M3-WEB-012`) | **100%** | Stat Cards theo role (DOCTOR / STAFF / ADMIN), bảng lịch hẹn sắp tới, biểu đồ cột 7 ngày, loading skeleton. |
| `app/appointments/page.tsx` (Queue Board) | TV3 + TV2 | **Hoàn thành** (`M3-WEB-010`) | **100%** | Kanban columns, bộ lọc ngày & bác sĩ, modal xác nhận Check-in/Hủy/Đổi lịch, tích hợp `PatientLookupDrawer`. Không có nút Hoàn thành thủ công. |
| `app/auth/page.tsx` | TV2 | **Hoàn thành** (`M3-WEB-030`) | **100%** | Single Centered Card 440px theo Contract v2.0 §14.5 (thay thế Split-screen cũ), bypass AppShell, lưu tài khoản `localStorage`, toggle mật khẩu. |
| `app/doctors/page.tsx` + `doctor-panel.tsx` | TV3 | **Hoàn thành** (`M3-WEB-020`) | **100%** | Weekly Schedule Calendar, switch kích hoạt nhanh, bộ lọc chuyên khoa, phân trang dữ liệu bác sĩ. |
| `app/medical-records/page.tsx` | TV4 | **Hoàn thành** (`M3-WEB-011`) | **100%** | Dual-pane workspace, resolve UUID → tên bệnh nhân & bác sĩ, tự động lưu DRAFT, bộ kê đơn thuốc động, modal chốt bệnh án FINAL. |
| `app/notifications/page.tsx` | TV4 | **Hoàn thành** (`M3-WEB-022`) | **100%** | Badge đếm chưa đọc trên Header, Popover & Notifications Panel, lọc chưa đọc, đánh dấu đã đọc tất cả. |
| `app/profile/page.tsx` + `profile-form.tsx` | TV2 | **Hoàn thành** (`M3-WEB-030`) | **100%** | Thẻ hồ sơ cá nhân, modal xác nhận cập nhật thông tin, audit design tokens chuẩn mực. |
| `app/users/page.tsx` | TV2 | **Hoàn thành** (`M3-WEB-021`) | **100%** | Tìm kiếm debounce 300ms, Status Badges màu sắc (Active/Locked/Inactive), Modal xác nhận trước khi khóa tài khoản. |
| `app/health/page.tsx` + `health-panel.tsx` | TV1 | **Hoàn thành** | **100%** | Badge trạng thái 5 microservices, nút Refresh thủ công, hiển thị version, Route Guard chỉ ADMIN được truy cập. |
| `src/components/app-shell.tsx` | TV1 | **Hoàn thành** (`M3-WEB-001`) | **100%** | CSS Modules không inline style, bypass hoàn toàn cho route `/auth`, `NotificationSlot` cắm Popover, responsive sidebar. |

### 1.2. Flutter — Patient App

| Màn hình / File | Người phụ trách M3 | Trạng thái hiện tại | Mức độ | Vấn đề cần giải quyết M3 |
| :--- | :---: | :---: | :---: | :--- |
| `onboarding/welcome_page.dart` | TV2 | Có UI Figma | 50% | Chuyển sang PageView 3 slides, kết nối luồng onboarding |
| `auth/auth_page.dart` + `widgets/` | TV2 | Có UI đẹp | 75% | Kết nối API login/register thực, validation inline |
| `appointments/appointments_page.dart` | TV3 | Có UI + TabBar | 75% | **BLOCKER P0: Thêm nút POST tạo lịch hẹn** |
| `appointments/booking_confirmation_sheet.dart` | TV3 | File mới | 0% | Booking Confirmation BottomSheet |
| `doctors/doctor_directory_page.dart` | TV3 | 298 dòng | 75% | Lắp `HorizontalDateStrip` & `SlotGridSelector` của TV1 |
| `records/records_page.dart` + `widgets/` | TV4 | Có UI + widgets | 80% | Thêm Health Timeline, nút Xuất PDF |
| `notifications/notifications_page.dart` + `widgets/` | TV4 | Có UI + tiles | 80% | Badge đếm kết nối BottomNav |
| `users/profile_page.dart` | TV2 | Có UI đẹp | 80% | Thêm thẻ BHYT đồ họa, masking số `DN401...***` |
| `shared/widgets/` (Date, Slot, QR, Chip) | TV1 | Đã code sẵn | **100%** | TV3 lắp data vào widget có sẵn (`d452242`) |
| `core/theme/app_theme.dart` | TV1 | Đã chuẩn hoá | **100%** | Color tokens & ThemeData chuẩn (`e810126`) |

---

## 2. Tiêu Chuẩn Thiết Kế (Design Principles — `ui-design-contract.md` v2.0)

1. **Thương hiệu Health&Human**: Brand Blue `#2D5BFF` chủ đạo · Emerald (thành công) · Amber (cảnh báo) · Rose (hủy/khẩn cấp).
2. **Patient App (Flutter)**: Tối ưu thao tác một tay · Phông chữ to rõ cho người lớn tuổi · QR check-in tiện lợi.
3. **Clinic Web (Next.js)**: Sidebar cố định · Data Table đa năng · Dual-pane layout cho bác sĩ · Route `/auth` căn giữa canvas.
4. **Trạng thái UI bắt buộc (mọi màn hình)**:
   - [x] **Loading** → Skeleton mờ (`SkeletonTable`, `Skeleton`)
   - [x] **Empty** → `EmptyState` chuẩn mực có hình minh họa + thông điệp + nút hành động gợi ý
   - [x] **Error** → Thông báo người dùng đọc được + nút Thử lại
   - [x] **Interactive Feedback** → Ripple/Hover · Loading on submit · Confirmation Modals
5. **Bảo mật hiển thị (Privacy Rules)**:
   - Tuyệt đối không hiển thị raw UUID cho người dùng cuối (phải resolve sang tên người).
   - Che bớt số BHYT trong list/selector/drawer (định dạng `DN401...***`).
   - Route Guard 403 rõ ràng khi người dùng truy cập URL ngoài quyền.
6. **Xử lý xung đột Slot (`409`)**: Giữ nguyên form nhập, tự tải lại slot trống mới — không reset toàn bộ dữ liệu.

---

## 3. Bảng Phân Công Chi Tiết — Milestone 3

---

### 3.1. WilliamsHugh — Trưởng nhóm (Platform, Design System, Dashboard)

*Trách nhiệm*: Duy trì nền tảng dùng chung cho cả 2 nền tảng; hoàn thiện Web Dashboard, AppShell và các technical components.

| Task ID | Tên Task | Nền tảng | Trạng thái | Nội dung công việc | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `M3-UI-LEAD-001` | **Chuẩn hoá Design Tokens** | Flutter & Web | **[x] Đã xong** | Chuẩn hoá Color Tokens theo `ui-design-contract.md` v2.0 trên cả 2 nền tảng. Mapping ClinicColors Flutter ↔ CSS variables Web. | Toàn bộ màn hình dùng chung biến style token; không còn inline hex code thô. |
| `M3-UI-LEAD-002` | **Bộ Component dùng chung (Web)** | Next.js | **[x] Đã xong** | Xây dựng bộ UI kit: `Button`, `Modal`, `ConfirmModal`, `Alert`, `Badge`, `StatusBadge`, `SkeletonTable`, `EmptyState`, `PermissionDeniedState`. | Component tái sử dụng đầy đủ; loại bỏ hoàn toàn inline styling. |
| `M3-UI-LEAD-003` | **Widget phức tạp dùng chung (App)** ⭐ | Flutter | **[x] Đã xong** | Code sẵn Widget tái sử dụng **để TV3 lắp API**: `HorizontalDateStrip`, `SlotGridSelector`, `QrTicketCard`, `AppointmentStatusChip` (`d452242`). | TV3 chỉ cần gọi widget với data — không tự code lại slot grid hay QR. |
| `M3-UI-LEAD-004` | **App Shell hoàn chỉnh** | Next.js & App | **[x] Đã xong (Web)** | Next.js: Tách CSS Modules, responsive sidebar, **chừa NotificationSlot** cho TV4 gắn Popover, bypass `/auth`. Flutter: `patient_shell.dart`. | Layout chuẩn trên mọi kích thước; route `/auth` tách biệt không sidebar. |
| `M3-UI-DASH-001` | **Dashboard Tổng quan** ⭐ | Next.js | **[x] Đã xong** | Xây dựng `app/page.tsx`: Stat Cards, danh sách lịch hẹn sắp tới, biểu đồ 7 ngày. Phân quyền hiển thị theo DOCTOR, STAFF, ADMIN. | Dữ liệu từ API thật; hiển thị đúng phân quyền sau đăng nhập. |
| `M3-UI-HEALTH-001` | **Trang Sức khỏe Hệ thống** | Next.js | **[x] Đã xong** | `app/health/page.tsx`: badge trạng thái từng microservice (✅/⚠️/❌), nút Refresh thủ công, hiển thị version. Chỉ ADMIN xem được. | ADMIN theo dõi được 5 services; các role khác bị từ chối truy cập. |
| `M3-UI-LEAD-005` | **API Client Error Handling** | Web & GW | **[x] Đã xong** | Xử lý lỗi 401/403/500 tập trung; trang 403 Forbidden chuẩn (`PermissionDeniedState`). | Không còn crash khi token hết hạn; URL ngoài quyền hiển thị trang 403 rõ ràng. |

---

### 3.2. Lht09112005 — UI Xác thực, Hồ sơ & Quản trị

*Trách nhiệm*: Onboarding/Auth Flutter, Profile bệnh nhân Flutter, Admin User Management Web, và Patient Lookup Drawer Web.

| Task ID | Tên Task | Nền tảng | Trạng thái | Nội dung công việc | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `M3-UI-USER-001` | **Onboarding + Auth App kết nối API** | Flutter | **[ ] Đang làm** | Refactor `welcome_page.dart` thành `PageView` 3 slides (xem chi tiết bên dưới). Kết nối API Supabase Auth thực qua SessionProvider, validation real-time email/password inline (không showDialog), toggle mật khẩu. | 3 slide onboarding mượt mà; login/register gọi API thành công; điều hướng đúng vào PatientShell. |
| `M3-UI-USER-002` | **Clinic Login nâng cấp (Web)** | Next.js | **[x] Đã xong** | Cập nhật theo `ui-design-contract.md` v2.0 §14.5: Màn hình căn giữa canvas (Single Centered Card 440px), bypass AppShell, lưu "Ghi nhớ tài khoản" vào `localStorage`, toggle ẩn/hiện mật khẩu, loading button. | Giao diện căn giữa trang nhã, không sidebar rỗng, form validation chuẩn. |
| `M3-UI-USER-003` | **Profile bệnh nhân — Thẻ BHYT** | Flutter | **[ ] Đang làm** | Thêm widget `InsuranceCard` đồ họa (gradient xanh teal, bo góc 16). **Masking số BHYT** (hiển thị `"DN401...***"`). Thêm confirmation dialog trước khi lưu thay đổi hồ sơ bệnh nhân. | Thẻ BHYT hiển thị đẹp mắt; số BHYT được che bớt; cập nhật hồ sơ có xác nhận. |
| `M3-UI-USER-004` | **Admin User Management (Web)** | Next.js | **[x] Đã xong** | `app/users/page.tsx`: Modal xác nhận trước khi khóa tài khoản, Status Badges màu sắc (`ACTIVE` xanh, `LOCKED` đỏ), tìm kiếm debounce 300ms, disabled loading button. | Khóa tài khoản bắt buộc qua modal xác nhận; search tự động debounce 300ms; không tự khóa chính mình. |
| `M3-UI-USER-005` | **Patient Lookup Drawer (Web)** ⭐ | Next.js | **[x] Đã xong** | `src/features/users/patient-lookup-drawer.tsx`: Drawer xem hồ sơ nhanh + 5 lịch hẹn gần nhất. Masking số BHYT dạng `"DN401...***"`. Export component để TV3 nhúng vào Queue Board. | TV3 nhúng `PatientLookup` vào `/appointments` dễ dàng; hiển thị loading skeleton và error state có retry. |

#### Chi tiết kỹ thuật cho các Task Flutter của TV2:

**1. Chi tiết 3 slides Onboarding (`M3-UI-USER-001`):**
| Slide | Tiêu đề | Nội dung mô tả |
| :---: | :--- | :--- |
| **1** | *"Đặt lịch khám dễ dàng"* | Chọn bác sĩ, chuyên khoa, ngày giờ khám bệnh phù hợp chỉ với vài thao tác. |
| **2** | *"Theo dõi lịch hẹn"* | Xem vé khám điện tử, mã QR check-in tại phòng khám, đổi hoặc hủy lịch linh hoạt. |
| **3** | *"Hồ sơ sức khỏe của bạn"* | Lưu trữ kết quả khám, đơn thuốc và lịch sử bệnh án minh bạch, an toàn. |

**2. Hàm chuẩn hoá masking số BHYT (`M3-UI-USER-003`):**
```dart
String maskInsurance(String? number) {
  if (number == null || number.length <= 5) return number ?? '—';
  return '${number.substring(0, 5)}...***';
}
```

---

### 3.3. MinhPhatVilla — UI Đặt Lịch Khám & Quản lý Lịch hẹn

*Trách nhiệm*: Luồng đặt lịch trên Flutter và Queue Board vận hành lịch hẹn trên Web.

> [!CAUTION]
> **BLOCKER P0**: `appointments_page.dart` nhận `BookingSelection` nhưng chỉ hiển thị text tĩnh "Lịch hẹn chưa được tạo" — **hoàn toàn không có nút POST**. Cần fix ngay trong Tuần 1.  
> **Lưu ý**: TV1 đã code sẵn `HorizontalDateStrip`, `SlotGridSelector`, `QrTicketCard` (`d452242`) — TV3 **chỉ lắp data vào widget**, không tự code lại.

| Task ID | Tên Task | Nền tảng | Trạng thái | Nội dung công việc | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `M3-BUG-BOOK-001` | **[BLOCKER] Fix POST tạo lịch hẹn** ⭐ | Flutter | **[ ] Đang làm** | Khi nhận `BookingSelection`: Hiển thị Confirmation Sheet đầy đủ thông tin (bác sĩ, ngày giờ) + ô nhập lý do khám + nút **"Xác nhận đặt lịch"** → `POST /api/v1/appointments`. Xử lý lỗi `409`: giữ nguyên lý do đã nhập, tự tải lại slot mới. | Chọn slot → Xác nhận → Gọi API thành công → Về danh sách thấy lịch hẹn mới. |
| `M3-UI-BOOK-001` | **Booking Confirmation Screen** ⭐ | Flutter | **[ ] Đang làm** | `appointments/booking_confirmation_sheet.dart`: BottomSheet fullscreen hiển thị chi tiết đặt lịch + ô lý do + nút hoàn tất. Mở trực tiếp từ `DoctorDirectoryPage`. | Luồng hoàn chỉnh: Chọn slot → Sheet xác nhận → POST → Danh sách lịch hẹn. |
| `M3-UI-BOOK-002` | **Doctor Directory hoàn chỉnh (App)** | Flutter | **[ ] Đang làm** | `doctors/doctor_directory_page.dart`: Dùng `HorizontalDateStrip` + `SlotGridSelector` của TV1. Thêm trang chi tiết bác sĩ (tiểu sử, chuyên khoa). Chọn slot → mở `BookingConfirmationSheet`. | Slot trống bấm được, slot đã đặt bị disabled; điều hướng mượt mà. |
| `M3-UI-BOOK-003` | **Appointment List (App) — 3 Tab + QR Ticket** | Flutter | **[ ] Đang làm** | `appointments/appointments_page.dart`: Chia 3 tab (`Sắp tới` / `Lịch sử` / `Đã hủy`). Dùng `QrTicketCard` của TV1. Đổi lịch & Hủy lịch có Confirmation Dialog. | 3 tab load đúng dữ liệu; QR card hiển thị mã hẹn; hủy lịch có xác nhận. |
| `M3-UI-BOOK-004` | **Clinic Queue Board** ⭐ | Next.js | **[x] Đã xong** | `app/appointments/page.tsx`: Bộ lọc ngày & bác sĩ, Kanban columns, các nút Confirm, Check-in, No-show, Hủy/Đổi lịch có modal lý do. Nhúng `PatientLookupDrawer`. **Không có nút Hoàn thành** (COMPLETED chỉ do Bác sĩ trigger). | Queue Board hoạt động ổn định; thao tác không reload trang; hủy/đổi lịch có lý do rõ ràng. |
| `M3-UI-DOC-001` | **Doctor Management Web nâng cấp** | Next.js | **[x] Đã xong** | `app/doctors/page.tsx` + `doctor-panel.tsx`: Weekly Schedule Calendar, switch bật/tắt hoạt động bác sĩ không reload trang. | Calendar hiển thị đúng lịch làm việc; switch hoạt động trơn tru. |

---

### 3.4. TehFine — UI Thăm Khám, Hồ Sơ Y Tế & Thông Báo

*Trách nhiệm*: Không gian làm việc thăm khám của bác sĩ (Web), hồ sơ y tế timeline (Flutter), và hệ thống thông báo đa nền tảng.

| Task ID | Tên Task | Nền tảng | Trạng thái | Nội dung công việc | Tiêu chí nghiệm thu |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `M3-BUG-REC-001` | **[Fix Bug] Resolve UUID → Tên** ⭐ | Next.js | **[x] Đã xong** | `app/medical-records/page.tsx`: Resolve `patientId` và `doctorId` → tên đầy đủ qua `GET /api/v1/users/:id`. Cache mapping tránh gọi API lặp. | Bảng hiển thị tên bệnh nhân & bác sĩ rõ ràng, không còn UUID thô. |
| `M3-UI-REC-001` | **Doctor Consultation Workspace** ⭐ | Next.js | **[x] Đã xong** | Dual-pane layout: Cột trái (thông tin bệnh nhân, tiền sử khám). Cột phải (triệu chứng, chẩn đoán, ghi chú, tự lưu nháp DRAFT). Bộ kê đơn thuốc động (thêm/xóa dòng). | Bác sĩ vừa xem tiền sử vừa nhập chẩn đoán không cần chuyển tab; tự lưu nháp an toàn. |
| `M3-UI-REC-002` | **Chốt ca khám & Ký bệnh án** | Next.js | **[x] Đã xong** | Nút nổi bật "Chốt kết quả & Hoàn tất ca khám" với modal tổng kết. Sau chốt: badge "Đã chốt", form lock không thể sửa, appointment tự chuyển `COMPLETED`. | Record = FINAL; Appointment = COMPLETED; form khóa an toàn sau khi ký. |
| `M3-UI-REC-003` | **Health Timeline + PDF Export (App)** | Flutter | **[ ] Đang làm** | `records/records_page.dart`: Health Timeline view (thứ tự thời gian). Nút "Chia sẻ / Xuất PDF đơn thuốc". Tận dụng `record_card.dart` và `prescription_section.dart`. | Timeline hiển thị đúng thứ tự; xuất PDF hoạt động tốt; xem chi tiết đầy đủ. |
| `M3-UI-NOTI-001` | **Notification Center đa năng** | Web & App | **[x] Đã xong (Web)** | Next.js: Header notification count badge + Popover & Panel lọc chưa đọc. Flutter: Kết nối badge đếm chưa đọc vào BottomNav. | Badge đếm chính xác; bấm thông báo điều hướng đúng màn hình liên quan. |

---

## 4. Quy Tắc Phân Định Rõ Ràng (Tránh Giao Thoa)

| Vấn đề | Quyết định bắt buộc |
| :--- | :--- |
| **Queue Board (`TV3`) vs Patient Lookup (`TV2`)** | TV2 export `PatientLookupDrawer` → TV3 import và nhúng vào `app/appointments/page.tsx` qua props injection. |
| **Ai kích hoạt trạng thái `COMPLETED`?** | **Chỉ TV4** (khi Bác sĩ chốt bệnh án sang `FINAL`). TV3 tuyệt đối không tạo nút `COMPLETED` thủ công trên Queue Board. |
| **Notification Popover (`TV4`) vs App Shell (`TV1`)** | TV1 chừa `NotificationSlot` trên Header. TV4 inject component vào slot mà không sửa trực tiếp layout của `app-shell.tsx`. |
| **Login Web (`TV2`)** | Bắt buộc tuân thủ Single Centered Card theo `ui-design-contract.md` v2.0 §14.5; không dùng split-screen cũ. |

---

## 5. Lộ Trình Sprint 4 Tuần & Tiến Độ Thực Tế

```
Tuần 1–2: NỀN TẢNG & MÀN HÌNH CỐT LÕI WEB (ĐÃ HOÀN THÀNH TRÊN WEB)
  [x] M3-UI-LEAD-001  — Chuẩn hoá Design Tokens (Flutter & Web)
  [x] M3-UI-LEAD-002  — UI Component Kit Web (Button, Modal, Badges, Skeleton)
  [x] M3-UI-LEAD-003  — Widget Kit Flutter (HorizontalDateStrip, SlotGrid, QrCard)
  [x] M3-UI-LEAD-004  — App Shell Next.js responsive + NotificationSlot
  [x] M3-UI-LEAD-005  — API Client Error Handling & 403 Forbidden page
  [x] M3-UI-DASH-001  — Dashboard tổng quan app/page.tsx
  [x] M3-UI-BOOK-004  — Clinic Queue Board app/appointments/page.tsx
  [x] M3-UI-USER-005  — Patient Lookup Drawer src/features/users/
  [x] M3-BUG-REC-001  — Fix UUID → Tên bệnh nhân/bác sĩ
  [x] M3-UI-REC-001   — Doctor Consultation Workspace app/medical-records/page.tsx

Tuần 3–4: NÂNG CẤP NGHIỆP VỤ & ĐÁNH BÓNG (WEB ĐÃ HOÀN TẤT, FLUTTER TIẾP TỤC)
  [x] M3-UI-DOC-001   — Doctor Management Calendar & Quick Toggle
  [x] M3-UI-USER-004  — Admin User Management (Debounce, StatusBadge, ConfirmModal)
  [x] M3-UI-REC-002   — Chốt ca khám & Ký bệnh án (Lock form, trigger COMPLETED)
  [x] M3-UI-NOTI-001  — Notification Center (Header Badge & Popover Web)
  [x] M3-UI-USER-002  — Clinic Login Web (Single Centered Card 440px)
  [x] M3-UI-HEALTH-001— System Health Dashboard (Admin only)
  [ ] M3-BUG-BOOK-001 — [BLOCKER Flutter] Fix POST tạo lịch hẹn          (TV3)
  [ ] M3-UI-BOOK-001  — [Flutter] Booking Confirmation BottomSheet       (TV3)
  [ ] M3-UI-BOOK-002  — [Flutter] Doctor Directory + Slot Selection      (TV3)
  [ ] M3-UI-BOOK-003  — [Flutter] Appointment List 3 Tab + QR Ticket     (TV3)
  [ ] M3-UI-USER-001  — [Flutter] Onboarding 3 Slides + Auth API         (TV2)
  [ ] M3-UI-USER-003  — [Flutter] Profile Thẻ BHYT + Masking              (TV2)
  [ ] M3-UI-REC-003   — [Flutter] Health Timeline + PDF Export           (TV4)
  [ ] ALL             — Kiểm thử E2E Flutter tích hợp Backend Gateway
```

---

## 6. Phụ Lục: Bảng Đối Chiếu Mã Task (`M3-UI-*` ↔ `M3-WEB-*`)

Nhằm giúp các thành viên và Tech Lead đối chiếu trực tiếp giữa danh sách phân công nhiệm vụ nhóm và commit log thực tế trên Git (`feat/tv1-m3-platform-ui`):

| Phạm vi Web Next.js | Mã phân công nhóm | Mã kỹ thuật Web | Trạng thái Git | Ghi chú kỹ thuật |
| :--- | :--- | :--- | :---: | :--- |
| **App Shell & Layout** | `M3-UI-LEAD-004` | `M3-WEB-001` | ✅ Merged | CSS Modules, bypass `/auth`, NotificationSlot |
| **Shared UI Kit** | `M3-UI-LEAD-002` | `M3-WEB-002` | ✅ Merged | StatusBadge, ConfirmModal, SkeletonTable, EmptyState |
| **Appointments Queue** | `M3-UI-BOOK-004` + `M3-UI-USER-005` | `M3-WEB-010` | ✅ Merged | Kanban Board, nhúng PatientLookupDrawer |
| **Medical Records** | `M3-BUG-REC-001` + `M3-UI-REC-001, 002` | `M3-WEB-011` | ✅ Merged | Dual-pane workspace, kê đơn động, chốt FINAL |
| **Dashboard** | `M3-UI-DASH-001` | `M3-WEB-012` | ✅ Merged | Role-based (DOCTOR/STAFF/ADMIN), stat cards, chart |
| **Doctors & Schedules**| `M3-UI-DOC-001` | `M3-WEB-020` | ✅ Merged | Schedule Calendar, switch active, pagination |
| **Users & Roles Admin**| `M3-UI-USER-004` | `M3-WEB-021` | ✅ Merged | Search debounce 300ms, modal xác nhận khóa |
| **Notifications Panel**| `M3-UI-NOTI-001` (Web) | `M3-WEB-022` | ✅ Merged | Header badge count, Popover & Panel lọc chưa đọc |
| **Auth & Profile** | `M3-UI-USER-002` | `M3-WEB-030` | ✅ Merged | Single Centered Card 440px theo Design Contract v2.0 |
| **A11y & Design Token**| `M3-UI-LEAD-001` | `M3-WEB-031` | ✅ Merged | Audit WCAG AA, focus-visible, 100% token compliance |
