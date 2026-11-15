# Kế hoạch triển khai backend theo API Contract v2

**Ngày lập:** 15/11/2026  
**Mục tiêu:** tăng tốc triển khai backend từ contract API v2 trên nhánh `test/m2-integration-002-openapi-contract-tests`.  
**Trạng thái:** kế hoạch giao việc; chưa triển khai các endpoint v2 và chưa nghiệm thu runtime.  
**Checkout tiếp tục:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`  
**Base quan sát:** `dad4f96aa8d2524c6ce31bee12e6421a5ba44946` — `merge: standardize backend service logging`.

## 1. Mục đích và điều kiện nguồn

Tài liệu này chia contract đích thành các task backend độc lập và một thứ tự tích hợp an toàn. Nguồn nghiệp vụ chuẩn là [`docs/api-contract-v2.md`](api-contract-v2.md) ở nhánh FE tích hợp `feat/m3-ui-acceptance-integrated`, commit `b1d3113bd595be6a46071ec20f3d086e369a8e5e`. Contract v2 hiện ở nhánh khác/worktree; bản backend `docs/api-contract.md` tại base là v1. Trước mỗi task, agent phải đối chiếu đúng SHA nguồn và đưa các đoạn được giao sang PR/commit service của mình; không giả định file v2 đã tồn tại ở backend base.

`api-contract-v2.md` nói rõ **đây là thiết kế đích, chưa triển khai và chưa nghiệm thu**. Nhãn `CÓ` chỉ nói route tồn tại ở snapshot, không nói payload, quyền, tính bền vững hoặc E2E v2 đã đạt. Nhãn `MỚI`, `THAY_ĐỔI`, `CHỜ_CHỐT`, `TÙY_CHỌN` phải được giữ nguyên ý nghĩa.

Không thay kiến trúc đã thống nhất: public client → API Gateway → owning service → database riêng của service. Supabase Auth chỉ thuộc User Service; Gateway không sở hữu DB; không truy cập DB service khác; không đưa service URL/secret lên frontend; API nội bộ không expose qua Gateway. Giữ Express/TypeScript, sáu service hiện có, PostgreSQL/database-per-service và outbox hiện hữu. Không thêm Redis, broker, service mới hoặc cache nghiệp vụ trừ khi có quyết định riêng.

## 2. Quy tắc điều phối và branch safety

- Tất cả task mới bắt đầu từ nhánh backend hiện hành `test/m2-integration-002-openapi-contract-tests`, sau khi ghi lại `git status`, `HEAD`, worktree và xác nhận không ghi đè thay đổi đang có. Nhánh phụ thuộc phải ghi parent SHA, PR phụ thuộc và thứ tự merge. Không tạo worktree đè lên checkout backend-openapi đang được dùng.
- Dùng branch theo rules: `feat/m2-<domain>-NNN-<slug>` hoặc `test/m2-integration-NNN-<slug>`. ID dưới đây là assignment mới, phân biệt với task backend lịch sử có cùng domain.
- Mỗi agent một worktree và một branch. Không để hai agent cùng sửa entrypoint, migration, OpenAPI hoặc repository của một service. Shared `packages/shared-types`, Gateway, root lockfile, contract/API docs cần TV1 review.
- Trước khi code, mỗi agent báo member, task ID, base SHA, owned paths, dependencies, contract section, acceptance excerpt và files dirty. Không suy ownership từ checkout.
- Chỉ commit local sau review; không push, mở PR hoặc merge `main` trong kế hoạch này. Giữ commit v2 FE riêng cho tham chiếu, không cherry-pick UI vào backend.
- Lệnh kiểm tra phải ghi chính xác command, exit code, số pass/fail/skip, SHA và việc cần DB thật. Không ghi “đạt E2E” từ unit/mock/OpenAPI lint.
- Không mở/in `.env`, token, connection URL hoặc dữ liệu người bệnh. Dùng fixtures tổng hợp. Test ghi DB chỉ dùng database disposable được chỉ định.

## 3. Baseline: phần đã có và các lỗ hổng đích

Trước khi nhận task, kiểm tra lại source tại base; bảng sau tóm tắt kiểm kê tĩnh để phân công, không thay thế review code:

| Miền | Hiện có tại backend snapshot | Mục tiêu v2 còn cần |
|---|---|---|
| Gateway identity | RAM `VerifiedIdentityCache`, TTL cấu hình, LRU/coalescing theo audit; login/logout proxy | Cache phải tôn trọng session state/deadline, khóa/thu hồi/role change, invalidation và restart; allowlist PENDING_MFA/LOCKED; không cấp quyền từ role cache cũ |
| User/Auth | Supabase Auth login/refresh/logout, profile/role/patient, internal verify | Phiên bền vững theo role; hoạt động PATIENT/DOCTOR; MFA TOTP, enrollment/challenge/proof, STAFF/ADMIN lock; session list/revoke, recovery/password; logout scope current/all; invalidate Gateway |
| Doctor | Specialty/doctor/schedule/time-off/slots, kiểm tra occupancy | `/doctors/me`; tương thích lookup names; dependency status/permissions theo contract, không giả slot trống |
| Appointment | CRUD/transition/state machine/idempotency/outbox | summary server; q/include/view/sort/from/to; names tối thiểu đúng scope; không lộ nội dung lâm sàng trước grant; chỉ COMPLETED qua callback FINAL; contract idempotency đầy đủ |
| Medical Record | DRAFT/FINAL, prescription trong record, callback hoàn tất | clinical grants, TOTP proof/context, versioning, lịch sử FINAL liên bác sĩ đúng scope, đọc authored history có hạn, chốt chống replay/race, `appointmentCompletion` |
| Notification | IN_APP list/detail/mark one, reminder/outbox | unread-count và read-all cutoff; không mất thông báo mới; list/error semantics |
| OpenAPI | Mỗi service có `/openapi.json`, Swagger UI; package contract tests | Schema đầy đủ cho endpoint v2, exact methods/params/security/error; snapshot + live khi service chạy |
| Runtime integration | Unit tests là chính; audit ghi nhận 24 DB/HTTP integration tests bị skip | PostgreSQL thật, HTTP liên service qua Gateway, race/replay/restart/dependency outage; báo riêng mock/DB/live |

Chi tiết authority là API v2 mục 1–16. Thiết kế RAM cache nằm ở `docs/backend-cache-design.md` trên worktree FE; nếu chưa chép vào branch task thì đọc nguồn cùng SHA. Không sửa cơ chế log đã chuẩn hóa, trừ lỗi cụ thể có regression test.

## 4. Phân công song song

### TV1 / Member 1 — `M2-INTEGRATION-004`: contract v2, Gateway, integration harness

**Branch đề xuất:** `test/m2-integration-004-api-v2-rollout`  
**Owned paths:** `gateway/api-gateway/**`, `packages/openapi-contract-tests/**`, integration harness/scripts liên quan; root `package.json`/lockfile chỉ khi cần và phải review. Không triển khai domain logic User/Appointment/Record thay owner.

**Phụ thuộc:** contract source `b1d3113`; nhánh User auth/session cho verify contract. Giai đoạn scaffold tests có thể chạy song song; chốt end-to-end sau các provider PR.

**Việc cần làm:**

- [ ] Lập compatibility matrix v1→v2: operation, owner, CÓ/MỚI/THAY_ĐỔI, role, status/error và breaking fields. Giữ `/api/v1` khi chưa có quyết định route-version khác; số phiên bản tài liệu không tự thành HTTP `/v2`.
- [ ] Gateway tiếp tục chỉ prefix-route; kiểm tra headers client spoof bị strip, internal routes không public, timeout/error/requestId giữ nguyên, không tự retry unsafe write.
- [ ] Nhận session metadata đã verify từ User; áp dụng deadline theo role, state ACTIVE/PENDING_MFA/LOCKED/EXPIRED/REVOKED và API-control allowlist. Gateway không tự truy cập DB.
- [ ] Thiết kế cache RAM theo `backend-cache-design.md`: TTL ≤ JWT/session/grant deadline; key token digest; bound LRU; coalesce; invalidation theo token/session/user; kết quả verify đang chạy không ghi đè sau invalidate; restart thành cache miss. Không cache MFA proof như quyền dùng lặp.
- [ ] Chứng minh logout, role/status/factor change, lock/unlock và revoke làm mất quyền cache theo SLA đã thống nhất; kiểm tra nhiều instance nếu kiến trúc triển khai có nhiều Gateway. Không xác nhận revoke hoàn tất trước khi hiệu lực quyền cũ mất.
- [ ] Mở rộng contract tests để kiểm tra exact endpoint/query/schema/error/security của v2; từ chối endpoint biến mất hoặc fallback bỏ guard. Tách static OpenAPI validation với live smoke.
- [ ] Xây integration harness qua Gateway cho PATIENT booking; STAFF xác nhận/check-in; DOCTOR grant/read/finalize; appointment callback; patient notifications. Harness không được trở thành service production mới.

**Tiêu chí đạt:** tests chứng minh prefix boundary, authorization header được tạo từ identity tin cậy, không direct-service access, state restrictions, cache expiry/invalidation/restart và OpenAPI khớp operation. Chạy được integration với DB test thật hoặc ghi chính xác phần blocker.

### TV2 / Member 2 — `M2-USER-004`: session, MFA, auth và patient scope

**Branch đề xuất:** `feat/m2-user-003-session-mfa-api-v2`  
**Owned paths:** `services/user-service/**`, User migrations/schema, User OpenAPI/tests, `INTERNAL-LOOKUP-CONTRACT.md` và User-owned API contract sections. Gateway/Record/Doctor code không thuộc nhánh này.

**Phụ thuộc:** Gateway consumer metadata contract từ TV1; MFA provider behavior phải được spike/verified against Supabase API/docs and existing SDK before implementing. Internal service credentials per existing caller matrix.

**Việc cần làm theo lát:**

1. **Session persistence and transitions** — session ID, actor, credential/provider subject reference, role policy, last activity, idle/absolute expiry, lock/revoke state, MFA state, timestamps, rotation/replay controls. Migration có up/down hoặc rollback strategy phù hợp conventions; unique/index/locking để refresh đồng thời không phát hai phiên/token hợp lệ ngoài policy. Không lưu password, TOTP code/seed dạng plaintext, refresh/access token thô.
2. **PATIENT/DOCTOR lifecycle** — PATIENT idle 30 ngày; DOCTOR idle 15 ngày; access token target 3600s, response luôn trả expiry thực. Chỉ activity sử dụng foreground cập nhật server timestamp; refresh, background poll và Gateway cache-hit không gia hạn idle. Hết hạn không hồi sinh bằng provider refresh. Atomic rotate refresh, logout/revoke và account status.
3. **STAFF/ADMIN lifecycle** — password + TOTP đầu phiên; 8h absolute expiry; 15m inactivity sang LOCKED; TOTP unlock không cấp lại 8h; hết 8h cần login lại. PENDING_MFA/LOCKED chỉ dùng allowlist auth control. ADMIN/STAFF policy bảo mật chung, quyền nghiệp vụ không đồng nhất.
4. **MFA API** — enrollment/factors/challenge/verify, mã 6 ký tự giữ số 0 đầu, challenge TTL/rate limit/attempt policy, purpose-bound proof và factor recovery. Secret chỉ trả trong enrollment qua TLS, không log, không cache chung. Không dùng `aal2` cũ hay `mfaVerified` client làm proof cho thao tác mới.
5. **Session/account APIs** — `/auth/session`, activity, session listing/revoke; logout current/all tương thích provider; password forgot/recovery exchange/reset/change theo mục 10. Password/recovery TTL, lockout thresholds và factor recovery cần quyết định an ninh trước release nếu contract chưa có giá trị.
6. **Protected actions** — proof cho role/status/factor/security mutations gắn actor, session, operation, resource và payload/version; service User kiểm tra nhưng domain service tiêu thụ proof transactionally theo owner.
7. **Profile/patient access** — giữ `GET/PATCH users/me`; giới hạn patient lookup. Thêm internal verify proof/grant và patient lookup đúng contract mục 15, với caller allowlist/credential riêng, DTO tối thiểu, không trả demographics ngoài mục đích. Không tin `X-Role`/ID client.
8. **Gateway invalidation** — khi logout/revoke/role/status/factor/lock đổi, phát signal nội bộ được xác thực đến Gateway; chống replay/sai thứ tự. Định nghĩa tính bền vững/outbox nếu cần để không mất invalidation sau restart; không giả hiệu lực cache theo instance đơn nếu triển khai nhiều replica.

**Tiêu chí đạt:** PostgreSQL thật kiểm tra refresh race/replay/idle boundary, role changes, account lock, revoke/restart; TOTP sai/hết hạn/replay/rate-limit; challenge/proof khác purpose/context; 503 provider không tạo login giả; OpenAPI có đầy đủ success/error/security. Không ghi “production ready” chỉ từ mocked Supabase.

### TV3 / Member 3 — `M2-BOOKING-006`: Doctor + Appointment contract v2

**Branch đề xuất:** `feat/m2-booking-005-appointment-doctor-api-v2`  
**Owned paths:** `services/doctor-service/**`, `services/appointment-service/**`, hai migrations/schemas/repositories/OpenAPI/tests. Các thay đổi Appointment→User/Doctor lookup cần TV2 review; Gateway không sửa.

**Việc Doctor:**

- [ ] `GET /api/v1/doctors/me` từ identity User đã xác minh; role DOCTOR active, 404 rõ khi thiếu profile.
- [ ] Tất cả list/schedule/time-off có pagination/filter đúng; kiểm tra schedule/time-off edits với appointment occupancy, 409 chứa số ca bị ảnh hưởng, không tự hủy.
- [ ] Doctor directory public/auth boundaries theo contract: API v2 liệt kê mọi role ACTIVE đã auth, không tự public anonymous. Không trả available slots nếu occupancy dependency lỗi.
- [ ] Internal lookup doctors minimal và auth caller đúng; không JOIN DB khác.

**Việc Appointment:**

- [ ] Chuẩn hóa `GET /appointments` summary default, `view=detail`, `q`, `include=names`, `from/to`, `sort`, multi-status, pagination thật; lọc/sort toàn tập trước phân trang. Summary detail role-aware; không lộ reason hoặc clinical data cho Doctor trước grant.
- [ ] `GET /appointments/summary` tính trên tập server đầy đủ, timezone `Asia/Ho_Chi_Minh`, khoảng UTC `[from,to)`, status counts nhất quán; lỗi không trả số 0 giả.
- [ ] Names qua internal lookup tối thiểu có giới hạn batch, kiểm tra quyền và timeout; nguồn lookup bắt buộc lỗi → 503, không kết quả rỗng; không cross-database join.
- [ ] Giữ state machine. STAFF/ADMIN thao tác tiếp đón; DOCTOR không tự confirm/check-in; `/complete` legacy trả `MEDICAL_RECORD_REQUIRED`; chỉ internal callback sau FINAL chuyển CHECKED_IN→COMPLETED.
- [ ] Create/reschedule/transitions dùng idempotency actor+operation+resource+fingerprint, concurrency safety, replay trả outcome cũ và key/payload mismatch 409. Outbox event atomic với DB state.
- [ ] ID/filter không mở rộng actor scope; appointment CANCELLED/NO_SHOW không cấp clinical relation. Patient own detail không cần Doctor grant.

**Tiêu chí đạt:** DB test thật concurrent slot booking/reschedule/transition/idempotency; no cross-patient; list >100 fixture; date boundary DST/timezone; dependency outage; outbox replay; callback chỉ khi medical FINAL có proof hợp lệ. Contract/OpenAPI và request/response không vênh.

### TV4 / Member 4 — `M2-RECORD-004` + `M2-NOTIFY-003`: clinical grants, finalization, notification

**Branch đề xuất:** `feat/m2-record-003-clinical-grants-finalization` (Record prerequisite) và stacked `feat/m2-notify-002-notification-api-v2` nếu cần tách owner review.  
**Owned paths:** `services/medical-record-service/**`, `services/notification-service/**`, schema/migrations/OpenAPI/tests của hai service. Không sửa User auth implementation; TV2 cung cấp proof verification internal contract. Appointment callback cần TV3 review.

**Medical Record:**

- [ ] Gate mọi read trước trả payload: PATIENT chỉ FINAL của mình; DOCTOR `scope=authored` summary hoặc detail với authored grant; `patient-history/detail` cần `CURRENT_ENCOUNTER` grant khớp doctor/session/patient/appointment.
- [ ] STAFF/ADMIN không có clinical read/write mặc định. Record ownership không đổi vì xem được history của bác sĩ khác. DRAFT của bác sĩ khác không hiện trong history.
- [ ] `POST access-grants` kiểm tra User proof + Doctor assignment + Appointment eligible/status + session và phát grant có TTL/actor-bound. Nếu eligible appointment status và grant TTL chưa được chốt, feature giữ sau decision gate; không chọn default permissive.
- [ ] `/finalization-contexts` bind appointment/record, expectedVersion, canonicalized content digest, prescription, actor/session và expiry. Nội dung raw clinical không gửi sang User Service.
- [ ] FINAL create/update yêu cầu proof FINALIZE mới gắn context/digest/version và idempotency; consume proof, ghi record FINAL, audit và outbox trong transaction chống race/replay. Chỉnh thuốc sau verify invalidates proof. FINAL immutable; amendment ngoài scope.
- [ ] Trả `appointmentCompletion=NOT_REQUESTED|PENDING|COMPLETED` theo trạng thái authoritative; outbox callback reliable/dedup; không report COMPLETED trước confirmation. Stale version/context trả 409 và giữ DRAFT.
- [ ] Log/audit chỉ metadata actor/record/appointment/purpose/outcome/requestId; không ghi nội dung bệnh án, thuốc, seed, mã hoặc token.

**Notification:**

- [ ] `GET unread-count` đếm toàn bộ của đúng recipient; lỗi không giả zero.
- [ ] `PATCH read-all` theo server `readBefore` cutoff, actor-owned, atomic/idempotent; notification đến sau cutoff vẫn unread. Trả updatedCount/unreadCount/readBefore/readAt theo contract.
- [ ] List/detail/single-read tiếp tục scoped owner; route tĩnh trước dynamic ID; public create luôn bị cấm. Payload điều hướng chỉ IDs, không có PHI.
- [ ] Duy trì event ID/dedup/outbox/reminder hiện có; không thêm push/preferences/1h reminder nếu chưa là decision mới.

**Tiêu chí đạt:** DB thật test proof replay/different digest/version race; grant mismatch doctor/patient/session/appointment; user B không đọc được; `FINAL→callback PENDING→COMPLETED`; notification read-all concurrent arrival/cutoff/retry; event dedup và restart worker. Chưa chốt grant eligibility/TTL hoặc history retention thì ghi là blocked decision, không nới quyền.

### TV1 + provider owners — `M2-INTEGRATION-005`: tích hợp qua Gateway, rollout và nghiệm thu

**Branch đề xuất:** `test/m2-integration-005-api-v2-clinic-workflow`  
**Base/dependencies:** bắt đầu từ nhánh backend-openapi sau khi các PR provider được review/merge theo thứ tự dưới đây; không lấy worktree này làm nền cho từng domain agent đồng thời.

**Checklist:**

- [ ] Chạy migrations trên DB integration disposable mới và thử upgrade path từ schema v1. Không reset user database hoặc Supabase project thật.
- [ ] Bật sáu service theo env template; ghi SHA, migration, ports, test account role (không ghi credential). Mọi request public chỉ qua Gateway, internal route không public.
- [ ] Luồng smoke: PATIENT login/activity/book/refresh/30-day expiry; STAFF login MFA/confirm/check-in/15m lock/unlock/8h expiry; DOCTOR login/assigned encounter/TOTP grant/read history/draft/final TOTP; FINAL→Appointment COMPLETED callback; PATIENT notification/result; ADMIN role/status change proof + revocation/invalidation.
- [ ] Lặp thử race, retry, duplicate, restart Gateway/User/Record/Notification, invalidation và dependency outage; 503 giữ session, không cấp dữ liệu, không đánh dấu empty/success giả.
- [ ] OpenAPI static contract suite cho cả sáu service; live fetch `/openapi.json`/docs; FE contract review của consumer owner. Không phá client được hỗ trợ mà không có rollout/version decision.
- [ ] Unit, DB integration, HTTP integration, live smoke và skipped test báo tách cột; build/lint riêng; lưu requestId/log đã redact.

## 5. Thứ tự triển khai và merge

Cho phép code theo hai đường không chồng owner:

```text
                         ┌─ TV3 Doctor/Appointment ──┐
TV2 User/session/MFA ────┤                           ├─ TV1 Gateway + TV4 cross-service proof/grants
                         └─ contracts first ─────────┘                         │
                                                                              └─ Integration smoke
TV4 Notification APIs ─────────────── có thể song song, phụ thuộc event baseline hiện có
```

1. **Trước khi tách code:** TV1 phát hành compatibility matrix/OpenAPI schemas và nội bộ DTO cho session/proof/lookup. TV2 đặc tả persistence + state transitions; TV4/TV3 review phần giao nhau. Chốt contract provider/consumer trước code song song.
2. **Song song:** TV2 triển khai session core; TV3 Doctor/Appointment APIs; TV4 Notification API. TV1 chuẩn bị contract tests/harness với fixture. PR không được đổi response shape chung một phía.
3. **Record security:** TV2 proof verifier trước hoặc stacked cùng TV4 Record qua interface giả lập có contract; TV3 expose appointment/doctor eligibility internal lookup. TV4 Record chỉ merge sau review đủ cả hai provider.
4. **Gateway integration:** TV1 nối state/cache/invalidation sau khi session metadata và signals được provider kiểm chứng. Không tạm bỏ auth/cache guard để endpoint chạy.
5. **Final integration:** merge provider trước consumer theo dependency; update integration branch từ đúng base; chạy migration, DB/HTTP suite rồi smoke full flow.
6. **Rollout:** `api-contract-v2.md` số tài liệu không tự thành route `/api/v2`. Do các thay đổi login/logout/field permissions có breaking potential, không rollout một nửa. Chọn cutover đồng bộ cho clients được hỗ trợ hoặc phải có quyết định versioning/negotiation trước release.

Thứ tự merge mặc định: User session/schema → Doctor/Appointment schema/API → Record grant/finalization → Notification extension (có thể trước Record nếu độc lập) → Gateway cache/session integration → integration harness/consumer. Nếu provider contract dùng để code song song chưa ổn định, merge schema chưa có consumer flag nhưng không expose behavior mới trước integration.

## 6. Quyết định còn mở — gate, không tự điền

Theo mục 17 của API v2, các nội dung sau cần owner quyết định/ghi config trước acceptance phụ thuộc:

| Quyết định | Blocker cho |
|---|---|
| Bác sĩ mở ca từ trạng thái CHECKED_IN hay cả CONFIRMED gần giờ; cửa sổ thời gian | Doctor clinical grant |
| TTL grant và điều kiện mất quyền khi hết phiên/ca hoàn tất/đổi bác sĩ | Record access/read |
| History authored-read tồn tại 1 hay 2 năm, chuyển cơ sở và phạm vi xin lại | Authored history policy/retention/access |
| MFA challenge/proof TTL, số lần sai, backoff/lockout | User MFA/security acceptance |
| Mất Authenticator/factor recovery identity proof/audit | Enrollment recovery/production enablement |
| NO_SHOW có notification không | Event schema/Notification producer and consumers |
| Client cũ còn được hỗ trợ đồng thời không; nếu có route versioning/negotiation | Breaking changes rollout |
| Mật khẩu mới, reset context expiry/email provider redirect allowlist | Password recovery |

Các mốc đã chốt không mở lại: PATIENT idle 30 ngày; DOCTOR idle 15 ngày; STAFF/ADMIN absolute 8 giờ và lock sau 15 phút inactivity; TOTP 6 chữ số; doctor đọc toàn FINAL của bệnh nhân trong current encounter sau xác minh và xác minh mới khi chốt; STAFF/ADMIN không có clinical rights mặc định. Cache identity Gateway RAM hiện có là điểm xuất phát, không chuyển ownership DB sang Gateway và không cần Redis cho mục tiêu này.

## 7. Quy tắc OpenAPI, migration, logging, cache

- Mọi operation public và internal có request/response schema, role/security, validation, error codes/status, path/query/header, examples tổng hợp và pagination. Không chỉ ghi summary. Static route (`summary`, `unread-count`, `read-all`, `me`) không bị bắt bởi route `/:id`.
- Migrations versioned, forward path từ schema hiện tại, kiểm thử trên empty DB và upgrade; không `DROP` dữ liệu/secret/session hoặc bệnh án trong migration bình thường. Rollback destructive phải có plan và backup strategy.
- Logs giữ contract JSON ngắn đã chuẩn hóa toàn backend: `requestId`, method/path/status/duration và event/error code khi cần; không log token, secret, TOTP, PHI, password, recovery token hoặc full body.
- Gateway cache chỉ identity verification và metadata an toàn; deadline là min của JWT expiry/session expiry/lock/grant expiry thích hợp. Cache hit không gia hạn activity. Không cache chi tiết bệnh án làm fallback sau access revoke. Invalidation trên logout/revoke/role/status/factor change chống stale in-flight result.
- Error normalization phân biệt 401 terminal, 403 permission/MFA/clinical grant, 409 conflict/idempotency/version, 422 eligibility/validation, 429 rate-limit, 503 dependency; đừng đổi lỗi nghiệp vụ thành “empty list”.

## 8. Ranh giới ngoài phạm vi

Không đưa vào các task bắt buộc: Redis cache nghiệp vụ, RabbitMQ/Kafka, dịch vụ mới, SSO Google/Apple, PDF, QR check-in, push/email/SMS, preference notification, invite nhân sự trực tiếp, audit analytics dashboard. Chỉ thêm sau quyết định riêng. Contract cache mô tả cache RAM identity backend, không đòi frontend chọn công nghệ cache.

## 9. Form bàn giao bắt buộc của mỗi task

```text
Member / task ID:
Branch / worktree:
Base SHA -> final SHA:
Owned paths:
Provider/consumer dependencies:
Contract sections / operation IDs:
Schema migration and rollback:
Tests run (command, exit, pass/fail/skip):
Mock vs PostgreSQL/HTTP/live evidence:
Open contract decisions / known gaps:
Security/permission review:
Git status clean? Local commit only? Push/merge: no
```

Chỉ đánh dấu `IMPLEMENTED` khi code/contract/schema cùng tồn tại; `REVIEWED` sau review; `MERGED` sau tích hợp; `ACCEPTED` sau đúng DB/HTTP/smoke evidence. Mỗi trạng thái phải ghi SHA. Skip/blocker giữ trạng thái chưa nghiệm thu.

## 10. Bắt đầu nhanh cho agent tiếp theo

1. Từ checkout backend-openapi, xác nhận branch/base/status; không tạo lại nhánh đang tồn tại hoặc sửa nhánh UI.
2. Đọc task này cùng `AGENTS.md`, `.agents/rules.md`, `docs/api-contract.md`, `docs/system-design.md`, `docs/logging-contract.md`, service README/contract tương ứng và API v2 source ở FE branch SHA đã nêu.
3. Kiểm tra worktree/branch hiện hữu và `git log`/`merge-base`; không cho rằng remote đã cập nhật nếu chưa fetch/check theo quy tắc team.
4. Bắt đầu compatibility matrix + User session schema/state design; tạo branch/worktree cách ly phù hợp. Chỉ chạy task domains song song sau khi write scopes/contract dependencies đã được công bố.
5. Báo người điều phối blockers và bằng chứng. Không in secret hoặc dữ liệu từ DB cá nhân.
