# Vận hành chế độ bảo trì

Chế độ bảo trì chặn toàn bộ trang thông thường và API nghiệp vụ bằng HTTP 503. Static asset, `/api/health`, và luồng điều khiển dành cho phiên owner/admin vẫn hoạt động. BullMQ worker tiếp tục xử lý job và không đọc trạng thái bảo trì.

## Bật bảo trì từ trang quản trị

1. Đăng nhập bằng tài khoản có vai trò `owner` hoặc `admin` trước khi bật bảo trì.
2. Mở trang **Quản trị**.
3. Chọn **Chế độ bảo trì** để mở `/maintenance-control`.
4. Nhập tiêu đề, thông báo và thời gian hoạt động lại dự kiến nếu có.
5. Kiểm tra phần xem trước dành cho khách truy cập.
6. Chọn **Bật bảo trì**.
7. Đọc cảnh báo và xác nhận. Website bắt đầu trả HTTP 503 trong tối đa khoảng hai giây.

Trong lúc bảo trì, giữ nguyên phiên đăng nhập. Bạn vẫn có thể mở `/maintenance-control` để sửa nội dung hoặc tắt bảo trì. Nếu phiên hết hạn, dùng terminal theo phần dưới.

## Tắt bảo trì từ trang quản trị

1. Mở `/maintenance-control` bằng phiên owner/admin đã có từ trước.
2. Chọn **Tắt bảo trì**.
3. Mở lại một trang thông thường để xác nhận website hoạt động.

Thao tác tắt không yêu cầu xác nhận lần hai.

## Điều khiển bằng terminal

Chạy lệnh tại thư mục gốc của dự án. CLI đọc `.env.local` và kết nối trực tiếp tới Redis, vì vậy không cần web server hoạt động.

Kiểm tra trạng thái Redis và trạng thái hiệu lực:

```powershell
npm run maintenance -- status
```

Bật với nội dung hiện có hoặc nội dung mặc định:

```powershell
npm run maintenance -- on
```

Bật và đặt nội dung cụ thể:

```powershell
npm run maintenance -- on --title "Đang nâng cấp" --message "Vui lòng quay lại sau" --until "2026-07-21T18:00:00+07:00"
```

Tắt ngay:

```powershell
npm run maintenance -- off
```

Lệnh trả exit code khác 0 nếu tham số sai, Redis không ghi được, hoặc biến môi trường đang khóa trạng thái.

## Khóa khẩn cấp bằng biến môi trường

Đặt các biến sau trên tiến trình web hoặc nền tảng triển khai:

```dotenv
MAINTENANCE_MODE=true
MAINTENANCE_TITLE=Hệ thống đang được bảo trì
MAINTENANCE_MESSAGE=Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.
MAINTENANCE_UNTIL=2026-07-21T18:00:00+07:00
```

`MAINTENANCE_MODE=true`, `1`, `yes`, hoặc `on` có ưu tiên cao hơn Redis. Admin và CLI không thể tắt trạng thái hiệu lực khi override này đang bật. Để khôi phục:

1. Đặt `MAINTENANCE_MODE=false` hoặc xóa biến.
2. Khởi động lại hoặc redeploy tiến trình web để biến mới có hiệu lực.
3. Chạy `npm run maintenance -- status` để kiểm tra.
4. Nếu bản ghi Redis vẫn đang bật, chạy `npm run maintenance -- off`.

## Khi Redis gặp sự cố

- Tiến trình đã đọc được trạng thái sẽ dùng bản last-known gần nhất.
- Tiến trình mới chưa có snapshot sẽ fail open về trạng thái tắt, trừ khi `MAINTENANCE_MODE` đang ép bật.
- Client bảo trì dùng timeout ngắn và không retry vô hạn, nên request không bị treo theo Redis.
- Nếu cần bảo trì chắc chắn trong lúc Redis lỗi, dùng environment override và restart tiến trình web.

## Allowlist khi bảo trì

Luôn được phép:

- `/_next/*` và file tĩnh.
- `/favicon.ico`, `/robots.txt`, `/sitemap.xml`.
- `/api/health` và route con.

Chỉ được chuyển tiếp khi có cookie phiên `autowin_session`; route đích vẫn xác thực quyền đầy đủ:

- `/maintenance-control`.
- `/api/admin/maintenance`.
- `/api/auth/me`.
- `/api/auth/logout`.

Login mới không hoạt động trong thời gian bảo trì. Nếu không còn phiên owner/admin, terminal là đường khôi phục chính.
