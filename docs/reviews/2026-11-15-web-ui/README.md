# Bằng chứng rà UI ngày 15/11/2026

Các ảnh ghi lại **UI hiện tại**, không phải bản thiết kế mới hoặc bằng chứng API v2 đã triển khai.

Frontend source: `b1d3113bd595be6a46071ec20f3d086e369a8e5e`, nhánh `feat/m3-ui-acceptance-integrated`. Chạy Next.js development trên localhost; chụp bằng Chrome thông qua `design-taste-frontend/scripts/shoot.mjs`. Không dùng tài khoản thật, database thật hoặc dữ liệu bệnh nhân thật. Biểu tượng Next development trong ảnh không thuộc UI production.

## Phạm vi ảnh

| Ảnh | Viewport | Nguồn dữ liệu |
|---|---|---|
| [Trang chủ](home-live-1440.png) | 1440×900, ghép toàn trang cao 4087px | Frontend trực tiếp; nội dung tĩnh sẵn có, chưa xác minh các claim |
| [Đăng nhập desktop](auth-live-1440.png) | 1440×900 | Frontend trực tiếp; không gửi login |
| [Đăng nhập mobile](auth-live-390.png) | 390×844 | Frontend trực tiếp; không gửi login |
| [Tổng quan bác sĩ](dashboard-doctor-fixture-1440.png) | 1440×900 | Fixture DOCTOR |
| [Lịch hẹn desktop](appointments-staff-fixture-1440.png) | 1440×900 | Fixture STAFF |
| [Lịch hẹn mobile](appointments-staff-fixture-390.png) | 390×844 | Fixture STAFF |
| [Bác sĩ và lịch làm việc](doctors-admin-fixture-1440.png) | 1440×900 | Fixture ADMIN |
| [Hồ sơ khám](medical-records-doctor-fixture-1440.png) | 1440×900 | Fixture DOCTOR, chưa chọn ca |
| [Hồ sơ cá nhân](profile-admin-fixture-1440.png) | 1440×900 | Fixture ADMIN |

“Fixture” nghĩa là một proxy local phục vụ HTML/assets Next.js và chèn session giả trong profile Chrome riêng, chặn fetch `/api/v1/*` để trả JSON mô phỏng. Request mutation bị từ chối; không forward tới backend. Có bốn ca mô phỏng cùng ngày, tên “Người bệnh mô phỏng”, bác sĩ/chuyên khoa mô phỏng và profile `review@example.invalid`. Các con số hoặc trạng thái khỏe giả phục vụ bố cục, không phải kết quả đo sức khỏe hệ thống.

Thông báo, quản lý tài khoản và health được rà source/contract; chưa chụp giao diện các route đó. Không suy rộng ảnh desktop sang mọi breakpoint hoặc từ fixture sang hành vi phân quyền thực tế. Screenshot không kiểm chứng cuộn, bàn phím, gửi form hay DB; cần kiểm thử riêng khi triển khai.

## Detector và đọc kết quả

Lệnh đã chạy một lần:

```sh
/home/Williams/.codex/skills/impeccable/scripts/impeccable detect --json apps/clinic-management-web
```

Exit 2 do có finding; [JSON gốc](impeccable-source-findings.json) gồm 7 warning, 0 error ở hai nhóm rule. Hai cảnh báo font Inter không áp dụng vì đây là font bắt buộc của dự án. Năm cảnh báo viền trái thuộc các trạng thái lịch hẹn, banner FINAL và thông báo chưa đọc; cần đánh giá theo ngữ nghĩa và label, không coi việc detector phát hiện là lỗi thiết kế tự động. Detector không chứng minh accessibility hoặc bảo mật đã đạt.

Tổng hợp đề xuất và việc cần kiểm chứng ở [web-ui-redesign-proposal.md](../../web-ui-redesign-proposal.md). Hai lượt rà độc lập đọc source/ảnh bổ sung cho đánh giá; không có test E2E hệ thống thật trong lượt này. Không chấm điểm hoặc công bố gate triển khai đã pass.
