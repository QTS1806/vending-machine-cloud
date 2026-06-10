# Vending Machine Cloud

Web dashboard for an ESP32 vending machine with Supabase and Vercel.

## What It Does

- Manages multiple vending machines by `machine_id`.
- Shows sold quantity, revenue, money accepted, stock, and machine heartbeat.
- Edits product name, price, stock, capacity, and enabled state from the web.
- Sends commands to ESP32 through Supabase.
- ESP32 updates Supabase after money is accepted and after a product is sold.
- Existing Python YOLO app can keep sending `#HOPLE:<amount>` to ESP32 over Serial.

## Project Files

- `supabase/schema.sql`: database tables, policies, indexes, seed machine/products.
- `web`: Vite React dashboard, ready for Vercel.
- `firmware/may_ban_hang_cloud.ino`: ESP32 firmware based on your current vending code.
- `python/README.md`: optional Python YOLO Supabase logging patch.

## 1. Supabase Setup

Open Supabase SQL Editor and run:

```text
supabase/schema.sql
```

This creates:

- `machines`
- `products`
- `sales`
- `money_events`
- `machine_events`
- `machine_commands`

It also creates demo machine `vending-001` with 4 product slots.

## 2. Run Web Locally

```bash
cd "C:\Users\Nguyen Van Quan\Documents\vending-machine-cloud\web"
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The local `.env` is already filled for your current Supabase project.

## 3. Upload ESP32 Firmware

Open:

```text
firmware/may_ban_hang_cloud.ino
```

Install Arduino libraries:

- ArduinoJson
- LiquidCrystal_I2C
- ESP32 board package

Upload to ESP32 and open Serial Monitor at `115200`.

Expected logs:

```text
#WIFI:IP:...
#OK:CLOUD_SP:...
```

When Python detects a bill, it still sends:

```text
#HOPLE:10000
```

ESP32 will accept the bill, update local credit, and insert a row into `money_events`.

## 4. Test Web-to-ESP32 Config

1. Open the dashboard.
2. Change price or stock for `SP1`.
3. Click `Lưu`.
4. Wait up to 5 seconds.
5. ESP32 Serial Monitor should show:

```text
#OK:CLOUD_SP:1,<price>,<stock>
```

The command row in web tab `Lệnh` should become `done`.

## 5. Test Sale Flow

1. Run Python YOLO app and connect COM.
2. Insert a bill.
3. ESP32 accepts money and Supabase gets a `money_events` row.
4. Buy a product on keypad.
5. Supabase gets a `sales` row.
6. Web revenue, sold quantity, and stock update.

## 6. Deploy Web to Vercel

```bash
cd "C:\Users\Nguyen Van Quan\Documents\vending-machine-cloud\web"
npx vercel --prod
```

In Vercel project settings, set Production Environment Variables:

```env
VITE_SUPABASE_URL=https://vjbmzmzdjsahyegnutne.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_lGCGKWhEl7g1pqcZCknoSg_c9lcG_8_
```

## Adding More Machines

For each new ESP32:

1. Change this in firmware:

```cpp
const char *MACHINE_ID = "vending-002";
```

2. Upload to the new ESP32.
3. Add `vending-002` from the web dashboard, or let ESP32 bootstrap it.

All data is separated by `machine_id`.

## Production Notes

The demo schema allows anon read/write for fast testing. Before real deployment:

- Add admin login.
- Do not allow public anon write to all tables.
- Move ESP32 writes through Supabase Edge Functions or signed device tokens.
- Avoid putting WiFi passwords and long-term keys directly in firmware for machines outside your lab.

