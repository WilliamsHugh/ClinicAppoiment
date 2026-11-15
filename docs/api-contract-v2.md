# API Contract v2 — Hợp đồng đích và kế hoạch tương thích

**Ngày cập nhật:** 14/11/2026.

**Phần nghiệp vụ đã chốt:** chính sách phiên và bảo mật của cả bốn role: PATIENT; DOCTOR với TOTP lâm sàng; STAFF/ADMIN với MFA đầu phiên, giới hạn ca làm việc và xác minh thao tác nhạy cảm. Các API bổ sung từ audit được đặc tả như thiết kế đích; tính năng mở rộng và tham số chưa chốt được ghi riêng.

**Trạng thái triển khai:** yêu cầu thiết kế, chưa triển khai và chưa nghiệm thu.

## 1. Phạm vi và quan hệ với contract hiện tại

Tài liệu hợp nhất yêu cầu đã chốt, danh mục nghiệp vụ v1 và các khoảng trống trong audit thành hợp đồng đích. Số phiên bản tài liệu `v2` không tự đổi prefix HTTP thành `/api/v2`; các route ở đây vẫn dùng `/api/v1`.

Nguồn đối chiếu: [contract v1](api-contract.md) và frontend tại `b1d3113bd595be6a46071ec20f3d086e369a8e5e`; backend/OpenAPI tại `dad4f96aa8d2524c6ce31bee12e6421a5ba44946`; [báo cáo audit](project-audit-report.md). Snapshot backend bổ sung cache/logging/test vào v1 nhưng chưa giải quyết mọi mâu thuẫn domain. Trong thiết kế đích, nội dung v2 thay thế những mục v1 được nêu rõ là khác; chưa tuyên bố runtime đã áp dụng v2.

| Nhãn | Ý nghĩa |
|---|---|
| `CÓ` | Route tồn tại trong backend snapshot; vẫn cần thay đổi nếu payload/quyền v2 khác |
| `MỚI` | Route hoặc hành vi được bổ sung để giải quyết gap; chưa triển khai trong snapshot |
| `THAY_ĐỔI` | Có route nhưng v2 thay đổi schema/quyền/hành vi; cần migration consumer |
| `TÙY_CHỌN` | Backlog chưa bật trong phạm vi bắt buộc; không được dựng UI hứa tính năng hoạt động |
| `CHỜ_CHỐT` | Còn quyết định nghiệp vụ/giá trị cấu hình; chưa đủ điều kiện nghiệm thu phần phụ thuộc |

Mục 3–8 quy định chính sách phiên/workflow; mục 9–16 quy định quy ước, API public/internal, schema và nghiệm thu. Chi tiết triển khai cache nằm ở [backend-cache-design.md](backend-cache-design.md); contract chỉ giữ yêu cầu về hiệu lực dữ liệu/quyền và lỗi quan sát được.

| Role | Chính sách phiên trong v2 |
|---|---|
| `PATIENT` | Đã chốt: hết hạn sau 30 ngày liên tiếp không sử dụng ứng dụng; hoạt động thường xuyên được tiếp tục giữ phiên |
| `DOCTOR` | Đã chốt: hết phiên sau 15 ngày không hoạt động; TOTP 6 số để mở quyền đọc theo ca khám và xác minh mới để chốt bệnh án/đơn thuốc |
| `STAFF` | Đã chốt: mật khẩu + TOTP 6 số đầu phiên; tối đa 8 giờ; khóa sau 15 phút không thao tác; xác minh mới cho thao tác nhạy cảm được phép |
| `ADMIN` | Đã chốt: dùng chung chính sách bảo mật với STAFF, quyền nghiệp vụ riêng |

STAFF/ADMIN dùng chung cơ chế bảo mật, không đồng nghĩa được cấp cùng quyền nghiệp vụ. Hai role này không kế thừa phiên dài ngày của PATIENT/DOCTOR.

## 2. Kiến trúc xác thực chung

Luồng bắt buộc: `Client -> API Gateway -> User Service -> database do User Service sở hữu / Supabase Auth`.

| Thành phần | Trách nhiệm |
|---|---|
| Client | Lưu thông tin phiên an toàn, gửi token, thay token sau refresh và báo hoạt động sử dụng thực tế |
| API Gateway | Kiểm tra mọi request được bảo vệ, cache kết quả xác minh, áp dụng hạn phiên được User Service trả về và chuyển danh tính đáng tin cậy đến service |
| User Service | Sở hữu chính sách và trạng thái phiên bền vững; xử lý login, refresh, logout, xác minh và cập nhật hoạt động; là nơi duy nhất dùng Supabase Auth |
| Service nghiệp vụ | Kiểm tra role và phạm vi tài nguyên trên mỗi request được chuyển tới |

Chính sách backend không phụ thuộc client là Web hay Flutter. Cách lưu credential trên từng thiết bị phải phù hợp nền tảng; role hoặc thời hạn do client lưu không có giá trị quyết định quyền truy cập.

Gateway không truy cập database. Trạng thái phiên cần có nguồn bền vững; restart Gateway không được làm mất quyền khôi phục một phiên còn hợp lệ.

## 3. Chính sách PATIENT đã chốt

### 3.1 Ba thời hạn riêng biệt

| Thành phần | Quy tắc |
|---|---|
| Access token | Mục tiêu cấu hình 3.600 giây; client luôn dùng `expiresIn` thực tế trả về, không tự giả định token còn hạn |
| Phiên PATIENT | Hết hạn khi đủ 30 ngày liên tiếp không hoạt động: `idleTimeoutSeconds = 2592000` |
| Kết quả xác thực được tái sử dụng | Không được cho phép request vượt hạn access token, phiên hoặc quyền đang áp dụng; chi tiết TTL/cache thuộc thiết kế backend |

30 ngày được tính bằng thời lượng UTC, không theo tháng dương lịch. Thời gian backend là nguồn quyết định.

### 3.2 Hạn phiên trượt theo hoạt động

Khi login thành công, User Service tạo phiên với:

```text
lastActiveAt = serverNow
idleExpiresAt = lastActiveAt + 30 ngày
```

Mỗi lần backend chấp nhận một hoạt động sử dụng hợp lệ của phiên còn hiệu lực:

```text
lastActiveAt = max(lastActiveAt, serverNow)
idleExpiresAt = lastActiveAt + 30 ngày
```

Nếu `serverNow >= idleExpiresAt`, phiên đã hết hạn. Backend phải kiểm tra điều kiện này trước khi cập nhật hoạt động hoặc cho refresh. Phiên đã hết hạn không được hồi sinh bằng heartbeat, access token còn hạn hoặc refresh token còn dùng được ở nhà cung cấp.

PATIENT sử dụng thường xuyên có thể giữ phiên lâu hơn 30 ngày kể từ lần login ban đầu. Chưa đặt hạn tuyệt đối 30 ngày kể từ login cho PATIENT.

Phiên vẫn có thể kết thúc trước mốc không hoạt động khi người dùng logout, phiên bị thu hồi, tài khoản bị khóa/vô hiệu hóa hoặc credential không còn hợp lệ. Việc đổi role phải được xác minh lại theo chính sách role mới.

### 3.3 Hoạt động nào kéo dài phiên

| Sự kiện | Cập nhật `lastActiveAt`? |
|---|---|
| Login thành công | Có, khởi tạo mốc hoạt động |
| Mở/đưa ứng dụng lên foreground và chủ động sử dụng | Có, qua request báo hoạt động được xác thực |
| Thao tác xem dữ liệu, đặt/đổi/hủy lịch hoặc dùng chức năng khi ứng dụng đang foreground | Có, client báo hoạt động theo cơ chế bên dưới |
| Chỉ nhận thông báo, đồng bộ nền hoặc polling tự động | Không |
| Refresh token tự động | Không |
| Gateway đọc cache, health check hoặc retry tự động | Không |

Đề xuất kỹ thuật để triển khai quy tắc này là `POST /api/v1/auth/session/activity` (mục 5). Client gửi khi mở lại ứng dụng và sau tương tác thực tế; có thể gộp tối đa một lần/phút. Không chạy timer báo hoạt động khi người dùng không thao tác hoặc ứng dụng ở background.

Thông báo hoạt động là tín hiệu từ client đã xác thực, không phải bằng chứng chống giả mạo rằng có người đang cầm thiết bị. Backend không nhận timestamp từ client để quyết định kéo dài phiên.

### 3.4 Refresh token và khôi phục phiên

1. Client chủ động refresh trước khi access token hết hạn hoặc khi cần lấy token mới lúc mở lại ứng dụng.
2. User Service xác minh credential, trạng thái tài khoản và phiên PATIENT trước khi trả token mới.
3. Refresh thành công trả cặp access token/refresh token mới. Client thay cả cặp một cách nhất quán và gộp các yêu cầu refresh đồng thời của cùng phiên.
4. Refresh không tự cập nhật `lastActiveAt`. Khi có người dùng thật quay lại sử dụng, client gửi báo hoạt động sau khi có access token hợp lệ.
5. Không đợi refresh token hết hạn mới làm mới phiên. Refresh token bị thu hồi/không hợp lệ không thể dùng để tự cấp lại credential.

Mất mạng, timeout hoặc `503` không tự chứng minh phiên đã hết hạn. Client giữ thông tin phiên để thử lại, đồng thời không dùng access token đã hết hạn để thực hiện nghiệp vụ. Chỉ chuyển về yêu cầu login khi nhận lỗi xác thực/phiên mang tính kết thúc hoặc người dùng tự logout.

## 4. Trạng thái phiên và cache backend

User Service là nguồn có thẩm quyền cho `sessionId`, chủ phiên, thời điểm bắt đầu/hoạt động, chính sách role, các hạn, trạng thái MFA/khóa/thu hồi và lý do kết thúc. PATIENT/DOCTOR có `idleExpiresAt`; STAFF/ADMIN có `absoluteExpiresAt`, `lockAt` và trạng thái khóa theo mục 8. Client không tự chọn `userId` hoặc `sessionId` để gia hạn cho người khác.

Không ghi mật khẩu, token thô hoặc dữ liệu bệnh nhân vào log. Khi User Service restart, trạng thái phiên vẫn tồn tại trong database của service.

Kết quả xác minh nội bộ cho Gateway cần bổ sung metadata phiên đã kiểm tra:

```json
{
  "sessionId": "opaque-session-id",
  "idleExpiresAt": "2026-12-14T03:00:00.000Z"
}
```

Các trường này nằm cùng danh tính `id`, `role`, `status` đã xác minh trong `data`; không thay thế các kiểm tra hiện có.

Gateway không coi role hoặc `user.status = ACTIVE` là đủ: còn phải xét trạng thái phiên `PENDING_MFA`, `ACTIVE`, `LOCKED`, `EXPIRED` hoặc `REVOKED`. Request nghiệp vụ không được vượt hạn access token/phiên/quyền; refresh và số lượng request không tự bỏ khóa hoặc gia hạn phiên.

Khi không xác minh được và không có kết quả còn hiệu lực, API trả lỗi tạm thời; không tự cấp quyền hoặc yêu cầu client xóa phiên vì outage. Logout/thu hồi/khóa tài khoản đã được xác nhận áp dụng phải ngăn request mới dùng quyền cũ, kể cả token vẫn hợp lệ về chữ ký. Invalidation nhiều Gateway là điều kiện kỹ thuật cần chứng minh trước nghiệm thu.

Kiểu cache, TTL, key, eviction, gộp xác minh và cách truyền invalidation được mô tả riêng trong [thiết kế cache backend](backend-cache-design.md), không phải trường request/response của frontend.

## 5. Hợp đồng HTTP dự thảo cho phiên PATIENT

Các route mới và metadata dưới đây là thiết kế cần triển khai, không phải mô tả các endpoint đã có đầy đủ hôm nay. Response dùng envelope/error/requestId của contract hiện hành.

| Method | Route | Credential và hành vi PATIENT |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Body login hiện hành; login thành công khởi tạo phiên và mốc hoạt động |
| `POST` | `/api/v1/auth/refresh` | Body `{ "refreshToken": "..." }`; không yêu cầu access token còn hạn, nhưng refresh token và phiên ứng dụng phải hợp lệ |
| `POST` | `/api/v1/auth/session/activity` | **Route mới đề xuất**; Bearer bắt buộc, body `{}`; User Service lấy phiên từ credential đã xác minh, kiểm tra chưa hết hạn rồi cập nhật hoạt động |
| `POST` | `/api/v1/auth/logout` | Kết thúc phiên; client xóa credential cục bộ theo ý định logout kể cả khi lỗi mạng; chỉ báo thu hồi phía server thành công sau khi server xác nhận |

Logout và thu hồi thiết bị theo hợp đồng đích mục 10.1: mặc định phiên hiện tại, scope all phải được yêu cầu rõ. Server chỉ xác nhận thu hồi thành công sau khi quyền liên quan đã mất hiệu lực.

### 5.1 Metadata trả về

Login/refresh PATIENT giữ các trường `accessToken`, `refreshToken`, `expiresIn`, `user` hiện có và bổ sung `session`:

```json
{
  "sessionId": "opaque-session-id",
  "state": "ACTIVE",
  "lastActiveAt": "2026-11-14T03:00:00.000Z",
  "idleExpiresAt": "2026-12-14T03:00:00.000Z",
  "idleTimeoutSeconds": 2592000
}
```

`data.session` có cấu trúc trên; hoạt động thành công trả `200` với `data` là metadata phiên mới. Refresh trả các mốc đang lưu, không tự đẩy chúng tới thời điểm refresh. DOCTOR dùng cùng cấu trúc với `idleTimeoutSeconds = 1296000` và `idleExpiresAt` sau 15 ngày; STAFF/ADMIN dùng metadata phân biệt hết phiên với khóa tạm thời ở mục 8.5.

### 5.2 Mã lỗi cần thống nhất khi triển khai

| HTTP | Code | Hành vi client |
|---|---|---|
| `401` | `AUTH_TOKEN_INVALID` | Access token sai/hết hạn; có thể thử refresh một lần nếu còn refresh token |
| `401` | `AUTH_REFRESH_INVALID` | Refresh token không dùng được; yêu cầu login |
| `401` | `AUTH_SESSION_IDLE_EXPIRED` | Đã hết hạn không hoạt động theo role: PATIENT 30 ngày, DOCTOR 15 ngày; xóa phiên cục bộ và yêu cầu login |
| `401` | `AUTH_SESSION_REVOKED` | Phiên bị thu hồi; xóa phiên cục bộ và yêu cầu login |
| `403` | `ACCOUNT_LOCKED` / `ACCOUNT_INACTIVE` | Chặn nghiệp vụ, thông báo trạng thái tài khoản; không lặp refresh |
| `503` | `AUTH_SERVICE_UNAVAILABLE` | Giữ thông tin phiên, thông báo tạm thời và cho thử lại |

Gateway không đổi các lỗi kết thúc phiên từ User Service thành `503` chung. Cache phải chặn request kể cả access token còn hạn nếu phiên đã hết hạn không hoạt động theo metadata được xác minh.

## 6. Ví dụ hành vi và tiêu chí nghiệm thu

| Tình huống | Kết quả bắt buộc |
|---|---|
| Login ngày 1, sử dụng tiếp ngày 20 | Mốc không hoạt động chuyển sang 30 ngày sau hoạt động ngày 20 |
| Sử dụng hằng ngày quá 30 ngày kể từ login | Tiếp tục phiên nếu credential hợp lệ, tài khoản active và không bị thu hồi |
| Không hoạt động đủ 30 ngày | Cả refresh và request được bảo vệ bị từ chối; báo hoạt động muộn không hồi sinh phiên |
| Chỉ polling/refresh/nhận notification nền trong 30 ngày | Vẫn hết hạn vì không có hoạt động sử dụng |
| Access token hết hạn khi vẫn dùng app | Tự refresh, thay cặp token và tiếp tục; không bắt nhập lại mật khẩu chỉ vì token ngắn hạn hết hạn |
| Access token còn hạn nhưng phiên vừa hết hạn không hoạt động | Gateway chặn theo hạn phiên, không chờ JWT hết hạn |
| Refresh gặp timeout/503 | Không tự xóa phiên và không giả vờ refresh thành công |
| Người dùng logout | Xóa thông tin phiên cục bộ; khi server xác nhận thì phiên/credential liên quan không tiếp tục dùng được qua Gateway |
| Restart Gateway hoặc User Service | Phiên còn hợp lệ được khôi phục/xác minh từ nguồn bền vững |
| Đổi PATIENT sang role khác | Không tiếp tục tự áp dụng chính sách 30 ngày của PATIENT |

Trước nghiệm thu cần kiểm chứng các biên `serverNow == idleExpiresAt`, refresh đồng thời, token xoay vòng, thu hồi và việc cache không kéo dài hạn phiên. Những tình huống trong bảng là tiêu chí cần kiểm thử, chưa phải kết quả test đã chạy.

## 7. Chính sách DOCTOR đã chốt

### 7.1 Phiên đăng nhập 15 ngày không hoạt động

DOCTOR dùng cùng cơ chế access token ngắn hạn, refresh token xoay vòng và cập nhật hoạt động như PATIENT, với `idleTimeoutSeconds = 1296000` (15 ngày liên tiếp). Không cố định refresh token sống 15 ngày và không tự logout vào ngày thứ 15 nếu bác sĩ vẫn hoạt động thường xuyên.

Áp dụng cùng quy tắc kiểm tra hết hạn trước khi gia hạn, thời gian server, không gia hạn vì refresh/polling nền và không xóa credential chỉ vì timeout/503. `POST /api/v1/auth/session/activity` dùng chung, áp dụng timeout theo role do User Service xác minh.

Phiên đăng nhập còn hạn không tự mở dữ liệu lâm sàng. Đăng nhập/khôi phục phiên chỉ cho phép vào hệ thống và xem thông tin điều hướng tối thiểu theo quyền; xem chi tiết ca khám, bệnh án và đơn thuốc của bệnh nhân cần quyền đọc đã xác minh bổ sung.

### 7.2 TOTP 6 số bắt buộc

Phương thức đã chốt là TOTP qua ứng dụng Authenticator. Bác sĩ nhập mã 6 số trong hộp thoại của ứng dụng; User Service xác minh bằng Supabase Auth. Client chỉ gọi API Gateway, không nhận cấu hình hoặc gọi Supabase trực tiếp.

Thiết lập lần đầu:

1. Bác sĩ có phiên hợp lệ vào luồng thiết lập TOTP; chưa được truy cập dữ liệu lâm sàng nếu chưa thiết lập xong.
2. User Service enroll factor và trả dữ liệu QR/secret cho đúng chủ phiên trong luồng thiết lập.
3. Bác sĩ quét QR bằng ứng dụng Authenticator, nhập mã để xác nhận factor hoạt động.
4. Chỉ factor được backend xác nhận thành công mới được dùng mở quyền lâm sàng. Bắt đầu enroll hoặc chỉ hiển thị QR không được coi là hoàn tất MFA.

QR/secret chỉ phục vụ enrollment; không lưu vào log, analytics hoặc cache dùng chung. Khi xác minh làm thay đổi cặp token, client phải lưu cặp mới nhất nhất quán. Backend không tin cờ `mfaVerified` do client tự gửi hoặc chỉ dựa vào việc JWT đã từng đạt `aal2` để cấp quyền cho một thao tác mới.

### 7.3 Xác minh để mở ca khám và lịch sử bệnh án

1. Bác sĩ chọn ca khám/bệnh nhân. Backend kiểm tra tài khoản, phiên, doctor profile còn hoạt động và ca khám thực sự được phân công cho bác sĩ.
2. Giao diện hiển thị rõ bệnh nhân/ca khám cần mở và yêu cầu TOTP.
3. User Service xác minh challenge mới có mục đích `OPEN_CLINICAL_RECORDS`.
4. Medical Record Service kiểm tra quan hệ điều trị và bằng chứng xác minh, rồi cấp quyền đọc giới hạn cho đúng `sessionId`, `doctorId`, `patientId`, `appointmentId`.
5. Bác sĩ được đọc toàn bộ lịch sử bệnh án đã chốt `FINAL`, quá trình điều trị và đơn thuốc của bệnh nhân có trong hệ thống, kể cả hồ sơ do bác sĩ khác lập. Không cần chuyển quyền sở hữu hồ sơ giữa các bác sĩ.

Trong ca đang mở và quyền đọc còn hiệu lực, không yêu cầu TOTP cho từng lần chuyển tab hoặc đọc từng bệnh án. Mỗi request vẫn phải kiểm tra phạm vi quyền; quyền của bệnh nhân A không mở hồ sơ bệnh nhân B. Quyền đọc bệnh án cũ không cho phép sửa bệnh án do bác sĩ khác lập.

Quyền đọc theo ca kết thúc khi ca hoàn tất, đổi bác sĩ phụ trách, tài khoản/phiên bị thu hồi hoặc quyền đọc hết hạn. Tái khám, ca mới hoặc bác sĩ mới cần thực hiện lại quy trình. Login/refresh không tự khôi phục quyền lâm sàng đã hết hạn.

Trạng thái lịch hẹn cho phép bắt đầu mở quyền và thời gian khóa khi không thao tác là thông số còn chờ chốt ở mục 17; không mặc định rằng mọi lịch vừa tạo `PENDING` đều cho phép mở toàn bộ lịch sử.

### 7.4 Xác minh mới khi chốt bệnh án và đơn thuốc

1. Bác sĩ hoàn thiện bản nháp và xem lại bệnh án, đơn thuốc trong màn hình xác nhận.
2. Backend tạo challenge mới, mục đích `FINALIZE_MEDICAL_RECORD`, gắn với bác sĩ, phiên, ca khám, bệnh án và phiên bản/nội dung sẽ chốt.
3. Bác sĩ nhập TOTP mới. Xác minh mở quyền đọc trước đó không thay thế bước này; không chấp nhận dùng lại một mã TOTP đã được tiêu thụ thành công cho thao tác khác.
4. Medical Record Service kiểm tra quyền phụ trách, trạng thái ca và bằng chứng xác minh trước khi lưu bệnh án cùng đơn thuốc thành `FINAL`.

Bằng chứng cho phép chốt có hạn ngắn và chỉ dùng một lần. Thay đổi nội dung bệnh án hoặc đơn thuốc sau xác nhận phải hủy bằng chứng cũ và yêu cầu xác minh lại. Không được dùng bằng chứng của bệnh án này để chốt bệnh án khác.

Việc kiểm tra/tiêu thụ quyền chốt phải chống race/replay và gắn với transaction ghi `FINAL`, audit và outbox trong Medical Record Service. Nếu retry cùng thao tác sau timeout, backend phải trả kết quả đã commit hoặc lỗi trạng thái rõ ràng; không chốt/gửi thông báo lần nữa và không buộc xác minh lại chỉ để đọc kết quả đã commit. Cơ chế idempotency cụ thể phải được bổ sung vào OpenAPI trước triển khai.

Quyền chốt được kiểm tra tại thời điểm commit `FINAL`. Outbox retry để đồng bộ appointment/notification chạy bằng danh tính service, không hỏi bác sĩ nhập TOTP cho từng lần retry. UI chỉ khẳng định ca đã `COMPLETED` khi đã xác nhận trạng thái đó; nếu mới chốt bệnh án thì hiển thị đang đồng bộ.

### 7.5 Đọc lại bệnh án sau ca khám và lưu trữ

Bác sĩ cần có khả năng tra cứu lại bệnh án/đơn thuốc do chính mình phụ trách để theo dõi điều trị hoặc xử lý biến chứng. Tra cứu lại yêu cầu xác minh bổ sung, kiểm tra quyền và ghi audit; không tự mở toàn bộ các lần khám mới của bệnh nhân với bác sĩ khác.

Lịch sử khám của bác sĩ mặc định hiển thị ít nhất 6 tháng gần nhất; có thể tra cứu hồ sơ cũ hơn nếu còn quyền. Đây là truy vấn tới hồ sơ gốc, không tạo bản sao bệnh án riêng cho tài khoản bác sĩ.

Khoảng quyền đọc dài hạn 1–2 năm đã được trao đổi nhưng chưa chốt con số cuối cùng. Thời hạn truy cập của bác sĩ, phạm vi khi bệnh nhân chuyển cơ sở và quy trình xin lại quyền cần thống nhất riêng. Thời hạn lưu trữ bệnh án trong database tuân theo chính sách lưu trữ y tế, không tự xóa sau 6 tháng hoặc 1–2 năm. Bệnh án `FINAL` tiếp tục được bảo toàn, không sửa trực tiếp qua quyền đọc lại.

### 7.6 Phân công trách nhiệm trong backend

| Thành phần | Trách nhiệm đối với DOCTOR |
|---|---|
| User Service | Phiên 15 ngày, enrollment/challenge/verify TOTP, factor thuộc đúng user và bằng chứng xác minh có mục đích/phạm vi/thời hạn |
| API Gateway | Xác thực request, áp dụng hạn phiên/cache, chuyển tiếp request MFA; không cấp quyền lâm sàng chỉ từ role hoặc cache identity |
| Doctor/Appointment Service | Cung cấp trạng thái bác sĩ và quan hệ phân công ca khám qua API nội bộ được xác thực |
| Medical Record Service | Sở hữu quyền đọc lâm sàng, kiểm tra phạm vi trên từng request, tiêu thụ quyền chốt, bảo toàn `FINAL` và audit đọc/chốt |

Audit gồm ai mở hồ sơ nào, ca khám, thời điểm, mục đích xác minh và kết quả; không ghi mã TOTP, token/secret hoặc nội dung bệnh án vào log. Quyền đọc/chốt có trạng thái bền vững hoặc cơ chế kiểm chứng tương đương; mất cache RAM không được biến thành cấp quyền mặc định.

### 7.7 Bổ sung HTTP dự thảo cho DOCTOR

Các tên route/payload dưới đây là đề xuất kỹ thuật để triển khai tính năng đã chốt; chưa tuyên bố đã có trong code. Các thao tác client đều đi qua Gateway. OpenAPI phải mô tả response/error schema đầy đủ trước khi triển khai frontend theo các route này.

| Method | Route | Mục đích và dữ liệu chính |
|---|---|---|
| `POST` | `/api/v1/auth/mfa/totp/enroll` | Phiên hợp lệ; tạo factor enrollment và trả QR/secret cho chủ phiên |
| `POST` | `/api/v1/auth/mfa/challenges` | Tạo challenge theo factor thuộc user; mục đích `ENROLL_TOTP`, `OPEN_CLINICAL_RECORDS` hoặc `FINALIZE_MEDICAL_RECORD`; context ca/bệnh nhân/bệnh án theo mục đích |
| `POST` | `/api/v1/auth/mfa/verify` | Nhận challenge và mã TOTP dạng chuỗi 6 số để giữ số 0 đầu; trả kết quả enrollment hoặc bằng chứng xác minh giới hạn mục đích/phạm vi, cùng token mới nếu provider phát hành |
| `POST` | `/api/v1/medical-records/access-grants` | Nhận bằng chứng mở hồ sơ và ca khám; Medical Record Service kiểm tra lại quan hệ rồi trả quyền đọc có hạn |
| `GET` | `/api/v1/medical-records` và `/{recordId}` | Bổ sung kiểm tra quyền đọc lâm sàng theo ca hoặc quyền đọc lại hồ sơ của chính bác sĩ |
| `POST/PATCH` | `/api/v1/medical-records` và `/{recordId}` | Với thao tác ghi `FINAL`, bắt buộc bằng chứng chốt dùng một lần; bản nháp không thay thế xác nhận chốt |

Backend phải xác minh bằng chứng được phát hành hợp lệ, còn hạn và khớp context; client không thể tự khai báo `verified: true`. Hợp đồng đích dùng `X-Clinical-Grant` cho quyền đọc, `verificationProofId` trong body cho thao tác chốt (mục 9/13) và API kiểm chứng nội bộ ở mục 15.3; không tự tạo header danh tính để vượt kiểm tra quyền.

| HTTP | Mã lỗi đề xuất | Hành vi client |
|---|---|---|
| `403` | `MFA_ENROLLMENT_REQUIRED` | Dẫn vào thiết lập TOTP trước truy cập lâm sàng |
| `403` | `CLINICAL_VERIFICATION_REQUIRED` | Mở hộp thoại TOTP cho đúng mục đích/ca khám |
| `403` | `MFA_CODE_INVALID` | Giữ dữ liệu và context, cho nhập lại trong giới hạn số lần thử |
| `403` | `MFA_CHALLENGE_EXPIRED` | Tạo challenge mới và yêu cầu mã còn hiệu lực |
| `403` | `CLINICAL_ACCESS_DENIED` | Chặn vì không có quan hệ/phạm vi hợp lệ; không tự thử MFA để vượt phân quyền |
| `409` | `FINALIZATION_CONTEXT_CHANGED` | Tải/đối chiếu bản nháp mới nhất, xem lại nội dung và xác minh mới |
| `429` | `MFA_RATE_LIMITED` | Thông báo giới hạn và thời gian được thử lại |
| `503` | `AUTH_SERVICE_UNAVAILABLE` | Giữ phiên và bản nháp; không mở quyền/chốt khi chưa xác minh được |

### 7.8 Tiêu chí nghiệm thu DOCTOR

| Tình huống | Kết quả bắt buộc |
|---|---|
| DOCTOR dùng thường xuyên quá 15 ngày kể từ login | Tiếp tục giữ phiên nếu hợp lệ; vẫn xác minh riêng quyền lâm sàng |
| Không hoạt động đủ 15 ngày dù còn refresh token | Backend từ chối refresh/khôi phục; yêu cầu login |
| Khôi phục token có `aal2` cũ nhưng chưa mở ca mới | Chưa được đọc hồ sơ ca mới |
| Factor của tài khoản khác, mã sai/hết hạn hoặc bỏ qua bước verify | Không được cấp quyền; giới hạn thử và audit |
| Mở ca của bệnh nhân A thành công, sửa ID sang B | Backend từ chối |
| Đọc nhiều bệnh án `FINAL` trong cùng ca/quyền còn hiệu lực | Không yêu cầu TOTP cho từng hồ sơ |
| Bác sĩ B được phân công ca mới và xác minh thành công | Đọc được lịch sử `FINAL` do bác sĩ A lập; không được sửa hồ sơ của A |
| Đã xác minh đọc nhưng gửi `FINAL` thiếu xác minh mới | Backend từ chối chốt |
| Đổi đơn thuốc/nội dung sau xác nhận hoặc replay quyền chốt | Backend từ chối dùng lại bằng chứng cũ; retry idempotent đã commit trả kết quả cũ |
| Ca hoàn tất, chuyển bác sĩ hoặc thu hồi phiên | Quyền đọc theo ca mất hiệu lực; quyền đọc lại hồ sơ do mình phụ trách xét riêng |
| TOTP sai hoặc API timeout/503 khi đang soạn | Giữ bản nháp, không xóa phiên vì lỗi tạm thời, không báo chốt thành công giả |

Mất thiết bị Authenticator phải có quy trình khôi phục danh tính và audit; không cho bỏ qua MFA chỉ để mở bệnh án. Thời hạn challenge, giới hạn thử, khóa quyền đọc khi không thao tác và quy trình recovery là điều kiện cần hoàn thiện trước nghiệm thu.

## 8. Chính sách bảo mật chung STAFF và ADMIN đã chốt

### 8.1 Thời hạn phiên và các lần xác minh

| Nội dung | Quy tắc áp dụng cho cả STAFF và ADMIN |
|---|---|
| Bắt đầu phiên mới | Bắt buộc mật khẩu + TOTP 6 số qua ứng dụng Authenticator |
| Hạn tuyệt đối | `absoluteTimeoutSeconds = 28800` (8 giờ) kể từ lần xác thực mật khẩu mở phiên |
| Không thao tác | `idleLockTimeoutSeconds = 900` (15 phút); khóa quyền sử dụng, không tự xóa phiên |
| Mở khóa trong hạn 8 giờ | Bắt buộc challenge TOTP mới; sau thành công được tiếp tục phần thời gian còn lại |
| Hết 8 giờ | Kết thúc phiên; yêu cầu mật khẩu + TOTP để tạo phiên mới |
| Refresh | Xoay vòng token trong phiên còn hợp lệ; không gia hạn mốc 8 giờ, không tự mở khóa hoặc tính là hoạt động |
| Thao tác nhạy cảm | Yêu cầu TOTP mới, gắn với đúng thao tác, đối tượng và nội dung xác nhận |
| Lỗi mạng/503 | Giữ thông tin phiên và dữ liệu nhập; không thực hiện nghiệp vụ khi chưa đủ điều kiện xác minh |

Hai mốc 8 giờ và 15 phút là yêu cầu backend, không chỉ là timer/ẩn giao diện phía client. Chuyển trang, F5, đóng/mở lại ứng dụng hoặc lấy token mới không tạo một ca làm việc 8 giờ mới. Không dựa vào sự kiện đóng tab/trình duyệt để quyết định phiên đã kết thúc.

### 8.2 Trạng thái phiên và quy tắc hoạt động

```text
Mật khẩu hợp lệ -> PENDING_MFA -> TOTP hợp lệ -> ACTIVE
ACTIVE -> không thao tác đủ 15 phút -> LOCKED
LOCKED -> TOTP mới hợp lệ, chưa hết 8 giờ -> ACTIVE
PENDING_MFA / ACTIVE / LOCKED -> đủ 8 giờ -> EXPIRED
Mọi trạng thái chưa kết thúc -> logout hoặc thu hồi -> REVOKED
```

Khi mật khẩu được xác minh thành công, User Service ghi `startedAt` bằng thời gian server và tính `absoluteExpiresAt = startedAt + 8 giờ`. Thời điểm này cố định trong vòng đời phiên. Hoàn tất MFA, refresh, mở khóa hoặc xác minh thao tác nhạy cảm không được đặt lại `startedAt`.

Phiên `PENDING_MFA` chỉ được dùng các API điều khiển xác thực cần thiết: đăng ký/xác minh factor, xem trạng thái phiên và logout. Credential được nhà cung cấp phát hành ở bước mật khẩu chưa có quyền gọi API nghiệp vụ, kể cả tài khoản có role ADMIN. Nếu chưa có factor đã xác nhận, cần hoàn tất thiết lập TOTP trước khi vào nghiệp vụ.

Khi MFA đầu phiên hoặc mở khóa thành công, đặt `lastActiveAt = serverNow`, `lockAt = lastActiveAt + 15 phút` và chuyển sang `ACTIVE`. Các hoạt động sử dụng hợp lệ trong foreground tiếp tục cập nhật `lastActiveAt`/`lockAt`, nhưng không thay đổi `absoluteExpiresAt`. Refresh, notification, polling, health check và retry tự động không tính là hoạt động.

Trước mỗi lần cập nhật hoạt động hoặc cho phép nghiệp vụ, kiểm tra theo thứ tự:

1. Nếu phiên bị thu hồi hoặc tài khoản không còn đủ quyền, chặn truy cập theo lỗi tương ứng.
2. Nếu `serverNow >= absoluteExpiresAt`, kết thúc phiên và yêu cầu login đầy đủ, kể cả vừa nhập TOTP thành công.
3. Nếu phiên còn trong hạn tuyệt đối nhưng `serverNow >= lockAt`, chuyển sang `LOCKED`; báo hoạt động đến muộn không tự mở khóa.
4. Chỉ phiên `ACTIVE` còn trong cả hai hạn mới được cập nhật hoạt động và thực hiện nghiệp vụ.

Khi `LOCKED`, chỉ cho phép API điều khiển phiên để refresh credential phục vụ xác thực, tạo/verify challenge mở khóa, xem trạng thái và logout. Refresh được phép nếu credential/phiên còn hợp lệ, nhưng response vẫn phải giữ trạng thái `LOCKED`; token mới không mở lại API nghiệp vụ. Client giữ trạng thái khóa trên mọi tab; tab cũ không được tiếp tục thao tác bằng token còn hạn.

Khi khóa, giao diện che nội dung nghiệp vụ và hiển thị bước mở khóa; không tiếp tục để bảng/thông tin tài khoản đang mở cho người khác xem. Giữ dữ liệu nhập chưa gửi trong phạm vi phiên để có thể tiếp tục sau mở khóa, nhưng không tự gửi thao tác đang chờ. Giao diện khóa phải đi kèm kiểm soát API phía backend.

### 8.3 Xác minh thao tác nhạy cảm

Các thao tác sau cần TOTP mới nếu actor có quyền nghiệp vụ tương ứng:

- Đổi role hoặc quyền truy cập.
- Khóa/mở khóa tài khoản khác.
- Thay đổi factor MFA hoặc cấu hình bảo mật.

Backend tạo challenge cho mục đích `AUTHORIZE_SENSITIVE_OPERATION`, gắn với phiên, actor, thao tác, đối tượng và phiên bản/nội dung thay đổi. UI phải hiển thị rõ thay đổi cần xác nhận trước khi nhập mã. Không tái sử dụng xác minh đầu phiên hoặc mở khóa để thực hiện thao tác nhạy cảm.

Bằng chứng xác nhận có hạn ngắn, chỉ dùng một lần và phải khớp dữ liệu thực thi. Thay đổi nội dung cần xác nhận lại; service sở hữu nghiệp vụ kiểm tra quyền và tiêu thụ bằng chứng cùng transaction nghiệp vụ, hỗ trợ retry idempotent sau khi đã commit. Một lần MFA thành công không cấp thêm role/quyền mới cho STAFF.

Phiên bị khóa, hết hạn, thu hồi hoặc bị đổi role phải làm vô hiệu bằng chứng thao tác chưa tiêu thụ. Không chấp nhận mã TOTP đã được dùng thành công cho challenge/thao tác khác. MFA, mã sai, giới hạn thử và kết quả nghiệp vụ cần audit, không ghi mã/secret/token thô.

Mất thiết bị Authenticator phải đi qua quy trình khôi phục danh tính có audit. Quy trình khôi phục là ngoại lệ được kiểm soát riêng, không tự cho phép tắt MFA bằng một phiên chỉ biết mật khẩu.

### 8.4 Quyền nghiệp vụ vẫn tách theo role

| Phạm vi | STAFF | ADMIN |
|---|---|---|
| Vận hành lịch hẹn: tạo hộ, xác nhận, hủy, check-in, no-show | Theo quyền và phạm vi phòng khám | Theo quyền quản trị được quy định |
| Quản lý tài khoản, role, trạng thái người dùng | Không tự được cấp | Có theo endpoint/quyền quản trị, kèm xác minh nhạy cảm |
| Quản lý danh mục/lịch làm việc và health | Theo quyền được cấp; không mặc định có health quản trị | Theo quyền quản trị hiện hành |
| Đọc chẩn đoán, nội dung bệnh án hoặc đơn thuốc | Không có quyền mặc định | Không có quyền mặc định |
| Tạo/sửa/chốt nội dung lâm sàng thay DOCTOR | Không | Không |

Những trường thông tin bệnh nhân cần cho tiếp đón được giới hạn theo tác vụ, không đồng nghĩa quyền đọc toàn bộ hồ sơ lâm sàng. Phần v2 này chốt STAFF/ADMIN không mặc nhiên có quyền lâm sàng; mô tả ADMIN đọc theo quyền kiểm toán trong v1 không tự tạo một quyền đã được cấp. Nếu triển khai quyền kiểm toán sau này, phải có contract riêng về điều kiện cấp, phạm vi và audit.

Các thao tác thường ngày như xem lịch, xác nhận hẹn và check-in sử dụng phiên ACTIVE đã MFA; không yêu cầu TOTP cho từng bệnh nhân. Vẫn giữ kiểm tra quyền backend và bước xác nhận hành động theo UI contract.

### 8.5 Metadata phiên và HTTP dự thảo

Giữ cấu trúc credential hiện có; `data.session` của STAFF/ADMIN bổ sung tối thiểu:

```json
{
  "sessionId": "opaque-session-id",
  "state": "ACTIVE",
  "startedAt": "2026-11-14T01:00:00.000Z",
  "absoluteExpiresAt": "2026-11-14T09:00:00.000Z",
  "absoluteTimeoutSeconds": 28800,
  "lastActiveAt": "2026-11-14T03:00:00.000Z",
  "lockAt": "2026-11-14T03:15:00.000Z",
  "idleLockTimeoutSeconds": 900,
  "mfaVerifiedAt": "2026-11-14T01:01:00.000Z"
}
```

`state` là trạng thái phiên, tách biệt `user.status`. `lockAt`/`mfaVerifiedAt` có thể null trước khi hoàn tất MFA. STAFF/ADMIN không sử dụng `idleExpiresAt` 15/30 ngày; nếu schema chung có trường đó thì trả null và client phải xử lý theo role/policy. User Service trả các trường trạng thái/hạn tương ứng qua API xác minh nội bộ để Gateway áp dụng mục 4. Client không thể tự đặt trạng thái ACTIVE.

Các tên route/purpose sau là thiết kế cần đồng bộ OpenAPI trước triển khai, không phải endpoint đã hoạt động:

| Method | Route | Quy tắc STAFF/ADMIN |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Xác minh mật khẩu, tạo phiên PENDING_MFA và trả rõ yêu cầu MFA; chưa cấp quyền nghiệp vụ |
| `POST` | `/api/v1/auth/mfa/totp/enroll` | Thiết lập factor trong luồng được phép, xác nhận factor trước khi sử dụng |
| `POST` | `/api/v1/auth/mfa/challenges` | Dùng chung User Service; purpose `STAFF_ADMIN_LOGIN`, `UNLOCK_SESSION` hoặc `AUTHORIZE_SENSITIVE_OPERATION`, kiểm tra state/quyền phù hợp |
| `POST` | `/api/v1/auth/mfa/verify` | Xác minh mã 6 số; cập nhật state hoặc phát hành bằng chứng đúng purpose; cập nhật token mới nếu provider phát hành |
| `GET` | `/api/v1/auth/session` | Route mới đề xuất để lấy metadata trạng thái/hạn do server xác minh, dùng được trong luồng khóa/MFA |
| `POST` | `/api/v1/auth/session/activity` | Chỉ phiên ACTIVE trong cả hai hạn được cập nhật hoạt động; không tự mở khóa hoặc kéo dài 8 giờ |
| `POST` | `/api/v1/auth/refresh` | Giữ nguyên hạn tuyệt đối và trạng thái khóa/MFA; từ chối khi EXPIRED/REVOKED |
| `POST` | `/api/v1/auth/logout` | Kết thúc phiên và invalidation; cho phép trong luồng khóa/MFA nếu credential hợp lệ |

Các route xác thực phải có policy riêng cho state PENDING_MFA/LOCKED để người dùng có thể xác minh/mở khóa; đây không phải ngoại lệ cho phép dùng API nghiệp vụ. Không proxy public các endpoint `/internal/v1/*`. Allowlist theo state được quy định tại mục 10.1, không mở toàn bộ prefix `/auth`.

| HTTP | Code | Hành vi client |
|---|---|---|
| `403` | `MFA_VERIFICATION_REQUIRED` | Mở xác minh đầu phiên; chưa tải dữ liệu nghiệp vụ |
| `403` | `AUTH_SESSION_LOCKED` | Hiển thị khóa và TOTP mở khóa; không xóa phiên hoặc lặp refresh để vượt khóa |
| `401` | `AUTH_SESSION_EXPIRED` | Đã đủ 8 giờ; xóa phiên cục bộ và yêu cầu mật khẩu + TOTP |
| `403` | `SENSITIVE_VERIFICATION_REQUIRED` | Hiển thị thao tác cụ thể và yêu cầu TOTP mới |
| `401` | `AUTH_SESSION_REVOKED` | Phiên bị thu hồi; yêu cầu đăng nhập lại |

Các lỗi mã TOTP sai/challenge hết hạn/rate limit và lỗi tạm thời dùng chung quy tắc ở mục 7.7. `AUTH_SESSION_LOCKED` không được chuyển thành lỗi kết thúc phiên; `AUTH_SESSION_EXPIRED` không được xử lý như khóa chỉ cần TOTP. Nếu hết cả hai hạn cùng lúc, ưu tiên lỗi hết phiên 8 giờ. Gateway không đổi các lỗi trạng thái này thành 503 chung.

### 8.6 Tiêu chí nghiệm thu STAFF/ADMIN

| Tình huống | Kết quả bắt buộc |
|---|---|
| Mật khẩu đúng nhưng chưa MFA, tự gọi API nghiệp vụ | Backend từ chối dù token Supabase có thể đã được phát hành |
| MFA thành công đầu phiên | Truy cập đúng quyền role trong thời gian còn lại của mốc 8 giờ |
| Hoạt động liên tục vượt 8 giờ | Phiên kết thúc, yêu cầu mật khẩu + TOTP; hoạt động không kéo dài hạn tuyệt đối |
| Không thao tác đủ 15 phút dù có polling/refresh nền | Khóa quyền sử dụng; mọi tab bị kiểm soát bởi trạng thái backend |
| Mở lại ứng dụng hoặc báo hoạt động sau mốc khóa | Vẫn LOCKED, yêu cầu TOTP mới |
| Refresh khi đang khóa | Chỉ phục vụ luồng điều khiển xác thực, không mở API nghiệp vụ và không đổi hạn 8 giờ |
| TOTP mở khóa lúc chưa đủ 8 giờ | ACTIVE với hạn tuyệt đối cũ; cập nhật mốc hoạt động/khóa |
| Xác minh mở khóa đúng lúc đủ 8 giờ | Không mở khóa; yêu cầu login đầy đủ |
| Thay payload/đối tượng hoặc replay bằng chứng nhạy cảm | Backend từ chối; retry idempotent đã commit trả kết quả cũ |
| STAFF MFA thành công rồi gọi endpoint ADMIN | Vẫn bị từ chối theo role/quyền |
| STAFF/ADMIN yêu cầu bệnh án hoặc đơn thuốc bằng ID trực tiếp | Không có quyền mặc định; backend từ chối |
| Restart backend hoặc dùng cache/token cũ | Giữ được trạng thái/hạn; không cấp lại 8 giờ hay vượt trạng thái khóa/thu hồi |
| Mất mạng/503 trong xác minh | Giữ phiên và dữ liệu nhập; không giả vờ xác minh thành công |

Các trường hợp trên là tiêu chí cần kiểm thử, chưa phải kết quả chạy test. Thời hạn challenge/bằng chứng, giới hạn thử và luồng khôi phục factor vẫn cần đặc tả kỹ thuật; không thay đổi các mốc 8 giờ/15 phút đã chốt.

## 9. Quy ước giao tiếp, dữ liệu và lỗi chung

### 9.1 Địa chỉ, headers và ranh giới

Base URL local tham chiếu là `http://localhost:8080`, có thể cấu hình theo môi trường. Client chỉ biết địa chỉ Gateway. Phân phối prefix không đổi:

| Prefix | Service sở hữu |
|---|---|
| `/api/v1/auth`, `/api/v1/users`, `/api/v1/patients` | User Service |
| `/api/v1/specialties`, `/api/v1/doctors`, `/api/v1/schedules` | Doctor Service |
| `/api/v1/appointments` | Appointment Service |
| `/api/v1/medical-records` | Medical Record Service |
| `/api/v1/notifications` | Notification Service |

Request JSON gửi `Content-Type: application/json`, `Accept: application/json`, Bearer khi endpoint yêu cầu và `Idempotency-Key` khi quy định. Gateway bảo toàn method/path/query/body/status, tạo/chuyển `X-Request-Id`, xóa các header danh tính/credential nội bộ do client gửi và chỉ chuyển danh tính đã xác minh. Không expose `/internal/v1/*`. Service xác minh caller trước khi tin header Gateway.

Mọi API nghiệp vụ yêu cầu phiên ACTIVE và quyền tương ứng. Các ngoại lệ public hoặc cho phiên PENDING_MFA/LOCKED được liệt kê ở mục 10; không mở ngoại lệ theo cả prefix. Danh sách/body có field không được hỗ trợ phải trả `400 VALIDATION_ERROR`, không âm thầm bỏ tham số như `sort=desc` ở snapshot cũ.

`X-Clinical-Grant` là ID opaque của quyền đọc lâm sàng, không phải header danh tính. Khi dùng, Gateway cho phép chuyển header này nhưng service luôn xác minh actor/session/phạm vi. Request thay role/user bằng header từ client vẫn bị chặn. Không đưa grant/proof vào URL để tránh lộ qua history/log.

### 9.2 Envelope và HTTP status

Mọi response JSON thành công dùng `{ success: true, data: T, requestId: string }`. Response list dùng `data = { items: T[], page: number, limit: number, total: number }`; `total` là tổng sau lọc và phân quyền trên toàn tập, không phải số item trang hiện tại.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Tham số không hợp lệ.",
    "details": [
      { "field": "patientId", "code": "invalid_uuid", "message": "ID không hợp lệ." }
    ]
  },
  "requestId": "opaque-request-id"
}
```

`details` luôn là mảng, có thể rỗng. Không trả SQL, stack trace, credential hoặc cấu hình nội bộ. Giữ mã lỗi có ý nghĩa từ service; Gateway không biến `401/403` phiên/MFA thành lỗi kết nối `503`.

| HTTP | Ý nghĩa chuẩn |
|---|---|
| `200` | Đọc/cập nhật thành công hoặc replay idempotent đã commit |
| `201` | Tạo tài nguyên lần đầu |
| `204` | Thao tác được mô tả rõ không có body |
| `400` | Sai path/query/body/UUID, sai tham số sort hoặc định dạng ngày |
| `401` | Thiếu/sai credential, refresh/phiên hết hạn hoặc bị thu hồi |
| `403` | Thiếu quyền, yêu cầu MFA, phiên khóa hoặc tài khoản bị chặn |
| `404` | Không tồn tại hoặc tài nguyên ngoài phạm vi người yêu cầu; tránh tiết lộ ID người khác |
| `409` | Xung đột slot/trạng thái/phiên bản/idempotency hoặc xác minh đã gắn nội dung cũ |
| `422` | Request đúng cấu trúc nhưng không hợp lệ theo nghiệp vụ |
| `429` | Giới hạn thử; trả `Retry-After` khi xác định được |
| `502` | Gateway không kết nối upstream |
| `503` | Service/dependency/persistence tạm không sẵn sàng |
| `504` | Gateway chờ upstream quá hạn |
| `500` | Lỗi ứng dụng không dự kiến; không lộ stack/SQL |

Chọn `404` nhất quán cho đọc ID tài nguyên không thuộc phạm vi; thiếu quyền chức năng hoặc thiếu grant hợp lệ dùng `403`. Không dùng `503` để che lỗi input; lỗi DB do UUID sai cần được ngăn tại boundary. JSON request lỗi cú pháp cũng trả envelope `400`.

### 9.3 Phân trang, ngày giờ và kiểu dữ liệu

- `page`: số nguyên từ 1, mặc định 1; `limit`: 1–100, mặc định 20. Trang ngoài dữ liệu trả `items: []` và `total` thật. Không tự cho rằng trang đầu là toàn bộ dữ liệu.
- ID là chuỗi opaque ở client; path/query ID hiện dùng UUID phải được backend validate. `userId`, `patientId`, `doctorId` là các ID khác nhau.
- Thời điểm là ISO 8601 UTC có `Z`; thời gian lọc dùng khoảng `[from,to)`, `from < to`. Khoảng một ngày Việt Nam là 00:00 ngày đó tới 00:00 ngày kế tiếp theo `Asia/Ho_Chi_Minh`, chuyển sang UTC.
- Ngày sinh và ngày chọn slot là `YYYY-MM-DD`, không có giờ/timezone. SQL `DATE` luôn serialize thành ngày thuần, không thành timestamp.
- Thời gian ca làm việc là `HH:mm` ở múi giờ phòng khám `Asia/Ho_Chi_Minh`; `weekday`: Chủ Nhật 0 đến Thứ Bảy 6.
- Field nullable trả `null` khi chưa có; `PATCH` bỏ field nghĩa là giữ nguyên, `null` chỉ được xóa các field schema cho phép. ID liên kết, role hoặc status không được mass-assign qua profile patch.
- Dùng `phone` thống nhất, không dùng thêm `phoneNumber`. Tên role kỹ thuật giữ `PATIENT/DOCTOR/STAFF/ADMIN`; nhãn hiển thị được dịch từ một mapping UI chung.
- Response nhạy cảm về phiên/người dùng/bệnh nhân/bệnh án dùng `Cache-Control: no-store`. Chưa có contract stale fallback cho dữ liệu lâm sàng/quyền; outage không được trả dữ liệu rỗng/0 giả thành công.

### 9.4 Schema domain đích

Các tên dưới đây được dùng trong bảng endpoint. OpenAPI phải mô tả field cụ thể tương đương, không để `data: {}` hoặc response không có schema. Field đọc theo quyền phải được liệt kê bằng schema riêng, không tùy tiện thay đổi theo từng trang.

| Schema | Field và quy tắc |
|---|---|
| `UserProfile` | `id`, `email`, `fullName`, `phone: string\|null`, `role`, `status: ACTIVE/INACTIVE/LOCKED`, `createdAt`, `updatedAt`; không trả `supabaseAuthUserId` |
| `PatientProfile` | `id`, `userId`, `fullName`, `email`, `phone`, `dateOfBirth: date\|null`, `gender: MALE/FEMALE/OTHER\|null`, `address`, `emergencyContact`, `insuranceNumber` nullable, `createdAt`, `updatedAt`; BHYT chỉ trả khi actor được phép và tác vụ cần |
| `PatientSummary` | `id`, `fullName`; các field liên hệ tối thiểu chỉ thêm trong schema tiếp đón được cấp quyền; không có BHYT/địa chỉ/chẩn đoán |
| `Specialty` | `id`, `name`, `description: string\|null`, `isActive`, `createdAt`, `updatedAt` |
| `Doctor` | `id`, `userId`, `specialtyId`, `displayName`, `bio: string\|null`, `isActive`, `createdAt`, `updatedAt` |
| `DoctorSchedule` | `id`, `doctorId`, `weekday`, `startTime`, `endTime`, `slotDurationMinutes: integer 5..240`, `isActive`, `createdAt`, `updatedAt` |
| `DoctorTimeOff` | `id`, `doctorId`, `startAt`, `endAt`, `reason: string\|null`, `createdAt` |
| `Slot` | `startAt`, `endAt` UTC; là khả dụng tại thời điểm đọc, không phải giữ chỗ |
| `Appointment` | `id`, `patientId`, `doctorId`, `specialtyId: string\|null`, `scheduledStartAt`, `scheduledEndAt`, `status`, `reason: string\|null`, `createdBy`, `updatedBy: string\|null`, `createdAt`, `updatedAt` |
| `AppointmentSummary` | `id`, `patientId`, `doctorId`, `specialtyId: string\|null`, `scheduledStartAt`, `scheduledEndAt`, `status`; khi include names có các summary ở mục 12.3; không có `reason` hoặc dữ liệu lâm sàng |
| `PrescriptionItem` | `medicineName`, `dosage`, `frequency`, `duration`: chuỗi bắt buộc, không rỗng sau trim |
| `MedicalRecord` | ID ca/patient/doctor, `symptoms`, `diagnosis`, `notes`, `treatmentPlan` nullable, `prescription: PrescriptionItem[]`, `status: DRAFT/FINAL`, `createdBy`, `updatedBy: string\|null`, `createdAt`, `updatedAt`; v2 thêm `version: integer >=1` và `appointmentCompletion: NOT_REQUESTED/PENDING/COMPLETED` |
| `Notification` | `id`, `recipientUserId`, `type`, `title`, `message`, `payload` chỉ ID/điều hướng, `status: UNREAD/READ/FAILED`, `readAt: timestamp\|null`, `createdAt`; trạng thái giao nhận không dùng để suy đoán đã đọc |

Các field mô tả văn bản có giới hạn độ dài trong OpenAPI. `reason` lịch hẹn trim và tối đa 500 ký tự cho cả tạo/đổi/chuyển trạng thái. Field lâm sàng tự do nếu có giới hạn dài hơn phải trả lỗi field rõ ràng khi vượt giới hạn, không cắt nội dung điều trị im lặng; giới hạn triển khai phải được khai báo trong schema trước tích hợp. `PatientProfile` chưa có `insuranceExpiryDate`; không hiển thị ngày hết hạn tự tạo. Các field mới như `version` và `appointmentCompletion` thuộc phần cần triển khai.

## 10. Auth, MFA, tài khoản và bệnh nhân

### 10.1 Auth và quản lý phiên

| Method | Path | Quyền, request và `data` thành công | Trạng thái |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public; `{fullName,email,password}`; chỉ tạo PATIENT; `201` với session hoặc `{requiresEmailConfirmation:true}` | `CÓ`; thêm session v2 |
| `POST` | `/api/v1/auth/login` | Public; `{email,password}`; `200 AuthSession`; STAFF/ADMIN bắt đầu PENDING_MFA | `THAY_ĐỔI` |
| `POST` | `/api/v1/auth/refresh` | Không cần access token còn hạn; `{refreshToken}`; `200 AuthSession` theo state/hạn đang áp dụng | `THAY_ĐỔI` |
| `POST` | `/api/v1/auth/logout` | Credential phiên theo luồng auth; `{refreshToken,scope?:current/all}`; mặc định đích `current`, `200 data:null` sau thu hồi; scope all cần kiểm tra đúng chủ phiên | `THAY_ĐỔI`; snapshot đang logout global |
| `GET` | `/api/v1/auth/me` | Auth hợp lệ; `200 UserProfile`; route tương thích cũ, client mới ưu tiên `/users/me` | `CÓ` |
| `GET` | `/api/v1/auth/session` | Phiên hiện tại, cho PENDING_MFA/LOCKED; `200 SessionMetadata` có hạn/state, không lộ token | `MỚI` |
| `POST` | `/api/v1/auth/session/activity` | Body `{}`, phiên ACTIVE chưa hết hạn/khóa; `200 SessionMetadata` | `MỚI` |
| `GET` | `/api/v1/auth/sessions` | Chủ tài khoản, phiên ACTIVE theo policy; `200 Page<SessionSummary>` của chính mình | `MỚI` |
| `DELETE` | `/api/v1/auth/sessions/{sessionId}` | Chủ tài khoản thu hồi một phiên của mình, `200 {sessionId,revoked:true}`; không xóa bệnh án hoặc tài khoản | `MỚI` |

Logout mặc định current là thay đổi đích có chủ ý so với `signOut(global)` hiện tại. Client xóa credential cục bộ ngay khi người dùng chọn logout; nếu offline phải thông báo chưa xác nhận thu hồi server. Đăng xuất toàn bộ sử dụng scope all rõ ràng, không vô tình thu hồi mọi thiết bị khi Web từ chối role PATIENT. Hành vi scope phải đồng bộ provider trước phát hành.

`AuthSession` có `accessToken`, `refreshToken`, `expiresIn` (giây), `user: {id,role}` và `session: SessionMetadata`. Metadata dùng union theo policy: PATIENT/DOCTOR có state/hạn không hoạt động, STAFF/ADMIN theo mục 8.5. Có thể bổ sung `user.fullName` từ profile chính thức để hiển thị header ngay, nhưng không dùng role làm tên giả; schema OpenAPI phải khai báo field mở rộng rõ ràng. Login STAFF/ADMIN dù trả token cũng chỉ có phạm vi PENDING_MFA cho tới verify; không để client suy ra quyền chỉ từ HTTP 200.

`SessionMetadata` PATIENT/DOCTOR trả `sessionId`, `state`, `lastActiveAt`, `idleExpiresAt`, `idleTimeoutSeconds`; khi còn hợp lệ, state ACTIVE không đồng nghĩa có grant lâm sàng. Schema STAFF/ADMIN ở mục 8.5. Timestamp là dữ liệu server, client không tự tính lại hạn để cấp quyền offline. Trạng thái EXPIRED/REVOKED được trả bằng mã lỗi tương ứng ở các request nghiệp vụ, không đưa credential mới trong response lỗi.

`SessionSummary` chỉ có `sessionId`, `isCurrent`, `state`, `startedAt`, `lastActiveAt`, hạn áp dụng và mô tả thiết bị nếu có; không có credential/IP thô hoặc phiên người khác. Thu hồi thiết bị là thao tác bảo mật, cần xác minh mới khi policy actor yêu cầu; có thể dùng logout current khi phiên đang khóa mà không buộc mở khóa trước.

Allowlist điều khiển xác thực theo state:

| State | Operation được phép ngoài nghiệp vụ |
|---|---|
| Public / chưa có access token | POST register/login/refresh; POST password/forgot, password/recovery/exchange, password/reset với đúng credential của từng flow; health/docs theo mục 15 |
| PENDING_MFA | GET auth/session, GET auth/mfa/factors, POST auth/logout; enroll nếu chưa có factor; challenges/verify chỉ ENROLL_TOTP hoặc STAFF_ADMIN_LOGIN; refresh chỉ giữ scope hạn chế |
| LOCKED | GET auth/session, GET auth/mfa/factors, POST auth/logout; challenges/verify chỉ UNLOCK_SESSION; refresh chỉ cho luồng điều khiển |
| ACTIVE | Các operation actor có quyền, cộng luồng xác minh đúng purpose; role không tự vượt phân quyền tài nguyên |
| EXPIRED / REVOKED | Không sử dụng credential cũ để làm nghiệp vụ/mở khóa; login/recovery mới vẫn theo luồng public; refresh cũ trả lỗi kết thúc phiên |

Path viết ngắn trong bảng vẫn dùng prefix `/api/v1/`. Enroll không được thay thế factor đang verified chỉ bằng một phiên chưa vượt MFA; đổi factor hiện có cần xác minh nhạy cảm hoặc recovery được kiểm soát. Mọi challenge verify phải kiểm tra đúng state và purpose đã gắn, không chỉ dựa vào endpoint nằm trong allowlist.

### 10.2 MFA và bằng chứng xác minh

| Method | Path | Request / response đích | Trạng thái |
|---|---|---|---|
| `POST` | `/api/v1/auth/mfa/totp/enroll` | Phiên hợp lệ trong scope cho phép; `{}` -> `201 {factorId,qrCode,secret}` chỉ ở enrollment | `MỚI` |
| `GET` | `/api/v1/auth/mfa/factors` | Chủ phiên; `200 {items:[{factorId,type:"totp",status}]}`; không trả secret | `MỚI` |
| `POST` | `/api/v1/auth/mfa/challenges` | `{factorId,purpose,context}` -> `201 {challengeId,purpose,expiresAt}` | `MỚI` |
| `POST` | `/api/v1/auth/mfa/verify` | `{challengeId,code}` với code là chuỗi khớp `^[0-9]{6}$`; `200 MfaVerificationResult` | `MỚI` |

Purpose allowlist: `ENROLL_TOTP`, `OPEN_CLINICAL_RECORDS`, `FINALIZE_MEDICAL_RECORD`, `STAFF_ADMIN_LOGIN`, `UNLOCK_SESSION`, `AUTHORIZE_SENSITIVE_OPERATION`. State/role phải được phép dùng purpose; client không thể đổi purpose của challenge sau phát hành. Context lâm sàng gồm ca/bệnh nhân và bệnh án/phiên bản/nội dung khi chốt; context nghiệp vụ nhạy cảm gồm operation, resource và nội dung thay đổi. Không gửi chẩn đoán/đơn thuốc thô vào User Service chỉ để xác minh; dùng digest được domain kiểm chứng.

`MfaVerificationResult` có `purpose`, `verifiedAt`, `session` và tùy mục đích `authorization: {proofId,purpose,expiresAt,context}`. Khi provider phát hành cặp token mới, response kèm `tokens: {accessToken,refreshToken,expiresIn}`; client phải thay cặp đầy đủ. Kết quả ENROLL/LOGIN/UNLOCK chỉ cập nhật factor/state đúng mục đích; không tự cấp proof chốt hay quyền đọc mọi bệnh nhân.

Proof là ID opaque, được backend kiểm chứng và ràng buộc audience service, actor/session/context. Service thực hiện nghiệp vụ chịu trách nhiệm tiêu thụ một lần; verifier User Service không tự thay đổi bệnh án/role. Không dùng grant đọc nhiều lần làm proof chốt một lần.

### 10.3 Password và khôi phục tài khoản — API mới

| Method | Path | Quyền / request / kết quả | Trạng thái |
|---|---|---|---|
| `POST` | `/api/v1/auth/password/forgot` | Public `{email}` -> `200 {accepted:true}` như nhau dù tài khoản có tồn tại; rate limit | `MỚI` |
| `POST` | `/api/v1/auth/password/recovery/exchange` | Public credential khôi phục từ email `{tokenHash}` -> context chỉ cho reset, không phải phiên nghiệp vụ | `MỚI` |
| `POST` | `/api/v1/auth/password/reset` | `{recoveryContextId,newPassword}` -> `200 data:null`; context ngắn hạn dùng một lần | `MỚI` |
| `POST` | `/api/v1/auth/password/change` | Phiên ACTIVE `{currentPassword,newPassword,verificationProofId?}`; step-up theo policy -> `200 data:null` | `MỚI` |

User Service gửi email và xác minh recovery qua provider, dùng redirect allowlist; frontend không giữ Supabase key/URL để tự xác thực. Recovery context không cho đọc bệnh án hoặc bỏ MFA. Đổi/reset thành công thu hồi phiên cũ theo policy bảo mật và yêu cầu login đầy đủ; timeout không giả vờ đổi thành công. Enrollment lại/mất factor cần quy trình khôi phục danh tính riêng trước bật tính năng tương ứng.

Các schema email/mật khẩu phải được chỉ rõ trong OpenAPI thay vì chỉ ghi “string”; không ép login credential cũ theo chính sách độ mạnh mật khẩu mới. Ngưỡng độ mạnh mật khẩu mới và thời hạn recovery là tham số bảo mật cần chốt trước nghiệm thu, không kế thừa im lặng ngưỡng scaffold.

### 10.4 Users và Patients

| Method | Path | Quyền, request và `data` | Trạng thái |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | Actor hiện tại; `UserProfile & {patientProfile:PatientProfile\|null}` | `CÓ` |
| `PATCH` | `/api/v1/users/me` | `{fullName?:string,phone?:string\|null}`; `200 UserProfile`, không nhận role/status/email | `CÓ` |
| `GET` | `/api/v1/users` | ADMIN; `page,limit,role,status,q`; `200 Page<UserProfile>` | `CÓ` |
| `GET` | `/api/v1/users/{userId}` | ADMIN; `200 UserProfile`; validate UUID trước DB | `CÓ` |
| `PATCH` | `/api/v1/users/{userId}/status` | ADMIN `{status,verificationProofId}`; `200 UserProfile`, thu hồi/invalidation theo thay đổi | `THAY_ĐỔI` |
| `PATCH` | `/api/v1/users/{userId}/role` | ADMIN `{role,verificationProofId}`; `200 UserProfile`, policy mới có hiệu lực, không giữ grant role cũ | `THAY_ĐỔI` |
| `GET` | `/api/v1/patients` | STAFF/ADMIN theo phạm vi; DOCTOR cần scope ca đã xác minh; `page,limit,q,appointmentId?`; `Page<PatientProfile>` giới hạn field theo tác vụ | `THAY_ĐỔI` cho DOCTOR |
| `GET` | `/api/v1/patients/{patientId}` | Chính bệnh nhân; STAFF/ADMIN theo tác vụ; DOCTOR có quan hệ ca và xác minh; `200 PatientProfile` theo quyền | `THAY_ĐỔI` cho DOCTOR |
| `PATCH` | `/api/v1/patients/{patientId}` | Chính bệnh nhân hoặc ADMIN được phép; chỉ field profile bên dưới, `200 PatientProfile` | `CÓ` |

`fullName`: trim, 2–120 ký tự. `phone`: null hoặc chuỗi khớp chính sách số điện thoại, không trả field alias `phoneNumber`. Patient patch cho phép `dateOfBirth` ngày thuần hoặc null, `gender` enum hoặc null, `address` <=500, `emergencyContact` <=120, `insuranceNumber` <=50 (các chuỗi nullable). Không được đổi userId/doctorId/role qua patch profile.

DOCTOR lấy tên tối thiểu trong danh sách ca đã phân công để chọn ca; xem profile đầy đủ dùng `appointmentId` và `X-Clinical-Grant`. User Service xác minh grant qua Medical Record Service; ca CANCELLED/NO_SHOW hoặc ca không được phân công không cấp quyền. Lỗi dependency trả `503 PATIENT_SCOPE_UNAVAILABLE`, không giả bệnh nhân không tồn tại. Filter patient/doctor không bao giờ mở rộng quyền actor.

## 11. Doctor, Specialty, Schedule và Time-off

| Method | Path | Quyền / request / `data` | Trạng thái |
|---|---|---|---|
| `GET` | `/api/v1/specialties` | Mọi role ACTIVE; `page,limit,q,isActive`; `Page<Specialty>` | `CÓ` |
| `POST` | `/api/v1/specialties` | ADMIN `{name,description?}`; `201 Specialty` | `CÓ` |
| `PATCH` | `/api/v1/specialties/{specialtyId}` | ADMIN `{name?,description?,isActive?}`; `200 Specialty` | `CÓ` |
| `GET` | `/api/v1/doctors` | Mọi role ACTIVE; `page,limit,specialtyId,q,isActive`; `Page<Doctor>` | `CÓ` |
| `GET` | `/api/v1/doctors/me` | DOCTOR; tìm doctor profile theo user đã xác minh; `200 Doctor` hoặc `404 DOCTOR_NOT_FOUND` | `MỚI` |
| `POST` | `/api/v1/doctors` | ADMIN `{userId,specialtyId,displayName,bio?}`; `201 Doctor` | `CÓ` |
| `GET` | `/api/v1/doctors/{doctorId}` | Mọi role ACTIVE; `200 Doctor` | `CÓ` |
| `PATCH` | `/api/v1/doctors/{doctorId}` | ADMIN `{specialtyId?,displayName?,bio?,isActive?}`; `200 Doctor` | `CÓ` |
| `GET` | `/api/v1/doctors/{doctorId}/schedules` | Mọi role ACTIVE; `page,limit`; `Page<DoctorSchedule>` | `CÓ` |
| `POST` | `/api/v1/doctors/{doctorId}/schedules` | Bác sĩ chính mình, STAFF/ADMIN; `{weekday,startTime,endTime,slotDurationMinutes}`; `201 DoctorSchedule` | `CÓ` |
| `PATCH` | `/api/v1/schedules/{scheduleId}` | Bác sĩ sở hữu, STAFF/ADMIN; các field lịch tùy chọn, thêm `isActive?`; `200 DoctorSchedule` | `CÓ` |
| `GET` | `/api/v1/doctors/{doctorId}/time-offs` | Bác sĩ chính mình, STAFF/ADMIN; `page,limit`; `Page<DoctorTimeOff>`; PATIENT bị từ chối | `CÓ` |
| `POST` | `/api/v1/doctors/{doctorId}/time-offs` | Cùng quyền trên; `{startAt,endAt,reason?}`; `201 DoctorTimeOff` | `CÓ` |
| `PATCH` | `/api/v1/doctors/{doctorId}/time-offs/{timeOffId}` | Cùng quyền trên; `{startAt?,endAt?,reason?}`; `200 DoctorTimeOff`, ID con phải thuộc doctorId | `CÓ` |
| `GET` | `/api/v1/doctors/{doctorId}/available-slots` | Mọi role ACTIVE; `date=YYYY-MM-DD` bắt buộc; `200 Slot[]` | `CÓ` |

Non-ADMIN chỉ thấy chuyên khoa/bác sĩ active, không thể dùng `isActive=false` để vượt giới hạn. Specialty name trim 2–120, description <=2000; doctor displayName 2–160, bio <=4000 hoặc null khi patch; schedule và time-off phải có end > start. Schedule không qua nửa đêm, không chồng schedule active của cùng bác sĩ. Mỗi user liên kết tối đa một doctor profile; account phải DOCTOR + ACTIVE và specialty hợp lệ.

Khi sửa/tắt lịch, time-off hoặc ngừng hoạt động bác sĩ, kiểm tra các lịch hẹn tương lai còn hiệu lực; thay đổi làm mất hiệu lực lịch đang có trả `409 SCHEDULE_CONFLICT_WITH_APPOINTMENTS` với `details` chứa `affectedAppointmentsCount`, không tự hủy lịch hẹn. Dependency occupancy lỗi phải trả `503`, không kết luận không có bệnh nhân.

Slot lấy từ schedule trừ time-off và occupancy; dependency bắt buộc không có/không truy cập được thì trả `503`, không trả danh sách được khẳng định còn trống chỉ từ schedule. Ràng buộc DB Appointment Service vẫn phải kiểm tra đặt trùng khi ghi; danh sách slot không giữ chỗ và không bảo đảm nguyên tử với thay đổi lịch xuyên service.

Các list phải phân trang thật, gồm cả time-off; frontend không cắt cứng trang 1. `/doctors/me` và các path tĩnh phải được phân biệt với `/{doctorId}` khi định tuyến. Endpoint xóa time-off hoặc gộp detail+specialty+schedule là tùy chọn ở mục 17, không mặc định đã hỗ trợ.

## 12. Appointment và dữ liệu dashboard

### 12.1 Endpoint, quyền và state machine

| Method | Path | Quyền / hành vi / `data` | Trạng thái |
|---|---|---|---|
| `GET` | `/api/v1/appointments` | PATIENT của mình, DOCTOR được phân công, STAFF/ADMIN theo phạm vi; `Page<AppointmentSummary>` mặc định; view detail theo quyền | `THAY_ĐỔI` filter/read model |
| `GET` | `/api/v1/appointments/summary` | DOCTOR/STAFF/ADMIN theo cùng phạm vi; thống kê server trước phân trang | `MỚI` |
| `POST` | `/api/v1/appointments` | PATIENT tự đặt hoặc STAFF/ADMIN đặt hộ; `201 Appointment` lần đầu, replay `200` | `CÓ` |
| `GET` | `/api/v1/appointments/{appointmentId}` | Cùng phân quyền; `view=summary` mặc định trả AppointmentSummary, `view=detail` trả Appointment theo điều kiện bên dưới | `THAY_ĐỔI` bảo vệ chi tiết lâm sàng |
| `PATCH` | `/api/v1/appointments/{appointmentId}/reschedule` | Owner patient hoặc STAFF/ADMIN; đổi lịch PENDING/CONFIRMED; `200 Appointment` | `CÓ` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/cancel` | Owner patient hoặc STAFF/ADMIN; `200 Appointment` | `CÓ` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/confirm` | STAFF/ADMIN; `200 Appointment` | `CÓ` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/check-in` | STAFF/ADMIN; `200 Appointment` | `CÓ` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/no-show` | STAFF/ADMIN; `200 Appointment` | `CÓ` |
| `PATCH` | `/api/v1/appointments/{appointmentId}/complete` | Route legacy, không phải luồng hoàn tất public v2; trả `409 MEDICAL_RECORD_REQUIRED` và hướng sang chốt bệnh án | `CÓ`, deprecated |

```text
PENDING -> CONFIRMED | CANCELLED
CONFIRMED -> CHECKED_IN | CANCELLED | NO_SHOW
CHECKED_IN -> COMPLETED  (chỉ callback nội bộ sau bệnh án FINAL)
COMPLETED / CANCELLED / NO_SHOW -> không chuyển tiếp
```

Role STAFF/ADMIN không hoàn tất ca thay bác sĩ. DOCTOR không sửa lịch/confirm/check-in thay lễ tân. CA bị hủy/no-show không cấp quan hệ đọc lâm sàng; danh sách ca cho bác sĩ chọn chỉ cung cấp thông tin tối thiểu theo lịch được phân công, không trả `reason`/nội dung bệnh án trước xác minh. Đọc chi tiết lâm sàng yêu cầu grant đúng ca theo mục 7/13.

### 12.2 Body, lỗi và idempotency

Create nhận `{doctorId,scheduledStartAt,scheduledEndAt,patientId?,specialtyId?,reason?}`. PATIENT được suy ra patientId từ actor; nếu gửi ID khác thì từ chối. STAFF/ADMIN phải gửi patientId hợp lệ. Slot phải ở tương lai, kết thúc sau bắt đầu và trùng slot được Doctor Service xác minh.

Reschedule nhận `{scheduledStartAt,scheduledEndAt,reason?}`; các transition nhận `{reason?}` hoặc `{}`. `reason` trim, tối đa 500 ký tự thống nhất. Không nhận status tùy ý qua patch appointment chung.

Create/reschedule/transition mới bắt buộc `Idempotency-Key`. Key là chuỗi ngẫu nhiên 16–255 ký tự, được giữ nguyên khi retry cùng ý định sau timeout. Backend scope theo actor + operation + resource + key và fingerprint payload; replay đã commit cùng ý định trả kết quả trước, khác payload trả `409 IDEMPOTENCY_KEY_REUSED`. Không tự phát key mới chỉ vì chưa nhận response.

Lỗi chính: `APPOINTMENT_SLOT_UNAVAILABLE` 409, `APPOINTMENT_SLOT_INVALID` 422, `APPOINTMENT_INVALID_STATUS_TRANSITION` 409, `DEPENDENCY_UNAVAILABLE`/`DOCTOR_VERIFICATION_UNAVAILABLE` 503, `APPOINTMENT_NOT_FOUND` 404. Không có dữ liệu test trả list rỗng thành công; lỗi DB/kết nối phải là lỗi thực, không biến thành 0 lịch hẹn.

### 12.3 Query list mới

| Query | Quy tắc đích |
|---|---|
| `page`, `limit` | Theo mục 9; lọc/sort trên toàn tập rồi mới phân trang |
| `patientId`, `doctorId` | UUID; không mở rộng phạm vi actor |
| `status` | Một enum hoặc danh sách enum phân tách dấu phẩy từ sáu trạng thái, OR trong filter; không có trạng thái lạ |
| `from`, `to` | UTC, `[from,to)` theo `scheduledStartAt`; dashboard bắt buộc gửi cả hai |
| `sort` | `scheduledStartAt:asc` (mặc định) hoặc `scheduledStartAt:desc`; thêm ID cùng chiều làm tie-breaker |
| `q` | Chuỗi trim 1–100; tìm tên bệnh nhân/bác sĩ hoặc lý do được actor phép xem trên toàn tập, không chỉ trang hiện tại |
| `include` | Chỉ `names` nếu yêu cầu tên hiển thị; trả `patientSummary`, `doctorSummary:{id,displayName}`, `specialtySummary:{id,name}\|null` theo quyền |
| `view` | `summary` mặc định hoặc `detail`; DOCTOR đọc detail phải có grant khớp ca/patient; list detail DOCTOR yêu cầu patientId và grant đúng patient, không mở nhiều bệnh nhân bằng một grant |

DOCTOR lấy ca hôm nay để khám bằng `status=CHECKED_IN`, từ đầu ngày tới đầu ngày kế tiếp và phân trang. Lịch sử bệnh nhân dùng `sort=scheduledStartAt:desc&limit=5`; không gửi alias `sort=desc` rồi tự đảo trang đầu. Dashboard không lấy 100 lịch cũ để giả làm thống kê toàn bộ.

Danh sách appointment DOCTOR vẫn được giới hạn theo phân công. Xem tiền sử điều trị của các bác sĩ khác dùng Medical Record `scope=patient-history` sau xác minh, không nới list appointment thành quyền tra cứu mọi ca của mọi bệnh nhân.

PATIENT xem detail của mình không cần grant DOCTOR; STAFF/ADMIN có thể xem thông tin lịch hẹn cần cho tiếp đón, gồm reason theo tác vụ, nhưng không có chẩn đoán/đơn thuốc của Medical Record. Khi được yêu cầu detail mà thiếu quyền/grant, trả lỗi rõ ràng, không âm thầm đổi về summary. OpenAPI khai báo hai response schema theo view; consumer không dùng field reason từ summary.

`q/include` là hành vi MỚI; Appointment Service cần API/read model từ service sở hữu tên, không JOIN database khác và không đẩy nghiệp vụ tổng hợp sang Gateway. Không tìm theo reason của ca mà actor chưa được xem. Nếu lookup tên bắt buộc để lọc không khả dụng, trả lỗi tạm thời; không trả kết quả tìm kiếm rỗng sai. Tên tùy chọn bị thiếu khi nguồn lỗi phải được biểu diễn bằng null/trạng thái rõ ràng, không bịa tên hoặc dùng role thay tên.

### 12.4 Summary

`GET /api/v1/appointments/summary?from=...&to=...` yêu cầu cả khoảng UTC; `doctorId?`, `status?` dùng cùng phân quyền/filter. Timezone đếm nhóm là `Asia/Ho_Chi_Minh`. Trả:

```json
{
  "success": true,
  "data": {
    "from": "2026-11-13T17:00:00.000Z",
    "to": "2026-11-14T17:00:00.000Z",
    "timezone": "Asia/Ho_Chi_Minh",
    "total": 0,
    "countsByStatus": {
      "PENDING": 0, "CONFIRMED": 0, "CHECKED_IN": 0,
      "COMPLETED": 0, "CANCELLED": 0, "NO_SHOW": 0
    },
    "daily": [{ "date": "2026-11-14", "total": 0 }]
  },
  "requestId": "opaque-request-id"
}
```

Các số được đếm sau cùng filter/phạm vi, tổng counts bằng total; nếu filter status thì các trạng thái còn lại bằng 0. `daily` có các ngày địa phương giao khoảng lọc, kể cả ngày không có ca. Endpoint summary lỗi không được render thành số 0 thật. Danh sách ca tiếp theo vẫn dùng list có sort/filter, không nhúng mọi lịch vào summary.

## 13. Medical Record, đơn thuốc và quyền lâm sàng

### 13.1 Endpoint và phạm vi

| Method | Path | Quyền / request / `data` | Trạng thái |
|---|---|---|---|
| `GET` | `/api/v1/medical-records` | PATIENT chỉ FINAL của mình; DOCTOR theo view/scope và grant bên dưới; `Page<MedicalRecord>` hoặc summary không nội dung lâm sàng | `THAY_ĐỔI` |
| `POST` | `/api/v1/medical-records` | DOCTOR phụ trách ca hợp lệ; body record, `Idempotency-Key`, quyền lâm sàng; `201 MedicalRecord`, replay `200` | `THAY_ĐỔI` |
| `GET` | `/api/v1/medical-records/{recordId}` | PATIENT sở hữu FINAL; DOCTOR có grant current-encounter hoặc authored-history phù hợp; `200 MedicalRecord` | `THAY_ĐỔI` |
| `PATCH` | `/api/v1/medical-records/{recordId}` | DOCTOR được phép sửa DRAFT; body field lâm sàng + `expectedVersion`; chốt cần proof mới; `200 MedicalRecord` | `THAY_ĐỔI` |
| `POST` | `/api/v1/medical-records/access-grants` | DOCTOR; `{verificationProofId,accessMode,appointmentId,patientId,recordId?}` -> `201 ClinicalGrant` | `MỚI` |
| `POST` | `/api/v1/medical-records/finalization-contexts` | DOCTOR có quyền ca; `{appointmentId,recordId?,expectedVersion,record}` -> `201 FinalizationContext` để ràng buộc xác minh với nội dung cần chốt | `MỚI` |

STAFF/ADMIN không được cấp quyền đọc/chốt lâm sàng chỉ nhờ role hoặc MFA thành công. Không có public endpoint hard-delete bệnh án, không có service kê đơn độc lập. Đơn thuốc thuộc Medical Record Service và nằm trong transaction chốt cùng bệnh án.

Create record nhận các ID ca/patient/doctor, `symptoms?`, `diagnosis?`, `notes?`, `treatmentPlan?`, `prescription` mặc định `[]`, `status` mặc định DRAFT. Service đối chiếu ID với actor/appointment; không tin doctorId trong body. Một ca tối đa một bệnh án active. POST FINAL được hỗ trợ trong thiết kế đích chỉ khi có context/proof cho thao tác tạo mới, `expectedVersion = 0`; không được bỏ xác minh vì record chưa có ID.

PATCH chỉ nhận các field nội dung trên, status DRAFT/FINAL, `expectedVersion` và `verificationProofId?`; không đổi doctorId/patientId/appointmentId/createdBy. Ghi phiên bản mới tăng `version`; stale `expectedVersion` trả `409 RECORD_VERSION_CONFLICT`. FINAL không sửa trực tiếp, không quay về DRAFT; nếu cần đính chính phải thiết kế phụ lục/version riêng, chưa có trong phạm vi này.

### 13.2 Quyền đọc liên bác sĩ và lịch sử tác giả

`ClinicalGrant` gồm `grantId`, `sessionId`, `doctorId`, `patientId`, `appointmentId`, `recordId|null`, `accessMode`, `issuedAt`, `expiresAt`. Grant trả ở body, gửi tiếp bằng `X-Clinical-Grant`; ràng buộc với actor/session, không phải mã có thể chia sẻ cho bác sĩ khác.

| `accessMode` | Điều kiện / phạm vi |
|---|---|
| `CURRENT_ENCOUNTER` | Bác sĩ được phân công ca còn đủ điều kiện + xác minh TOTP mới; đọc lịch sử FINAL của bệnh nhân kể cả của bác sĩ khác và DRAFT của ca mình đang phụ trách |
| `AUTHORED_HISTORY` | Xác minh mới, account/doctor còn đủ quyền, record thực sự do mình phụ trách và nằm trong cửa sổ quyền đã cấu hình; chỉ đọc hồ sơ đó, không mở toàn bộ các ca mới của bệnh nhân |

Chế độ authored-history không đòi ca cũ còn CHECKED_IN để xử lý nhu cầu theo dõi sau điều trị; vẫn cần điều kiện quyền dài hạn ở mục 17. Chưa chốt thời hạn hoặc trạng thái bắt đầu mở quyền thì phần phụ thuộc chưa được nghiệm thu, không tự mở quyền vô hạn.

List nhận `page,limit,patientId?,doctorId?,appointmentId?,status?,from?,to?,sort?,scope?,view?`. `from/to` ở đây lọc `createdAt`, `sort=createdAt:desc` mặc định hoặc asc, tie-break bằng ID. `scope=authored` (mặc định DOCTOR) hoặc `patient-history`; `view=summary|detail`, mặc định summary cho DOCTOR và detail cho PATIENT.

Summary DOCTOR chỉ là chỉ mục lịch sử do mình phụ trách: ID bệnh án/ca/patient, ngày tạo, status và nhãn bệnh nhân tối thiểu; không symptoms/diagnosis/notes/treatmentPlan/prescription. UI mặc định lịch sử 6 tháng nhưng có thể phân trang/lọc cũ hơn theo quyền. Không dùng summary để lộ toàn bộ lịch sử bệnh nhân của bác sĩ khác trước xác minh.

`scope=patient-history&view=detail` yêu cầu patientId + grant CURRENT_ENCOUNTER khớp ca và patient. Truy vấn không ép `doctorId = actor.doctorId` cho các bệnh án FINAL cũ; đó là sửa hành vi gây thiếu tiền sử đã nêu trong audit. `view=detail` cho authored-history cũng cần grant hợp lệ. PATIENT không được dùng filter để đọc DRAFT hoặc hồ sơ người khác. Nội dung DRAFT của bác sĩ khác không thuộc quyền đọc lịch sử.

### 13.3 Context, proof và hoàn tất ca

`FinalizationContext` trả `contextId`, `appointmentId`, `recordId|null`, `expectedVersion`, `contentDigest`, `expiresAt`. Medical Record Service chuẩn hóa nội dung cần chốt và tạo digest; frontend không phải tự quyết định canonical hash. Chỉ context/digest/ID được đưa vào MFA challenge, không sao chép nội dung lâm sàng sang User Service.

Sau khi bác sĩ xem nội dung, verify TOTP cho purpose FINALIZE tạo proof gắn context. Request POST/PATCH FINAL gửi `verificationProofId` cùng nội dung đã xác nhận. Medical Record Service kiểm tra context còn hạn, actor/session/ca, phiên bản và digest của nội dung thực thi; thay đổi thuốc hoặc field khác làm proof không còn dùng được. Tiêu thụ proof và ghi FINAL/audit/outbox phải chống race và replay.

Mọi request tạo/chốt cần `Idempotency-Key`; replay cùng thao tác đã commit trả record đã lưu, không ghi/gửi đơn lần nữa. Không dùng cùng proof cho một request mới khác key sau khi đã commit. Lỗi optimistic concurrency hoặc nội dung khác trả 409, giữ bản nháp để người dùng đối chiếu.

Chốt FINAL trả `200/201` với record đã chốt; `appointmentCompletion = PENDING` cho tới khi callback thành công, COMPLETED khi đã xác nhận Appointment Service cập nhật. DRAFT trả NOT_REQUESTED. Trạng thái đồng bộ không làm FINAL quay về DRAFT. Client có thể đọc lại record/appointment để theo dõi; không hứa hoàn tất tối đa 5 giây và không gọi route public `/appointments/{id}/complete` để ép đồng bộ.

Lỗi chính: `CLINICAL_VERIFICATION_REQUIRED`/`CLINICAL_ACCESS_DENIED` 403, `MEDICAL_RECORD_NOT_FOUND` 404, `MEDICAL_RECORD_ALREADY_EXISTS`/`MEDICAL_RECORD_FINAL`/`RECORD_VERSION_CONFLICT`/`FINALIZATION_CONTEXT_CHANGED` 409, `APPOINTMENT_NOT_ELIGIBLE` 422, dependency lỗi 503. Không đủ quyền đọc trả lỗi trước khi trả nội dung; audit đọc/chốt không chứa nội dung nhạy cảm trong log.

## 14. Notification, badge và đánh dấu đã đọc

| Method | Path | Quyền / request / `data` | Trạng thái |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | Actor ACTIVE; `page,limit,status`; `200 Page<Notification>` chỉ người nhận | `CÓ` |
| `GET` | `/api/v1/notifications/unread-count` | Actor ACTIVE; `200 {unreadCount:integer >=0}` toàn bộ thông báo của mình, không chỉ trang đang tải | `MỚI` |
| `GET` | `/api/v1/notifications/{notificationId}` | Chủ thông báo; `200 Notification`, ngoài phạm vi trả 404 | `CÓ` |
| `PATCH` | `/api/v1/notifications/{notificationId}/read` | Chủ thông báo; body `{}`, idempotent; `200 Notification` | `CÓ` |
| `PATCH` | `/api/v1/notifications/read-all` | Actor ACTIVE; `{readBefore?:timestamp}`; đánh dấu toàn tập theo cutoff, không chỉ trang đầu | `MỚI` |
| `POST` | `/api/v1/notifications` | Public client bị từ chối `403 ACCESS_DENIED`; không phải API tạo thông báo | `CÓ`, luôn từ chối |

`readBefore` mặc định serverNow, không nhận mốc tương lai. read-all chỉ cập nhật UNREAD có `createdAt <= readBefore` của actor; response `200 {updatedCount,unreadCount,readBefore,readAt}`. Thông báo mới đến sau cutoff vẫn UNREAD. Retry cùng cutoff không tăng số đọc lại; UI dùng unreadCount server trả hoặc fetch count mới, không tự đặt 0 vô điều kiện.

Payload điều hướng chỉ có `appointmentId?`, `recordId?`, không có chẩn đoán/thuốc/BHYT. Bấm thông báo cần đi đúng ID; endpoint đích vẫn kiểm tra phiên/MFA/phạm vi. Notification không cấp quyền và không vượt khóa STAFF/ADMIN hoặc grant DOCTOR.

Kênh hiện tại được cam kết là IN_APP tải qua REST; reminder backend snapshot chỉ có mốc 24 giờ. Đặt/đổi lịch CONFIRMED lên reminder theo trạng thái hiện hành; hủy/check-in hoặc context không còn CONFIRMED làm reminder cũ không được gửi. Chưa có push/nhắc 1 giờ; nếu chưa triển khai, UI phải bỏ lời hứa đó. Event NO_SHOW và preference/kênh ngoài được giữ ở mục 17, không mặc định là đã hoạt động.

Các path tĩnh `unread-count`, `read-all` phải được xử lý trước route động ID. Lỗi count/list không được giả badge 0 hoặc danh sách trống; không tự tạo thông báo từ client để mô phỏng backend.

## 15. API nền tảng và API nội bộ

### 15.1 Health, OpenAPI và Swagger

| Method | Path | Response / quyền | Trạng thái |
|---|---|---|---|
| `GET` | `/health` | Gateway trả `200 {service:"api-gateway",status:"ok"}` trong envelope; domain service trả readiness persistence hoặc `503 DATABASE_UNAVAILABLE` | `CÓ` |
| `GET` | `/api/v1/system/health` | ADMIN phiên ACTIVE; `200 {gateway:"ok",status:"ok"/"degraded",services:{users,doctors,appointments,medicalRecords,notifications}}`; mỗi service là `ok/unavailable` | `CÓ` |
| `GET` | `/openapi.json` | Spec OpenAPI của owner; Gateway chỉ mô tả phần platform mình sở hữu | `CÓ` ở cả sáu service |
| `GET` | `/docs/` | Swagger UI của owner | `CÓ` ở cả sáu service |
| `GET` | `/api-docs/` | Alias Swagger UI | `CÓ` ở cả sáu service |

Readiness không trả DB URL, secret, stack trace hoặc ID bệnh nhân. Service DB lỗi trả 503; Gateway aggregate có thể trả 200 cùng status degraded vì request lấy báo cáo health đã thành công. Cổng diagnostic của từng service chỉ phục vụ development/vận hành được phép; frontend nghiệp vụ vẫn chỉ gọi Gateway.

Các chỉ số outbox/reminder nếu thêm phải có schema vận hành riêng, không expose tùy tiện qua health public. Cổng liên kết/gộp OpenAPI có thể là tài liệu tĩnh; không chuyển quyền sở hữu endpoint nghiệp vụ sang Gateway.

### 15.2 Hợp đồng service-to-service hiện có

Mọi route dưới đây không được public qua Gateway, dùng caller credential backend-only và requestId. Nội bộ trả cùng success/error envelope; caller chỉ được thực hiện đúng chức năng được cấp, không suy ra quyền ADMIN từ việc có token service.

| Caller -> Owner | Method | Path | Request / `data` tối thiểu | Trạng thái |
|---|---|---|---|---|
| Gateway -> User | `GET` | `/internal/v1/auth/verify` | Bearer người dùng; trả id/role/status ứng dụng và metadata phiên/state/hạn; authUserId chỉ ở nội bộ khi cần | `THAY_ĐỔI` session v2 |
| Doctor -> User | `GET` | `/internal/v1/users/{userId}/doctor-eligibility` | `{id,role,status}`; dùng để tạo doctor profile | `CÓ` |
| Appointment/Medical Record -> User | `GET` | `/internal/v1/patients/by-user/{userId}` | `{id,userId}` | `CÓ` |
| Appointment/Medical Record -> User | `GET` | `/internal/v1/patients/{patientId}` | `{id,userId}` | `CÓ` |
| User/Appointment/Medical Record -> Doctor | `GET` | `/internal/v1/doctors/by-user/{userId}` | `{id,userId,isActive}`; caller User có credential riêng theo cấu hình | `CÓ` |
| Appointment -> Doctor | `POST` | `/internal/v1/doctors/verify-slot` | `{doctorId,startAt,endAt}` -> `{valid,reason?}` | `CÓ` |
| Doctor -> Appointment | `GET` | `/internal/v1/appointments/occupied-slots` | `doctorId,from,to?` -> các khoảng `[startAt,endAt)` active; không có dữ liệu patient | `CÓ` |
| User -> Appointment | `GET` | `/internal/v1/appointments/{appointmentId}/patient-scope` | `{id,patientId,doctorId,status}`; User đối chiếu doctor phụ trách | `CÓ` |
| Medical Record -> Appointment | `GET` | `/internal/v1/appointments/{appointmentId}/verify-for-medical-record` | `{valid,appointment:{id,patientId,doctorId,status}?}` | `CÓ` |
| Medical Record -> Appointment | `POST` | `/internal/v1/appointments/{appointmentId}/complete-from-record` | `{recordId}` -> `200` khi cập nhật hoặc replay cùng record; record phải FINAL và đúng ca | `CÓ` |
| Appointment -> Medical Record | `GET` | `/internal/v1/medical-records/by-appointment/{appointmentId}` | ID liên kết, status và thông tin tác giả tối thiểu; không chẩn đoán/đơn thuốc | `CÓ` |
| Notification -> Appointment | `GET` | `/internal/v1/appointments/{appointmentId}/reminder-context` | `{id,patientId,status,scheduledStartAt}` | `CÓ` |
| Appointment/Medical Record -> Notification | `POST` | `/internal/v1/notifications` | `{eventId,type,payload}` -> `201` lần đầu, `200` dedup | `CÓ` |
| Producer/vận hành được cấp -> Notification | `POST` | `/internal/v1/notifications/{notificationId}/retry` | Retry giao nhận có kiểm soát, `200` với kết quả hiện tại; không tạo thêm notification mới | `CÓ` |

Thiếu/sai credential caller trả `401 INTERNAL_AUTH_REQUIRED`; caller xác thực nhưng không được phép trả 403. Input UUID/date sai trả 400. Lookup không có tài nguyên trả 404; dependency không xác minh được trả 503. Đối chiếu clinical completion sai trạng thái/record trả 409 hoặc 422 theo lý do, không giả thành công.

Các tên biến token, timeout, retry, lease và cấu trúc repository là cấu hình backend, không phải dữ liệu frontend cần gửi. Không query DB chéo service để bỏ qua API nội bộ.

### 15.3 API nội bộ mới phục vụ v2

| Caller -> Owner | Method | Path | Schema / bảo vệ | Trạng thái |
|---|---|---|---|---|
| Medical Record / service thực thi thao tác nhạy cảm -> User | `POST` | `/internal/v1/auth/mfa/proofs/verify` | `{proofId,purpose,actorUserId,sessionId,context}` -> `{valid,proofId,purpose,expiresAt,context}`; caller/audience/purpose khớp; không tiêu thụ proof thay transaction domain | `MỚI` |
| User/Appointment -> Medical Record | `POST` | `/internal/v1/medical-records/access-grants/verify` | `{grantId,actorUserId,sessionId,patientId,appointmentId,recordId?}` -> `{valid,accessMode,expiresAt}`; không trả nội dung bệnh án | `MỚI` |
| Appointment/Medical Record -> User | `POST` | `/internal/v1/patients/lookup` | `{patientIds,actorContext,appointmentIds?}` -> `{items:PatientSummary[]}`; tối đa 100 ID, kiểm tra phạm vi, không BHYT/contact ngoài tác vụ | `MỚI` |
| Appointment/Medical Record -> Doctor | `POST` | `/internal/v1/doctors/lookup` | `{doctorIds}` tối đa 100 -> `{items:[{id,displayName,specialtyId,isActive}]}`; caller đã cấp quyền | `MỚI` |

`actorContext` là danh tính/phạm vi được backend xác minh từ request gốc, không phải role do client tự khai báo; service nhận phải kiểm tra delegation/caller. DOCTOR chỉ được resolve summary cho ca được phân công; quyền summary không cấp quyền đọc profile hoặc hồ sơ lâm sàng. Batch/search/read model phải giữ cùng ranh giới dữ liệu; không cho gửi danh sách ID tùy ý để thu thập tên bệnh nhân ngoài phạm vi.

Kiểm chứng proof/grant không đồng nghĩa cấp quyền nghiệp vụ cuối cùng; service domain vẫn kiểm tra tình trạng tài nguyên hiện tại. Proof được ràng buộc duy nhất audience/operation; domain tiêu thụ proofId một lần cùng transaction, không dùng verifier nội bộ như cơ chế chốt từ xa bỏ kiểm tra trạng thái.

### 15.4 Event và nhất quán liên service

Event đang cam kết: `appointment.created`, `appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled`, `appointment.checked_in`, `medical-record.created`, `medical-record.updated`. Notification payload chỉ có `recipientUserId`, `patientId?`, `appointmentId?`, `recordId?`, `scheduledStartAt?`. `eventId` ổn định khi retry; receiver dedup cả notification và reminder. Event cũ không hồi sinh reminder đã hủy.

Medical Record ghi outbox cùng FINAL; callback hoàn tất Appointment trước thông báo kết quả. Lỗi gửi thông báo không rollback lịch hẹn hoặc bệnh án đã commit. Thay đổi schedule/slot xuyên service chưa phải transaction nguyên tử; contract không hứa atomicity chưa có. Retry/outbox là chi tiết backend nhưng API phải trả trạng thái đã commit/đang đồng bộ trung thực.

## 16. Đối chiếu audit, migration và nghiệm thu

### 16.1 Các thay đổi so với v1/snapshot

| Nguồn phát hiện | Quyết định trong v2 | Việc triển khai còn lại |
|---|---|---|
| CONF-01: public `/complete` khác code | Hoàn tất qua FINAL + callback nội bộ; route cũ deprecated trả MEDICAL_RECORD_REQUIRED | Cập nhật OpenAPI, client và test luồng chốt |
| CONF-02: UI báo hoàn thành quá sớm | Trả trạng thái appointmentCompletion, không hứa giới hạn 5 giây | Read model đồng bộ và UX chờ |
| BUG-02/03: cắt 100/20 lịch | Filter đúng ngày/status, summary server, phân trang toàn bộ | Dashboard/record picker và truy vấn backend |
| CONF-04/05: sort bị bỏ qua, tìm kiếm trang hiện tại | Sort allowlist, q server, include names có scope | Parser/query/read model; sửa consumer sort legacy |
| CONF-03: ADMIN đọc bệnh án mâu thuẫn | Không có quyền lâm sàng mặc định; audit grant đặc biệt chưa bật | Role guard và docs thống nhất |
| Quyền DOCTOR đọc bệnh án của bác sĩ khác | Grant theo ca + TOTP; history FINAL không bị ép theo doctor tác giả | Medical Record/User/Appointment và audit đọc |
| BUG-04: chọn ca canceled/no-show để lookup | Scope/grant phải hợp lệ; summary tối thiểu cho ca đã phân công | Sửa chọn appointmentId và PatientProfile API |
| BUG-05: cache module lẫn tài khoản | Client xóa/đổi dữ liệu theo session/actor; private response no-store | Cache frontend không dùng chung role/user; backend xem tài liệu riêng |
| BUG-06 và rủi ro DATE | Validate UUID 400, ngày sinh luôn YYYY-MM-DD | Mapper DB, validator và test DB thật |
| Mobile notification chỉ 20 mục/read-all chưa đủ | Phân trang, unread-count và read-all theo cutoff toàn tập | API mới và client lấy count thật |
| Reminder UI 1h/push chưa có | Cam kết hiện tại chỉ 24h IN_APP | Sửa copy hoặc triển khai extension được duyệt |
| User OpenAPI response chung | Schema domain và union Session/MFA cụ thể | Cập nhật OpenAPI và shared/generated types |
| TEST-01/HARDEN-01 | Lỗi test log/hardening ở backend, không phải API feature mới | Sửa assertion, HTTP redirect policy theo tài liệu kỹ thuật |
| Migration User Service chưa rõ | Cần lệnh tái lập/version/upgrade và bằng chứng | Runbook/migration service, không thêm endpoint migrate public |
| UI BHYT/SSO/PDF/Preferences hứa trước | Không bịa dữ liệu hoặc giả thành công | Tắt lời hứa chưa hỗ trợ hoặc chọn extension ở mục 17 |

### 16.2 Mã lỗi nghiệp vụ tối thiểu bổ sung

Mã lỗi auth/phiên/MFA/grant ở mục 5, 7, 8 được giữ nguyên. Các mã dưới đây hoàn thiện danh mục v1; alias cũ cần được dịch/loại bỏ có phối hợp, không đổi mã tùy từng service.

| Code | HTTP | Ý nghĩa |
|---|---|---|
| `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID` | 401 | Thiếu/sai/hết hạn access token |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email/mật khẩu không hợp lệ |
| `AUTH_EMAIL_NOT_CONFIRMED` | 403 | Chưa xác nhận email |
| `AUTH_EMAIL_INVALID` | 400 | Địa chỉ email không hợp lệ |
| `AUTH_RATE_LIMITED` / `RATE_LIMIT_EXCEEDED` | 429 | Giới hạn auth hoặc request |
| `AUTH_NOT_CONFIGURED` / `AUTH_EMAIL_PROVIDER_DISABLED` | 503 | Cấu hình xác thực/provider chưa sẵn sàng, không phải lỗi mật khẩu |
| `USER_PROFILE_NOT_FOUND` | 403 | Auth có user nhưng thiếu profile ứng dụng |
| `USER_NOT_FOUND` / `PATIENT_NOT_FOUND` / `DOCTOR_NOT_FOUND` | 404 | Không có tài nguyên được phép xem |
| `DOCTOR_ACCOUNT_INVALID` / `SPECIALTY_INVALID` | 422 | Tài khoản bác sĩ/chuyên khoa không đủ điều kiện |
| `SCHEDULE_OVERLAP` | 409 | Schedule active bị chồng |
| `SCHEDULE_CONFLICT_WITH_APPOINTMENTS` | 409 | Thay đổi làm ảnh hưởng lịch đang có |
| `APPOINTMENT_AVAILABILITY_UNAVAILABLE` / `DEPENDENCY_UNAVAILABLE` | 503 | Không xác minh được nguồn bắt buộc |
| `APPOINTMENT_NOT_FOUND` / `NOTIFICATION_NOT_FOUND` | 404 | Không có tài nguyên được phép xem |
| `VALIDATION_ERROR` | 400 | Path/query/body sai cấu trúc |
| `ACCESS_DENIED` | 403 | Actor thiếu quyền chức năng |
| `ROUTE_NOT_FOUND` | 404 | Không có route |
| `DATABASE_UNAVAILABLE` | 503 | Persistence không sẵn sàng |
| `UPSTREAM_SERVICE_UNAVAILABLE` / `UPSTREAM_INVALID_RESPONSE` | 502 | Không kết nối upstream hoặc upstream sai envelope |
| `UPSTREAM_SERVICE_TIMEOUT` | 504 | Timeout tại Gateway |
| `INTERNAL_SERVER_ERROR` | 500 | Lỗi ứng dụng không dự kiến; không lộ stack/SQL và không giả là lỗi input |

### 16.3 Áp dụng contract mà không làm client hiểu sai

- CÓ chỉ xác nhận có route tại backend `dad4f96`; session theo role, MFA/grant, schema mới, sort/q/summary và bulk notification chưa được coi đã triển khai. Frontend ở `b1d3113` cũng chưa đáp ứng mọi thay đổi này.
- Cần triển khai provider/consumer/OpenAPI theo cùng baseline và kiểm tra compatibility trước bật v2. Một số thay đổi mang tính breaking: bắt MFA, bảo vệ field lâm sàng, context/proof chốt, unknown query 400, logout current, normalized null/date và trường bắt buộc mới.
- Trong môi trường MVP có thể rollout đồng bộ sau cập nhật các client được hỗ trợ; không âm thầm thay `/api/v1` khi còn client cũ đang được cam kết phục vụ. Nếu phải phục vụ song song contract không tương thích, cần quyết định version route/negotiation rõ trước phát hành. Số v2 của tài liệu chưa tự tạo route mới.
- Không tạo fallback bỏ MFA/grant để giữ client cũ chạy. Những consumer chưa nâng cấp phải có thông báo/yêu cầu cập nhật phù hợp.
- OpenAPI từng service cập nhật cùng PR triển khai; Gateway chỉ cập nhật routing/header/auth boundary thật sự thay đổi. Contract test exact operation list phải bổ sung các route mới, không xóa assertion để làm xanh.

### 16.4 Điều kiện nghiệm thu tích hợp

1. Có OpenAPI đầy đủ path/query/body/success/error/security cho mọi operation được bật; kiểu client khớp DTO, đặc biệt phone/date/null/status/pagination.
2. Chạy các ca phiên/MFA nêu ở mục 6–8, gồm gọi API trực tiếp bỏ UI, đổi ID/role, session khóa/hết hạn và replay/chỉnh payload.
3. PostgreSQL thật kiểm chứng concurrent booking, reschedule, unique record, version conflict, tiêu thụ proof, outbox/dedup; không coi mock test pass là E2E pass.
4. Kiểm chứng `PATIENT đặt -> STAFF xác nhận/check-in -> DOCTOR mở TOTP/đọc tiền sử -> chốt TOTP -> FINAL -> COMPLETED -> PATIENT xem kết quả/notification` qua Gateway.
5. Fixture nhiều hơn 20/100 item chứng minh list/search/summary/record picker không bỏ sót; đọc tất cả không giới hạn ở trang đầu và không nuốt thông báo mới sau cutoff.
6. Kiểm chứng dependency timeout/503, giữ bản nháp/phiên và không trả empty/0/success giả; verify DATE trên DB thật.
7. Báo cáo lưu branch/SHA môi trường/lệnh/exit code và log đã che dữ liệu nhạy cảm. Những test bị skip không được đánh dấu nghiệm thu. Lượt chỉnh tài liệu này chưa thực thi hệ thống hay phát hành endpoint.

## 17. Quyết định còn mở và phạm vi tùy chọn

### 17.1 Tham số/quyết định cần chốt trước bật phần phụ thuộc

| Nội dung | Điều đã rõ | Phần còn mở |
|---|---|---|
| STAFF/ADMIN | MFA đầu phiên, tối đa 8 giờ, khóa 15 phút, MFA mới mở khóa/thao tác nhạy cảm | Thời hạn challenge/proof, ngưỡng thử sai và quy trình recovery factor |
| DOCTOR mở ca | TOTP theo ca và phạm vi bệnh nhân, đọc FINAL liên bác sĩ | Bắt đầu từ CHECKED_IN hay cửa sổ CONFIRMED gần giờ khám; thời hạn grant và tự khóa quyền lâm sàng |
| Bác sĩ đọc lại | Được tra cứu hồ sơ mình phụ trách, lịch sử mặc định ít nhất 6 tháng | Chốt cửa sổ 1 hay 2 năm, tác động chuyển cơ sở, xin cấp lại quyền và lưu trữ y tế áp dụng |
| Recovery/password | User Service sở hữu flow, context giới hạn mục đích, không bypass MFA | Ngưỡng mật khẩu mới, thời hạn recovery và xác minh danh tính khi mất factor |
| NO_SHOW | Có transition, chưa gửi event notification tương ứng trong snapshot | Có yêu cầu thông báo cho bệnh nhân hay chủ đích bỏ qua; nếu có phải thêm enum/event producer/consumer cùng PR |
| Rollout | Phân biệt CÓ/MỚI/THAY_ĐỔI; không bỏ guard cho client cũ | Nếu phải phục vụ song song client khác contract, chốt version/negotiation trước release |

Các số 30 ngày PATIENT, 15 ngày DOCTOR, 8 giờ/15 phút STAFF/ADMIN đã chốt và không nằm trong danh sách hỏi lại. Chi tiết cache, ghi hoạt động và invalidation nhiều instance được hoàn thiện ở [thiết kế backend](backend-cache-design.md), không yêu cầu frontend chọn RAM hay Redis.

### 17.2 Extension từ audit — chưa tự coi là tính năng đã bật

| Tính năng / API tham chiếu | Quyền và ràng buộc nếu triển khai | Trạng thái |
|---|---|---|
| `POST /api/v1/users` tạo/invite nhân sự trực tiếp | ADMIN + xác minh nhạy cảm; User Service provisioning qua Supabase Auth; tạo doctor profile vẫn thuộc Doctor Service | `TÙY_CHỌN` |
| `DELETE /api/v1/doctors/{doctorId}/time-offs/{timeOffId}` | Bác sĩ sở hữu hoặc STAFF/ADMIN theo quyền; kiểm tra ID con/actor, audit; không tự hủy lịch hẹn | `TÙY_CHỌN` |
| `GET /api/v1/doctors/{doctorId}/overview` | View đọc bác sĩ + chuyên khoa + schedule theo cùng quyền; không thêm DB JOIN xuyên service | `TÙY_CHỌN` |
| `POST /api/v1/appointments/check-in-by-token` | STAFF/ADMIN ACTIVE; QR xác định vé/ca, kiểm tra status và idempotency; QR không thay phiên nhân viên hoặc MFA/grant bác sĩ | `TÙY_CHỌN` |
| `GET /api/v1/medical-records/{recordId}/export?format=pdf` | PATIENT của mình hoặc DOCTOR có quyền đọc; audit/export, không public URL không kiểm soát | `TÙY_CHỌN` |
| `GET/PUT /api/v1/notifications/preferences` | Chủ tài khoản, chỉ lựa chọn kênh/mốc đã được backend hỗ trợ; tắt UI lựa chọn giả | `TÙY_CHỌN` |
| `POST/DELETE /api/v1/notifications/device-tokens` | Thiết bị/actor sở hữu, token push là dữ liệu nhạy cảm, cần provider/worker thật | `TÙY_CHỌN` |
| Nhắc 1h, email/SMS/push ngoài IN_APP | Chốt delivery channel, retry và preferences; không chỉ đổi copy UI | `TÙY_CHỌN` |
| SSO Google/Apple | Chưa chốt route; provider exchange/PKCE/redirect do User Service sở hữu, client qua Gateway | `TÙY_CHỌN` |
| `insuranceExpiryDate` trên PatientProfile | Chỉ thêm khi có nguồn dữ liệu/schema/validation; không gán ngày giả trên UI | `TÙY_CHỌN` |

Booking tại quầy đã có POST appointments cho STAFF/ADMIN; không cần tạo service hoặc API booking riêng. Phần còn thiếu là UI chọn bệnh nhân/bác sĩ/slot và gửi request đúng contract. Read-all/unread-count, summary và sort/search đã được đưa vào thiết kế đích ở mục 12/14, không còn bị trộn với backlog tùy chọn này.

## 18. Tham chiếu triển khai

- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions): vòng đời access/refresh token và giới hạn phiên tích hợp.
- [Supabase signout](https://supabase.com/docs/guides/auth/signout): JWT có thể còn hiệu lực tới `exp` sau logout; ứng dụng phải thực thi thu hồi phiên theo policy riêng.
- [Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp): enrollment, challenge/verify và ứng dụng Authenticator; API TOTP có trên gói miễn phí.
- [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html): bằng chứng xác nhận có hạn, gắn nội dung và chống replay.
- [Luật Khám bệnh, chữa bệnh 15/2023/QH15](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-15-2023-qh15-kham-benh-chua-benh-119231127164453959.htm) và [Thông tư 33/2025/TT-BYT](https://vanban.chinhphu.vn/?classid=1&docid=214427&pageid=27160&typegroupid=6): căn cứ để cơ sở xác định chính sách lưu trữ bệnh án; thời hạn truy cập của bác sĩ không phải lệnh xóa hồ sơ.

Các cấu hình time-box/inactivity tích hợp của Supabase thuộc gói Pro trở lên. Với gói miễn phí, User Service thực thi trạng thái phiên do service sở hữu: PATIENT 30 ngày không hoạt động; DOCTOR 15 ngày không hoạt động; STAFF/ADMIN tối đa 8 giờ và khóa sau 15 phút không thao tác. Không mặc định coi nhà cung cấp đã áp dụng các chính sách này.
