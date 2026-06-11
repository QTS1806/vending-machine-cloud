import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Box,
  CheckCircle2,
  Coins,
  Database,
  LayoutDashboard,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes("YOUR_PROJECT_REF");

const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
const DEFAULT_MACHINE_ID = "vending-001";
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function money(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

function time(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(value));
}

function vietnamDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(value));
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function vietnamDayLabel(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(value));
}

function isToday(value) {
  if (!value) return false;
  return vietnamDateKey(value) === vietnamDateKey();
}

function ageText(value) {
  if (!value) return "Chưa có tín hiệu";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s trước`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} giờ trước`;
}

function machineTone(machine) {
  if (!machine?.last_seen_at) return "warning";
  const ageMs = Date.now() - new Date(machine.last_seen_at).getTime();
  if (machine.status === "error") return "danger";
  if (ageMs < 45000 && machine.status !== "offline") return "success";
  return "warning";
}

function machineStatusLabel(machine) {
  const tone = machineTone(machine);
  if (tone === "success") return "Hoạt động";
  if (machine?.status === "error") return "Lỗi";
  return "Ngoại tuyến";
}

function productTone(product) {
  if (!product.enabled) return "neutral";
  if (Number(product.stock) <= 0) return "danger";
  if (Number(product.stock) <= 1) return "warning";
  return "success";
}

function productStatusLabel(product) {
  if (!product.enabled) return "Đang tắt";
  if (Number(product.stock) <= 0) return "Hết hàng";
  if (Number(product.stock) <= 1) return "Sắp hết";
  return "Còn hàng";
}

function percent(stock, capacity) {
  const max = Math.max(1, Number(capacity || 0));
  return Math.max(0, Math.min(100, (Number(stock || 0) / max) * 100));
}

function machineNumber(id) {
  const match = String(id || "").match(/(\d+)$/);
  return match ? match[1].padStart(3, "0") : String(id || "-");
}

function displayMachineName(machineOrId) {
  const id = typeof machineOrId === "string" ? machineOrId : machineOrId?.id;
  return `Máy bán hàng ${machineNumber(id)}`;
}

function displayMachineWithId(machineOrId) {
  const id = typeof machineOrId === "string" ? machineOrId : machineOrId?.id;
  if (!id) return "-";
  return `${displayMachineName(machineOrId)} (${id})`;
}

function displayProductName(product) {
  const name = String(product?.name || "").trim();
  if (!name) return `Sản phẩm ${product?.slot || ""}`.trim();
  return name.replace(/^san\s*pham/i, "Sản phẩm");
}

function Pill({ tone, children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function MetricCard({ icon: Icon, label, value, hint, tone = "blue" }) {
  return (
    <section className="metric-card">
      <div className={`metric-icon metric-${tone}`}>
        <Icon size={28} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </section>
  );
}

export default function App() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState(DEFAULT_MACHINE_ID);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [moneyEvents, setMoneyEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newMachineId, setNewMachineId] = useState("vending-002");
  const offlineLoggedRef = useRef(new Set());

  const currentMachine = machines.find((item) => item.id === machineId);

  const dashboard = useMemo(() => {
    const successfulSales = sales.filter((sale) => sale.success);
    const todaySales = successfulSales.filter((sale) => isToday(sale.created_at));
    const todayMoney = moneyEvents.filter((item) => isToday(item.created_at));
    const revenueToday = todaySales.reduce((sum, sale) => sum + Number(sale.unit_price || 0), 0);
    const insertedToday = todayMoney.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const outOfStockProducts = allProducts.filter((item) => item.enabled && Number(item.stock) <= 0);
    const disabledProducts = products.filter((item) => !item.enabled);
    const pendingCommands = commands.filter((item) => item.status === "pending" || item.status === "sent");
    const onlineMachines = machines.filter((machine) => machineTone(machine) === "success");

    const slotSales = new Map();
    for (const sale of todaySales) {
      const slot = Number(sale.product_slot || 0);
      if (!slot) continue;
      const current = slotSales.get(slot) || { slot, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(sale.unit_price || 0);
      slotSales.set(slot, current);
    }

    const topProduct = [...slotSales.values()].sort((a, b) => b.count - a.count)[0];

    const alerts = [];
    for (const item of outOfStockProducts) {
      const machineName = displayMachineName(item.machine_id || currentMachine || machineId);
      alerts.push({
        tone: "danger",
        title: `${machineName} hết hàng`,
        text: `${displayProductName(item)} tại SP${item.slot} đã hết hàng.`,
      });
    }

    const seenEventAlertKeys = new Set();
    for (const event of events.filter((item) => item.severity === "error" || item.severity === "warning")) {
      const dedupeKey =
        event.event_type === "offline_detected"
          ? `${event.machine_id || "unknown"}:offline_detected`
          : `${event.machine_id || "unknown"}:${event.event_type}:${event.id}`;
      if (seenEventAlertKeys.has(dedupeKey)) continue;
      seenEventAlertKeys.add(dedupeKey);
      if (alerts.length >= outOfStockProducts.length + 5) break;

      const eventMachineName = displayMachineWithId(event.machine_id || currentMachine || machineId);
      alerts.push({
        tone: event.severity === "error" ? "danger" : "warning",
        title: event.event_type === "motor_timeout" ? `${eventMachineName}: Động cơ quay quá lâu` : `Cảnh báo ${eventMachineName}`,
        text:
          event.event_type === "offline_detected"
            ? `Không tìm thấy tín hiệu từ ${eventMachineName}. ${event.message || ""}`.trim()
            : event.message || time(event.created_at),
      });
    }

    const activity = [
      ...sales.map((sale) => ({
        id: `sale-${sale.id}`,
        icon: ShoppingCart,
        tone: "success",
        title: `${displayMachineName(sale.machine_id || currentMachine)} bán SP${sale.product_slot} - ${money(sale.unit_price)}`,
        text: time(sale.created_at),
        created_at: sale.created_at,
      })),
      ...moneyEvents.map((item) => ({
        id: `money-${item.id}`,
        icon: Banknote,
        tone: "blue",
        title: `${displayMachineName(item.machine_id || currentMachine)} nhận ${money(item.amount)}`,
        text: time(item.created_at),
        created_at: item.created_at,
      })),
      ...commands.map((command) => ({
        id: `command-${command.id}`,
        icon: Settings,
        tone: command.status === "error" ? "danger" : "neutral",
        title: `${displayMachineName(command.machine_id || currentMachine)}: lệnh ${command.command_type}`,
        text: command.status,
        created_at: command.created_at,
      })),
      ...events.map((event) => ({
        id: `event-${event.id}`,
        icon: event.severity === "error" || event.severity === "warning" ? AlertCircle : ListChecks,
        tone: event.severity === "error" ? "danger" : event.severity === "warning" ? "warning" : "neutral",
        title: `${displayMachineName(event.machine_id || currentMachine)}: ${event.message || event.event_type}`,
        text: time(event.created_at),
        created_at: event.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20);

    return {
      activity,
      alerts,
      disabledProducts,
      insertedToday,
      onlineMachines,
      outOfStockProducts,
      pendingCommands,
      revenueToday,
      soldToday: todaySales.length,
      topProduct,
    };
  }, [allProducts, commands, currentMachine, events, machineId, machines, moneyEvents, sales]);

  const loadData = useCallback(async () => {
    if (!supabase) return;

    setLoading(true);
    setError("");

    const machineResult = await supabase
      .from("machines")
      .select("*")
      .order("created_at", { ascending: true });

    if (machineResult.error) {
      setError(machineResult.error.message);
      setLoading(false);
      return;
    }

    const machineList = machineResult.data || [];
    setMachines(machineList);

    const selectedId = machineList.some((item) => item.id === machineId)
      ? machineId
      : machineList[0]?.id || DEFAULT_MACHINE_ID;

    if (selectedId !== machineId) {
      setMachineId(selectedId);
    }

    const [productResult, allProductResult, salesResult, moneyResult, commandResult, eventResult] =
      await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("machine_id", selectedId)
          .order("slot", { ascending: true }),
        supabase
          .from("products")
          .select("*")
          .order("machine_id", { ascending: true })
          .order("slot", { ascending: true }),
        supabase
          .from("sales")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("money_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("machine_commands")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("machine_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

    const firstError =
      productResult.error ||
      allProductResult.error ||
      salesResult.error ||
      moneyResult.error ||
      commandResult.error ||
      eventResult.error;

    if (firstError) {
      setError(firstError.message);
    } else {
      setProducts(productResult.data || []);
      setAllProducts(allProductResult.data || []);
      setSales(salesResult.data || []);
      setMoneyEvents(moneyResult.data || []);
      setCommands(commandResult.data || []);
      setEvents(eventResult.data || []);
    }

    setLoading(false);
  }, [machineId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!supabase || !machineId) return undefined;

    const timer = window.setInterval(loadData, 6000);
    const channel = supabase
      .channel("vending_global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machines" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sales" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "money_events" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machine_commands" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "machine_events" },
        loadData,
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [machineId, loadData]);

  useEffect(() => {
    if (!supabase || !machines.length) return;

    const offlineEvents = machines
      .filter((machine) => machine?.id && machine.last_seen_at && machineTone(machine) !== "success")
      .filter((machine) => {
        const lastSeen = new Date(machine.last_seen_at).getTime();
        const alreadyLogged = events.some(
          (event) =>
            event.machine_id === machine.id &&
            event.event_type === "offline_detected" &&
            new Date(event.created_at).getTime() > lastSeen,
        );
        const key = `${machine.id}:${machine.last_seen_at}`;
        if (alreadyLogged || offlineLoggedRef.current.has(key)) return false;
        offlineLoggedRef.current.add(key);
        return true;
      })
      .map((machine) => ({
        machine_id: machine.id,
        event_type: "offline_detected",
        severity: "warning",
        message: `Không tìm thấy tín hiệu từ ${displayMachineWithId(machine)} trong ${ageText(machine.last_seen_at)}.`,
      }));

    if (!offlineEvents.length) return;

    supabase
      .from("machine_events")
      .insert(offlineEvents)
      .then(() => loadData());
  }, [events, loadData, machines]);

  useEffect(() => {
    if (!notice && !error) return undefined;

    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 5200);

    return () => window.clearTimeout(timer);
  }, [error, notice]);

  const updateProductField = (slot, field, value) => {
    setProducts((current) =>
      current.map((item) => (item.slot === slot ? { ...item, [field]: value } : item)),
    );
  };

  const createCommand = async (commandType, payload) => {
    const { error: commandError } = await supabase.from("machine_commands").insert({
      machine_id: machineId,
      command_type: commandType,
      payload,
    });

    if (commandError) throw commandError;
  };

  const saveProduct = async (product) => {
    setSaving(`product-${product.slot}`);
    setError("");
    setNotice("");

    const price = Number(product.price);
    const stock = Number(product.stock);
    const capacity = Math.max(Number(product.capacity || 0), stock);

    if (!Number.isInteger(price) || price < 0 || price % 1000 !== 0) {
      setError(`SP${product.slot}: giá không hợp lệ`);
      setSaving("");
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setError(`SP${product.slot}: tồn kho không hợp lệ`);
      setSaving("");
      return;
    }

    const payload = {
      slot: product.slot,
      name: displayProductName(product),
      price,
      stock,
      capacity,
      enabled: Boolean(product.enabled),
    };

    const { error: updateError } = await supabase
      .from("products")
      .update(payload)
      .eq("machine_id", machineId)
      .eq("slot", product.slot);

    if (updateError) {
      setError(updateError.message);
    } else {
      try {
        await createCommand("set_product", payload);
        setNotice(`Đã gửi cấu hình SP${product.slot}`);
        await loadData();
      } catch (commandError) {
        setError(commandError.message);
      }
    }

    setSaving("");
  };

  const sendAllProducts = async () => {
    setSaving("all-products");
    setError("");
    setNotice("");

    try {
      for (const product of products) {
        const payload = {
          slot: Number(product.slot),
          name: displayProductName(product),
          price: Number(product.price),
          stock: Number(product.stock),
          capacity: Number(product.capacity),
          enabled: Boolean(product.enabled),
        };

        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("machine_id", machineId)
          .eq("slot", product.slot);

        if (updateError) throw updateError;
      }

      await createCommand("sync_products", {
        products: products.map((item) => ({
          slot: Number(item.slot),
          name: displayProductName(item),
          price: Number(item.price),
          stock: Number(item.stock),
          capacity: Number(item.capacity),
          enabled: Boolean(item.enabled),
        })),
      });

      setNotice("Đã gửi cấu hình tất cả sản phẩm");
      await loadData();
    } catch (sendError) {
      setError(sendError.message);
    }

    setSaving("");
  };

  const sendSimpleCommand = async (type, payload = {}) => {
    setSaving(type);
    setError("");
    setNotice("");
    try {
      await createCommand(type, payload);
      setNotice(`Đã gửi lệnh ${type}`);
      await loadData();
    } catch (commandError) {
      setError(commandError.message);
    }
    setSaving("");
  };

  const addMachine = async () => {
    const id = newMachineId.trim();
    if (!id) return;

    setSaving("new-machine");
    setError("");
    setNotice("");

    const { error: machineError } = await supabase.from("machines").upsert({
      id,
      name: displayMachineName(id),
      location: "Chưa đặt vị trí",
      status: "offline",
      firmware_version: "cloud-0.1",
    });

    if (machineError) {
      setError(machineError.message);
      setSaving("");
      return;
    }

    const seedProducts = [1, 2, 3, 4].map((slot) => ({
      machine_id: id,
      slot,
      name: `Sản phẩm ${slot}`,
      price: 10000,
      stock: 4,
      capacity: 4,
      enabled: true,
    }));

    const { error: productError } = await supabase.from("products").upsert(seedProducts, {
      onConflict: "machine_id,slot",
    });

    if (productError) {
      setError(productError.message);
    } else {
      setMachineId(id);
      setNotice(`Đã tạo máy ${id}`);
      await loadData();
    }

    setSaving("");
  };

  const deleteCurrentMachine = async () => {
    if (!currentMachine) return;

    if (machineId === DEFAULT_MACHINE_ID) {
      setError(`Không xóa máy mặc định ${DEFAULT_MACHINE_ID}.`);
      return;
    }

    const ok = window.confirm(
      `Xóa ${displayMachineName(currentMachine)}? Toàn bộ sản phẩm, lịch sử bán, tiền, lệnh và sự kiện của máy này cũng sẽ bị xóa.`,
    );
    if (!ok) return;

    setSaving("delete-machine");
    setError("");
    setNotice("");

    const { error: deleteError } = await supabase.from("machines").delete().eq("id", machineId);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      const remainingMachines = machines.filter((machine) => machine.id !== machineId);
      const nextMachineId = remainingMachines[0]?.id || DEFAULT_MACHINE_ID;

      setMachines(remainingMachines);
      setMachineId(nextMachineId);
      setProducts([]);
      setSales([]);
      setMoneyEvents([]);
      setCommands([]);
      setEvents([]);
      setNotice(`Đã xóa máy ${machineId}`);
    }

    setSaving("");
  };

  if (!isConfigured) {
    return (
      <main className="config-screen">
        <section className="config-panel">
          <AlertCircle size={28} />
          <div>
            <h1>Nhóm 1</h1>
            <p>Thiếu biến môi trường Supabase.</p>
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_ANON_KEY</code>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-frame">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <section className="workspace">
        <header className="app-topbar">
          <button className="filter-button" type="button" onClick={loadData} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} />
            <span>{loading ? "Đang tải" : "Làm mới"}</span>
          </button>
        </header>

        <section className="content">
          <PageHeader
            activeTab={activeTab}
          />

          {error && (
            <section className="notice notice-danger">
              <AlertCircle size={18} />
              <span>{error}</span>
            </section>
          )}

          {notice && (
            <section className="notice notice-success">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
            </section>
          )}

          {activeTab === "overview" && (
            <OverviewPage
              dashboard={dashboard}
              machines={machines}
              products={products}
              sales={sales}
              machineId={machineId}
              setMachineId={setMachineId}
            />
          )}

          {activeTab === "machines" && (
            <MachinesPage
              machines={machines}
              machineId={machineId}
              setMachineId={setMachineId}
              newMachineId={newMachineId}
              setNewMachineId={setNewMachineId}
              addMachine={addMachine}
              deleteCurrentMachine={deleteCurrentMachine}
              saving={saving}
              currentMachine={currentMachine}
            />
          )}

          {activeTab === "products" && (
            <ProductsPage
              currentMachine={currentMachine}
              machineId={machineId}
              machines={machines}
              products={products}
              setMachineId={setMachineId}
              updateProductField={updateProductField}
              saveProduct={saveProduct}
              saving={saving}
            />
          )}

          {activeTab === "sales" && (
            <DataTable
              title="Lịch sử bán hàng"
              rows={sales}
              columns={[
                ["created_at", "Thời gian", (row) => time(row.created_at)],
                ["machine_id", "Máy", (row) => displayMachineWithId(row.machine_id || currentMachine)],
                ["product_name", "Sản phẩm", (row) => displayProductName({ name: row.product_name, slot: row.product_slot })],
                ["unit_price", "Giá", (row) => money(row.unit_price)],
                ["credit_after", "Tiền còn lại", (row) => money(row.credit_after)],
                ["success", "Kết quả", (row) => <Pill tone={row.success ? "success" : "danger"}>{row.success ? "OK" : "Lỗi"}</Pill>],
              ]}
            />
          )}

          {activeTab === "money" && (
            <MoneyPage currentMachine={currentMachine} machines={machines} moneyEvents={moneyEvents} events={events} />
          )}

          {activeTab === "alerts" && (
            <AlertsPage alerts={dashboard.alerts} events={events} currentMachine={currentMachine} />
          )}

          {activeTab === "commands" && (
            <DataTable
              title="Lệnh cấu hình"
              rows={commands}
              columns={[
                ["created_at", "Tạo lúc", (row) => time(row.created_at)],
                ["machine_id", "Máy", (row) => displayMachineWithId(row.machine_id || currentMachine)],
                ["command_type", "Lệnh", (row) => row.command_type],
                ["status", "Trạng thái", (row) => <Pill tone={row.status === "done" ? "success" : row.status === "error" ? "danger" : "warning"}>{row.status}</Pill>],
                ["payload", "Payload", (row) => JSON.stringify(row.payload)],
                ["processed_at", "Xử lý", (row) => time(row.processed_at)],
              ]}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function Sidebar({ activeTab, setActiveTab }) {
  const items = [
    ["overview", LayoutDashboard, "Tổng quan"],
    ["machines", Database, "Máy bán hàng"],
    ["products", Box, "Tồn kho"],
    ["sales", ShoppingCart, "Bán hàng"],
    ["money", Banknote, "Tiền"],
    ["alerts", AlertTriangle, "Cảnh báo"],
    ["commands", ListChecks, "Lệnh cấu hình"],
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Database size={26} />
        </div>
        <div>
          <strong>Nhóm 1</strong>
          <span>Vending Management</span>
        </div>
      </div>

      <nav className="side-nav">
        {items.map(([id, Icon, label]) => (
          <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function PageHeader({ activeTab }) {
  const titles = {
    overview: ["Hệ thống quản lý máy bán hàng tự động", "Theo dõi trạng thái, tồn kho và doanh thu theo thời gian thực"],
    machines: ["Máy bán hàng", "Thêm, chọn và xóa các máy đang quản lý"],
    products: ["Tồn kho sản phẩm", "Cập nhật giá, số lượng và trạng thái từng slot"],
    sales: ["Lịch sử bán hàng", "Theo dõi các giao dịch bán thành công từ ESP32"],
    money: ["Tiền và giao dịch", "Theo dõi tiền đã nhận và tiền đã trả lại"],
    alerts: ["Cảnh báo", "Những việc cần chú ý từ máy và cloud"],
    commands: ["Lệnh cấu hình", "Theo dõi lệnh web gửi xuống ESP32"],
  };
  const [title, subtitle] = titles[activeTab] || titles.overview;

  return (
    <section className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

function OverviewPage({ dashboard, machines, products, sales, machineId, setMachineId }) {
  return (
    <>
      <section className="metric-grid">
        <MetricCard icon={Database} label="Tổng số máy" value={machines.length} hint={`${dashboard.onlineMachines.length} máy đang hoạt động`} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Máy đang hoạt động" value={dashboard.onlineMachines.length} hint={`${machines.length ? Math.round((dashboard.onlineMachines.length / machines.length) * 100) : 0}% tổng số máy`} tone="green" />
        <MetricCard icon={TrendingUp} label="Doanh thu hôm nay" value={money(dashboard.revenueToday)} hint={`${dashboard.soldToday} sản phẩm đã bán`} tone="teal" />
        <MetricCard icon={AlertTriangle} label="Sản phẩm hết hàng" value={dashboard.outOfStockProducts.length} hint={`${dashboard.outOfStockProducts.length} sản phẩm hết hàng`} tone="orange" />
      </section>

      <section className="dashboard-grid">
        <section className="overview-left-stack">
          <section className="panel machine-table-panel">
            <div className="panel-heading">
              <h2>Danh sách máy bán hàng</h2>
              <span>{machines.length} máy</span>
            </div>
            <MachineTable machines={machines} selectedId={machineId} onSelect={setMachineId} />
          </section>

          <section className="panel chart-panel">
            <div className="panel-heading">
              <h2>Doanh thu 7 ngày</h2>
              <span>7 ngày qua</span>
            </div>
            <RevenueBars sales={sales} />
          </section>
        </section>

        <section className="right-stack">
          <AlertPanel alerts={dashboard.alerts} />
          <ActivityPanel activity={dashboard.activity} />
        </section>
      </section>
    </>
  );
}

function MachineTable({ machines, selectedId, onSelect }) {
  return (
    <div className="machine-table">
      <div className="machine-table-head">
        <span>Mã máy</span>
        <span>Trạng thái</span>
        <span>Số dư</span>
        <span>Doanh thu</span>
        <span>Kết nối</span>
      </div>
      {machines.map((machine) => {
        const tone = machineTone(machine);
        return (
          <button key={machine.id} className={`machine-row ${machine.id === selectedId ? "active" : ""}`} onClick={() => onSelect(machine.id)}>
            <span>
              <strong>{displayMachineName(machine)}</strong>
              <small>{machine.id}</small>
            </span>
            <Pill tone={tone}>{machineStatusLabel(machine)}</Pill>
            <span>{money(machine.current_credit)}</span>
            <span>{money(machine.total_revenue)}</span>
            <span className={`connection-dot connection-dot-${tone}`} />
          </button>
        );
      })}
      {!machines.length && <div className="empty compact">Chưa có máy</div>}
    </div>
  );
}

function AlertPanel({ alerts }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Cảnh báo</h2>
        <span>{alerts.length || "Ổn định"}</span>
      </div>
      <div className="alert-list">
        {alerts.map((alert) => (
          <article key={`${alert.title}-${alert.text}`} className={`alert-card alert-card-${alert.tone}`}>
            {alert.tone === "danger" ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.text}</p>
            </div>
          </article>
        ))}
        {!alerts.length && (
          <article className="empty-state">
            <CheckCircle2 size={22} />
            <div>
              <strong>Không có cảnh báo</strong>
              <p>Máy đang ổn định.</p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function ActivityPanel({ activity }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Hoạt động gần đây</h2>
        <span>{activity.length} mục</span>
      </div>
      <div className="activity-list">
        {activity.map((item) => (
          <article key={item.id} className="activity-item">
            <span className={`activity-icon activity-${item.tone}`}>
              <item.icon size={18} />
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </div>
          </article>
        ))}
        {!activity.length && <div className="empty compact">Chưa có hoạt động</div>}
      </div>
    </section>
  );
}

function RevenueBars({ sales }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000);
    const key = vietnamDateKey(date);
    return {
      key,
      label: vietnamDayLabel(date),
      revenue: 0,
    };
  });

  const dayMap = new Map(days.map((day) => [day.key, day]));
  for (const sale of sales) {
    if (!sale.success || !sale.created_at) continue;
    const key = vietnamDateKey(sale.created_at);
    const day = dayMap.get(key);
    if (day) {
      day.revenue += Number(sale.unit_price || 0);
    }
  }

  const max = Math.max(1, ...days.map((day) => day.revenue));

  return (
    <div className="revenue-chart">
      <div className="chart-legend">
        <span className="legend-bar" />
        <span>Doanh thu</span>
      </div>
      <div className="bars">
        {days.map((day) => {
          const height = day.revenue > 0 ? Math.max(18, (day.revenue / max) * 100) : 4;
          return (
            <div key={day.key} className="bar-item">
              <strong>{day.revenue ? money(day.revenue) : ""}</strong>
              <span style={{ height: `${height}%` }} />
              <small>{day.label}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MachinesPage({ machines, machineId, setMachineId, newMachineId, setNewMachineId, addMachine, deleteCurrentMachine, saving, currentMachine }) {
  return (
    <section className="two-column">
      <section className="panel">
        <div className="panel-heading">
          <h2>Danh sách máy</h2>
          <span>{machines.length} máy</span>
        </div>
        <MachineTable machines={machines} selectedId={machineId} onSelect={setMachineId} />
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>Quản lý máy</h2>
          <span>{currentMachine?.id || "-"}</span>
        </div>
        <label>
          Mã máy mới
          <input value={newMachineId} onChange={(event) => setNewMachineId(event.target.value)} spellCheck="false" />
        </label>
        <div className="quick-actions">
          <button className="primary-button" onClick={addMachine} disabled={saving === "new-machine"}>
            <Plus size={18} />
            <span>Thêm máy</span>
          </button>
          <button className="icon-button danger-action" onClick={deleteCurrentMachine} disabled={!currentMachine || machineId === DEFAULT_MACHINE_ID || saving === "delete-machine"}>
            <Trash2 size={18} />
            <span>{saving === "delete-machine" ? "Đang xóa" : "Xóa máy"}</span>
          </button>
        </div>
      </section>
    </section>
  );
}

function ProductsPage({ currentMachine, machineId, machines, products, setMachineId, updateProductField, saveProduct, saving }) {
  const totalStock = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const outOfStock = products.filter((product) => product.enabled && Number(product.stock) <= 0).length;

  return (
    <section className="stack">
      <section className="inventory-header panel">
        <div>
          <p>Máy đang chỉnh</p>
          <h2>{displayMachineName(currentMachine || machineId)}</h2>
          <span>{machineId}</span>
        </div>
        <label>
          Chọn máy
          <select value={machineId} onChange={(event) => setMachineId(event.target.value)}>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {displayMachineName(machine)} ({machine.id})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="inventory-summary">
        <MetricCard icon={Box} label="Tổng tồn kho" value={totalStock} hint={`${products.length} slot sản phẩm`} tone="blue" />
        <MetricCard icon={AlertTriangle} label="Sản phẩm hết hàng" value={outOfStock} hint={`${outOfStock} sản phẩm hết hàng`} tone="orange" />
      </section>

      <section className="inventory-grid">
        {products.map((product) => {
          const fill = percent(product.stock, product.capacity);
          const tone = productTone(product);
          return (
            <article key={product.id} className={`inventory-card inventory-card-${tone}`}>
              <header className="inventory-card-head">
                <div className="slot-badge">SP{product.slot}</div>
                <div>
                  <h2>{displayProductName(product)}</h2>
                  <p>{money(product.price)} · còn {Number(product.stock || 0)} sản phẩm</p>
                </div>
                <Pill tone={tone}>{productStatusLabel(product)}</Pill>
              </header>

              <div className={`stock-meter stock-meter-${tone}`}>
                <span style={{ width: `${fill}%` }} />
              </div>

              <div className="inventory-fields">
                <label>
                  Tên sản phẩm
                  <input value={displayProductName(product)} onChange={(event) => updateProductField(product.slot, "name", event.target.value)} />
                </label>
                <label>
                  Giá bán
                  <input type="number" min="0" step="1000" value={product.price} onChange={(event) => updateProductField(product.slot, "price", event.target.value)} />
                </label>
                <label>
                  Số lượng còn
                  <input type="number" min="0" value={product.stock} onChange={(event) => updateProductField(product.slot, "stock", event.target.value)} />
                </label>
              </div>

              <footer className="inventory-actions">
                <button className="primary-button" onClick={() => saveProduct(product)} disabled={saving === `product-${product.slot}`}>
                  <Save size={18} />
                  <span>{saving === `product-${product.slot}` ? "Đang cập nhật" : "Cập nhật sản phẩm"}</span>
                </button>
              </footer>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function MoneyPage({ currentMachine, machines, moneyEvents, events }) {
  const machineLookup = new Map(machines.map((machine) => [machine.id, machine]));
  const machineFor = (machineId) => machineLookup.get(machineId) || machineId || currentMachine;
  const receivedRows = moneyEvents.map((event) => ({
    ...event,
    transactionType: "in",
    transactionLabel: "Tiền nhận",
    machineName: displayMachineName(machineFor(event.machine_id)),
  }));
  const refundedAmount = machines.reduce((sum, machine) => sum + Number(machine.total_refunded || 0), 0);
  const refundEventRows = events
    .filter((event) => event.event_type === "refund")
    .map((event) => ({
      id: `refund-event-${event.id}`,
      created_at: event.created_at,
      amount: Number(event.payload?.amount || 0),
      transactionType: "out",
      transactionLabel: "Tiền ra",
      machineName: displayMachineName(machineFor(event.machine_id)),
    }))
    .filter((event) => event.amount > 0);
  const refundEventTotal = refundEventRows.reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const displayedRefundedAmount = Math.max(refundedAmount, refundEventTotal);
  const refundRows = !refundEventRows.length && displayedRefundedAmount
    ? [
        {
          id: `refund-${currentMachine?.id || "machine"}`,
          created_at: currentMachine?.updated_at || currentMachine?.last_seen_at,
          amount: displayedRefundedAmount,
          transactionType: "out",
          transactionLabel: "Tiền ra",
          machineName: "Tất cả máy",
        },
      ]
    : [];
  const transactionRows = [...receivedRows, ...refundEventRows, ...refundRows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <section className="stack">
      <section className="metric-grid compact-grid">
        <MetricCard icon={Banknote} label="Tiền đã nhận" value={money(machines.reduce((sum, machine) => sum + Number(machine.cash_in_box || 0), 0))} tone="blue" />
        <MetricCard icon={Coins} label="Tiền đã trả lại" value={money(displayedRefundedAmount)} tone="orange" />
      </section>
      <DataTable
        title="Lịch sử giao dịch"
        rows={transactionRows}
        columns={[
          ["created_at", "Thời gian", (row) => time(row.created_at)],
          [
            "amount",
            "Giao dịch",
            (row) => (
              <span className={`transaction-amount transaction-${row.transactionType}`}>
                {row.transactionType === "out" ? "-" : "+"} {money(row.amount)}
              </span>
            ),
          ],
          ["transactionLabel", "Loại", (row) => row.transactionLabel],
          ["machineName", "Nguồn", (row) => row.machineName],
        ]}
      />
    </section>
  );
}

function AlertsPage({ alerts, events, currentMachine }) {
  return (
    <section className="two-column">
      <AlertPanel alerts={alerts} />
      <DataTable
        title="Nhật ký máy"
        rows={events}
        columns={[
          ["created_at", "Thời gian", (row) => time(row.created_at)],
          ["machine_id", "Máy", (row) => displayMachineWithId(row.machine_id || currentMachine)],
          ["event_type", "Loại", (row) => row.event_type],
          ["severity", "Mức", (row) => <Pill tone={row.severity === "error" ? "danger" : row.severity === "warning" ? "warning" : "neutral"}>{row.severity}</Pill>],
          ["message", "Nội dung", (row) => row.message || "-"],
        ]}
      />
    </section>
  );
}

function DataTable({ title, rows, columns }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{rows.length} dòng</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map(([key, , render]) => (
                  <td key={key}>{render(row)}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="empty" colSpan={columns.length}>
                  Chưa có dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
