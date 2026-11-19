# Backend quản lý nhà trọ

Express + MongoDB lưu hộ thuê, đơn giá và phiếu thu theo tháng.

Khi dùng Docker, khởi động các dịch vụ từ thư mục gốc:

```bash
docker compose up --build -d
docker compose exec backend npm run import:excel
```

Lệnh `import:excel` đọc file `../../tiennhatro.xlsx`, tạo hộ/phiếu theo các khối tháng trong Excel và chỉ dọn các hộ mẫu có tên dạng `Household 1`. Chạy lại lệnh sẽ không tạo trùng phiếu cùng hộ, tháng, năm.

Các API chính: `/api/config/prices`, `/api/households`, `/api/bills`, `/api/dashboard`.
