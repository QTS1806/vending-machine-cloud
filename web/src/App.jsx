import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  Banknote,
  Box,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  Database,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShoppingCart,
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

function statusTone(machine) {
  if (!machine?.last_seen_at) return "warning";
  const ageMs = Date.now() - new Date(machine.last_seen_at).getTime();
  if (ageMs < 45000 && machine.status !== "error") return "success";
  if (machine.status === "error") return "danger";
  return "warning";
}

function Stat({ icon: Icon, label, value, tone = "neutral" }) {
  return (
    <section className={`stat stat-${tone}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
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
  const [activeTab, setActiveTab] = useState("products");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newMachineId, setNewMachineId] = useState("vending-002");

  const currentMachine = machines.find((item) => item.id === machineId);
  const onlineTone = statusTone(currentMachine);

  const totals = useMemo(() => {
    const revenue = sales
      .filter((sale) => sale.success)
      .reduce((sum, sale) => sum + Number(sale.unit_price || 0), 0);
    const inserted = moneyEvents.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      revenue,
      inserted,
      sold: sales.filter((sale) => sale.success).length,
      lowStock: products.filter((item) => item.enabled && Number(item.stock) <= 1).length,
    };
  }, [moneyEvents, products, sales]);

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
          .limit(30),
        supabase
          .from("money_events")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("machine_commands")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("machine_events")
          .select("*")
          .eq("machine_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(30),
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
      name: product.name || `San pham ${product.slot}`,
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
          name: product.name || `San pham ${product.slot}`,
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
          name: item.name || `San pham ${item.slot}`,
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
      name: `May ban hang ${id}`,
      location: "Chua dat vi tri",
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
      name: `San pham ${slot}`,
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
            <p>Missing Supabase environment variables.</p>
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
          <span>{onlineTone === "success" ? "Online" : "Cần kiểm tra"}</span>
        </div>
      </header>

      <section className="toolbar">
        <label>
          Máy
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
        <Stat icon={ShoppingCart} label="Sản phẩm đã bán" value={totals.sold} tone="success" />
        <Stat icon={Coins} label="Doanh thu phiên" value={money(totals.revenue)} tone="money" />
        <Stat icon={Banknote} label="Tiền đã nhận" value={money(totals.inserted)} tone="money" />
        <Stat icon={Clock3} label="Lần cập nhật" value={time(currentMachine?.last_seen_at)} tone={onlineTone} />
        <Stat icon={Database} label="Tiền trong máy" value={money(currentMachine?.cash_in_box)} tone="neutral" />
        <Stat icon={PackageCheck} label="Sản phẩm sắp hết" value={totals.lowStock} tone={totals.lowStock ? "warning" : "success"} />
        <Stat icon={Cpu} label="Firmware" value={currentMachine?.firmware_version || "-"} tone="neutral" />
        <Stat icon={Box} label="Số slot" value={products.length} tone="neutral" />
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

      {activeTab === "products" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Sản phẩm</h2>
            <span>{products.length} slot</span>
          </div>
          <div className="product-grid">
            {products.map((product) => (
              <article key={product.id} className="product-row">
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

