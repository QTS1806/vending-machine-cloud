import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Bell,
  Box,
  CheckCircle2,
  ChevronRight,
  Coins,
  CreditCard,
  Database,
  LayoutDashboard,
  ListChecks,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes("YOUR_PROJECT_REF");

const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
const DEFAULT_MACHINE_ID = "vending-001";

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
  }).format(new Date(value));
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isToday(value) {
  if (!value) return false;
  return new Date(value) >= startOfToday();
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

function percent(stock, capacity) {
  const max = Math.max(1, Number(capacity || 0));
  return Math.max(0, Math.min(100, (Number(stock || 0) / max) * 100));
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

  const currentMachine = machines.find((item) => item.id === machineId);
  const onlineTone = machineTone(currentMachine);

  const dashboard = useMemo(() => {
    const successfulSales = sales.filter((sale) => sale.success);
    const todaySales = successfulSales.filter((sale) => isToday(sale.created_at));
    const todayMoney = moneyEvents.filter((item) => isToday(item.created_at));
    const revenueToday = todaySales.reduce((sum, sale) => sum + Number(sale.unit_price || 0), 0);
    const insertedToday = todayMoney.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const lowStockProducts = products.filter((item) => item.enabled && Number(item.stock) <= 1);
    const disabledProducts = products.filter((item) => !item.enabled);
    const pendingCommands = commands.filter((item) => item.status === "pending" || item.status === "sent");
    const failedCommands = commands.filter((item) => item.status === "error");
    const onlineMachines = machines.filter((machine) => machineTone(machine) === "success");
    const totalStock = products.reduce((sum, item) => sum + Number(item.stock || 0), 0);

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
    if (onlineTone !== "success") {
      alerts.push({
        tone: "danger",
        title: "Máy đang xem ngoại tuyến",
        text: `Tín hiệu cuối: ${ageText(currentMachine?.last_seen_at)}.`,
      });
    }
    for (const item of lowStockProducts) {
      alerts.push({
        tone: Number(item.stock) <= 0 ? "danger" : "warning",
        title: `SP${item.slot} ${Number(item.stock) <= 0 ? "hết hàng" : "sắp hết"}`,
        text: `${item.name || "Sản phẩm"} còn ${Number(item.stock || 0)}/${Number(item.capacity || 0)}.`,
      });
    }
    if (pendingCommands.length) {
      alerts.push({
        tone: "warning",
        title: "Có lệnh đang chờ ESP32",
        text: `${pendingCommands.length} lệnh pending/sent.`,
      });
    }
    if (failedCommands.length) {
      alerts.push({
        tone: "danger",
        title: "Có lệnh cấu hình lỗi",
        text: `${failedCommands.length} lệnh bị lỗi.`,
      });
    }

    const activity = [
      ...sales.slice(0, 3).map((sale) => ({
        id: `sale-${sale.id}`,
        icon: ShoppingCart,
        tone: "success",
        title: `Bán SP${sale.product_slot} - ${money(sale.unit_price)}`,
        text: time(sale.created_at),
      })),
      ...moneyEvents.slice(0, 3).map((item) => ({
        id: `money-${item.id}`,
        icon: Banknote,
        tone: "blue",
        title: `Nhận ${money(item.amount)}`,
        text: time(item.created_at),
      })),
      ...commands.slice(0, 2).map((command) => ({
        id: `command-${command.id}`,
        icon: Settings,
        tone: command.status === "error" ? "danger" : "neutral",
        title: `Lệnh ${command.command_type}`,
        text: command.status,
      })),
    ].slice(0, 6);

    return {
      activity,
      alerts,
      disabledProducts,
      insertedToday,
      lowStockProducts,
      onlineMachines,
      pendingCommands,
      revenueToday,
      soldToday: todaySales.length,
      topProduct,
      totalStock,
    };
  }, [commands, currentMachine, machines, moneyEvents, onlineTone, products, sales]);

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

    const [productResult, salesResult, moneyResult, commandResult, eventResult] =
      await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("machine_id", selectedId)
          .order("slot", { ascending: true }),
        supabase
          .from("sales")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("money_events")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("machine_commands")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("machine_events")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

    const firstError =
      productResult.error ||
      salesResult.error ||
      moneyResult.error ||
      commandResult.error ||
      eventResult.error;

    if (firstError) {
      setError(firstError.message);
    } else {
      setProducts(productResult.data || []);
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
      .channel(`vending_${machineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machines", filter: `id=eq.${machineId}` },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `machine_id=eq.${machineId}` },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sales", filter: `machine_id=eq.${machineId}` },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "money_events", filter: `machine_id=eq.${machineId}` },
        loadData,
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [machineId, loadData]);

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
    const capacity = Number(product.capacity);

    if (!Number.isInteger(price) || price < 0 || price % 1000 !== 0) {
      setError(`SP${product.slot}: giá không hợp lệ`);
      setSaving("");
      return;
    }

    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(capacity) || capacity < stock) {
      setError(`SP${product.slot}: tồn kho/sức chứa không hợp lệ`);
      setSaving("");
      return;
    }

    const payload = {
      slot: product.slot,
      name: product.name || `Sản phẩm ${product.slot}`,
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
          name: product.name || `Sản phẩm ${product.slot}`,
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
          name: item.name || `Sản phẩm ${item.slot}`,
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
      name: `Máy bán hàng ${id}`,
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
      `Xóa máy ${currentMachine.name || machineId}? Toàn bộ sản phẩm, lịch sử bán, tiền, lệnh và sự kiện của máy này cũng sẽ bị xóa.`,
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
            <h1>VendoPro</h1>
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
          <button className="ghost-button" type="button" aria-label="Mở menu">
            <Menu size={20} />
          </button>
          <div className="search-box">
            <Search size={18} />
            <input placeholder="Tìm kiếm máy, sản phẩm, lệnh..." spellCheck="false" />
          </div>
          <button className="filter-button" type="button" onClick={loadData} disabled={loading}>
            <SlidersHorizontal size={18} />
            <span>{loading ? "Đang tải" : "Làm mới"}</span>
          </button>
          <div className="top-alert">
            <Bell size={19} />
            {dashboard.alerts.length > 0 && <span>{dashboard.alerts.length}</span>}
          </div>
          <div className="admin-chip">
            <div>Q</div>
            <span>
              <strong>Admin</strong>
              <small>Quản trị viên</small>
            </span>
          </div>
        </header>

        <section className="content">
          <PageHeader
            activeTab={activeTab}
            onlineTone={onlineTone}
            currentMachine={currentMachine}
            loadData={loadData}
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
              currentMachine={currentMachine}
              machineId={machineId}
              setMachineId={setMachineId}
              sendAllProducts={sendAllProducts}
              sendSimpleCommand={sendSimpleCommand}
              saving={saving}
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
              products={products}
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
                ["product_slot", "Slot", (row) => `SP${row.product_slot}`],
                ["product_name", "Sản phẩm", (row) => row.product_name || "-"],
                ["unit_price", "Giá", (row) => money(row.unit_price)],
                ["credit_after", "Tiền còn lại", (row) => money(row.credit_after)],
                ["success", "Kết quả", (row) => <Pill tone={row.success ? "success" : "danger"}>{row.success ? "OK" : "Lỗi"}</Pill>],
              ]}
            />
          )}

          {activeTab === "money" && (
            <MoneyPage currentMachine={currentMachine} moneyEvents={moneyEvents} />
          )}

          {activeTab === "alerts" && (
            <AlertsPage alerts={dashboard.alerts} events={events} />
          )}

          {activeTab === "commands" && (
            <DataTable
              title="Lệnh cấu hình"
              rows={commands}
              columns={[
                ["created_at", "Tạo lúc", (row) => time(row.created_at)],
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
    ["money", CreditCard, "Tiền"],
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
          <strong>VendoPro</strong>
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

      <div className="sidebar-footer">
        <strong>Gói thử nghiệm</strong>
        <span>Supabase + ESP32</span>
      </div>
    </aside>
  );
}

function PageHeader({ activeTab, currentMachine, onlineTone }) {
  const titles = {
    overview: ["Quản lý máy bán hàng tự động", "Theo dõi trạng thái, tồn kho và doanh thu theo thời gian thực"],
    machines: ["Máy bán hàng", "Thêm, chọn và xóa các máy đang quản lý"],
    products: ["Tồn kho sản phẩm", "Cập nhật giá, số lượng và trạng thái từng slot"],
    sales: ["Lịch sử bán hàng", "Theo dõi các giao dịch bán thành công từ ESP32"],
    money: ["Tiền và giao dịch", "Theo dõi tiền nhận, tiền trong hộp và tiền đã trả lại"],
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
      <div className={`machine-status machine-status-${onlineTone}`}>
        {onlineTone === "success" ? <Wifi size={18} /> : <WifiOff size={18} />}
        <span>{currentMachine?.id || "Chưa có máy"}</span>
      </div>
    </section>
  );
}

function OverviewPage({ dashboard, machines, products, sales, currentMachine, machineId, setMachineId, sendAllProducts, sendSimpleCommand, saving }) {
  return (
    <>
      <section className="metric-grid">
        <MetricCard icon={Database} label="Tổng số máy" value={machines.length} hint={`${dashboard.onlineMachines.length} máy đang hoạt động`} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Máy đang hoạt động" value={dashboard.onlineMachines.length} hint={`${machines.length ? Math.round((dashboard.onlineMachines.length / machines.length) * 100) : 0}% tổng số máy`} tone="green" />
        <MetricCard icon={TrendingUp} label="Doanh thu hôm nay" value={money(dashboard.revenueToday)} hint={`${dashboard.soldToday} sản phẩm đã bán`} tone="teal" />
        <MetricCard icon={AlertTriangle} label="Cảnh báo tồn kho" value={dashboard.lowStockProducts.length} hint="Slot sắp hết hoặc hết hàng" tone="orange" />
      </section>

      <section className="dashboard-grid">
        <section className="panel machine-table-panel">
          <div className="panel-heading">
            <h2>Danh sách máy bán hàng</h2>
            <button className="mini-button" onClick={() => setMachineId(machineId)}>
              Xem tất cả <ChevronRight size={16} />
            </button>
          </div>
          <MachineTable machines={machines} selectedId={machineId} onSelect={setMachineId} />
        </section>

        <section className="right-stack">
          <AlertPanel alerts={dashboard.alerts} />
          <ActivityPanel activity={dashboard.activity} />
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>Doanh thu gần đây</h2>
            <span>30 giao dịch mới nhất</span>
          </div>
          <RevenueBars sales={sales} />
        </section>

        <section className="panel stock-panel">
          <div className="panel-heading">
            <h2>Tồn kho sản phẩm</h2>
            <span>{dashboard.totalStock} sản phẩm</span>
          </div>
          <StockList products={products} />
        </section>

        <section className="panel quick-panel">
          <div className="panel-heading">
            <h2>Thao tác nhanh</h2>
            <span>{currentMachine?.id || "-"}</span>
          </div>
          <div className="quick-actions">
            <button className="primary-button" onClick={sendAllProducts} disabled={!products.length || saving === "all-products"}>
              <Send size={18} />
              <span>{saving === "all-products" ? "Đang gửi" : "Gửi cấu hình"}</span>
            </button>
            <button className="icon-button" onClick={() => sendSimpleCommand("refresh_config")} disabled={saving === "refresh_config"}>
              <RefreshCw size={18} />
              <span>Đồng bộ lại</span>
            </button>
          </div>
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
        <span>Tồn kho</span>
        <span>Doanh thu</span>
        <span>Kết nối</span>
      </div>
      {machines.map((machine) => {
        const tone = machineTone(machine);
        return (
          <button key={machine.id} className={`machine-row ${machine.id === selectedId ? "active" : ""}`} onClick={() => onSelect(machine.id)}>
            <span>
              <strong>{machine.name}</strong>
              <small>{machine.id}</small>
            </span>
            <Pill tone={tone}>{machineStatusLabel(machine)}</Pill>
            <span>{money(machine.cash_in_box)}</span>
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
  const recent = sales.slice(0, 7).reverse();
  const max = Math.max(1, ...recent.map((sale) => Number(sale.unit_price || 0)));

  return (
    <div className="bars">
      {recent.map((sale, index) => {
        const height = Math.max(18, (Number(sale.unit_price || 0) / max) * 100);
        return (
          <div key={sale.id || index} className="bar-item">
            <span style={{ height: `${height}%` }} />
            <small>SP{sale.product_slot}</small>
          </div>
        );
      })}
      {!recent.length && <div className="empty compact">Chưa có dữ liệu bán hàng</div>}
    </div>
  );
}

function StockList({ products }) {
  return (
    <div className="stock-list">
      {products.slice(0, 6).map((product) => {
        const fill = percent(product.stock, product.capacity);
        return (
          <article key={product.id} className="stock-row">
            <div>
              <strong>{product.name || `SP${product.slot}`}</strong>
              <small>SP{product.slot} · {Number(product.stock || 0)} còn lại</small>
            </div>
            <div className={`stock-meter stock-meter-${productTone(product)}`}>
              <span style={{ width: `${fill}%` }} />
            </div>
            <Pill tone={productTone(product)}>{Math.round(fill)}%</Pill>
          </article>
        );
      })}
      {!products.length && <div className="empty compact">Chưa có sản phẩm</div>}
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

function ProductsPage({ products, updateProductField, saveProduct, saving }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Tồn kho sản phẩm</h2>
        <span>{products.length} slot</span>
      </div>
      <div className="product-grid">
        {products.map((product) => (
          <article key={product.id} className={`product-row product-row-${productTone(product)}`}>
            <div className="slot-badge">SP{product.slot}</div>
            <label>
              Tên
              <input value={product.name || ""} onChange={(event) => updateProductField(product.slot, "name", event.target.value)} />
            </label>
            <label>
              Giá
              <input type="number" min="0" step="1000" value={product.price} onChange={(event) => updateProductField(product.slot, "price", event.target.value)} />
            </label>
            <label>
              Tồn
              <input type="number" min="0" value={product.stock} onChange={(event) => updateProductField(product.slot, "stock", event.target.value)} />
            </label>
            <label>
              Sức chứa
              <input type="number" min="0" value={product.capacity} onChange={(event) => updateProductField(product.slot, "capacity", event.target.value)} />
            </label>
            <label className="switch-row">
              <input type="checkbox" checked={Boolean(product.enabled)} onChange={(event) => updateProductField(product.slot, "enabled", event.target.checked)} />
              Bật
            </label>
            <button className="icon-button save-button" onClick={() => saveProduct(product)} disabled={saving === `product-${product.slot}`}>
              <Save size={18} />
              <span>Lưu</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function MoneyPage({ currentMachine, moneyEvents }) {
  return (
    <section className="stack">
      <section className="metric-grid compact-grid">
        <MetricCard icon={Banknote} label="Tiền trong hộp" value={money(currentMachine?.cash_in_box)} tone="blue" />
        <MetricCard icon={Coins} label="Tiền đã trả lại" value={money(currentMachine?.total_refunded)} tone="orange" />
        <MetricCard icon={CreditCard} label="Tiền đang có" value={money(currentMachine?.current_credit)} tone="green" />
      </section>
      <DataTable
        title="Sự kiện nhận tiền"
        rows={moneyEvents}
        columns={[
          ["created_at", "Thời gian", (row) => time(row.created_at)],
          ["amount", "Mệnh giá", (row) => money(row.amount)],
          ["source", "Nguồn", (row) => row.source],
          ["raw_label", "Nhãn", (row) => row.raw_label || "-"],
          ["confidence", "Độ tin cậy", (row) => row.confidence || "-"],
        ]}
      />
    </section>
  );
}

function AlertsPage({ alerts, events }) {
  return (
    <section className="two-column">
      <AlertPanel alerts={alerts} />
      <DataTable
        title="Nhật ký máy"
        rows={events}
        columns={[
          ["created_at", "Thời gian", (row) => time(row.created_at)],
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
