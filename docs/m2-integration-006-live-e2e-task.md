# M2-INTEGRATION-006 — Live E2E qua Gateway cho Web và Patient App

**Trạng thái:** READY FOR BASELINE; chưa được giao agent và chưa chạy test
**Coordinator:** TV1 / Member 1
**Mục tiêu:** chứng minh các luồng cốt lõi bằng client thật → API Gateway → business service thật → database disposable; phân biệt rõ code đã có với phần cần sửa.
**Quy tắc:** chỉ commit local; không push, không mở PR, không merge; không reset/stash/ghi đè thay đổi chưa commit của người dùng.

## 1. Baseline và điều kiện bắt đầu

Baseline quan sát ngày 17/11/2026:

- Backend: `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`, branch `test/m2-integration-005-api-v2-clinic-workflow`, HEAD `bec6e93369c66ba532439c3e216d36a3f717b088`.
- Frontend: `/home/Williams/Projects/ClinicAppoiment`, branch `feat/m3-ui-acceptance-integrated`, HEAD `bbd251a`; working tree có thay đổi chưa commit. Đây chưa phải snapshot sạch được chấp nhận cho E2E.
- Runner `test/run-phase5-live.mjs` là Gateway + upstream Express synthetic trong RAM. Giữ nó làm Gateway regression, không dùng làm bằng chứng service thật.
- Các kết quả 27 PostgreSQL integration / 18 OpenAPI / unit suites được báo cáo trước đây, chưa chạy lại trong lần soạn task.

Trước khi triển khai, TV1 ghi lại `git status`, SHA và diff summary cho từng checkout; xác nhận danh sách service/port/env mà không in secret. Giữ nguyên frontend worktree đang dirty. Mỗi agent làm trong worktree riêng. Nếu frontend cần thay đổi trong worktree sạch, thống nhất snapshot đầu vào với chủ sở hữu trước; không tự mang hoặc loại bỏ diff chưa được xác nhận.

**Không bắt đầu live write** cho tới khi xác nhận rõ tất cả DB là disposable, migration đúng phiên bản, fixture tổng hợp và có cách dọn dữ liệu an toàn. Không dùng Supabase production, tài khoản người dùng thật hoặc dữ liệu bệnh án thật.

## 2. Phạm vi nghiệp vụ và ngoài phạm vi

### Phải chạy

1. PATIENT Flutter: đăng nhập/khôi phục phiên, duyệt bác sĩ và slot, đặt lịch, xem/đổi/hủy lịch, đọc hồ sơ FINAL và xem/đọc thông báo.
2. STAFF/ADMIN Web: đăng nhập MFA, quyền trước/sau xác minh, tiếp nhận lịch và thao tác được contract cho phép, thu hồi phiên.
3. DOCTOR Web: lịch được phân công, TOTP theo ca, clinical grant đúng session/appointment/patient, tạo/sửa draft có version, context và xác minh lần cuối để chốt FINAL.
4. Liên kết liên service: appointment completion, notification/outbox, idempotency, duplicate/replay, role/resource boundary và lỗi upstream.
5. Mọi request public từ client phải đi qua Gateway; kiểm tra log/request ID mà không lưu token, mã TOTP, secret, mật khẩu hoặc PHI.

### Không làm

- Không đổi visual direction, shell, route hoặc layout rộng. Chỉ sửa thành phần cần để kết nối/nghiệm thu, theo `docs/ui-design-contract.md`, tokens và component hiện hữu.
- Không thêm database/service, không cho client truy cập trực tiếp service port/database, không thay business contract ngoài phối hợp owner.
- Không tính test mock/harness, OpenAPI-only hoặc health-only là live E2E.
- Không tuyên bố production readiness.

## 3. Chia việc — tối đa 4 agent, đúng ownership

Mỗi agent dùng một worktree riêng. Các nhánh dưới đây là nhánh task dự kiến; trước khi tạo phải kiểm tra nhánh/worktree tồn tại và chọn tên khác nếu đã được dùng. Cùng một task điều phối `M2-INTEGRATION-006`; domain code vẫn do owner của domain sửa.

| Agent | Thành viên / Task ID | Branch dự kiến và base | Phạm vi sở hữu | Bàn giao |
|---|---|---|---|---|
| Agent 1 | TV1 / Member 1 — `M2-INTEGRATION-006` | Backend `test/m2-integration-006-live-e2e`, base `bec6e93` | Thực tế hóa môi trường test Gateway + 5 services, health/readiness, runner/fixtures orchestration, request evidence, cross-service flow coordinator và báo cáo. Tách rõ synthetic với live. Không sửa logic domain. | Lệnh khởi chạy, kiểm tra port/config an toàn, test orchestration và evidence matrix có SHA/DB migrations. |
| Agent 2 | TV2 / Member 2 — `M2-INTEGRATION-006` | Frontend task worktree `test/m2-integration-006-auth-session-live`, base theo frontend snapshot được duyệt từ `bbd251a` | PATIENT auth/profile/session và Web auth/session/MFA; bổ sung Flutter integration test cho login, refresh, lỗi mạng và logout nếu thiếu. User Service/API chỉ sửa khi phát hiện lỗi và giữ owner Member 2. | E2E auth/session từ client thật qua Gateway; regression test, không đổi UI ngoài flow hiện hữu. |
| Agent 3 | TV3 / Member 3 — `M2-INTEGRATION-006` | Frontend task worktree `test/m2-integration-006-booking-live`, base theo frontend snapshot được duyệt | Flutter khám phá bác sĩ/slot/booking/cancel/reschedule; Web lịch tiếp nhận/check-in/transition. API Appointment/Doctor chỉ do Member 3 sửa. | E2E booking và state transition; kiểm tra idempotency/replay và dữ liệu lịch sau request. |
| Agent 4 | TV4 / Member 4 — `M2-INTEGRATION-006` | Frontend task worktree `test/m2-integration-006-clinical-live`, base theo frontend snapshot được duyệt | DOCTOR Web clinical grant/draft/finalize; PATIENT Flutter record/notification; API Medical Record/Notification chỉ do Member 4 sửa. | E2E đọc/chốt bệnh án và notification/outbox; kiểm tra privacy/session/proof replay. |

### Quy tắc khi phát hiện lỗi

- Agent kiểm tra trước xem đó là thiếu UI, lỗi client adapter, contract mismatch, Gateway routing, service authorization hay persistence.
- Chuyển lỗi về đúng owner. Không sửa chéo service hoặc file shared để “làm xanh” E2E; TV1 review mọi thay đổi Gateway/shared client/env/script.
- Nếu phải sửa implementation, tạo nhánh/worktree theo domain owner và khai báo base SHA, paths, dependency, acceptance trước khi code. Commit local nhỏ, sau đó chạy lại flow bị ảnh hưởng và regression liên quan.
- Agent không cùng sửa một file integration test. TV1 sở hữu runner orchestration; từng domain agent sở hữu test file/fixture riêng của flow mình.

## 4. Thứ tự triển khai

### Nhịp 0 — Baseline và test environment

TV1 xác nhận checkout, dirty state, API contract, ports, service URLs, test database riêng, migrations và seed/reset procedure. Không in `.env`; kiểm tra tên biến và trạng thái cấu hình bằng cách redacted. Tạo tài khoản/factor TOTP tổng hợp theo cách test đã duyệt. Dừng nếu có bất kỳ URL/DB nào trỏ production.

**Exit:** frontend snapshot được chủ sở hữu xác nhận; 5 DB disposable rõ ràng; service health/readiness kiểm tra được; không có secret/PHI trong evidence.

### Nhịp 1 — Client-domain flows song song

TV2–TV4 chạy flow của mình từ client thật. Dùng Flutter integration tests trên emulator/device và browser automation hoặc browser manual evidence cho Web. Test phải gửi request qua Gateway URL duy nhất cấu hình trong client. Lưu request ID/status/timestamp và assertion nghiệp vụ, không lưu credential.

**Exit:** từng flow có kết quả pass/fail/skip và lỗi được gán đúng owner; không gọi service trực tiếp từ test client để né Gateway.

### Nhịp 2 — Cross-service clinical journey

TV1 điều phối một fixture end-to-end: PATIENT tạo booking → STAFF check-in → DOCTOR xác minh TOTP và grant đúng ca → ghi/chốt bệnh án → appointment hoàn tất → PATIENT đọc FINAL và notification. Kiểm tra DB của service sở hữu sau mỗi side effect; xác nhận không có cross-database access.

**Exit:** mọi liên kết state/outbox đúng, duplicate/replay không tạo side effect thứ hai, patient/doctor/session sai bị từ chối.

### Nhịp 3 — Boundary, lỗi và hồi quy

Kiểm tra request không xác thực, role sai, patient/appointment sai, session/grant/proof hết hạn hoặc replay, response mất sau write, service timeout/503, retry, migration sạch và DB persistence. UI phải giữ input và hiển thị lỗi có thể phục hồi; không chuyển lỗi thành empty/success giả.

Chạy build/typecheck/lint và regression phù hợp Web, Flutter, Gateway, service và PostgreSQL. Ghi cả test skip; skip bắt buộc làm flow đó chưa đạt.

### Nhịp 4 — Báo cáo và handoff

TV1 cập nhật report/handoff với bộ SHA chính xác, dirty state, môi trường đã redacted, migrations, từng command/exit code, pass/fail/skip, request IDs/artifact path an toàn, và known gaps. Chỉ commit local.

## 5. Ma trận E2E và tiêu chí pass

| ID | Client/role | Luồng | Assertions tối thiểu |
|---|---|---|---|
| E2E-AUTH-PATIENT | Flutter / PATIENT | login → refresh/restore → lỗi tạm thời → logout | Phiên theo contract; timeout không xóa phiên hợp lệ; logout làm mất quyền server-side; gọi qua Gateway |
| E2E-AUTH-STAFF | Web / STAFF, ADMIN | login → PENDING_MFA → MFA → nghiệp vụ → revoke | Trước MFA nghiệp vụ bị chặn; sau MFA theo đúng quyền; thu hồi vô hiệu phiên |
| E2E-PATIENT-BOOK | Flutter / PATIENT | doctor/slot → booking → retry → list/detail | Slot lấy từ API; idempotent retry không tạo lịch thứ hai; conflict không làm mất input |
| E2E-STAFF-APPT | Web / STAFF | pending → confirm/check-in và trạng thái hợp lệ | Chỉ transition được phép; dữ liệu appointment và history khớp; request direct service không xuất hiện |
| E2E-DOCTOR-CLINICAL | Web / DOCTOR | checked-in → TOTP/grant → summary/detail → draft → context/TOTP → FINAL | Grant gắn đúng patient/appointment/doctor/session; draft version; tamper/replay bị từ chối; completion/outbox đúng |
| E2E-PATIENT-RESULT | Flutter / PATIENT | tải record sau FINAL → notification/count/read | Chỉ đọc record của đúng patient; draft không lộ; paging/read-all cutoff và notification mới đúng |
| E2E-FAILURE | Flutter + Web | timeout/503/response mất/retry | Không fake success/empty, không mất draft/input, retry unsafe write không nhân side effect |

Flow chỉ PASS khi assert trên response qua Gateway và side effect bền vững ở database service sở hữu. Health check, status 200 đơn lẻ, mock, synthetic runner và API test không có client thật không đạt tiêu chí này.

## 6. Bằng chứng bắt buộc

Mỗi flow ghi:

- Task/Member owner, client build, backend/frontend SHA và trạng thái dirty của snapshot.
- OS/emulator/browser, Gateway URL (không kèm secret), service revision, migrations và tên database disposable.
- Command hoặc thao tác tái lập, exit code, số pass/fail/skip, kết quả assertions và request IDs.
- Assertion persistence/outbox bằng truy vấn/test helper đã redacted; không chụp/ghi PHI.
- Kết quả accessibility/regression phù hợp: Flutter semantics/tap targets và Web keyboard/focus/responsive.

## 7. Definition of Done

Chỉ đánh dấu `E2E ACCEPTED` khi tất cả E2E bắt buộc trong ma trận chạy qua client thật, Gateway thật, năm service runtime thật và database disposable cùng bộ revision tương thích; không có flow bắt buộc bị skip; authorization, persistence, retry/idempotency/outbox đều được assert; Web/Flutter regression đạt; owners xác nhận; báo cáo có evidence tái lập.

Nếu thiếu một điều kiện, ghi trạng thái cụ thể, ví dụ `IMPLEMENTED / UNIT PASS / DB PASS / LIVE E2E NOT RUN`; không dùng “100%”, “hoàn tất toàn bộ” hoặc “accepted”.

## 8. Quy tắc bảo toàn UI và Git

- Tuân thủ `docs/ui-design-contract.md`, `apps/clinic-management-web/app/globals.css`, `apps/patient-app/lib/core/theme/app_theme.dart` và component hiện có. Không đổi visual direction, token, shell hoặc navigation để thuận tiện cho test.
- Mỗi thay đổi UI chỉ nối/sửa state cho flow cụ thể; giữ loading/empty/error/success, input và tương tác đang có.
- Mọi agent làm trên branch/worktree riêng; không checkout/reset/stash hoặc ghi vào worktree frontend dirty hiện tại.
- Chỉ commit local theo task; tuyệt đối không push, mở PR hoặc merge `main` trong phạm vi này.
