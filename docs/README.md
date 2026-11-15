# Tài liệu đang sử dụng

## Hợp đồng và kiến trúc

| Tài liệu | Vai trò |
|---|---|
| [Quy tắc repository](../.agents/rules.md) | Kiến trúc, ranh giới platform, bảo vệ dữ liệu và phối hợp |
| [API hiện hành](api-contract.md) | Baseline v1 để kiểm tra tương thích triển khai |
| [API đích v2](api-contract-v2.md) | Chính sách phiên, MFA và nghiệp vụ đã chốt; phân biệt API có/mới/thay đổi, chưa tuyên bố đã triển khai |
| [Thiết kế cache backend](backend-cache-design.md) | Chi tiết kỹ thuật cache, độc lập với giao diện HTTP |
| [UI Design Contract](ui-design-contract.md) | Nhận diện, tokens và quy tắc UI đã duyệt |
| [Web Rendering Contract](web-rendering-contract.md) | Header ổn định, skeleton chỉ dữ liệu, loading/error theo vùng |
| [System Design](system-design.md) | Kiến trúc nền; phần snapshot cũ phải đối chiếu rules/API đích trước thay đổi |

## Công việc hiện tại

- [Bàn giao cho agent tiếp theo](web-ui-agent-handoff-2026-11-15.md): trạng thái checkpoint, SHA/checkout, việc chưa tích hợp và thứ tự tiếp tục.
- [Phân công UI song song](web-ui-parallel-tasks.md): task, owner, nhánh, phạm vi file, dependency và kết quả kiểm tra của đợt hiện tại.
- [Đề xuất tổ chức lại UI](web-ui-redesign-proposal.md): thiết kế từng trang và ma trận API.
- [Audit FE–BE ngày 14/11](project-audit-report.md): bằng chứng theo SHA; không tự cập nhật kết quả test khi source thay đổi.
- [Ảnh rà UI ngày 15/11](reviews/2026-11-15-web-ui/README.md): snapshot trước chỉnh sửa, có ghi rõ fixture và giới hạn.

## Tài liệu đã nghỉ sử dụng

[Thư mục lưu trữ](archive/m3-2026-11-15/README.md) chứa các kế hoạch nghiệm thu, phân công cũ và handoff đã tích hợp. Các tài liệu này không phải backlog đang chạy. Lưu lại để truy nguyên quyết định; không dùng các checklist “đã xong” cũ làm bằng chứng nghiệm thu phiên bản hiện tại.
