# Bằng chứng rà UI sau tích hợp (15/11/2026)

Thực hiện sau khi hoàn tất tích hợp 3 checkpoint (TV2, TV3, TV4) và commit tích hợp `d027c37` trên nhánh `feat/m3-ui-acceptance-integrated`.

## 1. Kết quả kiểm tra tự động

- **Typecheck**: `npm run typecheck -w @clinic/clinic-management-web` — **PASS** (0 lỗi).
- **Unit & Integration Tests**: `npm run test -w @clinic/clinic-management-web` — **27/27 test files, 279/279 tests PASS**.
- **Production Build**: `npm run build -w @clinic/clinic-management-web` — **PASS** (13/13 static routes compiled thành công).
- **Format / Git check**: `git diff --check` — **PASS** (0 lỗi định dạng).

## 2. Danh mục ảnh chụp kiểm chứng UI

Chụp bằng Chrome headless thông qua script `shoot.mjs` trên server Next.js production build (`http://localhost:5174`) và synthetic read-only review proxy (`http://localhost:5307`):

| Ảnh | Viewport | Giao diện kiểm tra | Ghi chú / Trạng thái |
|---|---|---|---|
| [home-live-1440.png](home-live-1440.png) | 1440×1630 (Desktop) | Trang chủ `/` | Đã dọn sạch claim giả, giữ Inter/palette chuẩn, CTA rõ ràng |
| [home-live-390.png](home-live-390.png) | 390×2143 (Mobile) | Trang chủ `/` | Reflow dọc gọn gàng, không tràn ngang |
| [auth-live-1440.png](auth-live-1440.png) | 1440×900 (Desktop) | Đăng nhập `/auth` | Dùng AuthForm chuẩn, focus management, remember email |
| [auth-live-390.png](auth-live-390.png) | 390×844 (Mobile) | Đăng nhập `/auth` | Vùng bấm đạt chuẩn ≥44px, nút ẩn/hiện mật khẩu tiếp cận tốt |
| [auth-live-320.png](auth-live-320.png) | 320×844 (Small Mobile) | Đăng nhập `/auth` | Không tràn ngang ở màn hình 320px |
| [dashboard-doctor-fixture-1440.png](dashboard-doctor-fixture-1440.png) | 1440×900 (Desktop) | Tổng quan `/dashboard` | Khung căn giữa tối đa 1050px, thông tin chuẩn |
| [appointments-staff-fixture-1440.png](appointments-staff-fixture-1440.png) | 1440×900 (Desktop) | Lịch hẹn `/appointments` | Bảng đầy đủ trạng thái, role badge một lần ở topbar |
| [appointments-staff-fixture-390.png](appointments-staff-fixture-390.png) | 390×844 (Mobile) | Lịch hẹn `/appointments` | Bảng chuyển sang dạng thẻ, bệnh nhân + thời gian + trạng thái rõ ràng |
| [doctors-admin-fixture-1440.png](doctors-admin-fixture-1440.png) | 1440×900 (Desktop) | Bác sĩ `/doctors` | Tách 3 tab rõ ràng (Lịch làm việc, Danh sách, Chuyên khoa) |
| [medical-records-doctor-fixture-1440.png](medical-records-doctor-fixture-1440.png) | 1440×900 (Desktop) | Hồ sơ khám `/medical-records` | Bố cục workspace chọn ca, form dài chỉ mở khi đã chọn ca |
| [notifications-doctor-fixture-1440.png](notifications-doctor-fixture-1440.png) | 1440×900 (Desktop) | Thông báo `/notifications` | Danh sách gọn, đánh dấu đọc theo phạm vi trang thật |
| [profile-admin-fixture-1440.png](profile-admin-fixture-1440.png) | 1440×900 (Desktop) | Hồ sơ `/profile` | Gom 2 nhóm (Thông tin cá nhân & Bảo mật/phiên), bỏ lặp role |

> [!NOTE]
> Mọi ảnh kiểm tra fixture đều được chạy qua proxy chặn hoàn toàn các request mutation (chỉ đọc), không tương tác với database hay tài khoản bệnh nhân thật.
