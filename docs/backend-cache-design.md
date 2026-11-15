# Thiết kế cache backend — tài liệu kỹ thuật

**Ngày:** 14/11/2026. **Phạm vi:** kỹ thuật thực thi yêu cầu tại [API Contract v2](api-contract-v2.md). Tài liệu này không thay đổi thời hạn phiên hoặc quyền nghiệp vụ đã chốt.

## 1. Snapshot và trạng thái

Đối chiếu backend `dad4f96aa8d2524c6ce31bee12e6421a5ba44946`, đặc biệt `gateway/api-gateway/src/auth.ts`. Triển khai hiện tại đã có cache identity trong RAM; quản lý phiên theo role, MFA/grant và invalidation đầy đủ dưới đây là thiết kế cần triển khai.

| Nội dung | Hiện có trong snapshot | Thiết kế cần bổ sung |
|---|---|---|
| Key | SHA-256 của access token, không lưu token thô trong key | Giữ nguyên; thêm index theo user/session để invalidation |
| TTL | Mặc định 5 phút, không vượt JWT `exp` | Chặn thêm theo hạn phiên, mốc khóa và trạng thái xác minh |
| Giới hạn | Mặc định 5.000 entry, LRU bằng Map | Giữ giới hạn cấu hình; đo eviction/hit/miss |
| Request đồng thời | Gộp promise xác minh cùng token | Giữ; invalidation phải chặn kết quả đang chạy tái ghi cache cũ |
| Logout | Xóa entry access token đang logout | Xóa mọi entry của phiên bị thu hồi; xử lý phiên ứng dụng bền vững |
| Đổi role/khóa user | Entry cũ còn tới hết TTL | Invalidate theo user; không báo thu hồi hoàn tất khi quyền cũ vẫn được dùng |
| DB | Gateway không có DB; verifier gọi User Service | User Service sở hữu trạng thái phiên bền vững; Gateway tiếp tục không có DB |

## 2. Cache identity

Chỉ cache danh tính đã được User Service xác minh; không tin role từ client hoặc decode JWT chưa xác minh. Entry chứa tối thiểu user/session, role có thẩm quyền, trạng thái tài khoản/phiên, hạn và phiên bản chính sách nếu dùng.

```text
PATIENT/DOCTOR:
  deadline = min(jwt.exp, session.idleExpiresAt)
STAFF/ADMIN ACTIVE:
  deadline = min(jwt.exp, session.absoluteExpiresAt, session.lockAt)
cacheExpiresAt = min(now + configuredCacheTTL, deadline)
```

Chuẩn hóa mọi timestamp cùng đơn vị khi so sánh. Cache hit không cập nhật thời gian hoạt động của người dùng, không kéo dài hạn và không chứng minh MFA cho một ca/thao tác mới. Cache miss/hết hạn gọi User Service qua API nội bộ có credential; không có kết quả hợp lệ thì từ chối an toàn bằng lỗi tạm thời phù hợp.

Các trạng thái PENDING_MFA/LOCKED chỉ cho phép những API điều khiển xác thực được liệt kê. Không sử dụng cache chỉ chứa `role` để cho phép nghiệp vụ. Hết deadline phải hỏi lại nguồn có thẩm quyền vì hoạt động hợp lệ có thể đã cập nhật deadline mới; không tự suy luận quyền được gia hạn.

## 3. Invalidation và restart

- Index `userId -> session/token digests` và `sessionId -> token digests` cho phép xóa toàn bộ entry liên quan, kể cả token đã xoay vòng.
- Logout/thu hồi phiên, đổi role, khóa tài khoản hoặc đổi factor phải làm mất hiệu lực quyền chưa tiêu thụ và cache tương ứng. Không chỉ xóa token của request hiện tại.
- Callback hoặc thông điệp invalidation nội bộ phải được xác thực, chống xử lý sai thứ tự; verifier đang chạy không được ghi lại identity cũ sau invalidation. Có thể dùng generation/version hoặc cờ đánh dấu kết quả không còn được cache.
- Trạng thái phiên và thu hồi nằm trong DB User Service; RAM trống sau restart chỉ dẫn tới cache miss. Không biến restart thành login mới, bỏ khóa hoặc gia hạn 8 giờ.
- Với một Gateway, cần hoàn tất invalidation của instance đó trước khi xác nhận thao tác thu hồi đã áp dụng. Khi triển khai nhiều Gateway, phải thiết kế cơ chế truyền invalidation và bảo đảm hiệu lực trước nghiệm thu; chỉ một Map riêng mỗi process không đáp ứng bảo đảm thu hồi toàn hệ thống.

Supabase JWT còn hạn có thể tiếp tục hợp lệ về chữ ký sau logout. User Service cần kiểm tra trạng thái phiên ứng dụng khi xác minh/refresh để token đã bị thu hồi không được đưa lại vào cache.

## 4. Hoạt động và quyền lâm sàng

Hoạt động foreground do client báo được User Service xử lý bằng thời gian server. Có thể gộp ghi, nhưng không bỏ kiểm tra hết hạn/khóa trước cập nhật hoặc biến refresh/polling thành hoạt động. Tần suất gộp và độ chính xác mốc hoạt động cần được đo trước nghiệm thu.

Quyền đọc lâm sàng và bằng chứng chốt do service sở hữu xác minh theo actor/session/ca/bệnh nhân/mục đích/phiên bản. Cache identity không thay thế việc kiểm tra các quyền này. Không cache cho phép dùng một lần theo kiểu chỉ đọc rồi xóa riêng lẻ; tiêu thụ và ghi nghiệp vụ phải chống race/replay trong transaction của service thực thi.

## 5. Cache response nghiệp vụ

Nếu bổ sung cache dữ liệu, key phải gồm actor/phạm vi quyền, endpoint, query chuẩn hóa và các phiên bản dữ liệu/chính sách cần thiết. Không dùng key chỉ theo route hoặc role cho dữ liệu bệnh nhân. Dữ liệu lâm sàng không dùng public/shared cache; response nhạy cảm dùng `Cache-Control: no-store` theo contract.

Sau mutation phải invalidation các list/detail/summary liên quan. Lỗi gọi nguồn không được biến thành danh sách rỗng, thống kê 0 hoặc báo mutation thành công. Chỉ trả snapshot cũ khi endpoint có contract riêng cho dữ liệu stale và thông báo rõ; quyền/thu hồi không được áp dụng stale fallback.

## 6. Vận hành và kiểm chứng

Đo cache hit/miss, số xác minh gộp, timeout, eviction và invalidation; không log token/digest định danh người bệnh hoặc payload nhạy cảm. Không thêm Redis/message broker chỉ để hiện thực bản đầu nếu RAM một Gateway đáp ứng phạm vi triển khai.

Các kiểm chứng cần có: token mới/hết hạn; role/khóa/logout; verifier đang chạy trong lúc invalidation; giới hạn entry; restart; khóa 15 phút/hạn 8 giờ; không giữ cache quyền sau khi ca hoàn tất. Báo cáo kết quả theo snapshot thực thi; tài liệu này chưa phải bằng chứng các kiểm chứng đã pass.
