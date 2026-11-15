# Phân công chỉnh sửa Web UI song song

**Ngày:** 15/11/2026. **Base:** `b1d3113bd595be6a46071ec20f3d086e369a8e5e`, nhánh tích hợp `feat/m3-ui-acceptance-integrated`. Đây là kế hoạch đang sử dụng, thay các kế hoạch/handoff trong [archive](archive/m3-2026-11-15/README.md).

**Trạng thái: ĐÃ HOÀN TẤT TÍCH HỢP THEO MỤC 6 CỦA BÀN GIAO.** Ba checkpoint của agent (TV2, TV3, TV4) và các thay đổi checkout chính (TV1) đã được commit và cherry-pick tuần tự vào nhánh `feat/m3-ui-acceptance-integrated`. Đã hoàn tất nối dây auth/recovery, vượt qua toàn bộ 279 tests, typecheck, next build và đã chụp kiểm chứng UI trực tiếp.

## 1. Phạm vi đã được yêu cầu

Thực thi [đề xuất UI](web-ui-redesign-proposal.md) trong phạm vi frontend có thể hoạt động với API hiện tại: thống nhất khung, sửa responsive, nhóm tác vụ, skeleton/error, bỏ nội dung lặp hoặc chưa hỗ trợ và khắc phục thông báo trạng thái sai. Không thay backend, database, env, Flutter hay chính sách quyền. Không giả backend đã có MFA/grant/session v2.

Mã M2 dưới đây là **assignment mới cho lượt sửa UI này**, dùng để đáp ứng quy tắc định danh và ownership; không đánh dấu lại các task backend M2 cũ. Registry backend ngoài repo vẫn là nguồn tra cứu task backend lịch sử. Người dùng cho phép thực thi liên domain; mỗi agent vẫn có tập file riêng để tránh xung đột.

## 2. Quy tắc chạy song song

- Một agent/một nhánh làm việc. Các checkout tạm của agent đã được tích hợp và dọn dẹp sạch; giữ nhánh/commit truy nguyên.
- Base chung là SHA trên; không khởi tạo từ main cũ làm mất UI mới. Các nhánh acceptance trước đã nằm trong HEAD, không triển khai lại nguyên patch cũ.
- Không sửa file được giao agent khác; báo main agent nếu cần thay API component dùng chung. Main agent sở hữu `globals.css`, shell, PageHeader, primitives, API client chung và docs.
- Giữ Next.js cho DOCTOR/STAFF/ADMIN; mọi request qua Gateway. Không truy cập Supabase trực tiếp, không gọi DB thật hoặc mutation trên dữ liệu thật trong lượt sửa UI.
- Giữ palette/Inter/token/layout đã duyệt. Header/tên cột/label không biến thành skeleton; role người đăng nhập chỉ một lần trên header.
- Typecheck và test có ý nghĩa theo feature trong từng nhánh. Main tích hợp tuần tự, chạy web suite/build và nhìn render desktop/mobile. Fixture không phải bằng chứng E2E.
- Chỉ commit local phần đã review; không push, mở PR, merge main hay chỉnh worktree backend. Sau tích hợp và kiểm tra sạch, đã dọn checkout `ui-*`; giữ branch/commit truy nguyên.

## 3. Các task đã tích hợp

| Member / task | Nhánh | Phạm vi sở hữu | Trạng thái |
|---|---|---|---|
| TV1 / `M2-PLATFORM-003` | `feat/m3-ui-acceptance-integrated` | Docs; shared shell/PageHeader/UI primitives/API client; layout dashboard; landing | INTEGRATED (`db6806d`) |
| TV2 / `M2-USER-003` | `fix/m2-user-003-web-profile-session-recovery` | `src/features/users/**`, `src/lib/session/**`, test auth/profile/session liên quan | INTEGRATED (`3f9e9cd`) |
| TV3 / `M2-BOOKING-005` | `fix/m2-booking-005-web-appointments-doctors-layout` | `src/features/appointments/**`, `src/features/doctors/**`, test tương ứng | INTEGRATED (`8990f8f`) |
| TV4 / `M2-RECORD-003`, `M2-NOTIFY-002` | `fix/m2-record-003-web-records-notifications-layout` | `src/features/medical-records/**`, `src/features/notifications/**` trừ context dùng chung; test tương ứng | INTEGRATED (`c67a3a8`) |
| Tích hợp & Nối dây | `feat/m3-ui-acceptance-integrated` | Nối `/auth` với AuthForm, banner recovery trên AppShell, sửa types và test recovery | COMMITTED (`d027c37`) |

Các source path đều tương đối với `apps/clinic-management-web/`. Dependencies chung: UI/render contract, API v1 và proposal/API v2 ở repo tích hợp. Chỉ gọi endpoint đã có, chưa bật các endpoint đích mới.

### TV1 / M2-PLATFORM-003 — Khung chung, tài liệu, tích hợp

- [x] Chuyển 11 tài liệu cũ vào archive, cập nhật link và tạo một chỉ mục tài liệu đang dùng.
- [x] Dùng một frame căn giữa, PageHeader cùng typography, shell cố định và logout luôn tiếp cận được.
- [x] Header mobile không tràn, có role một lần; drawer đóng không nhận focus, mở quản lý Tab/Escape/focus trả lại.
- [x] Input có focus/label/error; nút và icon có vùng bấm phù hợp; skeleton hỗ trợ reduced motion.
- [x] Landing bỏ claim và CTA giả; giữ nội dung có nguồn và lối vào web quản lý, không thêm Patient Web.
- [x] Tích hợp các nhánh theo phạm vi, kiểm tra web test/typecheck/build và render sau tích hợp; ghi kết quả thật.

### TV2 / M2-USER-003 — Cá nhân, đăng nhập, phục hồi phiên

- [x] Profile gọn: thông tin cá nhân và bảo mật/phiên theo khả năng thực; bỏ avatar/preferences giả và role lặp của chính mình.
- [x] Giữ chỉnh tên/số điện thoại, email read-only; dữ liệu lỗi không che title/label hoặc xóa input.
- [x] Copy đăng xuất khớp global provider hiện tại; không hứa current-device trước migration backend.
- [x] Refresh network/5xx giữ credential và ngữ cảnh để thử lại; lỗi terminal vẫn kết thúc phiên; không dùng access token hết hạn để tiếp tục nghiệp vụ.
- [x] Checkbox ghi nhớ nói đúng hành vi hiện có; không cho tự thay hạn phiên bằng lựa chọn UI.
- [x] Kiểm tra transient/terminal auth và auth/profile flow liên quan; không thêm MFA frontend giả.

### TV3 / M2-BOOKING-005 — Lịch hẹn và bác sĩ

- [x] Mobile thấy bệnh nhân + thời gian + trạng thái trước khi thao tác; giữ desktop table và chức năng hiện có.
- [x] Bảng/hàng đợi dùng cùng quy tắc quyền và ConfirmModal cho xác nhận/check-in.
- [x] Search cục bộ ghi rõ phạm vi, không giấu pagination khi trang hiện tại không khớp.
- [x] Trang bác sĩ tách tab lịch/danh sách/chuyên khoa theo role; form quản trị không đẩy lịch xuống cuối trang.
- [x] Lịch mobile phù hợp viewport; giữ phân trang/lỗi độc lập và không suy ra slot trống khi dependency lỗi.
- [x] Kiểm tra action/confirm/doctor UI, không gọi `/doctors/me` trước khi provider có route.

### TV4 / M2-RECORD-003 và M2-NOTIFY-002 — Khám và thông báo

- [x] Chưa chọn ca: hướng dẫn gọn; đã chọn: ngữ cảnh ca, form đang khám và lịch sử có cấu trúc rõ.
- [x] Giữ deep link, input sau lỗi, FINAL read-only; label thuốc bền vững, không chỉ dùng placeholder.
- [x] Không báo appointment COMPLETED chỉ từ lưu FINAL; phân biệt đã chốt và chưa xác nhận đồng bộ.
- [x] Skeleton/error theo vùng, không che tiêu đề; không lọc cứng trang đầu rồi gọi là toàn bộ ca cần khám.
- [x] Mark-read nói đúng phạm vi trang; giữ partial failure và badge logic hiện có.
- [x] Kiểm tra record submit/read-only/notifications theo behavior đã đổi; không giả clinical grant/proof.

## 4. Task tiếp theo phụ thuộc backend v2

| Follow-up | Phụ thuộc cần có trước | Tiêu chí không được bỏ qua |
|---|---|---|
| Phiên/MFA theo role | User/Gateway trả metadata/state, endpoints session/activity/MFA/recovery và invalidation | PENDING_MFA/LOCKED/EXPIRED/REVOKED, không logout vì 503, khóa đồng bộ tab |
| Mở và chốt bệnh án v2 | Clinical grants, finalization-context, version/proof/idempotency | Backend kiểm tra scope ca/bệnh nhân, TOTP mới khi chốt, chống replay và nội dung thay đổi |
| Dashboard đầy đủ | Appointment q/include/view/sort và summary | Lọc/tổng trên toàn tập; không giả 0, không lộ reason trước grant |
| Thông báo toàn tập | unread-count/read-all cutoff | Không đánh dấu nhầm notification mới đến sau cutoff |
| Thiết bị/đổi role an toàn | Session list/revoke, scope current/all, operation-bound proof | Copy khớp hành vi server; quyền mới/thu hồi có hiệu lực |

Các follow-up này chưa được đánh dấu implemented trong đợt UI. TTL clinical grant, điều kiện mở ca, cửa sổ đọc lại 1/2 năm và recovery factor vẫn theo mục quyết định mở của API v2.

## 5. Kết quả tích hợp

Đã thực hiện tích hợp đầy đủ 3 nhánh checkpoint TV2, TV3, TV4 vào `feat/m3-ui-acceptance-integrated`:

- **Chuỗi commit**:
  1. `db6806d`: Khung dùng chung, landing dọn sạch, tài liệu archive và chỉ mục mới (TV1).
  2. `3f9e9cd`: Cherry-pick TV2 profile tinh gọn, session recovery (`d55f9bc`).
  3. `8990f8f`: Cherry-pick TV3 booking mobile reflow, doctor 3-tab layout (`9842922`).
  4. `c67a3a8`: Cherry-pick TV4 medical records workspace, page-scoped notifications (`77d8bc8`).
  5. `d027c37`: Hợp nhất `/auth` vào `AuthForm`, hiển thị recovery banner trên `AppShell`, fix typecheck `handleUnauthorized`, bổ sung test suite `session-recovery.test.tsx`.
- **Kiểm tra tự động**:
  - `npm run typecheck -w @clinic/clinic-management-web`: **PASS** (0 lỗi).
  - `npm run test -w @clinic/clinic-management-web`: **27/27 test files PASS, 279/279 tests PASS** (100%).
  - `npm run build -w @clinic/clinic-management-web`: **PASS** (tạo 13/13 static routes production).
  - `git diff --check`: **PASS** (0 lỗi).
- **Kiểm chứng giao diện thực tế**:
  - Đã chụp ảnh render toàn diện ở các breakpoint 1440px, 390px, 320px tại [docs/reviews/2026-11-15-integrated-ui/](reviews/2026-11-15-integrated-ui/README.md).
  - Đã dọn dẹp các worktree tạm `ui-booking`, `ui-record`, `ui-user`. Worktree `backend-openapi` được bảo toàn nguyên vẹn.
