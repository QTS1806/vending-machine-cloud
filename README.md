# PHỤ LỤC C: SOURCE CODE

## Đề tài

**Hệ thống máy bán hàng tự động sử dụng ESP32, nhận diện tiền bằng YOLO và quản lý từ xa qua Web**

## Thành viên nhóm

| Họ và tên | Mã sinh viên |
| --- | --- |
| Nguyễn Văn Quân | 22021511 |
| Nguyễn Bình Minh | 22021504 |
| Nguyễn Việt Tiến | 22021500 |

## Link triển khai

Web dashboard:

```text
https://vending-machine-cloud.vercel.app
```

Source code GitHub:

```text
https://github.com/QTS1806/vending-machine-cloud
```

## Mục đích của repository

Repository này lưu các phần source code chính của hệ thống máy bán hàng tự động trong đồ án, bao gồm:

- Firmware ESP32 điều khiển máy bán hàng.
- Giao diện Web quản lý máy bán hàng.
- Cấu trúc cơ sở dữ liệu Supabase.
- Tài liệu tích hợp app Python YOLO nhận diện tiền.

Không đưa toàn bộ source code vào báo cáo Word. Báo cáo chỉ trích các đoạn code quan trọng và dẫn link GitHub này tại phần phụ lục.

## Cấu trúc thư mục

```text
vending-machine-cloud
├─ firmware/
│  └─ may_ban_hang_cloud/
│     ├─ may_ban_hang_cloud.ino
│     └─ secrets.example.h
├─ supabase/
│  ├─ schema.sql
│  ├─ add_total_refunded.sql
│  └─ fix_touch_trigger.sql
├─ web/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  └─ styles.css
│  ├─ package.json
│  └─ vite.config.js
├─ python/
│  └─ README.md
├─ README.md
└─ vercel.json
```

## Các file quan trọng

| File/Thư mục | Vai trò |
| --- | --- |
| `firmware/may_ban_hang_cloud/may_ban_hang_cloud.ino` | Firmware ESP32 điều khiển máy bán hàng, đọc cảm biến/nút bấm, điều khiển relay/motor và đồng bộ Supabase |
| `firmware/may_ban_hang_cloud/secrets.example.h` | File mẫu cấu hình WiFi và Supabase cho ESP32 |
| `supabase/schema.sql` | Tạo bảng dữ liệu, policy, index và dữ liệu mẫu cho Supabase |
| `web/src/App.jsx` | Logic chính của Web dashboard |
| `web/src/styles.css` | Giao diện và bố cục Web dashboard |
| `web/package.json` | Danh sách thư viện và script chạy Web |
| `python/README.md` | Ghi chú cách app Python YOLO giao tiếp với ESP32 |

## Luồng hoạt động chính

```mermaid
flowchart LR
  User["Người dùng"] --> Machine["Máy bán hàng"]
  Camera["Camera"] --> Python["App Python YOLO"]
  Python -->|"Serial: #HOPLE:<amount>"| ESP32["ESP32"]
  ESP32 -->|"money_events, sales, machine_events"| Supabase["Supabase"]
  Web["Web dashboard"] -->|"machine_commands"| Supabase
  Supabase -->|"REST API"| ESP32
  Supabase -->|"Dữ liệu quản lý"| Web
```

Mô tả ngắn:

1. Người dùng đưa tiền vào máy.
2. ESP32 gửi `#START` cho app Python.
3. Python nhận diện tiền bằng YOLO và gửi `#HOPLE:<amount>` về ESP32 nếu hợp lệ.
4. ESP32 xử lý số dư, bán hàng, hoàn tiền và điều khiển động cơ.
5. ESP32 ghi dữ liệu lên Supabase.
6. Web dashboard đọc dữ liệu Supabase và hiển thị doanh thu, tồn kho, lịch sử bán hàng, tiền và cảnh báo.
7. Khi người quản trị sửa cấu hình trên Web, Web tạo lệnh trong `machine_commands`; ESP32 đọc lệnh và cập nhật cấu hình local.

## Cơ sở dữ liệu Supabase

Các bảng chính:

| Bảng | Chức năng |
| --- | --- |
| `machines` | Thông tin máy, trạng thái online/offline, số dư, doanh thu, tiền đã nhận/trả lại |
| `products` | Danh sách sản phẩm theo từng máy và từng slot |
| `sales` | Lịch sử bán hàng |
| `money_events` | Lịch sử tiền vào/tiền ra |
| `machine_events` | Nhật ký máy và cảnh báo |
| `machine_commands` | Lệnh cấu hình từ Web gửi xuống ESP32 |

Chạy schema ban đầu trong Supabase SQL Editor:

```text
supabase/schema.sql
```

## Chạy Web ở máy local

Yêu cầu:

- Node.js
- npm
- Supabase project

Tạo file:

```text
web/.env
```

Theo mẫu:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Chạy Web:

```bash
cd web
npm install
npm run dev
```

Mở:

```text
http://127.0.0.1:5173
```

## Deploy Web lên Vercel

Web được deploy bằng Vercel. Khi deploy cần cấu hình Environment Variables:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Build kiểm tra:

```bash
cd web
npm run build
```

## Nạp firmware ESP32

Mở file:

```text
firmware/may_ban_hang_cloud/may_ban_hang_cloud.ino
```

Tạo file cấu hình riêng:

```text
firmware/may_ban_hang_cloud/secrets.h
```

Dựa trên mẫu:

```text
firmware/may_ban_hang_cloud/secrets.example.h
```

Ví dụ cấu trúc:

```cpp
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char *SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const char *SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
const char *MACHINE_ID = "vending-001";
```

Thư viện Arduino cần cài:

- ESP32 board package
- ArduinoJson
- LiquidCrystal_I2C

Serial Monitor:

```text
115200 baud
```

## Mở rộng thêm máy bán hàng

Mỗi máy cần một `MACHINE_ID` riêng:

```cpp
const char *MACHINE_ID = "vending-002";
```

Web và database tách dữ liệu theo `machine_id`, vì vậy có thể mở rộng thêm nhiều máy như:

```text
vending-001
vending-002
vending-003
```

## Ghi chú bảo mật

Repository public không chứa:

- `web/.env`
- `firmware/may_ban_hang_cloud/secrets.h`
- WiFi password thật
- Supabase key thật

Các file cấu hình thật chỉ nên lưu ở máy cá nhân hoặc trong Environment Variables của Vercel.

## Phạm vi đồ án

Repository phục vụ mục đích học tập và báo cáo đồ án. Hệ thống hiện ở mức mô hình thử nghiệm, tập trung kiểm chứng:

- Điều khiển máy bán hàng bằng ESP32.
- Nhận diện tiền bằng YOLO qua app Python.
- Ghi nhận dữ liệu lên Supabase.
- Quản lý máy bán hàng qua Web dashboard.
- Deploy Web bằng Vercel.

Nếu triển khai thực tế, cần bổ sung đăng nhập, phân quyền, bảo mật API và cơ chế xác thực thiết bị.

