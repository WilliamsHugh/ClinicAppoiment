# Bàn giao M2-INTEGRATION-005

**Ngày cập nhật:** 17/11/2026
**Branch:** `test/m2-integration-005-api-v2-clinic-workflow`
**HEAD:** `bec6e93369c66ba532439c3e216d36a3f717b088` (`feat(integration): complete Phase 5 live OpenAPI and synthetic E2E runner and acceptance report`)
**Working tree tại lúc cập nhật tài liệu:** sạch trước các sửa đổi tài liệu hiện tại.

## Trạng thái bàn giao

M2-INTEGRATION-005 đã tích hợp backend và bổ sung kiểm thử Gateway tổng hợp. Các báo cáo trước ghi build/lint, unit/contract, PostgreSQL disposable integration và OpenAPI checks đạt; lần cập nhật này **không chạy lại các test đó**.

Runner Phase 5 đi qua HTTP Gateway nhưng tự dựng năm upstream Express fixture và dùng store trong RAM. Vì thế kết quả runner không xác nhận năm service thật, database thật hoặc giao diện Flutter/Web. Trạng thái phù hợp là **backend integration evidence available; product E2E not accepted**.

## Những gì bàn giao được

- Backend integration branch và các commit domain đã tích hợp đến HEAD nêu trên.
- `test/run-phase5-live.mjs`: kiểm tra Gateway với upstream tổng hợp; dùng cho regression Gateway, không đặt nhãn live service E2E.
- PostgreSQL integration suites: kết quả 27/27 được ghi trong báo cáo trước; chưa tái chạy ở lần rà soát tài liệu này.
- `LIVE-SMOKE-GUIDE.md`: đã được chỉnh để phân biệt contract/synthetic/live-service evidence.
- Báo cáo trạng thái hiện hành: [`api-v2-e2e-acceptance-report.md`](api-v2-e2e-acceptance-report.md).

## Việc còn lại

Chưa có bằng chứng chạy Web và Flutter qua Gateway tới năm service thật trên cùng bộ revision; cũng chưa có báo cáo live cho các side effect trong database/outbox. Không dùng `ACCEPTED`, `100% E2E` hoặc `live E2E verified` cho toàn sản phẩm ở trạng thái này.

Tiếp tục theo task [`M2-INTEGRATION-006`](m2-integration-006-live-e2e-task.md). Task yêu cầu giữ nguyên các thay đổi frontend đang có, làm việc trong worktree riêng, chỉ commit local và không push/merge.

## Lịch sử

Bản handoff trước khi hiệu chỉnh được lưu tại [`archive/m2-2026-11-17/m2-integration-005-handoff-2026-11-17.md`](archive/m2-2026-11-17/m2-integration-005-handoff-2026-11-17.md). Bản đó là snapshot lịch sử, không phải trạng thái nghiệm thu hiện tại.
