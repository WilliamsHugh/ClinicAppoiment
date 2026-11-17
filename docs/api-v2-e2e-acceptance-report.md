# Báo cáo trạng thái nghiệm thu API v2 và E2E

**Ngày rà soát:** 17/11/2026
**Nhánh backend:** `test/m2-integration-005-api-v2-clinic-workflow`
**HEAD backend tại rà soát:** `bec6e93369c66ba532439c3e216d36a3f717b088`
**Trạng thái:** `BACKEND INTEGRATION EVIDENCE AVAILABLE; PRODUCT E2E NOT ACCEPTED`

## Kết luận

Mã nguồn có kiểm thử unit/contract, PostgreSQL integration, kiểm tra OpenAPI và runner gửi request HTTP qua API Gateway. Tuy nhiên, runner Phase 5 khởi tạo các upstream Express tổng hợp với dữ liệu trong bộ nhớ; nó không khởi chạy năm business service thật hoặc ứng dụng Flutter/Web. Vì vậy, kết quả 6/6 scenario của runner chỉ chứng minh luồng Gateway với upstream giả lập, không phải E2E của sản phẩm qua các service và database thật.

Chưa có bằng chứng trong bộ tài liệu này rằng Flutter PATIENT và Next.js management Web đã chạy trên cùng một bộ revision tương thích qua Gateway tới các service thật. **Không nghiệm thu E2E toàn sản phẩm ở revision này.**

## Bằng chứng đã có và giới hạn

| Lớp | Bằng chứng được ghi nhận | Phạm vi kết luận |
|---|---|---|
| Backend build, lint, unit, contract | Báo cáo cũ ghi các lệnh và kết quả; lượt rà soát tài liệu/source này không chạy lại suite | Chỉ xem là kết quả được báo cáo, chưa tái xác minh lần này |
| PostgreSQL integration | Báo cáo cũ ghi 27/27 trên DB disposable | Bằng chứng test repository/service với PostgreSQL; không chứng minh toàn ứng dụng |
| OpenAPI/Swagger | Runner kiểm tra 6 endpoint tiến trình, báo cáo ghi 18/18 | Chỉ xác nhận tài liệu OpenAPI/Swagger trên các tiến trình được kiểm tra |
| Gateway HTTP synthetic | `test/run-phase5-live.mjs` dựng Gateway cùng năm upstream Express trong test process; dữ liệu dùng `Map` | Có ích để kiểm tra định tuyến và hành vi Gateway với fixture; upstream không phải service runtime thật |
| Web và Flutter | Bộ test Flutter hiện có là unit/widget; không thấy `integration_test/` trong snapshot được rà soát. Runner không mở giao diện client | Chưa có E2E từ giao diện người dùng |

Lệnh `npm run test:live-e2e -w @clinic/openapi-contract-tests` chạy runner tổng hợp, không thay cho smoke test qua các service thật. Xem [runner](../packages/openapi-contract-tests/test/run-phase5-live.mjs) và [hướng dẫn live smoke](../packages/openapi-contract-tests/LIVE-SMOKE-GUIDE.md).

## Giới hạn của con số tổng

Không dùng tổng `621/621` trong báo cáo cũ như số test duy nhất. Bảng cũ cộng 104 contract tests rồi cộng lại các nhóm con 18 OpenAPI và 6 synthetic flows. Các test tổng hợp phải được báo cáo theo suite, kèm số liệu không chồng lặp nếu cần tổng.

## Revision cần chốt cho lần nghiệm thu kế tiếp

Báo cáo cũ ghi frontend `bbd251a`; repo frontend đang có thay đổi chưa commit tại thời điểm rà soát. Không coi SHA đó là bằng chứng một bản build UI đã được kiểm thử chung với backend `bec6e93`. Lần nghiệm thu mới phải ghi commit hoặc snapshot rõ ràng cho cả hai repo/worktree, trạng thái dirty, migration/database fixture, lệnh, exit code, pass/fail/skip và artifacts đã loại bỏ credential/PHI.

## Điều kiện để nâng lên E2E ACCEPTED

1. Chạy Gateway và năm business service thật, cấu hình các URL nội bộ qua env test; xác nhận health/readiness và database riêng của từng service.
2. Chạy các luồng bắt buộc từ Next.js cho DOCTOR/STAFF/ADMIN và từ Flutter cho PATIENT. Mọi request public phải đi qua Gateway.
3. Dùng tài khoản và dữ liệu tổng hợp trên database disposable; kiểm tra persistence, quyền actor/session/resource, idempotency, outbox và side effects.
4. Ghi kết quả cho từng hành trình, không suy diễn PASS từ mock/harness hoặc test service đơn lẻ.
5. Chạy lại regression Web/Flutter và kiểm tra không làm lệch UI đã duyệt.

Task thực hiện phần còn thiếu được ghi tại [`m2-integration-006-live-e2e-task.md`](m2-integration-006-live-e2e-task.md). Bản báo cáo nghiệm thu trước khi hiệu chỉnh được lưu trong [`archive/m2-2026-11-17`](archive/m2-2026-11-17/README.md).
