# Task M3 — TV2: Lht09112005

> **Milestone**: M3 · **Assignee**: Lht09112005  
> **Branch base**: `main` tại commit `189651e` (hoặc `feat/tv3-m3-booking-confirmation` sau khi merge)  
> **Nền tảng**: Next.js (`apps/clinic-management-web`) + Flutter (`apps/patient-app`)  
> **Ngày bắt đầu**: 23/10/2026

---

## Tổng Quan & Thứ Tự Ưu Tiên

| Task ID | Tên | Nền tảng | Ưu tiên | Deadline gợi ý |
| :--- | :--- | :---: | :---: | :--- |
| `M3-UI-USER-005` | **PatientLookupDrawer** ⭐ | Next.js | **P2 — Cần trước Tuần 2** | 27/10 |
| `M3-UI-USER-004` | **Admin User Management nâng cấp** | Next.js | P2 | 29/10 |
| `M3-UI-USER-001` | **Onboarding + Auth App kết nối API** | Flutter | P2 | 05/11 |
| `M3-UI-USER-003` | **Profile bệnh nhân — Thẻ BHYT** | Flutter | P2 | 07/11 |
| `M3-UI-USER-002` | **Clinic Login nâng cấp (Web)** | Next.js | P3 | 10/11 |

> [!IMPORTANT]
> **`M3-UI-USER-005` phải xong trước 27/10** — TV3 (MinhPhatVilla) đang chờ component này để hoàn thiện PR Queue Board. Slot đã được chừa sẵn trong `queue-board.tsx`.

---

## Task 1 — `M3-UI-USER-005`: PatientLookupDrawer (Next.js) ⭐

### Bối cảnh & Mục đích

TV3 đã xây `QueueBoard` trong `app/appointments/page.tsx`. Khi Lễ tân bấm **"Chi tiết lịch hẹn"** của bất kỳ bệnh nhân nào, một dialog mở ra và hiển thị phần `PatientLookup` (xem hồ sơ bệnh nhân nhanh). TV3 đã chừa sẵn **injection slot** — TV2 chỉ cần build component theo đúng interface và truyền vào.

### Contract Interface (đã được TV3 định nghĩa sẵn)

```typescript
// Trong apps/clinic-management-web/src/features/appointments/queue-board.tsx
export interface PatientLookupContext {
  patientId: string;      // UUID của bệnh nhân cần xem
  appointmentId: string;  // UUID lịch hẹn tương ứng
  onClose(): void;        // Gọi khi người dùng đóng
}
export interface QueueBoardProps {
  PatientLookup?: ComponentType<PatientLookupContext>;
}
```

### Cách tích hợp vào Queue Board

```typescript
// apps/clinic-management-web/app/appointments/page.tsx
import { QueueBoard } from "../../src/features/appointments/queue-board";
import { PatientLookupDrawer } from "../../src/features/users/patient-lookup-drawer";

export default function AppointmentsPage() {
  return <QueueBoard PatientLookup={PatientLookupDrawer} />;
}
```

### File nguồn có sẵn

`apps/clinic-management-web/src/features/users/patient-selector.tsx` — component tìm kiếm bệnh nhân (gọi `GET /api/v1/patients`, debounce 250ms, có sẵn state loading/error/empty). **Tái sử dụng lại `PatientSelector` — không viết lại logic search**.

### API sử dụng

```
GET /api/v1/patients?q=<query>&limit=10&appointmentId=<id>
    → { items: PatientItem[] }  (role STAFF/ADMIN — gọi qua Gateway)

GET /api/v1/appointments/<appointmentId>
    → { id, patientId, doctorId, status, scheduledStartAt, ... }

GET /api/v1/users/<patientId>   (dùng patient-scope endpoint)
    → { id, fullName, phone, dateOfBirth, insuranceNumber, address, ... }
```

> [!CAUTION]
> **Không gọi trực tiếp Supabase.** Mọi request phải qua `createBrowserApiClient(session)` từ `src/lib/api/client.ts`.  
> **Role DOCTOR không được gọi `GET /api/v1/users/:id`** cho lịch hẹn trạng thái `CANCELLED` hoặc `NO_SHOW`. Queue Board đã handle phần này — component chỉ cần hiển thị data nhận được.

### Giao diện cần xây

Tạo file mới: `apps/clinic-management-web/src/features/users/patient-lookup-drawer.tsx`

**Layout trong dialog detail (không cần tạo modal riêng — TV3 đã có dialog container):**

```
┌─────────────────────────────────────────┐
│  Hồ sơ bệnh nhân                        │
│  ─────────────────────────────────────  │
│  Họ tên:     Nguyễn Văn A               │
│  SĐT:        090x xxx xxx               │
│  Ngày sinh:  12/05/1985                 │
│  Thẻ BHYT:   DN401...*** (masked)       │
│  Địa chỉ:    12 Lê Lợi, Q.1, TP.HCM   │
│  ─────────────────────────────────────  │
│  Lịch sử đặt khám gần đây              │
│  • 15/10 - BS. Trần B - Hoàn thành ✅  │
│  • 08/09 - BS. Lê C  - Đã hủy ❌       │
│  ─────────────────────────────────────  │
│                        [Đóng]           │
└─────────────────────────────────────────┘
```

**Yêu cầu chi tiết:**
1. **Fetch hồ sơ**: Gọi `GET /api/v1/users/{patientId}` khi component mount. Hiển thị LoadingState (skeleton) trong lúc chờ.
2. **Masking số BHYT**: Hiển thị `insuranceNumber` dưới dạng `"DN401...***"` — chỉ giữ 5 ký tự đầu, phần còn lại thay bằng `***`. Ví dụ: `"DN40112345678"` → `"DN401...***"`.
3. **Lịch sử đặt lịch**: Gọi `GET /api/v1/appointments?patientId={patientId}&limit=5&sort=desc` — hiển thị tối đa 5 lịch hẹn gần nhất (ngày, tên bác sĩ, trạng thái badge).
4. **Error state**: Nếu fetch thất bại, hiển thị thông báo lỗi + nút "Thử lại". Không crash toàn bộ Queue Board.
5. **Nút Đóng**: Gọi `onClose()` prop.
6. **Không implement chức năng chọn/edit bệnh nhân** — đây chỉ là **read-only view**.

### Tiêu chí nghiệm thu

- [ ] Gắn `PatientLookupDrawer` vào `QueueBoardProps.PatientLookup` → hiển thị khi click "Chi tiết lịch hẹn".
- [ ] Số BHYT được masked đúng format `"XXXXX...***"`.
- [ ] Hiển thị Loading skeleton khi đang fetch.
- [ ] Error state có nút Thử lại, không crash Queue Board.
- [ ] Lịch sử tối đa 5 lịch hẹn gần nhất với badge trạng thái màu.
- [ ] Viết tối thiểu 1 unit test kiểm tra rendering và masking logic.

---

## Task 2 — `M3-UI-USER-004`: Admin User Management nâng cấp (Next.js)

### File nguồn

`apps/clinic-management-web/app/users/page.tsx` (đã có ~75%, kết nối API thật)

### Những gì đã có sẵn

- Bảng danh sách tài khoản với phân trang.
- Tìm kiếm theo tên/SĐT/email, lọc theo role và status.
- Nút khóa/mở khóa tài khoản (gọi API đã hoạt động).

### Những gì cần thêm

**1. Confirmation Modal trước khi khóa tài khoản**

Hiện tại nút "Khóa" thực thi ngay lập tức — cần thêm modal xác nhận:

```
┌───────────────────────────────────────┐
│  ⚠️  Xác nhận khóa tài khoản         │
│                                       │
│  Bạn có chắc muốn khóa tài khoản     │
│  của Nguyễn Văn A (DOCTOR)?          │
│  Tài khoản bị khóa sẽ không thể      │
│  đăng nhập cho đến khi được mở lại.  │
│                                       │
│       [Hủy]    [Xác nhận khóa]       │
└───────────────────────────────────────┘
```

**2. Badge trạng thái màu trực quan**

Thay thế text status thô bằng Badge:
- `ACTIVE` → badge **xanh lá** (`bg-emerald-100 text-emerald-700`)
- `LOCKED` → badge **đỏ** (`bg-rose-100 text-rose-700`)
- `INACTIVE` → badge **xám** (`bg-slate-100 text-slate-600`)

**3. Tìm kiếm debounce 300ms**

Hiện tại search cần bấm Enter. Thêm debounce 300ms để tự động search khi người dùng gõ:

```typescript
useEffect(() => {
  const timer = setTimeout(() => fetchUsers(1), 300);
  return () => clearTimeout(timer);
}, [searchQuery, roleFilter, statusFilter]);
```

**4. Loading state trên nút action**

Khi đang gọi API khóa/mở khóa: disable nút, hiển thị "Đang xử lý..." thay vì text gốc.

### API

```
PATCH /api/v1/users/:id   { status: "LOCKED" | "ACTIVE" }
```

### Tiêu chí nghiệm thu

- [ ] Khóa tài khoản phải qua confirm modal trước.
- [ ] Badge màu hiển thị đúng theo status.
- [ ] Search tự động sau 300ms debounce (không cần bấm Enter).
- [ ] Nút action hiển thị loading, disabled khi đang xử lý.
- [ ] Không thể tự khóa tài khoản của mình.

---

## Task 3 — `M3-UI-USER-001`: Onboarding + Auth App kết nối API (Flutter)

### File nguồn

- `apps/patient-app/lib/features/onboarding/welcome_page.dart` (có UI Figma, ~50%)
- `apps/patient-app/lib/features/auth/auth_page.dart` (có UI đẹp, ~75%)
- `apps/patient-app/lib/features/auth/widgets/login_form.dart` (có UI)
- `apps/patient-app/lib/features/auth/widgets/register_form.dart` (có UI)

### Những gì đã có sẵn

- `WelcomePage`: màn hình 1 slide Figma với nền xanh `ClinicColors.primary`, card nghiêng, nút mũi tên.
- `AuthPage`: tách widget `LoginForm` + `RegisterForm` + `SsoButtons`, layout đúng Figma.
- `LoginForm`: form có text field + toggle ẩn/hiện mật khẩu + `onSubmit` callback.

### Những gì cần làm

**1. Mở rộng WelcomePage thành Onboarding 3 slides**

Chuyển `WelcomePage` từ màn hình tĩnh thành `PageView` 3 slides:

| Slide | Tiêu đề | Mô tả |
| :---: | :--- | :--- |
| 1 | "Đặt lịch khám dễ dàng" | Chọn bác sĩ, chuyên khoa, ngày giờ phù hợp. |
| 2 | "Theo dõi lịch hẹn" | Xem vé khám, QR check-in, đổi/hủy lịch linh hoạt. |
| 3 | "Hồ sơ sức khỏe của bạn" | Xem bệnh án, đơn thuốc, tiền sử khám bệnh. |

Mỗi slide có: hình minh họa (icon lớn Material), tiêu đề, mô tả, dot indicator. Slide cuối có nút **"Bắt đầu"** → navigate sang `AuthPage`.

**2. Kết nối API thực cho LoginForm**

Hiện tại `LoginForm` nhận `onSubmit(email, password)` callback nhưng `AuthPage` chưa implement logic thực. Cần:

```dart
// Gọi Supabase Auth qua session provider (không gọi trực tiếp Supabase từ widget)
// Dùng SessionProvider / onLogin callback đã được inject từ PatientShell
Future<void> _handleLogin(String email, String password) async {
  await session.signIn(email: email, password: password);
  // Nếu thành công: PatientShell tự navigate vào app
  // Nếu thất bại: LoginForm hiển thị lỗi bên dưới ô nhập liệu
}
```

**Validation real-time cần có:**
- Email: format hợp lệ (có `@` và domain).
- Password: ít nhất 8 ký tự.
- Lỗi hiển thị bên dưới từng ô nhập, **không dùng `showDialog`**.

**3. Kết nối API thực cho RegisterForm**

Tương tự login, wiring `onRegister(name, email, password)` với Supabase Auth.  
Sau đăng ký thành công: hiển thị thông báo "Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản." và chuyển về tab Login.

**4. Tích hợp vào PatientShell**

Kiểm tra `app_routes.dart` để đảm bảo route `/auth` hiển thị Onboarding trước khi vào `AuthPage` (nếu là lần đầu mở app — dùng `SharedPreferences` để đánh dấu).

### Tiêu chí nghiệm thu

- [ ] 3 slides Onboarding với PageView, dot indicator, nút "Bắt đầu".
- [ ] API Login gọi đúng, lỗi hiển thị inline dưới ô nhập.
- [ ] Validation real-time email + password.
- [ ] API Register gọi đúng, thông báo xác nhận email.
- [ ] Không gọi Supabase trực tiếp từ widget — dùng `session.signIn()` / `session.signUp()`.

---

## Task 4 — `M3-UI-USER-003`: Profile bệnh nhân — Thẻ BHYT (Flutter)

### File nguồn

`apps/patient-app/lib/features/users/profile_page.dart` (đã có UI đẹp, kết nối API ~80%)

### Những gì cần thêm

**1. Thẻ BHYT dạng Card đồ họa**

Thêm widget `InsuranceCard` bên dưới avatar trong `ProfilePage`:

```
┌────────────────────────────────────────────┐
│  🏥  Health&Human                  BẢO HIỂM│
│                                            │
│  Họ tên:   NGUYỄN VĂN A                    │
│  Mã BHYT:  DN401...***                     │
│  Ngày sinh: 12/05/1985                     │
│  Hạn dùng: 31/12/2027                     │
│                                  [Thẻ mẫu]│
└────────────────────────────────────────────┘
```

Thiết kế: nền gradient xanh (`ClinicColors.primary` → teal), bo góc 16, text trắng. Widget nằm trong `widgets/insurance_card.dart`.

**2. Masking số BHYT**

```dart
String maskInsurance(String? number) {
  if (number == null || number.length <= 5) return number ?? '—';
  return '${number.substring(0, 5)}...***';
}
```

Áp dụng nhất quán ở `InsuranceCard` và bất kỳ nơi nào hiển thị `insuranceNumber` trong profile.

**3. Confirmation Dialog trước khi lưu thay đổi**

Hiện tại nút Save gọi API ngay. Thêm `showDialog` xác nhận:

```
Xác nhận cập nhật hồ sơ?
[Hủy]  [Lưu thay đổi]
```

### Tiêu chí nghiệm thu

- [ ] `InsuranceCard` widget hiển thị đẹp mắt với gradient và bo góc.
- [ ] Số BHYT được masked `"XXXXX...***"` trong Card và mọi nơi trong profile.
- [ ] Save profile có confirmation dialog trước.
- [ ] Form edit có validation cơ bản (tên không rỗng, SĐT đúng format).

---

## Task 5 — `M3-UI-USER-002`: Clinic Login nâng cấp (Next.js)

### File nguồn

`apps/clinic-management-web/app/auth/page.tsx` (có UI đơn giản ~75%)

### Thiết kế Split-screen

```
┌────────────────┬──────────────────────────┐
│                │                          │
│   Hình ảnh     │    Health&Human           │
│   phòng khám   │    ──────────────────    │
│   (gradient    │    Email                  │
│   xanh teal)   │    [                   ] │
│                │    Mật khẩu              │
│   Health &     │    [                  👁]│
│   Human        │    □ Ghi nhớ tài khoản   │
│   Chào mừng    │                          │
│   trở lại      │    [   Đăng nhập   ]     │
│                │                          │
└────────────────┴──────────────────────────┘
```

**Yêu cầu:**
- Màn hình chia đôi 50/50: bên trái là hình ảnh/gradient thương hiệu, bên phải là form.
- Responsive: dưới 768px → ẩn bên trái, chỉ hiển thị form full-width.
- "Ghi nhớ tài khoản": lưu email vào `localStorage` khi checked.
- Toggle ẩn/hiện mật khẩu với icon mắt.
- Loading state trên nút Đăng nhập khi đang xử lý.

### Tiêu chí nghiệm thu

- [ ] Split-screen trên màn hình ≥ 768px.
- [ ] Form full-width trên mobile.
- [ ] "Ghi nhớ tài khoản" lưu và tự điền email lần sau.
- [ ] Toggle mật khẩu hoạt động.

---

## Quy Tắc Chung (bắt buộc tuân thủ)

1. **Không gọi Supabase trực tiếp từ widget/component** — luôn dùng `session` provider hoặc `createBrowserApiClient(session)`.
2. **Mọi màn hình phải có đủ 4 UI states**: Loading (Skeleton) · Empty · Error (nút Retry) · Success.
3. **Số BHYT phải masked** ở mọi nơi hiển thị: `"XXXXX...***"`.
4. **Confirmation dialog** trước mọi thao tác phá hoại (khóa tài khoản, lưu hồ sơ).
5. **Không sửa file trong** `src/features/appointments/`, `src/features/doctors/` — domain của TV3.
6. **Không sửa** `src/lib/api/client.ts`, `app_routes.dart`, `patient_shell.dart` — platform của TV1.
7. Branch name gợi ý: `feat/tv2-m3-user-ui`.

---

## Dependency & Unblocking TV3

> [!IMPORTANT]
> **Sau khi hoàn thành `M3-UI-USER-005`**, cập nhật `app/appointments/page.tsx`:
>
> ```typescript
> import { QueueBoard } from "../../src/features/appointments/queue-board";
> import { PatientLookupDrawer } from "../../src/features/users/patient-lookup-drawer";
>
> export default function AppointmentsPage() {
>   return <QueueBoard PatientLookup={PatientLookupDrawer} />;
> }
> ```
>
> Báo TV3 (MinhPhatVilla) và TV1 (WilliamsHugh) để kiểm tra tích hợp trước khi merge.
