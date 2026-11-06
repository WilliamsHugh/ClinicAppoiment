# Kế Hoạch Chỉnh Sửa & Nâng Cấp Giao Diện Clinic Management Web (M3 Follow-Up)

> **Tài liệu tham chiếu bắt buộc:**
> - [`.agents/rules.md`](../.agents/rules.md)
> - [`docs/ui-design-contract.md`](./ui-design-contract.md) (v2.0)
> - [`docs/web-rendering-contract.md`](./web-rendering-contract.md)
> - [`docs/team-task-assignment-m3.md`](./team-task-assignment-m3.md)

---

## 1. Mục tiêu
Khắc phục triệt để vấn đề hiển thị Logo thương hiệu **Health&Human** (kết hợp **Hướng 1**: Badge nền thương hiệu + crop gọn khoảng trống và **Hướng 2**: Bộ biến thể Logo Sáng/Tối), đồng thời xử lý toàn bộ các lỗi vi phạm Design Contract (`docs/ui-design-contract.md`), Rendering Contract (`docs/web-rendering-contract.md`) và tiêu chuẩn Anti-Slop trên `apps/clinic-management-web`.

---

## 2. Quy tắc Git, Phân nhánh & Ownership (BẮT BUỘC)

1. **Tuyệt đối không đẩy code lên remote:**
   - **CẤM** chạy `git push` dưới mọi hình thức.
   - Mọi thay đổi chỉ được kiểm thử và lưu bằng **local commit** trên máy.
2. **Bảo toàn công việc hiện tại trước khi tách nhánh:**
   - Commit local toàn bộ các thay đổi đang có trên nhánh `feat/tv1-m3-platform-ui` trước khi tạo nhánh con để không làm mất hoặc trộn lẫn code hiện có.
3. **Chiến lược phân nhánh gọn gàng theo chuẩn `.agents/rules.md` (`<type>/m2-<domain>-<NNN>-<slug>`):**
   Mỗi gói công việc thuộc một miền sở hữu (Member 1 → Member 4) được thực hiện trên nhánh riêng rồi hợp nhất (`--no-ff`) về lại `feat/tv1-m3-platform-ui` sau khi vượt qua toàn bộ bài test và build:

| Thứ tự | Tên nhánh (Local Branch) | Owner | Task ID đối chiếu | Phạm vi file sở hữu |
| :---: | :--- | :---: | :--- | :--- |
| **0 (Base)** | `feat/tv1-m3-platform-ui` | TV1 | `M3-UI-LEAD-004` / `M3-WEB-001` | Nhánh cơ sở chứa toàn bộ trạng thái M3 hiện tại. |
| **Nhánh 1** | `fix/m2-platform-002-logo-shell-and-landing-polish` | **Member 1 (TV1)** | `M3-UI-LEAD-001`, `M3-UI-LEAD-004`, `M3-UI-DASH-001` | `public/images/logo*.png`, `public/logo.png`, `app/globals.css`, `src/components/app-shell.*`, `src/features/dashboard/staff-dashboard.tsx`, `src/features/landing/*` |
| **Nhánh 2** | `fix/m2-user-002-auth-logo-and-profile-integrity` | **Member 2 (TV2)** | `M3-UI-USER-002` (`M3-WEB-030`) | `app/auth/page.tsx`, `app/auth/auth.module.css`, `src/features/users/profile-form.tsx`, `src/features/users/profile.module.css` |
| **Nhánh 3** | `fix/m2-booking-004-confirm-modals-timezone-and-doctor-ui` | **Member 3 (TV3)** | `M3-UI-BOOK-004` (`M3-WEB-010`), `M3-UI-DOC-001` (`M3-WEB-020`) | `src/features/appointments/*`, `src/features/doctors/*` |
| **Nhánh 4** | `fix/m2-record-002-final-confirm-and-role-guard` | **Member 4 (TV4)** | `M3-UI-REC-002` (`M3-WEB-011`) | `src/features/medical-records/*`, `src/lib/navigation/routes.ts` |

---

## 3. Yêu cầu triển khai chi tiết theo từng Nhánh

### NHÁNH 1: `fix/m2-platform-002-logo-shell-and-landing-polish` (Owner: Member 1 — Platform & Shell)

#### 1.1. Xử lý toàn diện Logo thương hiệu (Kết hợp Hướng 1 & Hướng 2)
- **Chuẩn hóa tài nguyên ảnh (Hướng 2 — Dual-Variant Assets + Trim Padding):**
  - Cắt gọn (trim) khoảng đệm trong suốt dư thừa (~20% mỗi cạnh) của file `public/images/logo.png` để biểu tượng chữ `HH` + rắn y khoa đạt tỷ lệ lấp đầy ~82–85% khung ảnh vuông.
  - Giữ `public/images/logo.png` (và tạo thêm bản sao `public/images/logo-light.png`) là bản **âm bản** (chữ `HH` trắng `#FFFFFF` + rắn cyan `#5CE1E6`) chuyên dùng trên nền đậm (`--brand` `#2d5bff` hoặc `--ink` `#0f172a`).
  - Tạo thêm biến thể **dương bản** `public/images/logo-dark.png` (chuyển chữ `HH` từ trắng `#FFFFFF` sang màu xanh thương hiệu đậm `#1E3A8A` / `#2D5BFF`, giữ nguyên rắn y khoa cyan sắc nét) và cập nhật `public/logo.png` để dùng cho bề mặt nền sáng không đóng khung và làm Favicon trình duyệt.
- **Đồng bộ hiển thị trong Khung Badge thương hiệu (Hướng 1 — Brand Badge Container):**
  - Tại `src/components/app-shell.module.css` (`.brandMark`) và `src/components/app-shell.tsx`:
    - Đổi nền `.brandMark` từ `var(--primary-light)` (`#e0f2fe`) sang `var(--brand)` (`#2d5bff`), bo góc `var(--radius-md)` (`6px`), kích thước `32×32px`, `box-shadow: var(--shadow-sm)`.
    - Hiển thị `<Image src="/images/logo.png" width={26} height={26} ... />` đã trim gọn bên trong `.brandMark`, bảo đảm độ tương phản chữ `HH` trắng trên nền `#2d5bff` đạt **8.59:1** (vượt chuẩn WCAG AAA).
  - Tại `src/features/landing/clinic-landing.module.css` (`.brandLogo`):
    - Điều chỉnh kích thước hiển thị hợp lý với ảnh đã trim gọn trên Header (`#2d5bff`) và Footer (`#0f172a`).

#### 1.2. Nâng cấp `AppShell` và `globals.css`
- **Ngày giờ thực tế trên Topbar (`src/components/app-shell.tsx`):**
  - Thay chuỗi hardcode `"Thứ Năm, 19/10/2026 · Múi giờ GMT+7"` bằng ngày thực tế được định dạng theo chuẩn tiếng Việt (`formatVietnamDate(new Date())` + `" · Múi giờ GMT+7"`).
- **Xác nhận đăng xuất trên Sidebar (`src/components/app-shell.tsx`):**
  - Bổ sung `ConfirmModal` khi người dùng bấm nút `Thoát` ở góc dưới Sidebar (đồng bộ hành vi với trang `/auth` và `/profile`).
- **Đồng bộ màu trạng thái trong `app/globals.css`:**
  - Cập nhật `.state-icon` và `.spinner` từ mã màu xanh cổ vịt cũ (`#e5f4f2`, `#cae4e1`) sang token `var(--primary-light)` và `var(--line)`.

#### 1.3. Chuẩn hóa bố cục `StaffDashboard` (`src/features/dashboard/staff-dashboard.tsx`)
- Tuân thủ `docs/ui-design-contract.md` §5.2 & §14.3:
  - Loại bỏ lưới 4 thẻ số liệu đồng dạng (`.statGrid` 4 ô) đang nằm chắn phía trên bảng hàng đợi.
  - Đưa bảng **`Hàng đợi cần xử lý`** lên vị trí ưu tiên đầu tiên ở cột chính bên trái.
  - Chuyển số liệu tổng hợp trạng thái trong ngày sang dạng danh sách `.summaryList` ở cột `aside` bên phải (đồng bộ hoàn toàn với cấu trúc của `DoctorDashboard`).

#### 1.4. Chuẩn hóa Trang chủ công khai `/` (`src/features/landing/clinic-landing-page.tsx`)
- **Đồng nhất ngôn ngữ Tiếng Việt (`docs/ui-design-contract.md` §21):**
  - Việt hóa toàn bộ thanh điều hướng (`Trang chủ`, `Dịch vụ`, `Liên hệ`, `Hỗ trợ`, `Cẩm nang`), khu vực Hero, nhãn thông số và biểu mẫu tìm kiếm bác sĩ (`Tìm kiếm bác sĩ`, `Tên bác sĩ`, `Chuyên khoa`, `Đang nhận lịch`, `Tìm kiếm`).
- **Sửa điều hướng xác thực & nút giả lập (`docs/ui-design-contract.md` §2 & §5.5):**
  - Gộp 2 nút `Sign Up` / `Log In` thành một nút rõ ràng: `"Đăng nhập nội bộ"` dẫn tới `/auth` (do cổng web chỉ dành cho Bác sĩ, Nhân viên, Quản trị viên và không có tự đăng ký).
  - Loại bỏ badge `iOS Patient App` không tồn tại trong phạm vi dự án.
  - Loại bỏ modal `Watch Video` chứa khung video đen giả lập không phát được; đổi nút phụ trên Hero thành liên kết cuộn mượt xuống mục `#services` (`Xem dịch vụ khám`).
- **Chuẩn hóa Modal & Token trên trang chủ (`docs/ui-design-contract.md` §7.1 & §15.2):**
  - Thay các modal tự dựng (`bookingDoctor`, `readingBlog`) bằng component `Modal` dùng chung từ `src/components/ui/modal.tsx` (hỗ trợ đóng bằng phím `Escape` và click ra ngoài backdrop).
  - Thay thế toàn bộ mã màu hex inline (`#1e293b`, `#64748b`, `#f8fafc`, `#e2e8f0`, `#0f172a`) bằng CSS variables (`var(--ink)`, `var(--muted)`, `var(--surface-subtle)`, `var(--line)`).

---

### NHÁNH 2: `fix/m2-user-002-auth-logo-and-profile-integrity` (Owner: Member 2 — Auth & Profile)

#### 2.1. Đồng bộ Logo trên trang `/auth` (`app/auth/page.tsx` & `app/auth/auth.module.css`)
- Thay thẻ `<span className={styles.brandLogo}>+</span>` bằng `<Image src="/images/logo.png" alt="Health&Human Logo" width={34} height={34} />` đặt trong khung `.brandLogo` nền `var(--brand)` (`#2d5bff`), bo góc `var(--radius-md)` (`6px`).

#### 2.2. Khắc phục các nút chết, Tab giả và dữ liệu giả lập trên `/profile` (`src/features/users/profile-form.tsx`)
- **Sửa điều hướng Tab (`ProfileNavigation`):**
  - Sửa điều kiện hiển thị các card theo đúng `activeTab` (`activeTab === "personal"`, `activeTab === "security"`, `activeTab === "notifications"`, `activeTab === "sessions"`) để khi bấm chuyển tab, giao diện thực sự chuyển đúng nội dung của mục đó.
- **Xử lý các trường và nút chưa có API lưu trữ (`docs/ui-design-contract.md` §5.5):**
  - Loại bỏ thẻ `<select>` ngày sinh hardcode 3 giá trị cố định (`14/03/1984`, `20/05/1990`, `10/11/1995`) cùng 2 trường `Giới tính`, `Ngôn ngữ hiển thị` ra khỏi form lưu chính (hoặc chuyển sang trạng thái chỉ đọc/disabled có nhãn `"Sắp ra mắt"`), đảm bảo form chỉ cho phép chỉnh sửa các trường thực sự được gửi và lưu qua `PATCH /api/v1/users/me` (`fullName`, `phone`).
  - Gắn nhãn `disabled` kèm chú thích `"Sắp ra mắt"` cho 2 nút chưa có API (`Đổi ảnh đại diện`, `Đổi mật khẩu`) thay vì để nút bấm không phản hồi.
- **Bảo mật định danh & Tính xác thực dữ liệu:**
  - Che bớt `profile.id` (hiển thị dạng `#` + 8 ký tự cuối, không phơi bày raw UUID).
  - Trong mục `Phiên đăng nhập`, bỏ thông tin giả lập `"Chrome · Windows 11 · TP. Hồ Chí Minh"`; chỉ hiển thị thông tin thực tế từ phiên hiện tại (email, vai trò, trạng thái xác thực đang hoạt động) và nút `"Đăng xuất khỏi thiết bị này"` (có `ConfirmModal`).

---

### NHÁNH 3: `fix/m2-booking-004-confirm-modals-timezone-and-doctor-ui` (Owner: Member 3 — Appointments & Doctors)

#### 3.1. Sửa lỗi lệch ngày theo múi giờ UTC trên `/appointments`
- Tại `src/features/appointments/appointments-panel.tsx` và `src/features/appointments/appointment-filter-bar.tsx`:
  - Thay `new Date().toISOString().split("T")[0]` bằng hàm lấy ngày theo múi giờ `Asia/Ho_Chi_Minh` (`new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())`) để tránh lỗi lùi 1 ngày trong khung giờ 00:00 – 06:59 sáng giờ Việt Nam.
- Làm rõ phạm vi tìm kiếm trên thanh tìm kiếm lịch hẹn (ghi rõ tìm theo tên/mã trên danh sách trang hiện tại).

#### 3.2. Bổ sung `ConfirmModal` cho thao tác `Xác nhận` và `Check-in` (`src/features/appointments/appointments-panel.tsx`)
- Tuân thủ `docs/ui-design-contract.md` §7.1 & §13.2:
  - Mở rộng `confirmDialog` để hiển thị `ConfirmModal` (`variant="primary"`) trước khi gọi API `confirm` (`PENDING` → `CONFIRMED`) và `checkIn` (`CONFIRMED` → `CHECKED_IN`), tương tự như `cancel` và `no-show`.

#### 3.3. Đồng bộ Design System Component trên `/doctors` (`src/features/doctors/*`)
- Tuân thủ `docs/ui-design-contract.md` §7.1:
  - Thay thế các thẻ `<button>` HTML thuần và `<div className={styles.error | styles.notice}>` trong `doctor-panel.tsx`, `doctor-list.tsx`, `schedule-panel.tsx` bằng các component chuẩn `Button`, `Alert`, `Badge` từ `src/components/ui/`.
  - Bổ sung `ConfirmModal` khi thực hiện thao tác ngừng hoạt động bác sĩ, ngừng chuyên khoa hoặc ngừng lịch làm việc.

---

### NHÁNH 4: `fix/m2-record-002-final-confirm-and-role-guard` (Owner: Member 4 — Medical Records)

#### 4.1. Bổ sung `ConfirmModal` khi chốt bệnh án `FINAL` (`src/features/medical-records/medical-records-panel.tsx`)
- Tuân thủ `docs/ui-design-contract.md` §7.1 & `docs/team-task-assignment-m3.md` (`M3-UI-REC-002`):
  - Khi bác sĩ chọn trạng thái `FINAL` (Hoàn tất khám) và bấm lưu, hiển thị `ConfirmModal` cảnh báo rõ: sau khi chốt bệnh án, ca khám sẽ chuyển sang trạng thái `COMPLETED` và khóa chỉnh sửa. Chỉ gửi request sau khi bác sĩ xác nhận.

#### 4.2. Chuẩn hóa phân quyền `/medical-records` (`src/lib/navigation/routes.ts` & `medical-records-panel.tsx`)
- Tuân thủ `docs/ui-design-contract.md` §12.2 & `docs/web-rendering-contract.md` §3.4 (*"ADMIN does not gain clinical record access by virtue of being ADMIN"*):
  - Giới hạn route `/medical-records` trong `routes.ts` và `medical-records-panel.tsx` cho vai trò `["DOCTOR"]` (cập nhật lại unit test liên quan trong `test/access-control.test.ts`).

---

## 4. Quy trình Kiểm thử & Nghiệm thu trước khi Commit Local

Trên mỗi nhánh trước khi tạo commit local và sau khi hợp nhất về nhánh tích hợp:
1. Chạy kiểm thử đơn vị & tích hợp giao diện:
   ```bash
   npm test -w @clinic/clinic-management-web
   ```
2. Kiểm tra kiểu tĩnh TypeScript & Production Build của Next.js:
   ```bash
   npm run build -w @clinic/clinic-management-web
   ```
3. Kiểm tra `git status` và `git log --graph --oneline -n 10`:
   - Đảm bảo không có file rác, không lộ biến môi trường `.env`, các commit được chia đúng nhánh sở hữu và **không chạy `git push`**.
