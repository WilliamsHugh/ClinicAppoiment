# Bàn giao chỉnh sửa Web UI cho agent tiếp theo

**Ngày:** 15/11/2026. **Lý do chốt:** người dùng yêu cầu dừng lượt làm việc để chuyển sang agent khác trước giới hạn phiên. Không có yêu cầu hủy hoặc bỏ các thay đổi đang làm.

**Trạng thái chung: đang ở checkpoint, chưa nghiệm thu.** Ba agent đã dừng và commit local trên nhánh riêng. Checkout chính có thay đổi chưa commit; chưa cherry-pick các checkpoint, chưa chạy full suite/build hoặc xem render sau tích hợp. Không push, không merge main, không sửa backend/env.

## 1. Đọc trước khi tiếp tục

1. [Repository rules](../.agents/rules.md) và `AGENTS.md` ở root.
2. [Chỉ mục docs](README.md), [phân công hiện tại](web-ui-parallel-tasks.md), [đề xuất UI từng trang](web-ui-redesign-proposal.md).
3. [UI Design Contract](ui-design-contract.md), [Web Rendering Contract](web-rendering-contract.md), source tương ứng.
4. [API v1](api-contract.md) là baseline triển khai; [API v2](api-contract-v2.md) là thiết kế đích, **không phải toàn bộ endpoint đã hoạt động**. [Audit FE–BE](project-audit-report.md) ghi theo snapshot cũ.

User muốn giao diện đồng nhất với trang lịch hẹn: tên trang, mô tả tác vụ, chức năng. Giữ xanh thương hiệu/Inter/tokens, sidebar/header cố định và logout tiếp cận được. Role người đăng nhập chỉ xuất hiện một lần ở header; tên không được lấy từ enum role. Header/tên cột/label giữ nguyên qua loading/error; skeleton chỉ dữ liệu. PATIENT dùng Flutter, không tạo Patient Web. Mọi request frontend qua Gateway.

## 2. Vị trí code và checkpoint

Repo chính: `/home/Williams/Projects/ClinicAppoiment`.

| Khu vực | Nhánh / HEAD | Vị trí và trạng thái |
|---|---|---|
| Tích hợp UI, TV1 / M2-PLATFORM-003 | `feat/m3-ui-acceptance-integrated`, `b1d3113bd595be6a46071ec20f3d086e369a8e5e` | Repo chính; shared UI/docs/landing đang là working-tree changes, chưa commit |
| Tài khoản/phiên, TV2 / M2-USER-003 | `fix/m2-user-003-web-profile-session-recovery`, `d55f9bc55fcd55ac8c7e7fee661add1d2fc0909e` | `../ClinicAppoiment-worktrees/ui-user`; sạch, commit local |
| Lịch hẹn/bác sĩ, TV3 / M2-BOOKING-005 | `fix/m2-booking-005-web-appointments-doctors-layout`, `9842922bf82f1c875eb1028384ad0e304a9a69e9` | `../ClinicAppoiment-worktrees/ui-booking`; sạch, commit local |
| Khám/thông báo, TV4 / M2-RECORD-003 + M2-NOTIFY-002 | `fix/m2-record-003-web-records-notifications-layout`, `77d8bc874906304ce6641e8801d107b4f595e39e` | `../ClinicAppoiment-worktrees/ui-record`; sạch, commit local |
| Backend hiện hữu | `test/m2-integration-002-openapi-contract-tests`, `dad4f96` | `../ClinicAppoiment-worktrees/backend-openapi`; không thay đổi trong lượt UI |

Ba nhánh UI đều bắt đầu từ `b1d3113`; chưa nằm trong HEAD checkout chính. Đừng xóa worktree/branch trước khi tích hợp. Các worktree nằm ngoài `/tmp`, dùng node_modules symlink; hook tự liên kết config/cert cục bộ, không commit/đọc/in secret từ đó. Không có backend test/live write trong lượt này.

## 3. Checkout chính đã sửa những gì

Các file dưới `apps/clinic-management-web/`, ngoài README/docs:

- `src/components/app-shell.tsx` và `.module.css`: header mobile gọn; ngày ở hàng phụ; role một lần; drawer đóng inert, mở focus trap/Tab/Escape và trả focus; logout hit area; một outer frame tối đa 1050px.
- `src/components/page-header.module.css`: tên trang 24px/600 theo contract.
- `src/components/ui/input.tsx`, `ui.module.css`: focus-visible, ID bằng useId, chuyển className vào control, liên kết lỗi select/textarea, hit area 44px và reduced-motion cho skeleton/modal.
- `src/components/route-guard.tsx`: bỏ phần lặp raw role ngoài header ở thông báo không có quyền. Chưa tái cấu trúc toàn bộ fallback từng trang.
- `app/globals.css`, `src/features/dashboard/dashboard.module.css`: căn cùng frame; **chưa sửa logic lấy/tính dữ liệu dashboard**.
- `src/lib/api/client.ts`: giữ nguyên ApiClientError do getAccessToken ném; thông báo theo code cho session unavailable/MFA/clinical/version conflict. Chưa có state machine v2 hoặc luồng xác minh mới.
- `src/features/landing/clinic-landing-page.tsx`, `.module.css`: trang chủ gọn hơn, bỏ catalogue/availability/ratings mẫu, số liệu/claim không có nguồn, bài viết gán tác giả và CTA giả; giữ hướng dẫn bệnh nhân, lối vào web quản lý, role trên header và xác nhận logout global. Dùng minh họa sẵn có với alt minh họa; không ngụ ý là nhân sự thật.
- `test/app-shell-navigation.test.tsx` mới; cập nhật `test/app-shell.test.tsx` và `test/landing-page.test.tsx` theo hành vi mới.

Những thay đổi này **chưa được xem render**. Đặc biệt rà header ở 320/390px, frame 1050px với bảng/form, menu khi resize, input tương tác và landing sau khi tích hợp session/profile.

## 4. Ba checkpoint của agent

### TV2 — Profile và phục hồi phiên

8 file: `src/features/users/{profile-form.tsx,profile.module.css,auth-form.tsx,auth-form.module.css,index.ts}`, `src/lib/session/{session.ts,session-context.tsx}`, `test/auth-profile.test.tsx`.

Đã gom profile hai nhóm, bỏ role lặp và placeholder; giữ chỉnh thông tin và copy logout global. Refresh lỗi tạm thời giữ credential, chặn dùng access token hết hạn. Bổ sung optional `Session.recovery = {message,pending,retry()}`; không đổi ba giá trị Session.status hiện tại.

**Thiếu việc nối dây:** `/auth` vẫn là form riêng trong `app/auth/page.tsx`, chưa dùng AuthForm đã sửa. Cần hợp nhất một form duy nhất và giữ hành vi remember-email/login/redirect. Shell chưa hiển thị recovery banner/CTA từ `session.recovery`. Viết test network/5xx, terminal errors và gộp refresh; rà thay account/role và tab để không lộ dữ liệu cũ.

### TV3 — Lịch hẹn và bác sĩ

14 file trong `src/features/appointments/`, `src/features/doctors/`, test `appointments-doctors-agent-b`, `appointments`, `doctor-screen`, `queue-board`.

Đã sửa hàng ca mobile, gom action phụ, giữ pagination khi search cục bộ không khớp; queue confirm/check-in qua ConfirmModal. Trang bác sĩ có ba tab, form thu gọn, chọn doctor bằng userId khi xác định được, lỗi theo vùng và phân trang nghỉ phép.

**Thiếu:** typecheck SHA cuối; xem render với shared frame/input/button sau tích hợp, 390/768/1440px và zoom; keyboard/menu; rà đổi actor/session/cache. Kiểm tra điều hướng giữa tab vẫn tìm được chức năng cũ. Không gọi `/doctors/me` mới trước khi có provider.

### TV4 — Hồ sơ khám và thông báo

10 file: `src/features/medical-records/{medical-records-panel.tsx,medical-records-panel.module.css,appointment-selector.tsx,prescription-form.tsx}`, `src/features/notifications/{notifications-panel.tsx,notifications-panel.module.css,notification-item.tsx}`, test `medical-records`, `notifications`, `notifications-interactive`.

Đã làm workspace chọn ca, ẩn form dài khi chưa chọn, phân trang/tải thêm, giữ deep link, nhãn thuốc và cảnh báo bản nháp khi đổi ca. Bỏ khẳng định FINAL đồng nghĩa appointment COMPLETED. Thông báo thành danh sách gọn, bulk theo trang và giữ partial failure.

**Thiếu:** chạy lại typecheck/tests sau patch cuối giữ state khi session refresh; rà format JSX/CSS, chống mất nháp khi đổi ca, deep link record/appointment, FINAL read-only, status đồng bộ và pagination. Chưa có API v2 clinical grant/proof/version hoặc read-all toàn tập.

## 5. Kiểm tra đã chạy: phạm vi chính xác

| Cây code | Kết quả thực tế | Giới hạn |
|---|---|---|
| Checkout chính, shared UI/landing hiện tại | `npm run typecheck -w @clinic/clinic-management-web`: PASS; targeted 3 file **17/17 PASS**; `git diff --check`: PASS | Chưa có ba commit agent; chưa full suite/build/render |
| TV2 | Auth/profile **13/13 PASS**, typecheck PASS ở bước trước patch cuối; diff check PASS | Chưa chạy lại sau thay đổi getAccessToken cuối; chưa có recovery tests |
| TV3 | Targeted cuối **9 file, 95 tests PASS**; typecheck PASS ở bước trung gian; diff check PASS | Chưa typecheck lại SHA cuối hoặc browser |
| TV4 | Targeted **42/42 PASS**, typecheck PASS trước patch cuối; kiểm tra cú pháp sau đó **8 TSX, 0 lỗi**; diff check PASS | Chưa Vitest/typecheck lại sau patch session cuối |
| Docs | Link local trong README, index/task plan và archive đã kiểm tra, không thiếu | Chạy lại khi thêm/sửa tài liệu bàn giao |

Không cộng các con số trên thành một lần full-suite tích hợp. Ảnh trong `docs/reviews/2026-11-15-web-ui/` là **trước sửa**. Không có bằng chứng PostgreSQL/E2E, không có ảnh sau tích hợp; không đánh dấu ACCEPTED.

## 6. Thứ tự agent tiếp theo nên làm

1. **Giữ code hiện tại:** đọc git status/diff checkout chính và từng worktree. Không reset/clean, không checkout nhánh khác làm mất working-tree changes. Review rồi commit checkpoint shared UI/docs đã xác nhận; tránh stage env/config/secrets hoặc gộp backend không liên quan. Các docs API v2/cache/audit/proposal đã tồn tại untracked từ lượt trước cũng phải giữ lại.
2. **Tích hợp tuần tự** ba commit vào nhánh `feat/m3-ui-acceptance-integrated`: TV2 → TV3 → TV4. Review source trước tích hợp; không lấy nguyên một phía khi có conflict. Sau khi checkpoint code chính an toàn, các SHA để cherry-pick là:

   ```sh
   git cherry-pick d55f9bc55fcd55ac8c7e7fee661add1d2fc0909e
   git cherry-pick 9842922bf82f1c875eb1028384ad0e304a9a69e9
   git cherry-pick 77d8bc874906304ce6641e8801d107b4f595e39e
   ```

3. **Nối auth/recovery** như mục 4. Rà ApiClient giữ đúng lỗi tạm thời, không tự logout vì 503; token hết hạn không được dùng tiếp. Kiểm tra hook/session object đổi không remount/xóa form hoặc tạo vòng fetch.
4. **Chạy kiểm tra trên cây tích hợp**, sửa lỗi thật trước mở rộng phạm vi:

   ```sh
   npm run typecheck -w @clinic/clinic-management-web
   npm run test -w @clinic/clinic-management-web
   npm run build -w @clinic/clinic-management-web
   git diff --check
   ```

5. **Nhìn và thao tác UI:** chạy dev frontend, dùng fixture rõ nguồn nếu backend chưa mở. Kiểm tra 390/768/1440px và 320px cho overflow; menu/focus/Escape, logout luôn thấy, bệnh nhân cạnh action, cả tab bác sĩ, draft/deep link/thuốc, profile, notifications. Tải/lỗi/partial/refetch giữ heading và input. Không dùng account/patient thật để mutation. Script Taste có thể chụp; proxy fixture cũ ở `/tmp/clinic-ui-review-zuwgwq51/fixture-proxy.mjs` có thể đã bị OS xóa, không coi nó là dependency bền vững.
6. **Dọn sau tích hợp:** chỉ bỏ checkout `ui-*` khi commit đã được bảo toàn và status sạch; giữ nhánh/commit truy nguyên. Không xóa worktree backend. Cập nhật task status, bằng chứng và hạn chế thực tế trước bàn giao tiếp.

## 7. Các khoảng trống chưa được xử lý

### UI/logic còn làm được với API hiện tại

- Dashboard còn cache module chưa phân vùng actor rõ ràng, lấy trang đầu 100 item rồi tính ngày/tổng; chưa xử lý đầy đủ filter ngày/phân trang và lỗi không biến thành 0. Đây là source cũ, chưa nằm trong patch layout vừa làm.
- RouteLoadingFallback trong `route-guard.tsx` vẫn phản ánh bố cục cũ của một số trang; cần hòa giải với profile hai nhóm, bác sĩ ba tab và workspace khám, dùng cùng heading/static labels.
- UI contract cũ còn nói lịch hẹn là placeholder, staff xem bệnh án, reset form sau lưu và role trong profile/sidebar; cần sửa đúng phạm vi, phân biệt runtime v1 với target v2. Chưa sửa các đoạn này trong lượt checkpoint.
- Kiểm tra người dùng khác đăng nhập trên cùng browser, stale cache/query, cập nhật tên header sau edit profile và chuyển tab/resize. Chưa có browser regression evidence cho cây mới.
- Landing chưa có nguồn được duyệt cho địa chỉ, hotline, giờ khám, catalogue public hoặc URL tải app; không thêm số/liên kết/QR giả để lấp phần trống.
- README gốc còn tuyên bố nghiệm thu backend M2 ở đoạn trước danh mục tài liệu; cần đối chiếu audit/SHA và chỉnh copy nếu chưa có bằng chứng, không tự suy từ unit tests.

### Phụ thuộc backend, không giải quyết bằng frontend giả

- Session metadata theo role, MFA enrollment/login/unlock, hoạt động thật và thu hồi đa tab/thiết bị; scope logout current/all.
- Doctor clinical grant theo ca, đọc FINAL liên bác sĩ, authored history; finalization context/proof mới, optimistic version, idempotency và `appointmentCompletion`.
- Appointment summary, q/include=names/view/sort và bảo vệ thông tin trước grant; `/doctors/me`.
- Notification unread-count và read-all cutoff. Preferences/push/PDF/QR kiosk/invite vẫn là extension chưa bật.
- TTL grant, thời điểm được mở ca, quyền đọc lại 1/2 năm và recovery factor còn phải chốt theo API v2 mục 17.

Không thêm modal TOTP rồi coi là đã bảo mật; không fallback bỏ grant/proof để tương thích UI cũ. Kiến trúc vẫn là frontend → Gateway → service sở hữu → DB của service.

## 8. Tài liệu đã dọn

11 bản kế hoạch/phân công/handoff/kiến trúc cũ đã chuyển vào `docs/archive/m3-2026-11-15/`, không xóa lịch sử. Đã sửa đường dẫn và thêm banner không dùng làm backlog hiện tại. `docs/README.md` là chỉ mục mới; `docs/web-ui-parallel-tasks.md` là kế hoạch hiện tại. Bản archive không thay thế API/UI/render contract hoặc audit theo SHA.

Các agent trước đã dừng; agent tiếp theo có thể bắt đầu từ bước 1 mà không cần hỏi lại quyền sửa UI đã được người dùng giao. Chưa được phép suy thành quyền push/deploy hoặc dùng dữ liệu bệnh nhân thật.
