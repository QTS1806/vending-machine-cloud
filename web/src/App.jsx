import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Banknote,
  Box,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  Database,
  MapPin,
  PackageCheck,
  Plus,
  Power,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShoppingCart,
  TrendingUp,
  Wifi,
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
  if (tone === "success") return "Online";
  if (machine?.status === "error") return "Lỗi";
  return "Mất kết nối";
}

function productTone(product) {
  if (!product.enabled) return "neutral";
  if (Number(product.stock) <= 0) return "danger";
  if (Number(product.stock) <= 1) return "warning";
  return "success";
}

function Stat({ icon: Icon, label, value, tone = "neutral", hint }) {
  return (
    <section className={`stat stat-${tone}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </section>
  );
}

function Pill({ tone, children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
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
    const totalStock = products.reduce((sum, item) => sum + Number(item.stock || 0), 0);

    const alerts = [];
    if (onlineTone !== "success") {
      alerts.push({
        tone: "danger",
        title: "Máy không còn online",
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
        title: "Có lệnh đang chờ ESP32 xử lý",
        text: `${pendingCommands.length} lệnh pending/sent.`,
      });
    }
    if (failedCommands.length) {
      alerts.push({
        tone: "danger",
        title: "Có lệnh cấu hình lỗi",
        text: `${failedCommands.length} lệnh bị lỗi, cần xem tab Lệnh.`,
      });
    }

    return {
      alerts,
      disabledProducts,
      insertedToday,
      lowStockProducts,
      pendingCommands,
      revenueToday,
      soldToday: todaySales.length,
      topProduct,
      totalStock,
    };
  }, [commands, currentMachine, moneyEvents, onlineTone, products, sales]);

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

    if (commandError) {
      throw commandError;
    }
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

  if (!isConfigured) {
    return (
      <main className="shell">
        <section className="config-panel">
          <AlertCircle size={28} />
          <div>
            <h1>Vending Cloud</h1>
            <p>Thiếu biến môi trường Supabase.</p>
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_ANON_KEY</code>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Vending Cloud</p>
          <h1>Quản lý máy bán hàng</h1>
        </div>
        <div className={`connection connection-${onlineTone}`}>
          {onlineTone === "success" ? <Wifi size={17} /> : <AlertCircle size={17} />}
          <span>{machineStatusLabel(currentMachine)}</span>
        </div>
      </header>

      <section className="toolbar">
        <label>
          Máy đang xem
          <select value={machineId} onChange={(event) => setMachineId(event.target.value)}>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name} ({machine.id})
              </option>
            ))}
          </select>
        </label>

        <label>
          Thêm máy
          <input
            value={newMachineId}
            onChange={(event) => setNewMachineId(event.target.value)}
            spellCheck="false"
          />
        </label>

        <button className="icon-button" onClick={addMachine} disabled={saving === "new-machine"}>
          <Plus size={18} />
          <span>Thêm</span>
        </button>

        <button className="icon-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          <span>Làm mới</span>
        </button>
      </section>

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

      <section className="stats-grid">
        <Stat icon={ShoppingCart} label="Đã bán hôm nay" value={dashboard.soldToday} tone="success" />
        <Stat icon={Coins} label="Doanh thu hôm nay" value={money(dashboard.revenueToday)} tone="money" />
        <Stat icon={Banknote} label="Tiền nhận hôm nay" value={money(dashboard.insertedToday)} tone="money" />
        <Stat
          icon={Clock3}
          label="Tín hiệu cuối"
          value={ageText(currentMachine?.last_seen_at)}
          hint={time(currentMachine?.last_seen_at)}
          tone={onlineTone}
        />
        <Stat icon={Database} label="Tiền trong hộp" value={money(currentMachine?.cash_in_box)} tone="neutral" />
        <Stat
          icon={PackageCheck}
          label="Cần nạp hàng"
          value={dashboard.lowStockProducts.length}
          tone={dashboard.lowStockProducts.length ? "warning" : "success"}
        />
        <Stat icon={Cpu} label="Firmware" value={currentMachine?.firmware_version || "-"} tone="neutral" />
        <Stat icon={Box} label="Tổng tồn kho" value={dashboard.totalStock} tone="neutral" />
      </section>

      <section className="actions">
        <button
          className="primary-button"
          onClick={sendAllProducts}
          disabled={!products.length || saving === "all-products"}
        >
          <Send size={18} />
          <span>{saving === "all-products" ? "Đang gửi" : "Gửi tất cả cấu hình"}</span>
        </button>
        <button className="icon-button" onClick={() => sendSimpleCommand("refresh_config")} disabled={saving === "refresh_config"}>
          <Settings size={18} />
          <span>Đồng bộ lại</span>
        </button>
        <button className="icon-button danger-action" onClick={() => sendSimpleCommand("refund_credit")} disabled={saving === "refund_credit"}>
          <Banknote size={18} />
          <span>Hoàn tiền</span>
        </button>
      </section>

      <section className="tabs" role="tablist">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>
          Tổng quan
        </button>
        <button className={activeTab === "products" ? "active" : ""} onClick={() => setActiveTab("products")}>
          Sản phẩm
        </button>
        <button className={activeTab === "sales" ? "active" : ""} onClick={() => setActiveTab("sales")}>
          Bán hàng
        </button>
        <button className={activeTab === "money" ? "active" : ""} onClick={() => setActiveTab("money")}>
          Tiền
        </button>
        <button className={activeTab === "commands" ? "active" : ""} onClick={() => setActiveTab("commands")}>
          Lệnh
        </button>
        <button className={activeTab === "events" ? "active" : ""} onClick={() => setActiveTab("events")}>
          Sự kiện
        </button>
      </section>

      {activeTab === "overview" && (
        <Overview
          alerts={dashboard.alerts}
          currentMachine={currentMachine}
          disabledProducts={dashboard.disabledProducts}
          machines={machines}
          machineId={machineId}
          onSelectMachine={setMachineId}
          products={products}
          topProduct={dashboard.topProduct}
        />
      )}

      {activeTab === "products" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Sản phẩm</h2>
            <span>{products.length} slot</span>
          </div>
          <div className="product-grid">
            {products.map((product) => (
              <article key={product.id} className={`product-row product-row-${productTone(product)}`}>
                <div className="slot-badge">SP{product.slot}</div>
                <label>
                  Tên
                  <input
                    value={product.name || ""}
                    onChange={(event) => updateProductField(product.slot, "name", event.target.value)}
                  />
                </label>
                <label>
                  Giá
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={product.price}
                    onChange={(event) => updateProductField(product.slot, "price", event.target.value)}
                  />
                </label>
                <label>
                  Tồn
                  <input
                    type="number"
                    min="0"
                    value={product.stock}
                    onChange={(event) => updateProductField(product.slot, "stock", event.target.value)}
                  />
                </label>
                <label>
                  Sức chứa
                  <input
                    type="number"
                    min="0"
                    value={product.capacity}
                    onChange={(event) => updateProductField(product.slot, "capacity", event.target.value)}
                  />
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={Boolean(product.enabled)}
                    onChange={(event) => updateProductField(product.slot, "enabled", event.target.checked)}
                  />
                  Bật
                </label>
                <button
                  className="icon-button save-button"
                  onClick={() => saveProduct(product)}
                  disabled={saving === `product-${product.slot}`}
                >
                  <Save size={18} />
                  <span>Lưu</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "sales" && (
        <DataTable
          title="Lịch sử bán"
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

      {activeTab === "events" && (
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
      )}
    </main>
  );
}

function Overview({ alerts, currentMachine, disabledProducts, machines, machineId, onSelectMachine, products, topProduct }) {
  return (
    <section className="overview-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2>Cần chú ý</h2>
          <span>{alerts.length || "Ổn định"}</span>
        </div>
        <div className="alert-list">
          {alerts.map((alert) => (
            <article key={`${alert.title}-${alert.text}`} className={`alert-card alert-card-${alert.tone}`}>
              <div>
                {alert.tone === "danger" ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
              </div>
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
                <p>Máy đang online và tồn kho vẫn an toàn.</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="panel machine-panel">
        <div className="panel-heading">
          <h2>Máy bán hàng</h2>
          <span>{machines.length} máy</span>
        </div>
        <div className="machine-list">
          {machines.map((machine) => {
            const tone = machineTone(machine);
            return (
              <button
                key={machine.id}
                className={`machine-card ${machine.id === machineId ? "active" : ""}`}
                onClick={() => onSelectMachine(machine.id)}
              >
                <span className={`status-dot status-dot-${tone}`} />
                <span>
                  <strong>{machine.name}</strong>
                  <small>{machine.id}</small>
                </span>
                <Pill tone={tone}>{machineStatusLabel(machine)}</Pill>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Tình trạng máy</h2>
          <span>{currentMachine?.id || "-"}</span>
        </div>
        <div className="detail-list">
          <Detail icon={Power} label="Trạng thái" value={machineStatusLabel(currentMachine)} />
          <Detail icon={Clock3} label="Tín hiệu cuối" value={ageText(currentMachine?.last_seen_at)} />
          <Detail icon={MapPin} label="Vị trí" value={currentMachine?.location || "Chưa đặt"} />
          <Detail icon={TrendingUp} label="Tổng doanh thu" value={money(currentMachine?.total_revenue)} />
          <Detail icon={Activity} label="Tổng sản phẩm đã bán" value={currentMachine?.total_sales || 0} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Tồn kho theo slot</h2>
          <span>{disabledProducts.length} slot tắt</span>
        </div>
        <div className="stock-list">
          {products.map((product) => {
            const capacity = Math.max(1, Number(product.capacity || 0));
            const stock = Number(product.stock || 0);
            const percent = Math.max(0, Math.min(100, (stock / capacity) * 100));
            return (
              <article key={product.id} className="stock-row">
                <div>
                  <strong>SP{product.slot}</strong>
                  <small>{product.name}</small>
                </div>
                <div className="stock-meter">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <Pill tone={productTone(product)}>{product.enabled ? `${stock}/${capacity}` : "Tắt"}</Pill>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel insight-panel">
        <div className="panel-heading">
          <h2>Gợi ý vận hành</h2>
          <span>Hôm nay</span>
        </div>
        <div className="insight-list">
          <Detail
            icon={ShoppingCart}
            label="Sản phẩm bán chạy"
            value={topProduct ? `SP${topProduct.slot} - ${topProduct.count} lượt` : "Chưa có bán hàng hôm nay"}
          />
          <Detail
            icon={PackageCheck}
            label="Việc cần làm"
            value={alerts.length ? "Xử lý cảnh báo trước khi chỉnh cấu hình" : "Có thể tiếp tục vận hành"}
          />
          <Detail
            icon={Wifi}
            label="Cloud"
            value={machineTone(currentMachine) === "success" ? "Heartbeat đang ổn" : "Cần kiểm tra ESP32/WiFi"}
          />
        </div>
      </section>
    </section>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="detail-row">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
