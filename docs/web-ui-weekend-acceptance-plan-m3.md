# Kế hoạch hoàn thiện và nghiệm thu Clinic Management Web cuối tuần

> **Ngày lập:** 12/11/2026 (UTC+7)  
> **Thời hạn đề xuất:** 15/11/2026  
> **Phạm vi:** Next.js Clinic Management Web cho `DOCTOR`, `STAFF`, `ADMIN`  
> **Nền tảng:** M3 UI; tài liệu này là checklist nghiệm thu hiện trạng, không thay thế hợp đồng giao diện/API.  
> **Tài liệu ưu tiên:** [UI Design Contract](ui-design-contract.md), [Web Rendering Contract](web-rendering-contract.md), [API Contract](api-contract.md), [.agents/rules.md](../.agents/rules.md).

## 1. Mục tiêu nghiệm thu

Đến cuối ngày 15/11, các trang web trong phạm vi phải có thể dùng cho tác vụ chính theo role, thống nhất về khung giao diện, hiển thị dữ liệu thật qua API Gateway và xử lý rõ các trạng thái tải, rỗng, lỗi, quyền truy cập và dữ liệu cũ.

“Hoàn thiện” trong đợt này nghĩa là:

- Người dùng đăng nhập đúng role, vào được các trang được phép và hoàn thành tác vụ chính.
- Header trang, mô tả tác vụ, shell và vị trí thao tác không nhảy hoặc đổi nội dung giữa fallback, loading và dữ liệu đã tải.
- Sidebar/header giữ vị trí; đăng xuất luôn truy cập được mà không cần cuộn sidebar.
- Dữ liệu nghiệp vụ đi theo `Browser → API Gateway → service sở hữu → database`; không có truy cập service/database trực tiếp từ trình duyệt.
- Các trạng thái loading/empty/error/stale có thể phân biệt; lỗi một vùng dữ liệu không làm ẩn các vùng tĩnh hoặc dữ liệu độc lập khác.
- Các thao tác có ảnh hưởng dữ liệu giữ quy tắc phân quyền, xác nhận, trạng thái nghiệp vụ và phản hồi sau khi Gateway xác nhận.
- Không còn lỗi P0/P1 chặn tác vụ chính hoặc làm người dùng hiểu sai trạng thái dữ liệu.

Không thuộc phạm vi nghiệm thu web cuối tuần này: hoàn tất Flutter Patient App, thêm nghiệp vụ backend mới ngoài contract hiện hành, thay đổi database/schema, hoặc làm lại toàn bộ visual direction.

## 2. Trạng thái và giả định tại thời điểm lập kế hoạch

### 2.1. Nhánh và thay đổi đang có

| Khu vực | Trạng thái ghi nhận |
|---|---|
| Web chính | Nhánh `feat/tv1-m3-platform-ui`, HEAD `231f4e2`; có thay đổi chưa commit ở dashboard, health panel/adapter và access-control test. Giữ nguyên các thay đổi này và đưa qua review trước khi commit. |
| Backend OpenAPI/logging | Worktree `backend-openapi`, nhánh `test/m2-integration-002-openapi-contract-tests`, HEAD `dad4f96`; không gộp backend vào nhánh web trong checklist này. |
| Các task M3 web trước đây | `docs/team-task-assignment-m3.md` ghi các trang web đã hoàn thành. Tài liệu hiện tại mở lại nghiệm thu theo contract và hành vi chạy thật; trạng thái “đã xong” cũ không thay cho lần nghiệm thu này. |

Các file web đang có thay đổi chưa commit:

- `apps/clinic-management-web/src/features/dashboard/admin-dashboard.tsx`
- `apps/clinic-management-web/src/features/health/health-panel.tsx`
- `apps/clinic-management-web/src/features/health/health.ts`
- `apps/clinic-management-web/test/access-control.test.ts`

Thay đổi hiện tại bổ sung cách đọc `gateway` ở cấp cao nhất của payload health và dùng chung hàm ánh xạ trạng thái giữa dashboard và trang health. Đây là công việc đang làm, chưa được coi là đã nghiệm thu cho tới khi build và kiểm tra hành vi với response Gateway thực tế.

### 2.2. Phân công và task ID

**Đầu mối điều phối:** Member 1 / TV1 — phạm vi nền tảng web, shell và tích hợp giao diện.  
**Task M3 liên quan:** `M3-UI-LEAD-004`, `M3-UI-DASH-001`, `M3-UI-HEALTH-001`.  
**M2 task ID:** N/A — đây là kế hoạch nghiệm thu M3 web, không tạo hoặc nhận một assignment M2 mới.

Các vùng nghiệp vụ cần review theo ownership hiện có:

| Vùng | Owner review | Task M3 đối chiếu | M2 task ID |
|---|---|---|---|
| Shell, routing, dashboard, health | Member 1 / TV1 | `M3-UI-LEAD-004`, `M3-UI-DASH-001`, `M3-UI-HEALTH-001` | N/A — M3 web acceptance |
| Đăng nhập, hồ sơ, tài khoản, patient lookup | Member 2 / TV2 | `M3-UI-USER-002`, `M3-UI-USER-004`, `M3-UI-USER-005` | N/A — M3 web acceptance |
| Lịch hẹn, bác sĩ, lịch làm việc | Member 3 / TV3 | `M3-UI-BOOK-004`, `M3-UI-DOC-001` | N/A — M3 web acceptance |
| Hồ sơ khám, thông báo | Member 4 / TV4 | `M3-UI-REC-001`, `M3-UI-REC-002`, `M3-UI-NOTI-001` | N/A — M3 web acceptance |

Đầu mối có thể triển khai các sửa đổi UI được yêu cầu trong phiên. Những thay đổi chạm contract/API hoặc logic sở hữu của service cần được review bởi owner tương ứng. Không thay đổi quyền backend chỉ để làm cho nút UI hoạt động.

## 3. Ưu tiên và việc còn phải làm

### P0 — Bắt buộc trước nghiệm thu

#### 3.1. Chốt hành vi shell và page header dùng chung

- [ ] Mở từng route protected và đối chiếu header trong session loading, data loading, populated, error và permission denied.
- [ ] Mỗi trang giữ nguyên cùng title, subtitle, thứ tự, căn lề và vùng actions qua fallback và sau khi tải dữ liệu; dùng `PageHeader`/cấu hình trang hiện có.
- [ ] `/appointments` giữ `Quản lý lịch hẹn` và mô tả tác vụ; các trang khác có title/mô tả đúng nhiệm vụ, không sao chép role hoặc tên người dùng vào phần nội dung trang.
- [ ] Role chỉ xuất hiện một lần ở header ứng dụng; rà dashboard, thẻ, page content, navigation và panel để bỏ role pill/badge trùng lặp.
- [ ] Sidebar và header giữ vị trí khi nội dung dài; phần sidebar có ít mục, không cuộn độc lập làm nút đăng xuất trôi khỏi viewport.
- [ ] `/` vẫn là public home; `/dashboard` là trang dashboard sau đăng nhập. Không thêm route home vào sidebar.
- [ ] Mọi nút điều hướng/CTA hiển thị đều hoạt động hoặc bị disable kèm trạng thái đã được contract cho phép; không để nút chết.

#### 3.2. Kiểm tra các trang và tác vụ theo role

| Trang | Role | Tác vụ cần thực hiện trong nghiệm thu |
|---|---|---|
| `/dashboard` | DOCTOR | Xem lịch được phân công, trạng thái trong ngày, điều hướng tới lịch hẹn và hồ sơ liên quan. |
| `/dashboard` | STAFF | Xem hàng đợi cần xử lý và đi tới thao tác tiếp nhận/lịch hẹn. Không hiển thị số liệu giả. |
| `/dashboard` | ADMIN | Xem tóm tắt quản trị, account count và trạng thái dịch vụ. Không để trạng thái chưa tải thành `0` hoặc `healthy`. |
| `/appointments` | DOCTOR, STAFF, ADMIN theo quyền API | Lọc theo ngày/trạng thái/từ khóa; xem kết quả và phân trang; thử hành động hợp lệ, xác nhận thao tác consequential, xử lý lỗi/409 mà không mất ngữ cảnh. Chỉ provider được quyền mới thấy/hành động trên dữ liệu tương ứng. |
| `/doctors` | DOCTOR, STAFF, ADMIN theo quyền API | Xem danh sách/chuyên khoa/lịch; tìm kiếm, phân trang và thao tác được cấp quyền. Căn chỉnh nội dung theo cùng page container, không lệch trái bất thường. |
| `/medical-records` | DOCTOR | Chọn ca khám được phân công, tải thông tin bệnh nhân, lưu nháp và hoàn tất theo quy tắc; khi chốt FINAL phải có xác nhận và form khóa sau khi server xác nhận. ADMIN/STAFF không được cấp quyền lâm sàng chỉ qua UI. |
| `/notifications` | DOCTOR, STAFF, ADMIN | Xem danh sách, lọc chưa đọc, đánh dấu đã đọc; cập nhật badge và panel cùng nguồn dữ liệu. |
| `/profile` | DOCTOR, STAFF, ADMIN | Tải profile; sửa đúng các trường API hỗ trợ; giữ dữ liệu nhập khi request lỗi. Tính năng chưa có API phải thể hiện disabled/roadmap rõ ràng. |
| `/users` | ADMIN | Tìm/lọc, xem trạng thái; đổi role hoặc khóa tài khoản qua xác nhận; không cho tự khóa chính mình nếu contract cấm. |
| `/health` | ADMIN | Đọc payload tổng hợp qua Gateway; phân biệt trạng thái Gateway với từng service; thử refresh, lỗi Gateway và stale data. Role khác nhận permission denied/redirect đúng quy tắc. |

> Các role “theo quyền API” phải được xác nhận theo response thực tế và [API Contract](api-contract.md), không suy ra quyền chỉ từ route UI.

#### 3.3. Loading, empty, error và dữ liệu cũ

- [ ] Tên trang, mô tả, filter, label, table heading và cấu trúc section xuất hiện ổn định; skeleton chỉ thay vùng dữ liệu.
- [ ] Refresh khi đang có dữ liệu giữ kết quả cũ trong lúc cập nhật; chỉ giữ kết quả cũ khi UI ghi rõ đó là dữ liệu stale.
- [ ] Empty state chỉ xuất hiện sau response thành công với danh sách rỗng; lỗi mạng/auth/5xx không được diễn giải thành danh sách rỗng.
- [ ] Error state có retry trong đúng vùng dữ liệu; retry không xóa filter, form draft hoặc lựa chọn hiện tại.
- [ ] Các request độc lập không làm cả trang chuyển sang lỗi chung. Ví dụ: lỗi health không làm mất account summary; lỗi resolve tên không làm mất bản ghi có thể hiển thị an toàn.
- [ ] Mọi mutation có loading ở control/row tương ứng, chống submit lặp và chỉ thông báo thành công sau response thành công.
- [ ] Skeleton vùng thay đổi có `aria-busy`/accessible status phù hợp; trạng thái không chỉ dựa vào màu.

#### 3.4. Xác minh luồng dữ liệu và health

- [ ] Trong trình duyệt chỉ có base URL của Gateway; không gọi trực tiếp các port của User/Doctor/Appointment/Medical Record/Notification Service.
- [ ] Kiểm tra request ID được giữ trong lỗi hiển thị/log đối chiếu; không đưa token, URL nội bộ, query nhạy cảm, dữ liệu bệnh nhân hoặc lỗi thô vào UI/log.
- [ ] So sánh `GET /api/v1/system/health` thực tế với adapter UI. `gateway` là trạng thái riêng; keys của services phải khớp `users`, `doctors`, `appointments`, `medicalRecords`, `notifications`.
- [ ] Unknown/missing status hiển thị “chưa xác định” hoặc loading; không diễn giải thành down/healthy.
- [ ] Trang health và dashboard không được mâu thuẫn khi dùng cùng một response shape.

**Health polling:** hiện tại panel tự tải khi vào trang và có nút kiểm tra lại; chưa có polling 30 giây. Nếu nghiệm thu yêu cầu cập nhật tự động trong tuần này, cần bổ sung thành hạng mục có kiểm soát: poll 30 giây khi tab visible, dừng khi hidden, kiểm tra khi quay lại; Gateway nên cache snapshot khoảng 10–15 giây và gộp request đồng thời. Health endpoint hiện gọi probe service cho mỗi request và payload hiện tại chưa có `checkedAt`/`durationMs`. Phần cache/metadata thuộc backend và API contract, vì vậy cần task ID M2 được cấp riêng trước khi triển khai; nếu chưa có task ID, nghiệm thu tuần này dùng refresh thủ công và hiển thị thời điểm nhận kết quả tại client, không gọi đó là thời điểm probe từng service.

### P1 — Cần hoàn tất nếu không làm chậm P0

- [ ] Kiểm tra responsive ở desktop, tablet và viewport hẹp; sidebar chuyển sang cách điều hướng phù hợp, bảng có scroll/reflow không làm mất action.
- [ ] Kiểm tra keyboard: thứ tự Tab hợp lý, focus-visible, dialog đóng bằng Escape, focus không rơi ra sau modal.
- [ ] Kiểm tra text tiếng Việt, ngày/giờ `Asia/Ho_Chi_Minh`, trạng thái lịch hẹn và lỗi nghiệp vụ.
- [ ] Loại bỏ các chỗ dùng raw `<button>`/`<input>` khi hợp đồng yêu cầu component design-system; chỉ sửa ở phạm vi tác vụ chính, không đại tu toàn bộ code.
- [ ] Kiểm tra console/runtime không có lỗi hydration, key warning hoặc request lặp bất thường khi chuyển route.
- [ ] Kiểm tra chiều cao cuộn: nội dung trang cuộn ở vùng chính; app shell và nút đăng xuất luôn sẵn dùng.

### P2 — Hoãn sau nghiệm thu nếu không chặn công việc

- Tinh chỉnh icon, micro-spacing và chuyển động nhỏ không ảnh hưởng khả năng đọc/thao tác.
- Tính năng mới không có trong API contract hoặc không liên quan tới luồng chính.
- Polling health tự động nếu chưa có task backend/API được duyệt và task ID M2.
- Công việc Flutter còn mở theo `docs/team-task-assignment-m3.md`.

## 4. Lịch làm việc ba ngày

### Ngày 1 — Chốt nền tảng và chặn lỗi tích hợp

- [ ] Xác nhận Gateway cùng năm service khởi động; không in/ghi lại giá trị `.env`.
- [ ] Mở các route bằng từng role test đã được cấp; ghi lại endpoint, status code và request ID khi có lỗi.
- [ ] Hoàn tất các thay đổi đang dang dở trong adapter health/dashboard và xác nhận payload thực tế.
- [ ] Rà `PageHeader`, route guard, shell cố định và trạng thái logout trên tất cả routes.
- [ ] Đánh dấu blocker P0 bằng route + bước tái hiện + kết quả mong đợi; không mở rộng scope trong lúc sửa.

**Cổng cuối ngày:** không còn lỗi đăng nhập/route khiến người dùng đúng role không vào được trang chính; khung trang không biến mất khi data request lỗi.

### Ngày 2 — Hoàn tất tác vụ nghiệp vụ và các trạng thái dữ liệu

- [ ] Đi hết luồng lịch hẹn: lọc → xem → hành động hợp lệ → xác nhận → kết quả/error.
- [ ] Đi hết luồng bác sĩ/lịch làm việc và xác nhận bố cục căn chỉnh với page container chung.
- [ ] Đi hết luồng hồ sơ khám của DOCTOR: chọn đúng appointment → draft → final confirm → lock.
- [ ] Kiểm tra profile, users, notifications theo quyền tương ứng.
- [ ] Rà skeleton/empty/error/stale cho các vùng API; sửa lỗi làm các tiêu đề/static controls biến mất hoặc nhảy.

**Cổng cuối ngày:** tác vụ chính không cần reload thủ công ngoài chức năng refresh được thiết kế; form không mất dữ liệu do lỗi request; quyền UI khớp API.

### Ngày 3 — Rà tương thích, sửa lỗi còn lại và ký nghiệm thu

- [ ] Chạy lint, build và bộ kiểm tra web hiện có; lưu lệnh, exit code và lỗi còn tồn tại.
- [ ] Kiểm tra từng role/route trong ma trận ở §3.2, cả direct URL và navigation.
- [ ] Kiểm tra responsive, keyboard/focus, modal, ngày giờ và status labels.
- [ ] Kiểm tra health status, gateway status, service status, stale state và nút refresh.
- [ ] Rà diff cuối: không có `.env`, secret, dữ liệu thật, thay đổi backend ngoài scope hoặc file generated ngoài ý muốn.
- [ ] Ghi lại lỗi chấp nhận được còn lại, owner và mốc xử lý; không đánh dấu hoàn tất nếu còn blocker P0.

**Cổng nghiệm thu:** tất cả P0 đạt; không còn lỗi P1 chặn tác vụ chính; build/lint xanh; role/route và luồng Gateway đã được kiểm tra thủ công; các thay đổi được commit local trên nhánh web sau review. Push/merge chỉ theo quy trình Git hiện hành và quyền được cấp.

## 5. Ma trận xác nhận cuối

| Nhóm | Bằng chứng cần lưu | Đạt khi |
|---|---|---|
| Shell và header | Ảnh hoặc ghi chú từng route ở loading/populated/error | Header không đổi; sidebar/header cố định; role chỉ hiển thị một lần ở app header. |
| Phân quyền | Bảng role × route và response 401/403 tương ứng | Không có route UI cấp quyền vượt API; không flash dữ liệu protected trước khi session xác định. |
| Tải dữ liệu | Request URL qua Gateway, response status, UI state | Loading khác empty/error; dữ liệu thiếu không bị đổi thành 0/healthy. |
| Tác vụ nghiệp vụ | Bước thao tác, response và trạng thái sau thao tác | Server là nguồn xác nhận; mutation có xác nhận/feedback đúng quy tắc. |
| Responsive/accessibility | Kích thước viewport, keyboard path, modal/focus | Không mất thao tác, không tràn ngang ngoài vùng table có chủ đích, focus nhìn thấy. |
| Build và chất lượng | Command + exit code + danh sách lỗi còn lại | Lint/build và bộ kiểm tra sẵn có đạt; không che lỗi bằng cách bỏ qua bước. |
| Git và bảo mật | `git status`, diff và danh sách commit | Chỉ có file thuộc scope; không có secrets/data thật; không ghi đè worktree/backend branch khác. |

## 6. Lệnh xác minh đề xuất

Chạy từ repository root sau khi các sửa đổi P0 hoàn tất:

```bash
npm run lint -w @clinic/clinic-management-web
npm run build -w @clinic/clinic-management-web
npm test -w @clinic/clinic-management-web
git diff --check
git status --short --branch
```

Không đưa giá trị `.env` vào terminal output hoặc tài liệu. Nếu kiểm tra live service, chỉ ghi URL Gateway không nhạy cảm, HTTP status, request ID và thời gian phản hồi. Không dùng production/patient data làm fixture.

## 7. Quyết định nghiệm thu

Cuối ngày 15/11, ghi một trong ba trạng thái:

- **Đạt:** toàn bộ P0 đạt và các cổng nghiệm thu ở §4 hoàn tất.
- **Đạt có tồn đọng:** P0 đạt; chỉ còn P1/P2 không chặn tác vụ, từng tồn đọng có owner và hạn xử lý.
- **Chưa đạt:** còn P0, lỗi phân quyền/dữ liệu, tác vụ chính không hoàn tất được, hoặc Gateway/service chưa đủ ổn định để xác nhận UI với response thật.

Không đánh dấu “100% hoàn thành” chỉ dựa vào việc route tồn tại hoặc build thành công.
