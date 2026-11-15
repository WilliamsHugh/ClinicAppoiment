# Tài liệu lịch sử M3

Chuyển khỏi thư mục tài liệu đang dùng ngày 15/11/2026. Kế hoạch mới ở [web-ui-parallel-tasks.md](../../web-ui-parallel-tasks.md), danh mục hợp đồng ở [docs/README.md](../../README.md).

| Nhóm | Tài liệu | Lý do lưu trữ |
|---|---|---|
| Kế hoạch cũ | [Nghiệm thu cuối tuần](web-ui-weekend-acceptance-plan-m3.md), [phân công nghiệm thu](web-ui-weekend-acceptance-tasks-m3.md), [remediation](web-ui-remediation-plan-m3.md), [phân công M3](team-task-assignment-m3.md) | Dùng baseline/nhánh cũ và checklist trùng; thay bằng kế hoạch UI hiện tại. Phần Flutter trong phân công cũ giữ để tra cứu, không coi là đã xong |
| Handoff đã tích hợp | [Tổng hợp TV3](tv3-m3-handoff.md), [directory](tv3-m3-doctor-directory.md), [calendar](tv3-m3-doctor-calendar.md), [booking](tv3-m3-booking-confirmation.md), [appointment list](tv3-m3-appointment-list.md), [queue](tv3-m3-queue-board.md) | Bằng chứng lịch sử ở SHA cũ; không giao lại task như công việc mới |
| Đề xuất kiến trúc cũ | [Architecture improvements](architecture-improvements.md) | Mô tả chưa có cache/UI, đề xuất Redis/JWKS/broker và số liệu không còn phù hợp quyết định hiện tại. Chưa được chấp nhận làm kiến trúc mới |

Nội dung lịch sử giữ nguyên ngoài banner và đường dẫn đã di chuyển. Không suy từ tài liệu này rằng PostgreSQL/E2E đã được nghiệm thu. Các ràng buộc hiện hành nằm trong rules, API contract và UI contract ở thư mục `docs/`.
