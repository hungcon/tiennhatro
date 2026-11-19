# Quản lý tiền nhà trọ

Bản Cloudflare dùng một Worker phục vụ React và `/api` trên cùng tên miền. SQLite Durable Object lưu hộ thuê, đơn giá và phiếu thu. Cả hai tài nguyên có hạn mức trong gói Workers Free. [Hạn mức Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/)

## Deploy từ GitHub

1. Tạo hoặc kết nối Worker `tiennhatro-app` với repo GitHub. Đặt **Root directory** tại thư mục chứa `wrangler.jsonc`, dùng `/` nếu đây là gốc repo.
2. Đặt **Build command** thành `npm --prefix frontend ci && npm run build`. Đặt **Deploy command** thành `npm run deploy`.
3. Trong **Settings → Build → Variables and secrets**, thêm `ADMIN_PASSWORD` kiểu **Secret** với mật khẩu quản trị. `npm run deploy` chuyển giá trị này thành secret của Worker. Bạn cũng có thể để trống ở phần Build và đặt secret trực tiếp trong **Settings → Variables and Secrets** của Worker. [Tài liệu Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Tài liệu Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. Push lên nhánh production đã kết nối. Wrangler tự tạo SQLite Durable Object lần đầu. Mở URL của Worker và đăng nhập bằng tên `admin` cùng mật khẩu đã đặt.

Frontend mặc định gọi `/api` trên cùng tên miền. Các lần cập nhật Worker dùng lại cơ sở dữ liệu đã có. Giữ nguyên tên Worker và binding khi deploy bản mới.

## Chạy local

Dùng Node.js 24. Chạy từ thư mục gốc của dự án.

```bash
npm --prefix frontend ci
npm run build
npm run dev -- --var ADMIN_PASSWORD:local-test-only
```

Mở `http://localhost:8787` với tên `admin`, mật khẩu `local-test-only`. Wrangler lưu dữ liệu của phiên local dưới `.wrangler/`.

## Nhập dữ liệu đầu kỳ

Mở **Đầu kỳ** trong menu. Chọn tháng bắt đầu tính phiếu, thêm hộ mới hoặc chọn hộ đã tạo, rồi nhập tiền phòng và chỉ số công tơ điện nước khi bàn giao. Mỗi hộ có thể bắt đầu ở một tháng khác nhau. Danh sách bên dưới hiển thị số liệu đã lưu.

Khi lập phiếu, hệ thống dùng chỉ số bàn giao để tính mức tiêu thụ đầu tiên và áp dụng tiền phòng đầu kỳ cho tháng bắt đầu. Có thể sửa số liệu trong Audit đầu kỳ cho đến khi hộ có phiếu đã nhập chỉ số hoặc ghi nhận thanh toán.

## Sao lưu và khôi phục

Sau khi đăng nhập, mở `/api/backup` để tải bản sao lưu JSON gồm đơn giá, hộ thuê, dữ liệu đầu kỳ và phiếu thu. Để khôi phục vào Worker còn trống, gửi tệp sao lưu qua `/api/import`. `curl` sẽ hỏi mật khẩu quản trị.

```bash
curl --fail-with-body --user admin \
  --header 'Content-Type: application/json' \
  --data-binary @tiennhatro.backup.json \
  'https://tiennhatro-app.YOUR_SUBDOMAIN.workers.dev/api/import'
```

Tệp tối đa 4 MiB. API kiểm tra dữ liệu và từ chối toàn bộ lần nhập nếu phát hiện phiếu trùng theo hộ và kỳ. Sau khi khôi phục, đối chiếu danh sách đầu kỳ, số phiếu và tổng tiền với bản sao lưu.
