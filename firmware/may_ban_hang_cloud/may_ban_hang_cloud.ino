#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>
#include "secrets.h"

LiquidCrystal_I2C lcd(0x27, 16, 2);

const char *FIRMWARE_VERSION = "cloud-0.1";

// Local vending logic always has priority. Cloud only runs while the machine is idle.
const bool CLOUD_ENABLED = true;
const bool DEBUG_KEYS = false;

// Bang tai nhan tien
#define IN1 4
#define IN2 2
#define IR_DAU 14
#define IR_CUOI 27

// Máy bán hàng
#define RL1 23
#define RL2 19
#define RL3 18
#define RL4 5

#define IR_MOTOR_DUOI 13
#define IR_MOTOR_TREN 15

const byte row = 3;
const byte col = 3;

const byte rowPin[row] = {32, 35, 34};
const byte colPin[col] = {26, 25, 33};

const char key[row][col] =
{
  {'1', '2', '3'},
  {'4', '5', '6'},
  {'7', '8', '9'}
};

const int soSanPham = 4;
const int relaySP[5] = {0, RL1, RL2, RL3, RL4};
const int camBienMotorSP[5] = {0, IR_MOTOR_DUOI, IR_MOTOR_DUOI, IR_MOTOR_TREN, IR_MOTOR_TREN};

long giaSP[5] = {0, 10000, 10000, 10000, 10000};
int soLuongSP[5] = {0, 4, 4, 4, 4};
bool sanPhamBat[5] = {false, true, true, true, true};

const long GIA_MIN = 5000;
const long GIA_MAX = 500000;
const long GIOI_HAN_TIEN = 1000000;
const int SO_LUONG_MIN = 0;
const int SO_LUONG_MAX = 4;

const unsigned long THOI_GIAN_DI_THEM_TIEN = 3000;
const unsigned long THOI_GIAN_LUI_THEM_TIEN = 3000;
const unsigned long THOI_GIAN_DOI_TIEN_VE = 1500;
const unsigned long THOI_GIAN_MOTOR_SP_TOI_DA = 4000;
const unsigned long THOI_GIAN_MOTOR_SP_THEM = 200;
const unsigned long THOI_GIAN_THONG_BAO = 2000;
const unsigned long THOI_GIAN_CHONG_DOI_PHIM = 200;
const unsigned long CLOUD_BOOT_DELAY_MS = 1000;
const unsigned long CLOUD_IDLE_MS = 1000;
const unsigned long CLOUD_HEARTBEAT_MS = 5000;
const unsigned long CLOUD_COMMAND_POLL_MS = 3000;
const unsigned long CLOUD_HTTP_TIMEOUT_MS = 4000;
const unsigned long CLOUD_ERROR_PAUSE_MS = 60000;
const unsigned long WIFI_RETRY_MS = 10000;

enum TrangThaiTien
{
  TIEN_CHO,
  TIEN_DANG_DI,
  TIEN_DI_THEM,
  TIEN_DANG_LUI,
  TIEN_LUI_THEM,
  TIEN_DOI_VE
};

enum TrangThaiBanHang
{
  BAN_HANG_CHO,
  BAN_HANG_DANG_QUAY,
  BAN_HANG_QUAY_THEM,
  BAN_HANG_XONG,
  BAN_HANG_LOI
};

enum CheDoMay
{
  CHE_DO_BAN_HANG,
  CHE_DO_XAC_NHAN_HOAN_TIEN,
  CHE_DO_CHON_SP_SUA_GIA,
  CHE_DO_SUA_GIA,
  CHE_DO_CHON_SP_SO_LUONG,
  CHE_DO_SUA_SO_LUONG
};

TrangThaiTien trangThaiTien = TIEN_CHO;
TrangThaiBanHang trangThaiBanHang = BAN_HANG_CHO;
CheDoMay cheDoMay = CHE_DO_BAN_HANG;

unsigned long mocTien = 0;
unsigned long mocBanHang = 0;
unsigned long mocThongBao = 0;
unsigned long mocPhim = 0;
unsigned long mocCloudHeartbeat = 0;
unsigned long mocCloudCommand = 0;
unsigned long mocWifi = 0;
unsigned long mocHoatDongLocal = 0;
unsigned long tamDungCloudDen = 0;
unsigned long mocLogWifi = 0;

bool dangThongBao = false;
bool dangGiuPhim = false;
bool dangDoiTienVe = false;
bool daRoiKhoiCamBienMotor = false;
bool daBaoGioiHanTien = false;
bool daCloudBootstrap = false;
bool daTaiTrangThaiMayTuCloud = false;
bool daTaiCauHinhTuCloud = false;
int soLoiCloudLienTiep = 0;
wl_status_t trangThaiWifiCu = WL_IDLE_STATUS;

long tienDangCo = 0;
long tienMoiNhan = 0;
int sanPhamDangChon = 0;
int sanPhamDangBan = 0;

int spDangCaiDat = 0;
long giaTam = 0;
int soLuongTam = 0;

String chuoiSerial = "";

long tongDoanhThuMay = 0;
long tongTienHopMay = 0;
long tongTienDaTraLai = 0;
int tongSanPhamDaBan = 0;

volatile bool coTienCanGuiCloud = false;
volatile long tienCanGuiCloud = 0;

volatile bool coBanHangCanGuiCloud = false;
volatile int spCanGuiCloud = 0;
volatile long giaCanGuiCloud = 0;
volatile long tienTruocCanGuiCloud = 0;
volatile long tienSauCanGuiCloud = 0;
volatile bool coSanPhamCanGuiCloud[5] = {false, false, false, false, false};
volatile bool coEventCanGuiCloud = false;
String eventTypeCanGuiCloud = "";
String eventSeverityCanGuiCloud = "info";
String eventMessageCanGuiCloud = "";
long eventAmountCanGuiCloud = -1;
int eventSlotCanGuiCloud = 0;

TaskHandle_t cloudTaskHandle = nullptr;

void cloudTask(void *parameter);
void xuLyCloud(unsigned long now);
bool coDuLieuLocalChoGuiCloud();
bool cloudBootstrap();
bool cloudFetchMachineStateFromWeb();
bool cloudFetchProductsFromWeb();
void cloudUpsertProduct(int sp);
void queueProductCloudSync(int sp);
bool cloudSendPendingProductSync();
void queueCloudEvent(const String &eventType, const String &severity, const String &message, long amount = -1, int slot = 0);
bool cloudLogEvent(const String &eventType, const String &severity, const String &message, long amount = -1, int slot = 0);
bool cloudSendPendingEvent();
bool cloudApplyProductPayload(JsonVariant payload);
void hoanTienChoKhach();

void setup()
{
  Serial.begin(115200);
  Serial.print("#RESET_REASON:");
  Serial.println((int)esp_reset_reason());

  lcd.init();
  lcd.backlight();

  pinMode(IR_DAU, INPUT_PULLUP);
  pinMode(IR_CUOI, INPUT_PULLUP);

  pinMode(IR_MOTOR_DUOI, INPUT_PULLUP);
  pinMode(IR_MOTOR_TREN, INPUT_PULLUP);

  pinMode(rowPin[0], INPUT_PULLUP);
  pinMode(rowPin[1], INPUT);
  pinMode(rowPin[2], INPUT);

  for (byte i = 0; i < col; i++)
  {
    pinMode(colPin[i], OUTPUT);
    digitalWrite(colPin[i], HIGH);
  }

  pinMode(RL1, OUTPUT);
  pinMode(RL2, OUTPUT);
  pinMode(RL3, OUTPUT);
  pinMode(RL4, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  tatTatCaRelay();
  dungBangTaiTien();
  if (CLOUD_ENABLED)
  {
    BaseType_t cloudTaskStatus = xTaskCreatePinnedToCore(
      cloudTask,
      "cloudTask",
      32768,
      nullptr,
      1,
      &cloudTaskHandle,
      1
    );

    if (cloudTaskStatus == pdPASS)
    {
      Serial.println("#CLOUD_TASK:START");
    }
    else
    {
      Serial.println("#CLOUD_TASK:FAIL");
    }
  }
  showHome();
}

void loop()
{
  unsigned long now = millis();

  docSerialTien();
  xuLyBangTaiTien(now);
  xuLyBanHang(now);
  xuLyThongBao(now);

  if (trangThaiTien != TIEN_CHO || trangThaiBanHang != BAN_HANG_CHO)
  {
    mocHoatDongLocal = now;
  }

  char phim = docBanPhim(now);
  if (phim != 0)
  {
    mocHoatDongLocal = now;
    xuLyPhim(phim);
  }

  delay(1);
}

void cloudTask(void *parameter)
{
  (void)parameter;
  Serial.println("#CLOUD_TASK:RUN");

  while (true)
  {
    if (CLOUD_ENABLED)
    {
      xuLyCloud(millis());
    }

    vTaskDelay(pdMS_TO_TICKS(250));
  }
}

String cloudRestUrl(const String &pathAndQuery)
{
  return String(SUPABASE_URL) + "/rest/v1/" + pathAndQuery;
}

void addCloudHeaders(HTTPClient &http, const String &prefer = "")
{
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  if (prefer.length() > 0)
  {
    http.addHeader("Prefer", prefer);
  }
}

bool cloudRequest(const String &method, const String &path, const String &body, String *response = nullptr, const String &prefer = "")
{
  if (!CLOUD_ENABLED)
  {
    return false;
  }

  if (millis() < tamDungCloudDen)
  {
    return false;
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("#CLOUD_SKIP:WIFI_OFF");
    return false;
  }

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(CLOUD_HTTP_TIMEOUT_MS);

  String url = cloudRestUrl(path);
  Serial.print("#CLOUD_REQ:");
  Serial.print(method);
  Serial.print(" ");
  Serial.println(path);

  if (!http.begin(client, url))
  {
    Serial.print("#CLOUD_BEGIN_FAIL:");
    Serial.println(path);
    return false;
  }

  http.setReuse(false);
  http.useHTTP10(true);
  http.setTimeout(CLOUD_HTTP_TIMEOUT_MS);
  addCloudHeaders(http, prefer);
  http.addHeader("Connection", "close");

  int status = 0;
  if (method == "GET")
  {
    status = http.GET();
  }
  else if (method == "POST")
  {
    status = http.POST(body);
  }
  else if (method == "PATCH")
  {
    status = http.sendRequest("PATCH", body);
  }
  else
  {
    http.end();
    return false;
  }

  String res = http.getString();
  http.end();

  if (response != nullptr)
  {
    *response = res;
  }

  if (status < 200 || status >= 300)
  {
    soLoiCloudLienTiep++;
    if (soLoiCloudLienTiep >= 3)
    {
      tamDungCloudDen = millis() + CLOUD_ERROR_PAUSE_MS;
      soLoiCloudLienTiep = 0;
      Serial.println("#CLOUD_PAUSE:60s");
    }

    Serial.print("#CLOUD_ERR:");
    Serial.print(method);
    Serial.print(" ");
    Serial.print(path);
    Serial.print(" status=");
    Serial.println(status);
    Serial.println(res);
    return false;
  }

  soLoiCloudLienTiep = 0;
  Serial.print("#CLOUD_OK:");
  Serial.print(method);
  Serial.print(" ");
  Serial.println(path);
  return true;
}

void connectWifi()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    return;
  }

  unsigned long now = millis();
  if (now - mocWifi < WIFI_RETRY_MS && mocWifi != 0)
  {
    return;
  }

  mocWifi = now;
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
  WiFi.disconnect(false);
  delay(20);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("#WIFI:BEGIN");
}

void logWifiStatusNeuCan(unsigned long now)
{
  wl_status_t status = WiFi.status();
  if (status != trangThaiWifiCu || now - mocLogWifi >= 10000)
  {
    mocLogWifi = now;
    trangThaiWifiCu = status;

    Serial.print("#WIFI_STATUS:");
    Serial.print((int)status);
    Serial.print(" HEAP:");
    Serial.println(ESP.getFreeHeap());
  }
}

bool cloudBootstrap()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return false;
  }

  if (!daTaiTrangThaiMayTuCloud && !coDuLieuLocalChoGuiCloud())
  {
    daTaiTrangThaiMayTuCloud = cloudFetchMachineStateFromWeb();
    if (!daTaiTrangThaiMayTuCloud)
    {
      return false;
    }
  }

  if (!daTaiCauHinhTuCloud && !coDuLieuLocalChoGuiCloud())
  {
    daTaiCauHinhTuCloud = cloudFetchProductsFromWeb();
  }

  StaticJsonDocument<320> machine;
  machine["id"] = MACHINE_ID;
  machine["name"] = "Máy bán hàng 001";
  machine["location"] = "Phòng test";
  machine["status"] = "online";
  machine["firmware_version"] = FIRMWARE_VERSION;
  machine["current_credit"] = tienDangCo;
  machine["cash_in_box"] = tongTienHopMay;
  machine["total_sales"] = tongSanPhamDaBan;
  machine["total_revenue"] = tongDoanhThuMay;
  machine["total_refunded"] = tongTienDaTraLai;

  String body;
  serializeJson(machine, body);
  bool ok = cloudRequest("POST", "machines?on_conflict=id", body, nullptr, "resolution=merge-duplicates,return=minimal");
  if (ok)
  {
    cloudLogEvent("machine_online", "info", "Máy đã bật và kết nối cloud");
  }

  return ok;
}

bool coDuLieuLocalChoGuiCloud()
{
  if (coTienCanGuiCloud || coBanHangCanGuiCloud || coEventCanGuiCloud)
  {
    return true;
  }

  for (int sp = 1; sp <= soSanPham; sp++)
  {
    if (coSanPhamCanGuiCloud[sp])
    {
      return true;
    }
  }

  return false;
}

bool cloudFetchMachineStateFromWeb()
{
  String response;
  String path = String("machines?select=current_credit,cash_in_box,total_sales,total_revenue,total_refunded")
                + "&id=eq." + MACHINE_ID
                + "&limit=1";

  if (!cloudRequest("GET", path, "", &response))
  {
    return false;
  }

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, response);
  if (error || !doc.is<JsonArray>())
  {
    Serial.println("#CLOUD_MACHINE_STATE:PARSE_FAIL");
    return false;
  }

  JsonArray machines = doc.as<JsonArray>();
  if (machines.size() == 0)
  {
    Serial.println("#CLOUD_MACHINE_STATE:EMPTY");
    return true;
  }

  JsonObject machine = machines[0];
  long cloudCredit = machine["current_credit"] | tienDangCo;
  long cloudCashInBox = machine["cash_in_box"] | tongTienHopMay;
  int cloudTotalSales = machine["total_sales"] | tongSanPhamDaBan;
  long cloudTotalRevenue = machine["total_revenue"] | tongDoanhThuMay;
  long cloudTotalRefunded = machine["total_refunded"] | tongTienDaTraLai;

  if (cloudCredit < 0)
  {
    cloudCredit = 0;
  }
  if (cloudCredit > GIOI_HAN_TIEN)
  {
    cloudCredit = GIOI_HAN_TIEN;
  }

  tienDangCo = cloudCredit;
  if (cloudCashInBox >= 0)
  {
    tongTienHopMay = cloudCashInBox;
  }
  if (cloudTotalSales >= 0)
  {
    tongSanPhamDaBan = cloudTotalSales;
  }
  if (cloudTotalRevenue >= 0)
  {
    tongDoanhThuMay = cloudTotalRevenue;
  }
  if (cloudTotalRefunded >= 0)
  {
    tongTienDaTraLai = cloudTotalRefunded;
  }

  Serial.print("#CLOUD_MACHINE_STATE:APPLIED:");
  Serial.println(tienDangCo);
  showHome();
  return true;
}

bool cloudFetchProductsFromWeb()
{
  String response;
  String path = String("products?select=slot,price,stock,enabled")
                + "&machine_id=eq." + MACHINE_ID
                + "&order=slot.asc";

  if (!cloudRequest("GET", path, "", &response))
  {
    return false;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, response);
  if (error || !doc.is<JsonArray>())
  {
    Serial.println("#CLOUD_CONFIG:PARSE_FAIL");
    return false;
  }

  JsonArray items = doc.as<JsonArray>();
  int applied = 0;
  for (JsonObject item : items)
  {
    if (cloudApplyProductPayload(item))
    {
      applied++;
    }
  }

  if (applied == 0)
  {
    for (int sp = 1; sp <= soSanPham; sp++)
    {
      cloudUpsertProduct(sp);
    }
    Serial.println("#CLOUD_CONFIG:SEEDED_DEFAULTS");
  }
  else
  {
    Serial.print("#CLOUD_CONFIG:APPLIED:");
    Serial.println(applied);
  }

  showHome();
  return true;
}

void xuLyCloud(unsigned long now)
{
  logWifiStatusNeuCan(now);

  if (now < CLOUD_BOOT_DELAY_MS)
  {
    return;
  }

  if (now < tamDungCloudDen)
  {
    return;
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    if (daCloudBootstrap)
    {
      Serial.println("#CLOUD_OFFLINE:WIFI_LOST");
      daCloudBootstrap = false;
    }
    connectWifi();
    return;
  }

  if (!daCloudBootstrap)
  {
    Serial.print("#WIFI:IP:");
    Serial.println(WiFi.localIP());
    Serial.print("#HEAP:");
    Serial.println(ESP.getFreeHeap());
    daCloudBootstrap = cloudBootstrap();
    return;
  }

  if (coTienCanGuiCloud)
  {
    if (cloudSendPendingMoney())
    {
      coTienCanGuiCloud = false;
      tienCanGuiCloud = 0;
    }
    return;
  }

  if (coBanHangCanGuiCloud)
  {
    if (cloudSendPendingSale())
    {
      coBanHangCanGuiCloud = false;
    }
    return;
  }

  if (cloudSendPendingEvent())
  {
    return;
  }

  if (!daTaiTrangThaiMayTuCloud && !coDuLieuLocalChoGuiCloud())
  {
    if (trangThaiTien == TIEN_CHO && trangThaiBanHang == BAN_HANG_CHO && now - mocHoatDongLocal >= CLOUD_IDLE_MS)
    {
      daTaiTrangThaiMayTuCloud = cloudFetchMachineStateFromWeb();
      return;
    }
  }

  if (now - mocCloudHeartbeat >= CLOUD_HEARTBEAT_MS || mocCloudHeartbeat == 0)
  {
    mocCloudHeartbeat = now;
    cloudHeartbeat("online");
    return;
  }

  if (cloudSendPendingProductSync())
  {
    return;
  }

  if (!daTaiCauHinhTuCloud && !coDuLieuLocalChoGuiCloud())
  {
    if (trangThaiTien == TIEN_CHO && trangThaiBanHang == BAN_HANG_CHO && now - mocHoatDongLocal >= CLOUD_IDLE_MS)
    {
      daTaiCauHinhTuCloud = cloudFetchProductsFromWeb();
      return;
    }
  }

  if (trangThaiTien != TIEN_CHO || trangThaiBanHang != BAN_HANG_CHO)
  {
    return;
  }

  if (now - mocHoatDongLocal < CLOUD_IDLE_MS)
  {
    return;
  }

  if (now - mocCloudCommand >= CLOUD_COMMAND_POLL_MS || mocCloudCommand == 0)
  {
    mocCloudCommand = now;
    cloudPollCommands();
    return;
  }
}

void cloudHeartbeat(const String &status)
{
  StaticJsonDocument<320> doc;
  doc["status"] = status;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["current_credit"] = tienDangCo;
  doc["cash_in_box"] = tongTienHopMay;
  doc["total_sales"] = tongSanPhamDaBan;
  doc["total_revenue"] = tongDoanhThuMay;
  doc["total_refunded"] = tongTienDaTraLai;

  String body;
  serializeJson(doc, body);
  cloudRequest("PATCH", String("machines?id=eq.") + MACHINE_ID, body, nullptr, "return=minimal");
}

void cloudUpsertProduct(int sp)
{
  StaticJsonDocument<384> doc;
  doc["machine_id"] = MACHINE_ID;
  doc["slot"] = sp;
  doc["name"] = String("Sản phẩm ") + String(sp);
  doc["price"] = giaSP[sp];
  doc["stock"] = soLuongSP[sp];
  doc["capacity"] = SO_LUONG_MAX;
  doc["enabled"] = sanPhamBat[sp];

  String body;
  serializeJson(doc, body);
  cloudRequest("POST", "products?on_conflict=machine_id,slot", body, nullptr, "resolution=merge-duplicates,return=minimal");
}

void cloudPatchProductStock(int sp)
{
  StaticJsonDocument<128> doc;
  doc["price"] = giaSP[sp];
  doc["stock"] = soLuongSP[sp];
  doc["enabled"] = sanPhamBat[sp];

  String body;
  serializeJson(doc, body);
  cloudRequest("PATCH", String("products?machine_id=eq.") + MACHINE_ID + "&slot=eq." + String(sp), body, nullptr, "return=minimal");
}

void queueProductCloudSync(int sp)
{
  if (!CLOUD_ENABLED || sp < 1 || sp > soSanPham)
  {
    return;
  }

  coSanPhamCanGuiCloud[sp] = true;
  Serial.print("#CLOUD_QUEUE:PRODUCT SP");
  Serial.println(sp);
}

bool cloudSendPendingProductSync()
{
  for (int sp = 1; sp <= soSanPham; sp++)
  {
    if (!coSanPhamCanGuiCloud[sp])
    {
      continue;
    }

    Serial.print("#CLOUD_SEND:PRODUCT SP");
    Serial.println(sp);

    StaticJsonDocument<128> doc;
    doc["price"] = giaSP[sp];
    doc["stock"] = soLuongSP[sp];
    doc["enabled"] = sanPhamBat[sp];

    String body;
    serializeJson(doc, body);
    bool ok = cloudRequest("PATCH", String("products?machine_id=eq.") + MACHINE_ID + "&slot=eq." + String(sp), body, nullptr, "return=minimal");
    if (ok)
    {
      coSanPhamCanGuiCloud[sp] = false;
      mocCloudHeartbeat = 0;
    }
    return true;
  }

  return false;
}

void cloudMoneyAccepted(long amount)
{
  if (!CLOUD_ENABLED)
  {
    return;
  }

  tongTienHopMay += amount;
  tienCanGuiCloud += amount;
  coTienCanGuiCloud = true;
}

bool cloudSendPendingMoney()
{
  if (tienCanGuiCloud <= 0)
  {
    return true;
  }

  StaticJsonDocument<192> doc;
  doc["machine_id"] = MACHINE_ID;
  doc["amount"] = tienCanGuiCloud;
  doc["source"] = "yolo_serial";

  String body;
  serializeJson(doc, body);
  if (!cloudRequest("POST", "money_events", body, nullptr, "return=minimal"))
  {
    return false;
  }

  mocCloudHeartbeat = 0;
  return true;
}

void cloudSaleSuccess(int sp, long price, long creditBefore, long creditAfter)
{
  if (!CLOUD_ENABLED)
  {
    return;
  }

  tongSanPhamDaBan++;
  tongDoanhThuMay += price;
  spCanGuiCloud = sp;
  giaCanGuiCloud = price;
  tienTruocCanGuiCloud = creditBefore;
  tienSauCanGuiCloud = creditAfter;
  coBanHangCanGuiCloud = true;
  queueProductCloudSync(sp);
  Serial.print("#CLOUD_QUEUE:SALE SP");
  Serial.println(sp);
}

bool cloudSendPendingSale()
{
  if (spCanGuiCloud < 1 || spCanGuiCloud > soSanPham)
  {
    return true;
  }

  Serial.print("#CLOUD_SEND:SALE SP");
  Serial.println(spCanGuiCloud);

  StaticJsonDocument<384> doc;
  doc["machine_id"] = MACHINE_ID;
  doc["product_slot"] = spCanGuiCloud;
  doc["product_name"] = String("Sản phẩm ") + String(spCanGuiCloud);
  doc["unit_price"] = giaCanGuiCloud;
  doc["credit_before"] = tienTruocCanGuiCloud;
  doc["credit_after"] = tienSauCanGuiCloud;
  doc["success"] = true;
  doc["message"] = "Bán hàng thành công";

  String body;
  serializeJson(doc, body);
  if (!cloudRequest("POST", "sales", body, nullptr, "return=minimal"))
  {
    return false;
  }

  mocCloudHeartbeat = 0;
  return true;
}

void queueCloudEvent(const String &eventType, const String &severity, const String &message, long amount, int slot)
{
  if (!CLOUD_ENABLED)
  {
    return;
  }

  eventTypeCanGuiCloud = eventType;
  eventSeverityCanGuiCloud = severity;
  eventMessageCanGuiCloud = message;
  eventAmountCanGuiCloud = amount;
  eventSlotCanGuiCloud = slot;
  coEventCanGuiCloud = true;
}

bool cloudSendPendingEvent()
{
  if (!coEventCanGuiCloud)
  {
    return false;
  }

  if (cloudLogEvent(eventTypeCanGuiCloud, eventSeverityCanGuiCloud, eventMessageCanGuiCloud, eventAmountCanGuiCloud, eventSlotCanGuiCloud))
  {
    coEventCanGuiCloud = false;
    mocCloudHeartbeat = 0;
    return true;
  }

  return false;
}

bool cloudLogEvent(const String &eventType, const String &severity, const String &message, long amount, int slot)
{
  if (!CLOUD_ENABLED)
  {
    return false;
  }

  StaticJsonDocument<384> doc;
  doc["machine_id"] = MACHINE_ID;
  doc["event_type"] = eventType;
  doc["severity"] = severity;
  doc["message"] = message;
  if (amount >= 0 || slot > 0)
  {
    JsonObject payload = doc.createNestedObject("payload");
    if (amount >= 0)
    {
      payload["amount"] = amount;
    }
    if (slot > 0)
    {
      payload["slot"] = slot;
    }
  }

  String body;
  serializeJson(doc, body);
  return cloudRequest("POST", "machine_events", body, nullptr, "return=minimal");
}

void cloudPollCommands()
{
  String response;
  String path = String("machine_commands?select=id,command_type,payload")
                + "&machine_id=eq." + MACHINE_ID
                + "&status=eq.pending"
                + "&order=created_at.asc"
                + "&limit=1";

  if (!cloudRequest("GET", path, "", &response))
  {
    return;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, response);
  if (error || !doc.is<JsonArray>())
  {
    return;
  }

  JsonArray commands = doc.as<JsonArray>();
  for (JsonObject command : commands)
  {
    long id = command["id"] | 0;
    const char *type = command["command_type"] | "";
    JsonVariant payload = command["payload"];

    bool ok = cloudApplyCommand(String(type), payload);
    cloudMarkCommand(id, ok, ok ? "" : "apply failed");
  }
}

bool cloudApplyCommand(const String &type, JsonVariant payload)
{
  if (type == "set_product")
  {
    bool ok = cloudApplyProductPayload(payload);
    if (ok)
    {
      int sp = payload["slot"] | 0;
      queueProductCloudSync(sp);
    }
    return ok;
  }

  if (type == "sync_products")
  {
    JsonArray items = payload["products"].as<JsonArray>();
    for (JsonObject item : items)
    {
      if (cloudApplyProductPayload(item))
      {
        int sp = item["slot"] | 0;
        queueProductCloudSync(sp);
      }
    }
    showHome();
    return true;
  }

  if (type == "refund_credit")
  {
    hoanTienChoKhach();
    return true;
  }

  if (type == "refresh_config")
  {
    bool ok = cloudFetchProductsFromWeb();
    mocCloudHeartbeat = 0;
    return ok;
  }

  return false;
}

bool cloudApplyProductPayload(JsonVariant payload)
{
  int sp = payload["slot"] | 0;
  if (sp < 1 || sp > soSanPham)
  {
    return false;
  }

  long price = payload["price"] | giaSP[sp];
  int stock = payload["stock"] | soLuongSP[sp];
  bool enabled = payload["enabled"] | sanPhamBat[sp];

  if (price < GIA_MIN)
  {
    price = GIA_MIN;
  }
  if (price > GIA_MAX)
  {
    price = GIA_MAX;
  }
  if (stock < SO_LUONG_MIN)
  {
    stock = SO_LUONG_MIN;
  }
  if (stock > SO_LUONG_MAX)
  {
    stock = SO_LUONG_MAX;
  }

  giaSP[sp] = price;
  soLuongSP[sp] = stock;
  sanPhamBat[sp] = enabled;

  Serial.print("#OK:CLOUD_SP:");
  Serial.print(sp);
  Serial.print(",");
  Serial.print(price);
  Serial.print(",");
  Serial.println(stock);

  showHome();
  return true;
}

void cloudMarkCommand(long id, bool ok, const String &message)
{
  if (id <= 0)
  {
    return;
  }

  StaticJsonDocument<192> doc;
  doc["status"] = ok ? "done" : "error";
  if (!ok)
  {
    doc["error_message"] = message;
  }

  String body;
  serializeJson(doc, body);
  cloudRequest("PATCH", String("machine_commands?id=eq.") + String(id), body, nullptr, "return=minimal");
}

// Kiem tra tien tu Python: #HOPLE:10000\r\n
void docSerialTien()
{
  while (Serial.available())
  {
    char c = Serial.read();

    if (c == '\r')
    {
      continue;
    }

    if (c == '\n')
    {
      xuLyChuoiTien(chuoiSerial);
      chuoiSerial = "";
    }
    else if (chuoiSerial.length() < 40)
    {
      chuoiSerial += c;
    }
  }
}

void xuLyChuoiTien(String data)
{
  data.trim();

  if (data.startsWith("#HOPLE:"))
  {
    tienMoiNhan = data.substring(7).toInt();

    Serial.print("Nhan tien: ");
    Serial.println(tienMoiNhan);
    return;
  }

  if (data.startsWith("#SETGIA:"))
  {
    xuLyLenhSetGia(data.substring(8));
    return;
  }

  if (data.startsWith("#SETSL:"))
  {
    xuLyLenhSetSoLuong(data.substring(7));
    return;
  }
}

void xuLyLenhSetGia(String payload)
{
  int dauPhay = payload.indexOf(',');
  if (dauPhay < 0)
  {
    return;
  }

  int sp = payload.substring(0, dauPhay).toInt();
  long gia = payload.substring(dauPhay + 1).toInt();

  if (sp < 1 || sp > soSanPham)
  {
    return;
  }

  if (gia < GIA_MIN)
  {
    gia = GIA_MIN;
  }
  if (gia > GIA_MAX)
  {
    gia = GIA_MAX;
  }

  giaSP[sp] = gia;
  queueProductCloudSync(sp);

  Serial.print("#OK:SETGIA:");
  Serial.print(sp);
  Serial.print(",");
  Serial.println(gia);
}

void xuLyLenhSetSoLuong(String payload)
{
  int dauPhay = payload.indexOf(',');
  if (dauPhay < 0)
  {
    return;
  }

  int sp = payload.substring(0, dauPhay).toInt();
  int soLuong = payload.substring(dauPhay + 1).toInt();

  if (sp < 1 || sp > soSanPham)
  {
    return;
  }

  if (soLuong < SO_LUONG_MIN)
  {
    soLuong = SO_LUONG_MIN;
  }
  if (soLuong > SO_LUONG_MAX)
  {
    soLuong = SO_LUONG_MAX;
  }

  soLuongSP[sp] = soLuong;
  queueProductCloudSync(sp);

  Serial.print("#OK:SETSL:");
  Serial.print(sp);
  Serial.print(",");
  Serial.println(soLuong);
}

// Bang tai nhan tien
void doiTrangThaiTien(TrangThaiTien trangThaiMoi, unsigned long now)
{
  trangThaiTien = trangThaiMoi;
  mocTien = now;
}

void chayBangTaiTienVao()
{
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
}

void chayBangTaiTienRa()
{
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void dungBangTaiTien()
{
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}

void xuLyBangTaiTien(unsigned long now)
{
  bool coTienODau = digitalRead(IR_DAU) == LOW;
  bool tienDenCuoi = digitalRead(IR_CUOI) == LOW;

  switch (trangThaiTien)
  {
    case TIEN_CHO:
      if (coTienODau)
      {
        if (tienDangCo >= GIOI_HAN_TIEN)
        {
          if (!daBaoGioiHanTien)
          {
            showMessage("Khong nhan them", "Tien da day");
            daBaoGioiHanTien = true;
          }
          break;
        }

        daBaoGioiHanTien = false;
        tienMoiNhan = 0;
        Serial.println("#START");
        chayBangTaiTienVao();
        doiTrangThaiTien(TIEN_DANG_DI, now);
      }
      else
      {
        daBaoGioiHanTien = false;
      }
      break;

    case TIEN_DANG_DI:
      if (tienDenCuoi)
      {
        Serial.println("#END");

        if (tienMoiNhan > 0)
        {
          doiTrangThaiTien(TIEN_DI_THEM, now);
        }
        else
        {
          chayBangTaiTienRa();
          doiTrangThaiTien(TIEN_DANG_LUI, now);
        }
      }
      break;

    case TIEN_DI_THEM:
      if (now - mocTien >= THOI_GIAN_DI_THEM_TIEN)
      {
        dungBangTaiTien();
        tienDangCo += tienMoiNhan;
        cloudMoneyAccepted(tienMoiNhan);
        tienMoiNhan = 0;
        doiTrangThaiTien(TIEN_CHO, now);
        showHome();
      }
      break;

    case TIEN_DANG_LUI:
      if (coTienODau)
      {
        doiTrangThaiTien(TIEN_LUI_THEM, now);
      }
      break;

    case TIEN_LUI_THEM:
      if (now - mocTien >= THOI_GIAN_LUI_THEM_TIEN)
      {
        dungBangTaiTien();

        if (!coTienODau)
        {
          doiTrangThaiTien(TIEN_CHO, now);
        }
        else
        {
          dangDoiTienVe = false;
          doiTrangThaiTien(TIEN_DOI_VE, now);
        }
      }
      break;

    case TIEN_DOI_VE:
      if (!coTienODau)
      {
        if (!dangDoiTienVe)
        {
          dangDoiTienVe = true;
          mocTien = now;
        }
        else if (now - mocTien >= THOI_GIAN_DOI_TIEN_VE)
        {
          dangDoiTienVe = false;
          doiTrangThaiTien(TIEN_CHO, now);
        }
      }
      else
      {
        dangDoiTienVe = false;
      }
      break;
  }
}

// Phim va menu
void xuLyPhim(char phim)
{
  if (trangThaiBanHang != BAN_HANG_CHO)
  {
    showMessage("May dang ban", "Vui long cho");
    return;
  }

  if (cheDoMay == CHE_DO_XAC_NHAN_HOAN_TIEN)
  {
    xuLyPhimHoanTien(phim);
    return;
  }

  if (cheDoMay == CHE_DO_CHON_SP_SUA_GIA || cheDoMay == CHE_DO_SUA_GIA)
  {
    xuLyPhimSuaGia(phim);
    return;
  }

  if (cheDoMay == CHE_DO_CHON_SP_SO_LUONG || cheDoMay == CHE_DO_SUA_SO_LUONG)
  {
    xuLyPhimSoLuong(phim);
    return;
  }

  switch (phim)
  {
    case '1':
      chonSanPham(1);
      break;

    case '2':
      chonSanPham(2);
      break;

    case '4':
      chonSanPham(3);
      break;

    case '5':
      chonSanPham(4);
      break;

    case '3':
      cheDoMay = CHE_DO_XAC_NHAN_HOAN_TIEN;
      showMessage("Hoan tien?", "9=OK 6=HUY");
      break;

    case '7':
      cheDoMay = CHE_DO_CHON_SP_SUA_GIA;
      showMessage("Sua gia SP", "Chon 1 2 3 4");
      break;

    case '8':
      cheDoMay = CHE_DO_CHON_SP_SO_LUONG;
      showMessage("Cai so luong", "Chon 1 2 3 4");
      break;

    case '9':
      xacNhanMua();
      break;

    case '6':
      huyLuaChon();
      break;
  }
}

void xuLyPhimHoanTien(char phim)
{
  if (phim == '9')
  {
    hoanTienChoKhach();
  }
  else if (phim == '6')
  {
    cheDoMay = CHE_DO_BAN_HANG;
    showHome();
  }
}

void xuLyPhimSuaGia(char phim)
{
  if (cheDoMay == CHE_DO_CHON_SP_SUA_GIA)
  {
    int sp = phimThanhSanPham(phim);
    if (sp > 0)
    {
      spDangCaiDat = sp;
      giaTam = giaSP[sp];
      cheDoMay = CHE_DO_SUA_GIA;
      hienThiSuaGia();
    }
    else if (phim == '6')
    {
      cheDoMay = CHE_DO_BAN_HANG;
      showHome();
    }
    return;
  }

  if (phim == '1')
  {
    giaTam += 5000;
  }
  else if (phim == '2')
  {
    giaTam -= 5000;
  }
  else if (phim == '4')
  {
    giaTam += 50000;
  }
  else if (phim == '5')
  {
    giaTam -= 50000;
  }
  else if (phim == '9')
  {
    giaSP[spDangCaiDat] = giaTam;
    queueProductCloudSync(spDangCaiDat);
    cheDoMay = CHE_DO_BAN_HANG;
    showMessage("Da luu gia", String("SP") + String(spDangCaiDat));
    return;
  }
  else if (phim == '6')
  {
    cheDoMay = CHE_DO_BAN_HANG;
    showHome();
    return;
  }

  if (giaTam < GIA_MIN)
  {
    giaTam = GIA_MIN;
  }
  if (giaTam > GIA_MAX)
  {
    giaTam = GIA_MAX;
  }

  hienThiSuaGia();
}

void xuLyPhimSoLuong(char phim)
{
  if (cheDoMay == CHE_DO_CHON_SP_SO_LUONG)
  {
    int sp = phimThanhSanPham(phim);
    if (sp > 0)
    {
      spDangCaiDat = sp;
      soLuongTam = soLuongSP[sp];
      cheDoMay = CHE_DO_SUA_SO_LUONG;
      hienThiSuaSoLuong();
    }
    else if (phim == '6')
    {
      cheDoMay = CHE_DO_BAN_HANG;
      showHome();
    }
    return;
  }

  if (phim == '1')
  {
    soLuongTam++;
  }
  else if (phim == '2')
  {
    soLuongTam--;
  }
  else if (phim == '9')
  {
    soLuongSP[spDangCaiDat] = soLuongTam;
    queueProductCloudSync(spDangCaiDat);
    cheDoMay = CHE_DO_BAN_HANG;
    showMessage("Da luu SL", String("SP") + String(spDangCaiDat));
    return;
  }
  else if (phim == '6')
  {
    cheDoMay = CHE_DO_BAN_HANG;
    showHome();
    return;
  }

  if (soLuongTam < SO_LUONG_MIN)
  {
    soLuongTam = SO_LUONG_MIN;
  }
  if (soLuongTam > SO_LUONG_MAX)
  {
    soLuongTam = SO_LUONG_MAX;
  }

  hienThiSuaSoLuong();
}

void hoanTienChoKhach()
{
  long tienTraLai = tienDangCo;
  if (tienTraLai > 0)
  {
    tongTienDaTraLai += tienTraLai;
    Serial.print("#CLOUD_QUEUE:REFUND ");
    Serial.println(tienTraLai);
    queueCloudEvent("refund", "info", "Hoàn tiền cho khách", tienTraLai);
  }

  tienDangCo = 0;
  sanPhamDangChon = 0;
  cheDoMay = CHE_DO_BAN_HANG;
  showMessage("Da hoan tien", "Tien:0");
  mocCloudHeartbeat = 0;
}

int phimThanhSanPham(char phim)
{
  if (phim == '1') return 1;
  if (phim == '2') return 2;
  if (phim == '4') return 3;
  if (phim == '5') return 4;
  return 0;
}

void chonSanPham(int sp)
{
  sanPhamDangChon = sp;
  dangThongBao = false;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SP");
  lcd.print(sp);
  lcd.print(" Gia:");
  lcd.print(giaSP[sp]);

  lcd.setCursor(0, 1);
  lcd.print("SL:");
  lcd.print(soLuongSP[sp]);
  lcd.print(" T:");
  lcd.print(tienDangCo);
}

void xacNhanMua()
{
  if (sanPhamDangChon == 0)
  {
    showMessage("Chua chon SP", "Chon 1 2 3 4");
    return;
  }

  if (soLuongSP[sanPhamDangChon] <= 0)
  {
    showMessage("Het hang", String("SP") + String(sanPhamDangChon));
    return;
  }

  if (!sanPhamBat[sanPhamDangChon])
  {
    showMessage("SP dang tat", String("SP") + String(sanPhamDangChon));
    return;
  }

  long gia = giaSP[sanPhamDangChon];
  if (tienDangCo < gia)
  {
    showMessage("Thieu tien", String("Can:") + String(gia - tienDangCo));
    return;
  }

  batDauBanHang(sanPhamDangChon);
}

void huyLuaChon()
{
  sanPhamDangChon = 0;
  cheDoMay = CHE_DO_BAN_HANG;
  showMessage("Da huy chon", String("Tien:") + String(tienDangCo));
}

// Ban hang
void batDauBanHang(int sp)
{
  sanPhamDangBan = sp;
  sanPhamDangChon = 0;
  daRoiKhoiCamBienMotor = digitalRead(camBienMotorSP[sp]) == HIGH;

  digitalWrite(relaySP[sp], HIGH);
  doiTrangThaiBanHang(BAN_HANG_DANG_QUAY, millis());

  dangThongBao = false;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Dang nha SP ");
  lcd.print(sp);
  lcd.setCursor(0, 1);
  lcd.print("Vui long cho");
}

void xuLyBanHang(unsigned long now)
{
  if (trangThaiBanHang == BAN_HANG_CHO)
  {
    return;
  }

  int relayDangBan = relaySP[sanPhamDangBan];
  int camBienMotor = camBienMotorSP[sanPhamDangBan];

  switch (trangThaiBanHang)
  {
    case BAN_HANG_DANG_QUAY:
    {
      int trangThaiCamBienMotor = digitalRead(camBienMotor);

      if (trangThaiCamBienMotor == HIGH)
      {
        daRoiKhoiCamBienMotor = true;
      }

      if (daRoiKhoiCamBienMotor && trangThaiCamBienMotor == LOW)
      {
        doiTrangThaiBanHang(BAN_HANG_QUAY_THEM, now);
      }
      else if (now - mocBanHang >= THOI_GIAN_MOTOR_SP_TOI_DA)
      {
        digitalWrite(relayDangBan, LOW);
        baoLoiBanHang("Loi Motor", "Qua thoi gian");
      }
      break;
    }

    case BAN_HANG_QUAY_THEM:
      if (now - mocBanHang >= THOI_GIAN_MOTOR_SP_THEM)
      {
        digitalWrite(relayDangBan, LOW);
        banHangThanhCong();
      }
      break;

    case BAN_HANG_XONG:
    case BAN_HANG_LOI:
      if (now - mocBanHang >= THOI_GIAN_THONG_BAO)
      {
        sanPhamDangBan = 0;
        doiTrangThaiBanHang(BAN_HANG_CHO, now);
        showHome();
      }
      break;

    case BAN_HANG_CHO:
      break;
  }
}

void banHangThanhCong()
{
  int spDaBan = sanPhamDangBan;
  long giaDaBan = giaSP[spDaBan];
  long tienTruocKhiBan = tienDangCo;

  tienDangCo -= giaSP[sanPhamDangBan];
  if (tienDangCo < 0)
  {
    tienDangCo = 0;
  }

  if (soLuongSP[sanPhamDangBan] > 0)
  {
    soLuongSP[sanPhamDangBan]--;
  }

  showMessage("Da nhan SP", String("Con lai:") + String(tienDangCo));
  doiTrangThaiBanHang(BAN_HANG_XONG, millis());
  Serial.println("Bán hàng thành công");
  cloudSaleSuccess(spDaBan, giaDaBan, tienTruocKhiBan, tienDangCo);
}

void baoLoiBanHang(String dong1, String dong2)
{
  tatTatCaRelay();
  showMessage(dong1, dong2);
  queueCloudEvent("motor_timeout", "error", String("Động cơ quay quá lâu tại SP") + String(sanPhamDangBan), -1, sanPhamDangBan);
  doiTrangThaiBanHang(BAN_HANG_LOI, millis());
}

void doiTrangThaiBanHang(TrangThaiBanHang trangThaiMoi, unsigned long now)
{
  trangThaiBanHang = trangThaiMoi;
  mocBanHang = now;
}

void tatTatCaRelay()
{
  digitalWrite(RL1, LOW);
  digitalWrite(RL2, LOW);
  digitalWrite(RL3, LOW);
  digitalWrite(RL4, LOW);
}

// LCD
void showHome()
{
  dangThongBao = false;
  cheDoMay = CHE_DO_BAN_HANG;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Phim:1 2 4 5");
  lcd.setCursor(0, 1);
  lcd.print("Tien:");
  lcd.print(tienDangCo);
}

void showMessage(String dong1, String dong2)
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(dong1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(dong2.substring(0, 16));
  dangThongBao = true;
  mocThongBao = millis();
}

void xuLyThongBao(unsigned long now)
{
  if (!dangThongBao)
  {
    return;
  }

  if (cheDoMay == CHE_DO_BAN_HANG &&
      trangThaiBanHang == BAN_HANG_CHO &&
      now - mocThongBao >= THOI_GIAN_THONG_BAO)
  {
    showHome();
  }
}

void hienThiSuaGia()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SP");
  lcd.print(spDangCaiDat);
  lcd.print(" Gia:");
  lcd.print(giaTam);

  lcd.setCursor(0, 1);
  lcd.print("1:2:5K 4:5:50K");
}

void hienThiSuaSoLuong()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SP");
  lcd.print(spDangCaiDat);
  lcd.print(" SL:");
  lcd.print(soLuongTam);

  lcd.setCursor(0, 1);
  lcd.print("1:+    2:-");
}

// Ban phim
char docBanPhim(unsigned long now)
{
  bool coPhimDangNhan = false;
  char phimNhan = 0;

  for (byte c = 0; c < col; c++)
  {
    for (byte i = 0; i < col; i++)
    {
      digitalWrite(colPin[i], HIGH);
    }

    digitalWrite(colPin[c], LOW);
    delayMicroseconds(50);

    for (byte r = 0; r < row; r++)
    {
      if (digitalRead(rowPin[r]) == LOW)
      {
        coPhimDangNhan = true;
        phimNhan = key[r][c];
      }
    }
  }

  if (!coPhimDangNhan)
  {
    dangGiuPhim = false;
    return 0;
  }

  if (dangGiuPhim || now - mocPhim < THOI_GIAN_CHONG_DOI_PHIM)
  {
    return 0;
  }

  dangGiuPhim = true;
  mocPhim = now;
  if (DEBUG_KEYS)
  {
    Serial.print("#KEY:");
    Serial.println(phimNhan);
  }
  return phimNhan;
}
