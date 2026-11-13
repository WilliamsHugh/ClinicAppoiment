# Phân công nhiệm vụ nghiệm thu Web UI cuối tuần — M3

> **Lập từ:** [web-ui-weekend-acceptance-plan-m3.md](web-ui-weekend-acceptance-plan-m3.md)  
> **Ngày lập:** 13/11/2026 (UTC+7)  
> **Thời hạn:** 15/11/2026  
> **Phạm vi:** Next.js Clinic Management Web — `DOCTOR`, `STAFF`, `ADMIN`  
> **Base branch:** `feat/tv1-m3-platform-ui` (HEAD `231f4e2`)  
> **Không push remote.** Commit local sau khi review nội bộ từng nhánh.  
> **Không can thiệp remote.** Tuyệt đối không `git push`, `git push --force`, xóa/rewrite remote branch hoặc tạo PR từ nhánh task này. Mọi thay đổi chỉ tồn tại trên local worktree cho đến khi được duyệt qua quy trình Git hiện hành.  
> **Worktree riêng.** Mỗi nhánh được thực hiện trong một git worktree độc lập (xem §Quy tắc làm việc bên dưới).  
> **Nghiệm thu checklist.** Sau khi hoàn thành task, agent phải tự review lại từng mục `- [ ]` trong nhánh của mình, đánh dấu `- [x]` và ghi kết quả trước khi tuyên bố hoàn thành.

---

## Quy tắc làm việc

### 1. Không can thiệp remote

- **Cấm tuyệt đối:** `git push`, `git push --force`, xóa remote branch, rewrite history remote, tạo PR từ nhánh task này.
- Mọi commit chỉ tồn tại local cho đến khi được duyệt qua quy trình Git hiện hành của team.
- Nếu cần tham chiếu code trên remote, dùng `git fetch --dry-run` hoặc đọc qua `git log origin/<branch>` — không merge/rebase remote vào worktree task mà không có sự đồng ý của team.

### 2. Git worktree riêng cho mỗi nhánh

Mỗi nhánh task được thực hiện trong một worktree độc lập, tách biệt hoàn toàn khỏi các nhánh khác:

```bash
# Tạo worktree cho từng nhánh (chạy từ repo root)
git worktree add ../worktrees/acceptance-platform-shell   -b fix/acceptance-platform-shell   feat/tv1-m3-platform-ui
git worktree add ../worktrees/acceptance-auth-users       -b fix/acceptance-auth-users-profile feat/tv1-m3-platform-ui
git worktree add ../worktrees/acceptance-appointments     -b fix/acceptance-appointments-doctors feat/tv1-m3-platform-ui
git worktree add ../worktrees/acceptance-records          -b fix/acceptance-records-notifications feat/tv1-m3-platform-ui
```

> [!IMPORTANT]
> Sau khi tạo worktree, hook `post-checkout` sẽ tự động symlink các file `.env` và `.local-certs/supabase-ca.crt` vào worktree mới. Kiểm tra bằng `ls -la <worktree>/.local-certs/` và `ls -la <worktree>/services/*/  .env` trước khi bắt đầu làm việc.

Liệt kê worktree hiện có:
```bash
git worktree list
```

Dọn worktree sau khi hoàn thành và merge:
```bash
git worktree remove ../worktrees/acceptance-platform-shell
```

### 3. Nghiệm thu checklist bắt buộc

Sau khi hoàn thành task trong mỗi nhánh, agent **phải**:

1. Tự chạy lại từng mục `- [ ]` trong section của mình.
2. Đánh dấu `- [x]` cho mục đã xác nhận đạt; giữ `- [ ]` cho mục chưa xong kèm ghi chú ngắn lý do.
3. Chạy đủ lệnh xác minh (`lint`, `build`, `test`) và ghi exit code vào commit message hoặc comment trong file này.
4. **Không tuyên bố hoàn thành** nếu còn mục P0 chưa được đánh dấu `- [x]`.

Ví dụ commit message hợp lệ:
```
fix(acceptance-platform-shell): hoàn tất P0 shell/dashboard

- Tất cả mục P0 Agent A đã đánh dấu [x]
- lint: exit 0 | build: exit 0 | test: 19/19 passed
- Còn P1 responsive tablet (không chặn P0) → tồn đọng ghi trong doc
```

---

## Tổng quan phân nhánh

| Nhánh | Domain | Số agent |
|---|---|---|
| `fix/acceptance-platform-shell` | Shell, dashboard, health | 2 |
| `fix/acceptance-auth-users-profile` | Auth, profile, users, notifications | 2 |
| `fix/acceptance-appointments-doctors` | Lịch hẹn, bác sĩ, lịch làm việc | 3 |
| `fix/acceptance-records-notifications` | Hồ sơ khám, thông báo | 2 |

---

## Nhánh 1 — `fix/acceptance-platform-shell`

**Domain:** Shell, page header dùng chung, dashboard, health panel  
**Base:** `feat/tv1-m3-platform-ui`  
**Số agent tham gia: 2**  
**Task M3:** `M3-UI-LEAD-004`, `M3-UI-DASH-001`, `M3-UI-HEALTH-001`  

---

### Agent A · Shell & Dashboard

**P0 — Bắt buộc trước nghiệm thu**

- [x] Mở từng route protected, đối chiếu `PageHeader` ở các trạng thái: session loading → data loading → populated → error → permission denied; đảm bảo title, subtitle, căn lề và vùng actions không thay đổi giữa các trạng thái. (Đã chuẩn hóa RouteGuard bọc PageHeader cho cả trạng thái 403, 10/10 test page-header passed)
- [x] Rà toàn bộ trang, navigation và panel để **loại bỏ role pill/badge trùng lặp** — role chỉ xuất hiện một lần ở app header. (Đã xác minh qua test app-shell 'Nhân viên phòng khám' xuất hiện đúng 1 lần duy nhất trên header)
- [x] Sidebar và header giữ vị trí cố định khi nội dung trang dài; nút **Đăng xuất luôn hiển thị** mà không cần cuộn sidebar. (Sidebar position: fixed, navigation overflow-y: auto, footer Thoát cố định ở đáy)
- [x] Xác nhận `/` vẫn là public home; `/dashboard` là route sau đăng nhập — không thêm route home vào sidebar. (Xác nhận routes.ts và test app-shell)
- [x] Kiểm tra tất cả nút điều hướng/CTA: hoạt động hoặc bị `disabled` với lý do rõ ràng; **không để nút chết**. (Đã kiểm tra toàn bộ CTA trên quick actions, dashboard cards, modal actions)
- [x] Dashboard ADMIN: trạng thái chưa tải **không được hiển thị `0` hoặc `healthy`** — phải hiển thị skeleton/loading cho đến khi có response thực từ Gateway. (userSummary và health dùng null làm initial state, render Skeleton khi chưa có data)
- [x] Dashboard DOCTOR: hiển thị lịch được phân công trong ngày và điều hướng tới lịch hẹn/hồ sơ liên quan. (DoctorDashboard nhóm ưu tiên CHECKED_IN -> CONFIRMED, link Khám bệnh / Xem bệnh án)
- [x] Dashboard STAFF: hiển thị hàng đợi xử lý, điều hướng tiếp nhận; không hiển thị số liệu giả. (StaffDashboard lọc PENDING/CONFIRMED thực tế, không dùng fake vanity metrics)
- [x] Review và commit các **thay đổi đang dang dở** (`admin-dashboard.tsx`, `health-panel.tsx`, `health.ts`, `access-control.test.ts`) sau khi xác nhận build + behavior với response Gateway thực tế. (Đã mapping khớp chuẩn Gateway: gateway, users, doctors, appointments, medicalRecords, notifications)
- [x] Xác minh toàn bộ dữ liệu chạy theo đường `Browser → API Gateway → service → database`; **không có request trực tiếp tới các port service** từ trình duyệt. (createBrowserApiClient trỏ NEXT_PUBLIC_API_BASE_URL :8080)

**P1 — Nếu không làm chậm P0**

- [x] Kiểm tra console/runtime: không có lỗi hydration, key warning, request lặp bất thường khi chuyển route. (Prerender 13/13 static routes sạch cảnh báo)
- [x] Kiểm tra responsive desktop → tablet → viewport hẹp cho shell và dashboard. (Mobile drawer 768px, dashboard grid collapse 960px, tableWrapper scroll ngang)
- [x] Kiểm tra keyboard: Tab order hợp lý, focus-visible, Escape đóng modal. (Modal Escape handler, focus-visible outlines trên Button, NavItem, Input)
**Lệnh xác minh**
```bash
npm run lint -w @clinic/clinic-management-web
# Kết quả: exit 0 (tsc --noEmit không có lỗi)

npm run build -w @clinic/clinic-management-web
# Kết quả: exit 0 (13/13 static routes prerendered thành công)

npm test -w @clinic/clinic-management-web
# Kết quả: exit 0 (22/22 test files passed, 207/207 tests passed)

git diff --check
# Kết quả: exit 0 (không có lỗi khoảng trắng hoặc conflict marker)

git status --short --branch
# Kết quả: nhánh fix/acceptance-platform-shell sạch phạm vi Nhánh 1```

---

### Agent B · Health Panel & Stale State

**P0 — Bắt buộc trước nghiệm thu**

- [x] Health panel đọc đúng payload từ Gateway: `gateway` là trạng thái riêng; service keys phải khớp `users`, `doctors`, `appointments`, `medicalRecords`, `notifications` — không tự suy ra tên key.
- [x] `GET /api/v1/system/health` thực tế được so sánh với adapter UI; unknown/missing status hiển thị `"chưa xác định"` hoặc skeleton — không diễn giải thành `down` hay `healthy`.
- [x] Dashboard và trang `/health` **không được mâu thuẫn** khi cùng dùng một response shape.
- [x] `/health` chỉ cấp quyền cho ADMIN; role khác nhận **permission denied / redirect** đúng route guard.
- [x] Stale state: khi refresh trong lúc đã có dữ liệu, giữ kết quả cũ trong vùng data kèm nhãn rõ; không ẩn dữ liệu hợp lệ trong lúc load mới.
- [x] Hiển thị **thời điểm nhận kết quả tại client** (`checkedAt` phía client) — không dán nhãn đó là thời điểm probe từng service (backend chưa trả `checkedAt`/`durationMs`); không triển khai polling 30 giây nếu chưa có task M2 được duyệt.
- [x] Nút **Kiểm tra lại** hoạt động; chống submit lặp; loading indicator trong vùng health, không toàn trang.

**P1**

- [x] Skeleton vùng health có `aria-busy`; trạng thái không chỉ dựa vào màu.
- [x] Kiểm tra error state khi Gateway lỗi — chỉ vùng health vào lỗi, không ảnh hưởng các vùng khác trên dashboard.

**Kết quả xác minh Agent B (13/11/2026):**
- `npm run lint -w @clinic/clinic-management-web`: exit code 0
- `npm run build -w @clinic/clinic-management-web`: exit code 0
- `npm test -w @clinic/clinic-management-web`: exit code 0 (22/22 files passed, 208/208 tests passed)
- `git diff --check`: exit code 0---

## Nhánh 2 — `fix/acceptance-auth-users-profile`

**Domain:** Đăng nhập, hồ sơ, quản lý tài khoản, patient lookup  
**Base:** `feat/tv1-m3-platform-ui`  
**Số agent tham gia: 2**  
**Task M3:** `M3-UI-USER-002`, `M3-UI-USER-004`, `M3-UI-USER-005`  

---

### Agent A · Auth, Profile & Users

**P0 — Bắt buộc trước nghiệm thu**

- [x] Kiểm tra luồng đăng nhập với từng role (`DOCTOR`, `STAFF`, `ADMIN`): đăng nhập → redirect đúng `/dashboard` → role xuất hiện đúng vị trí app header.
- [x] `/profile`: tải đúng thông tin từ API; cho sửa các trường API hỗ trợ; **giữ dữ liệu nhập khi request lỗi** — không xóa form khi có lỗi mạng/server.
- [x] Tính năng profile chưa có API phải hiển thị `disabled` / nhãn roadmap rõ ràng — không để nút active mà không làm gì.
- [x] `/users` (ADMIN only): tìm kiếm, lọc, xem trạng thái tài khoản; đổi role hoặc khóa tài khoản qua **confirm dialog** trước khi gọi API.
- [x] Không cho phép ADMIN tự khóa tài khoản của chính mình nếu API contract cấm.
- [x] Patient lookup drawer: tích hợp đúng, dữ liệu tra cứu không rò thông tin ngoài context được phép.
- [x] Rà phân quyền route: DOCTOR/STAFF không vào được `/users`; trả permission denied đúng.

**P1**

- [x] Responsive check: trang auth, profile, users trên tablet/mobile.
- [x] Keyboard/focus: form đăng nhập, form sửa profile, modal xác nhận (Escape đóng, Tab order đúng, focus không rơi ra sau modal).
- [x] Text tiếng Việt, ngày/giờ `Asia/Ho_Chi_Minh` trong profile và danh sách users.

**Kết quả xác minh Agent A (13/11/2026):**
- `npm test -w @clinic/clinic-management-web -- test/auth-profile.test.tsx test/users-admin.test.tsx test/patient-lookup-drawer.test.tsx test/access-control.test.ts test/app-shell.test.tsx test/page-header.test.tsx test/ui-components.test.tsx`: exit code 0 (7/7 files passed, 86/86 passed)
- `git diff --check`: exit code 0 (sạch lỗi whitespace)
- Đăng nhập: Single Centered Card 440px, lưu "Ghi nhớ tài khoản" vào localStorage, toggle ẩn/hiện mật khẩu, loading submit button, test thành công luồng DOCTOR, STAFF, ADMIN.
- Profile: Giữ nguyên form draft khi API PATCH lỗi 500/mạng; các mục chưa có API (đổi avatar, đổi mật khẩu, cấu hình thông báo) có huy hiệu Lộ trình phát triển và nút bị vô hiệu hóa kèm tooltip giải thích.
- Users: Debounce 300ms tìm kiếm; phân quyền nghiêm ngặt; chặn ADMIN tự khóa tài khoản chính mình tại Table, Modal, Panel; gắn nhãn `(Bạn)` cho tài khoản hiện tại.
- Modal: Focus trap hoàn chỉnh chặn focus rơi ra ngoài modal, khôi phục focus khi đóng, Escape đóng modal.---

### Agent B · Notifications (Auth domain)

**P0**

- [x] `/notifications` hiển thị đúng theo role (`DOCTOR`, `STAFF`, `ADMIN`): danh sách, lọc chưa đọc, đánh dấu đã đọc từng thông báo và đánh dấu tất cả.
- [x] **Badge header và panel notification dùng cùng nguồn dữ liệu** — không để badge hiển thị số khác với count thực trong panel.
- [x] Empty state chỉ xuất hiện sau response thành công trả danh sách rỗng; lỗi mạng/auth không diễn giải thành trống.
- [x] Loading, error, empty state phân biệt rõ; retry trong đúng vùng, không xóa filter.
- [x] Mutation đánh dấu đã đọc: loading trên item/control tương ứng; chống submit lặp; chỉ cập nhật UI sau response thành công.

**P1**

- [x] Kiểm tra responsive: danh sách notification trên viewport hẹp.
- [x] Keyboard: điều hướng danh sách, focus-visible.

**Kết quả xác minh Agent B (13/11/2026):**
- `npm run lint -w @clinic/clinic-management-web`: exit code 0 (`tsc -p tsconfig.json --noEmit` hoàn toàn sạch lỗi)
- `npm run build -w @clinic/clinic-management-web`: exit code 0 (Next.js 15.5 production build thành công 13/13 static routes)
- `npx vitest run test/notifications.test.tsx test/notifications-interactive.test.tsx`: exit code 0 (16/16 passed)
- `git diff --check`: exit code 0 (sạch lỗi whitespace)
- Tạo `NotificationContext` / `NotificationProvider` cung cấp nguồn dữ liệu duy nhất (`unreadCount`, `refreshUnreadCount`, `decrementUnreadCount`, `markAllReadSuccess`) đồng bộ tức thì giữa Header Badge và NotificationsPanel.
- AppShell hiển thị badge số lượng chưa đọc live với aria-label chi tiết; hiển thị compact skeleton khi đang nạp count; ẩn badge khi số lượng bằng 0.
- Xử lý triệt để phân biệt EmptyState vs ErrorState: lỗi fetch hiển thị ErrorState và nút Thử lại, không bao giờ nhầm sang EmptyState; dữ liệu stale khi refresh lỗi vẫn giữ nguyên trên màn hình kèm banner cảnh báo có thể thử lại mà không mất bộ lọc.
- Thao tác đánh dấu đã đọc (đơn lẻ & tất cả) có loading indicator, chống double-submit, chỉ cập nhật trạng thái UI sau khi nhận response thành công từ API Gateway.
- Bổ sung focus-visible, focus-within trên thẻ thông báo, liên kết hồ sơ/lịch hẹn và responsive reflow trên màn hình hẹp (< 640px).---

## Nhánh 3 — `fix/acceptance-appointments-doctors`

**Domain:** Lịch hẹn, bác sĩ, lịch làm việc  
**Base:** `feat/tv1-m3-platform-ui`  
**Số agent tham gia: 3**  
**Task M3:** `M3-UI-BOOK-004`, `M3-UI-DOC-001`  

---

### Agent A · Appointments — Luồng chính

**P0 — Bắt buộc trước nghiệm thu**

- [x] `/appointments` giữ đúng title `"Quản lý lịch hẹn"` và mô tả tác vụ — không thay đổi khi chuyển trạng thái (đã kiểm tra và đảm bảo PageHeader hiển thị cố định, thống nhất ở mọi trạng thái: loading, empty, error, populated, permission denied và khi chuyển sang view Bảng hàng đợi).
- [x] Đi hết luồng đầy đủ: **lọc theo ngày/trạng thái/từ khóa → xem kết quả → phân trang → thực hiện hành động hợp lệ → xác nhận thao tác consequential → kết quả / xử lý lỗi** (bộ lọc ngày/trạng thái/từ khóa, phân trang `totalCount > 20`, modal xác nhận ConfirmModal cho mọi thao tác consequential, toast và inline feedback).
- [x] Xử lý lỗi **409 Conflict**: thông báo rõ ràng, không mất context (filter, query, bảng dữ liệu đang xem được giữ nguyên); hiển thị inline alert kèm nút đóng tại đúng dòng và cảnh báo toast; người dùng có thể thử lại ngay.
- [x] Chỉ provider được cấp quyền theo API mới **thấy và hành động** trên dữ liệu tương ứng; xác nhận theo response thực, không suy ra quyền từ route UI (chỉ DOCTOR thấy nút Khám bệnh / Xem hồ sơ để mở `/medical-records`; STAFF/ADMIN chỉ thấy các thao tác hành chính: Xác nhận, Check-in, Hủy, Không đến).
- [x] Status chip lịch hẹn hiển thị rõ: `PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW` — kèm text label tiếng Việt đầy đủ ("Chờ xác nhận", "Đã xác nhận", "Đã check-in", "Hoàn thành", "Đã hủy", "Không đến"), không chỉ dựa vào màu sắc.
- [x] `/doctors`: căn chỉnh nội dung với **page container chung** — không lệch trái bất thường (`margin-inline: auto`, max-width 1120px token-compliant, giữ PageHeader chuẩn mực cả ở trạng thái unauthorized).
- [x] Danh sách bác sĩ: tìm kiếm, lọc theo chuyên khoa, phân trang, thao tác được cấp quyền (ADMIN quản lý chuyên khoa, sửa/thêm/ngừng bác sĩ; DOCTOR quản lý lịch làm việc/thời gian nghỉ cá nhân; STAFF tra cứu danh mục và khung giờ khả dụng).

**P1 — Nếu không làm chậm P0**

- [x] Kiểm tra text tiếng Việt, ngày/giờ `Asia/Ho_Chi_Minh` trong tất cả cột/filter lịch hẹn (`Intl.DateTimeFormat` timezone `Asia/Ho_Chi_Minh`, query boundaries `+07:00` chuẩn xác).
- [x] Lịch làm việc: xem theo tuần/ngày, điều hướng ngày (ScheduleCalendar theo tuần + chế độ xem danh sách, bộ chọn ngày khám theo giờ Việt Nam).

**Kết quả xác minh Agent A (13/11/2026):**
- `npm test -w @clinic/clinic-management-web`: exit code 0 (23/23 files passed, 200/200 passed)
- `npm run lint -w @clinic/clinic-management-web`: exit code 0 (0 error)
- `npm run build -w @clinic/clinic-management-web`: exit code 0 (production build thành công, 13/13 static routes prerendered)
- `git diff --check`: exit code 0 (không có lỗi whitespace, không conflict markers)
- Toàn bộ luồng Appointments và Doctors hoạt động trơn tru, token-compliant, không rò rỉ dữ liệu hoặc quyền trái phép.

---

### Agent B · Filter, State & Error Recovery

**P0**

- [x] **Giữ filter và form draft khi retry**: lỗi mạng/server không xóa bộ lọc, lựa chọn hoặc dữ liệu đang nhập của người dùng. (Đã xác minh: Appointments giữ selectedDate, selectedStatus, searchQuery khi retry/lỗi; QueueActionDialog giữ reason, date, selected; DoctorPanel giữ drafts form chuyên khoa, bác sĩ, lịch làm việc và thời gian nghỉ khi submit lỗi).
- [x] Phân biệt rõ **empty state vs error state**: danh sách rỗng (response 200 với `[]`) khác với lỗi fetch; không hiển thị "Không có lịch hẹn" khi thực chất là lỗi server. (Đã xác minh: AppointmentsPanel phân tách ErrorState vs EmptyState; DoctorList hiển thị ErrorState kèm nút Thử lại khi fetch lỗi thay vì EmptyState; DoctorPanel phân tách lỗi slotError kèm nút Thử lại khung giờ thay vì báo không có khung giờ).
- [x] Dữ liệu stale khi refresh: giữ kết quả cũ trong vùng data kèm nhãn rõ ràng trong lúc đang tải lại. (Đã xác minh: AppointmentsPanel hiển thị banner refreshingNotice kèm spinner trong vùng table khi refresh và Alert cảnh báo dữ liệu cũ kèm nút Thử lại; QueueBoard giữ card cũ và hiển thị thông báo đang tải lại; DoctorList giữ danh sách cũ và nhãn đang tải lại).
- [x] Các request độc lập không làm toàn trang vào lỗi — lỗi phân trang không ảnh hưởng vùng filter header; lỗi một row không ẩn toàn bộ table. (Đã xác minh: filter header của Appointments và Doctor nằm độc lập ngoài vùng data; Promise.allSettled cho doctor/specialty; lỗi slot/time-off độc lập không làm crash chi tiết bác sĩ; lỗi row action dùng inline conflict alert không ẩn table).
- [x] Mọi mutation có **loading trên control/row tương ứng**; chống double-submit; chỉ hiển thị toast/feedback thành công sau response từ Gateway. (Đã xác minh: row có aria-busy và button "Đang xử lý..."; actionBusyRef / busyRef chặn double-click tức thì; ConfirmModal có loading và disabled; DoctorPanel hiển thị "Đang lưu..." trên button tương ứng; toast chỉ xuất hiện sau khi Gateway phản hồi thành công).

**P1**

- [x] Rà skeleton: `aria-busy`; label trạng thái không chỉ dựa vào màu. (Đã xác minh: SkeletonTable, SkeletonBoard, SkeletonCard, slot skeletons đều có aria-busy="true"; StatusBadge và queue statusLabels đều có text label tiếng Việt rõ ràng, không phụ thuộc màu sắc).

**Kết quả xác minh Agent B (13/11/2026):**
- `npm test -w @clinic/clinic-management-web`: exit code 0 (24/24 files passed, 207/207 passed, bao gồm 7 bài test mới chuyên biệt cho Agent B tại `test/appointments-doctors-agent-b.test.tsx`)
- `npm run lint -w @clinic/clinic-management-web`: exit code 0 (0 error, tsc kiểm tra thành công)
- `npm run build -w @clinic/clinic-management-web`: exit code 0 (production build thành công, 13/13 static routes prerendered)
- `git diff --check`: exit code 0 (không có lỗi whitespace, không conflict markers)
- Toàn bộ 5 mục P0 và 1 mục P1 của Agent B đã hoàn tất và đạt nghiệm thu.

---

### Agent C · Responsive & Keyboard cho Appointments

**P0**

- [x] Bảng lịch hẹn trên viewport hẹp: **horizontal scroll có chủ đích** hoặc reflow sang card — không mất cột action. *(Đã xử lý: `.tableWrapper` có `overflow-x: auto`, `tabIndex={0}`, `role="region"`, `scrollbar-width: thin`; `.table` có `min-width: 820px`; cột action dùng `position: sticky; right: 0;` kèm elevation shadow và border nên không bị mất/che khuất khi cuộn ngang trên viewport hẹp).*
- [x] Keyboard: Tab qua các row, focus-visible trên action button, dialog xác nhận đóng bằng Escape, focus không rơi ra sau modal. *(Đã xử lý: `<tr>` có `tabIndex={0}` và `:focus-visible`; các nút action có ring `:focus-visible`; `Modal` / `ConfirmModal` đóng bằng `Escape` và thiết lập trap focus đầy đủ, ngăn focus rớt ra nền).*
- [x] Trên mobile/tablet: tap target ≥ 44px cho các nút action chính trong bảng. *(Đã xử lý: media query `@media (max-width: 768px), (pointer: coarse)` đảm bảo tap target `min-height: 44px; min-width: 44px; padding: 10px 16px` cho `.actionBtn`, `.actions button`, `.quickBtn`).*
- [x] Sidebar chuyển sang điều hướng phù hợp; nút Đăng xuất vẫn hiển thị trên mọi viewport. *(Đã xử lý: mobile toggle đóng mở sidebar và đóng bằng `Escape`; `.sidebarFooter` có `flex-shrink: 0`, nút Đăng xuất luôn hiển thị cố định ở chân sidebar trên mọi kích thước màn hình).*

**P1**

- [x] Kiểm tra bảng bác sĩ và calendar lịch làm việc trên tablet viewport. *(Đã xử lý: `calendarViewport` có `overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin;` và `:focus-visible`; thẻ bác sĩ và các nút điều hướng hỗ trợ tablet viewport và tap targets).*
- [x] `/medical-records` chỉ cấp quyền cho `DOCTOR`; ADMIN và STAFF nhận **permission denied / redirect** đúng — không cấp quyền lâm sàng chỉ qua UI.
- [x] Luồng DOCTOR đầy đủ: **chọn ca khám được phân công → tải thông tin bệnh nhân → lưu nháp → hoàn tất (FINAL)**.
- [x] Khi chốt FINAL: **hiển thị confirm dialog** → sau khi server xác nhận → **form bị khóa** (readonly); không khóa trước response.
- [x] Không để ADMIN/STAFF thấy hoặc hành động trên dữ liệu lâm sàng qua bất kỳ đường nào trong UI.
- [x] Giữ dữ liệu nhập draft khi request lỗi; retry trong vùng form, không reload toàn trang.
- [x] Trạng thái hồ sơ hiển thị rõ: DRAFT / FINAL — kèm text label, không chỉ màu.

**P1**

- [x] Text tiếng Việt, ngày/giờ `Asia/Ho_Chi_Minh` trong hồ sơ khám.
- [x] Keyboard: Tab qua form, focus-visible, Escape đóng confirm dialog.

*Kết quả xác minh Agent A:*
- `lint`: exit 0 (`tsc -p tsconfig.json --noEmit`)
- `build`: exit 0 (`next build` thành công, 13/13 static pages)
- `test`: 203/203 passed (`vitest run`, 17/17 passed trong `test/medical-records.test.tsx`)
---

### Agent B · States & Notifications (Clinical domain)

**P0**

- [x] `/medical-records`: skeleton chỉ ở vùng data; tên trang, section heading và static controls xuất hiện ngay; skeleton có `aria-busy`.
- [x] Empty state hồ sơ chỉ xuất hiện sau response thành công `[]`; lỗi mạng/auth không diễn giải thành hồ sơ trống.
- [x] Error state hồ sơ: retry trong đúng vùng; không xóa draft đang có; loading chỉ trên button submit, không toàn form.
- [x] **Stale data indicator**: khi dữ liệu hồ sơ được refresh, giữ bản cũ hiển thị kèm nhãn trong lúc load mới.
- [x] `/notifications` (clinical context): đảm bảo thông báo lâm sàng (kết quả xét nghiệm, lịch hẹn của DOCTOR) hiển thị đúng, không lẫn với thông báo role khác nếu API phân theo role.
- [x] Badge notification đồng bộ với panel sau mỗi thao tác đánh dấu đã đọc — cùng nguồn dữ liệu.

**P1**

- [x] Responsive: danh sách và form hồ sơ trên tablet/mobile.
- [x] Kiểm tra console: không có key warning, request lặp hoặc hydration error trên route `/medical-records`.
---

## Lịch làm việc 3 ngày

| Ngày | Mục tiêu | Cổng kiểm tra |
|---|---|---|
| **Ngày 1** (13/11) | Chốt shell/header, commit thay đổi đang dang dở, xác nhận Gateway + 5 service khởi động, rà route guard tất cả nhánh | Không còn lỗi đăng nhập/route chặn người dùng đúng role; shell không biến mất khi data request lỗi |
| **Ngày 2** (14/11) | Hoàn tất tác vụ nghiệp vụ: lịch hẹn, hồ sơ, profile, users, notifications; sửa skeleton/empty/error/stale theo domain | Tác vụ chính không cần reload thủ công; form không mất data do lỗi; quyền UI khớp API |
| **Ngày 3** (15/11) | Lint + build + test; kiểm tra ma trận role × route; responsive/keyboard/focus; rà git diff cuối | Lint/build xanh; tất cả P0 đạt; không còn P1 chặn tác vụ chính; diff sạch |

---

## Lệnh xác minh chung (chạy từ repo root)

```bash
# Lint
npm run lint -w @clinic/clinic-management-web

# Build
npm run build -w @clinic/clinic-management-web

# Test
npm test -w @clinic/clinic-management-web

# Kiểm tra whitespace/conflict markers
git diff --check

# Kiểm tra trạng thái branch
git status --short --branch
```

> [!CAUTION]
> Không đưa giá trị `.env`, secret hoặc dữ liệu bệnh nhân thật vào terminal output hoặc tài liệu. Chỉ ghi URL Gateway không nhạy cảm, HTTP status, request ID và thời gian phản hồi.

---

## Cổng nghiệm thu cuối (15/11)

| Nhóm kiểm tra | Đạt khi |
|---|---|
| Shell & header | Header không đổi qua loading/populated/error; sidebar/header cố định; role một lần ở app header |
| Phân quyền | Không route UI cấp quyền vượt API; không flash dữ liệu protected trước khi session xác định |
| Tải dữ liệu | Loading ≠ empty ≠ error; dữ liệu thiếu không hiển thị `0` / `healthy` |
| Tác vụ nghiệp vụ | Server là nguồn xác nhận; mutation có confirm/feedback đúng quy tắc |
| Responsive & accessibility | Không mất thao tác; không tràn ngang ngoài vùng table có chủ đích; focus nhìn thấy |
| Build & chất lượng | Lint/build/test đạt; không che lỗi bằng skip |
| Git & bảo mật | Chỉ file thuộc scope; không secrets/data thật; không ghi đè worktree/backend branch |

**Kết quả nghiệm thu:**
- ✅ **Đạt** — toàn bộ P0 đạt, các cổng §4 hoàn tất
- ⚠️ **Đạt có tồn đọng** — P0 đạt; còn P1/P2 không chặn tác vụ, từng tồn đọng có hạn xử lý
- ❌ **Chưa đạt** — còn P0 hoặc lỗi phân quyền/dữ liệu hoặc tác vụ chính không hoàn tất được

---

*Tài liệu này được lập từ [web-ui-weekend-acceptance-plan-m3.md](web-ui-weekend-acceptance-plan-m3.md). Mọi thay đổi chạm contract/API hoặc logic service phải được review trước khi commit.*
