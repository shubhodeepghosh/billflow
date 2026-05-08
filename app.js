const STORAGE_KEY = "billforge.app.v2";

const defaultSettings = {
  businessName: "BillForge Studio",
  tradeName: "Billing made simple",
  ownerName: "Your Name",
  address: "123 Main Road, Business District, India",
  phone: "+91 90000 00000",
  email: "billing@billforge.local",
  currencyCode: "INR",
  taxRate: 18,
  taxLabel: "GST",
  invoicePrefix: "BF-",
  nextInvoiceNumber: 1201,
  footerNote: "Thank you for your business.",
  logoData: "",
};

const seedCustomers = [
  {
    id: uid("cus"),
    name: "Apex Traders",
    contactName: "Rahul Sharma",
    phone: "+91 98765 43210",
    email: "accounts@apextraders.com",
    address: "Plot 14, Industrial Area, Jaipur",
    gstin: "08ABCDE1234F1Z5",
  },
  {
    id: uid("cus"),
    name: "Zenith Interiors",
    contactName: "Neha Singh",
    phone: "+91 91234 56789",
    email: "billing@zenithinteriors.in",
    address: "22 Lake View, Indore",
    gstin: "23ZYXWV9876K1Z2",
  },
];

const seedProducts = [
  { id: uid("prd"), name: "Invoice Setup Service", sku: "SKU-SVC-300", unit: "service", price: 2500, taxRate: 18, stock: 999 },
  { id: uid("prd"), name: "Barcode Label Roll", sku: "SKU-BL-220", unit: "roll", price: 399, taxRate: 18, stock: 68 },
  { id: uid("prd"), name: "Premium Receipt Paper Pack", sku: "SKU-PP-100", unit: "pack", price: 249, taxRate: 18, stock: 125 },
];

const seedInvoices = [
  {
    id: uid("inv"),
    number: "BF-1198",
    customerId: seedCustomers[0].id,
    issueDate: daysAgoIso(12),
    dueDate: daysAgoIso(5),
    status: "paid",
    items: [
      { id: uid("itm"), name: "Invoice Setup Service", qty: 1, price: 2500, taxRate: 18, discount: 0, unit: "service" },
      { id: uid("itm"), name: "Barcode Label Roll", qty: 3, price: 399, taxRate: 18, discount: 0, unit: "roll" },
    ],
    payments: [{ amount: 4362.46, date: daysAgoIso(11), method: "Bank transfer", note: "Paid in full" }],
    notes: "Install complete and training delivered.",
    discountValue: 0,
    shipping: 0,
  },
  {
    id: uid("inv"),
    number: "BF-1199",
    customerId: seedCustomers[1].id,
    issueDate: daysAgoIso(6),
    dueDate: daysAgoIso(1),
    status: "partial",
    items: [
      { id: uid("itm"), name: "Premium Receipt Paper Pack", qty: 8, price: 249, taxRate: 18, discount: 0, unit: "pack" },
      { id: uid("itm"), name: "Invoice Setup Service", qty: 1, price: 2500, taxRate: 18, discount: 0, unit: "service" },
    ],
    payments: [{ amount: 2000, date: daysAgoIso(2), method: "UPI", note: "Advance" }],
    notes: "Waiting on balance.",
    discountValue: 0,
    shipping: 0,
  },
];

const state = loadState();
const app = document.getElementById("app");
let invoiceSeq = state.settings.nextInvoiceNumber || defaultSettings.nextInvoiceNumber;

state.view = state.view || "dashboard";
state.search = state.search || "";
state.activeInvoiceId = state.activeInvoiceId || state.invoices[0]?.id || null;
state.editCustomerId = state.editCustomerId || null;
state.editProductId = state.editProductId || null;
state.draftDirty = Boolean(state.draftDirty);
state.draftInvoice = state.draftInvoice || createDraftInvoice();
state.draftCustomer = state.draftCustomer || blankCustomer();
state.draftProduct = state.draftProduct || blankProduct();
syncSequenceToSettings();
applyAccent(state.settings.accentColor || "#f6b84d");
saveState();
render();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return merge(createDefaultState(), JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    view: "dashboard",
    search: "",
    activeInvoiceId: null,
    editCustomerId: null,
    editProductId: null,
    settings: structuredClone(defaultSettings),
    customers: structuredClone(seedCustomers),
    products: structuredClone(seedProducts),
    invoices: structuredClone(seedInvoices).map(normalizeInvoice),
    draftInvoice: createDraftInvoice(),
    draftCustomer: blankCustomer(),
    draftProduct: blankProduct(),
    draftDirty: false,
  };
}

function merge(base, override) {
  return {
    ...base,
    ...override,
    settings: { ...base.settings, ...(override?.settings || {}) },
    customers: Array.isArray(override?.customers) ? override.customers : base.customers,
    products: Array.isArray(override?.products) ? override.products : base.products,
    invoices: Array.isArray(override?.invoices) ? override.invoices.map(normalizeInvoice) : base.invoices,
    draftInvoice: override?.draftInvoice ? normalizeDraftInvoice(override.draftInvoice) : base.draftInvoice,
    draftCustomer: override?.draftCustomer || base.draftCustomer,
    draftProduct: override?.draftProduct || base.draftProduct,
    draftDirty: Boolean(override?.draftDirty ?? base.draftDirty),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncSequenceToSettings() {
  invoiceSeq = Math.max(1, Math.floor(numberValue(state.settings.nextInvoiceNumber, defaultSettings.nextInvoiceNumber)));
  state.settings.nextInvoiceNumber = invoiceSeq;
}

function applyAccent(color) {
  document.documentElement.style.setProperty("--accent", color || "#f6b84d");
}

function uid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  return addDaysIso(todayIso(), -days);
}

function addDaysIso(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function blankCustomer() {
  return { id: null, name: "", contactName: "", phone: "", email: "", address: "", gstin: "" };
}

function blankProduct() {
  return { id: null, name: "", sku: "", unit: "unit", price: 0, taxRate: defaultSettings.taxRate, stock: 0 };
}

function createDraftInvoice(seed = {}) {
  return {
    id: null,
    number: currentInvoiceNumber(),
    customerId: seed.customerId || "",
    issueDate: todayIso(),
    dueDate: addDaysIso(todayIso(), 7),
    status: "draft",
    items: [],
    payments: [],
    notes: "",
    discountValue: 0,
    shipping: 0,
  };
}

function normalizeLineItem(item) {
  return {
    id: item.id || uid("itm"),
    name: item.name || "Untitled item",
    qty: Math.max(1, numberValue(item.qty, 1)),
    price: Math.max(0, numberValue(item.price, 0)),
    taxRate: Math.max(0, numberValue(item.taxRate, defaultSettings.taxRate)),
    discount: Math.max(0, numberValue(item.discount, 0)),
    unit: item.unit || "unit",
  };
}

function normalizeInvoice(invoice) {
  return {
    ...invoice,
    id: invoice.id || uid("inv"),
    number: invoice.number || currentInvoiceNumber(),
    customerId: invoice.customerId || "",
    issueDate: invoice.issueDate || todayIso(),
    dueDate: invoice.dueDate || addDaysIso(invoice.issueDate || todayIso(), 7),
    status: invoice.status || "draft",
    items: Array.isArray(invoice.items) ? invoice.items.map(normalizeLineItem) : [],
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    notes: invoice.notes || "",
    discountValue: numberValue(invoice.discountValue, 0),
    shipping: numberValue(invoice.shipping, 0),
  };
}

function normalizeDraftInvoice(invoice) {
  return {
    ...createDraftInvoice({ customerId: invoice.customerId || "" }),
    ...invoice,
    items: Array.isArray(invoice.items) ? invoice.items.map(normalizeLineItem) : [],
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    discountValue: numberValue(invoice.discountValue, 0),
    shipping: numberValue(invoice.shipping, 0),
  };
}

function currentInvoiceNumber() {
  return `${state.settings.invoicePrefix || defaultSettings.invoicePrefix}${String(invoiceSeq).padStart(4, "0")}`;
}

function issueInvoiceNumber() {
  const number = currentInvoiceNumber();
  invoiceSeq += 1;
  state.settings.nextInvoiceNumber = invoiceSeq;
  return number;
}

function formatMoney(value) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: state.settings.currencyCode || "INR",
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `₹${(value || 0).toFixed(2)}`;
  }
}

function dateLabel(iso) {
  const dt = new Date(`${iso}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(dt);
}

function shortDate(iso) {
  const dt = new Date(`${iso}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function invoiceTotals(invoice) {
  const totals = (invoice.items || []).reduce(
    (acc, item) => {
      const lineBase = numberValue(item.qty, 0) * numberValue(item.price, 0);
      const lineDiscount = numberValue(item.discount, 0);
      const lineNet = Math.max(0, lineBase - lineDiscount);
      const lineTax = lineNet * (numberValue(item.taxRate, state.settings.taxRate) / 100);
      acc.subtotal += lineBase;
      acc.discount += lineDiscount;
      acc.tax += lineTax;
      return acc;
    },
    { subtotal: 0, discount: 0, tax: 0 }
  );
  const invoiceDiscount = numberValue(invoice.discountValue, 0);
  const shipping = numberValue(invoice.shipping, 0);
  const total = Math.max(0, totals.subtotal - totals.discount - invoiceDiscount + totals.tax + shipping);
  const paid = (invoice.payments || []).reduce((sum, payment) => sum + numberValue(payment.amount, 0), 0);
  return { ...totals, invoiceDiscount, shipping, total, paid, balance: Math.max(0, total - paid) };
}

function customerName(customerId) {
  return state.customers.find((customer) => customer.id === customerId)?.name || "Walk-in customer";
}

function customerById(customerId) {
  return state.customers.find((customer) => customer.id === customerId) || null;
}

function productById(productId) {
  return state.products.find((product) => product.id === productId) || null;
}

function statusLabel(invoice) {
  const totals = invoiceTotals(invoice);
  if (invoice.status === "paid" || totals.balance <= 0) return "Paid";
  if (invoice.status === "partial") return "Partial";
  if (invoice.status === "draft") return "Draft";
  const overdue = new Date(`${invoice.dueDate}T00:00:00`).getTime() < new Date(`${todayIso()}T00:00:00`).getTime();
  return overdue ? "Overdue" : "Sent";
}

function statusClass(invoice) {
  const status = statusLabel(invoice).toLowerCase();
  if (status.includes("paid")) return "paid";
  if (status.includes("partial")) return "partial";
  if (status.includes("overdue")) return "overdue";
  if (status.includes("draft")) return "draft";
  return "sent";
}

function filteredInvoices() {
  const q = state.search.trim().toLowerCase();
  return [...state.invoices]
    .filter((invoice) => {
      if (!q) return true;
      return (
        invoice.number.toLowerCase().includes(q) ||
        customerName(invoice.customerId).toLowerCase().includes(q) ||
        invoice.notes.toLowerCase().includes(q) ||
        statusLabel(invoice).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
}

function filteredCustomers() {
  const q = state.search.trim().toLowerCase();
  return [...state.customers].filter((customer) => {
    if (!q) return true;
    return [customer.name, customer.contactName, customer.phone, customer.email].join(" ").toLowerCase().includes(q);
  });
}

function filteredProducts() {
  const q = state.search.trim().toLowerCase();
  return [...state.products].filter((product) => {
    if (!q) return true;
    return [product.name, product.sku, product.unit].join(" ").toLowerCase().includes(q);
  });
}

function stats() {
  const invoices = state.invoices.map(normalizeInvoice);
  const totals = invoices.reduce(
    (acc, invoice) => {
      const summary = invoiceTotals(invoice);
      acc.revenue += summary.total;
      acc.collected += summary.paid;
      acc.outstanding += summary.balance;
      if (invoice.status === "paid" || summary.balance <= 0) acc.paidCount += 1;
      return acc;
    },
    { revenue: 0, collected: 0, outstanding: 0, paidCount: 0 }
  );
  return {
    invoiceCount: invoices.length,
    customerCount: state.customers.length,
    productCount: state.products.length,
    ...totals,
  };
}

function dashboardSeries() {
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`,
      label: ref.toLocaleDateString("en-IN", { month: "short" }),
      value: 0,
    });
  }
  state.invoices.forEach((invoice) => {
    const bucket = buckets.find((entry) => entry.key === invoice.issueDate.slice(0, 7));
    if (bucket) bucket.value += invoiceTotals(invoice).total;
  });
  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));
  return buckets.map((bucket) => ({ ...bucket, height: Math.max(18, (bucket.value / max) * 100) }));
}

function topCustomers() {
  return state.customers
    .map((customer) => {
      const invoices = state.invoices.filter((invoice) => invoice.customerId === customer.id);
      const value = invoices.reduce((sum, invoice) => sum + invoiceTotals(invoice).total, 0);
      return { ...customer, value, invoiceCount: invoices.length };
    })
    .sort((a, b) => b.value - a.value);
}

function render() {
  const activeElement = document.activeElement;
  const focusInfo =
    activeElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) &&
    activeElement.id
      ? {
          id: activeElement.id,
          start: typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
          end: typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null,
        }
      : null;

  const section = renderSection();
  const logoHtml = state.settings.logoData
    ? `<img src="${escapeAttr(state.settings.logoData)}" alt="Logo" />`
    : `<span>${initials(state.settings.businessName)}</span>`;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${initials(state.settings.businessName)}</div>
          <div>
            <p class="brand-title">${escapeHtml(state.settings.businessName)}</p>
            <p class="brand-subtitle">${escapeHtml(state.settings.tradeName)}</p>
          </div>
        </div>

        <div class="sidebar-card">
          <h3>Offline billing suite</h3>
          <p>Invoices, customers, products, backups, and printable receipts in one place.</p>
        </div>

        <nav class="nav">
          ${[
            ["dashboard", "◆", "Dashboard", `${stats().invoiceCount}`],
            ["invoices", "✦", "Invoices", `${state.invoices.length}`],
            ["customers", "◉", "Customers", `${state.customers.length}`],
            ["products", "▣", "Products", `${state.products.length}`],
            ["settings", "⚙", "Settings", "Branding"],
          ]
            .map(
              ([id, icon, label, meta]) => `
                <button class="${state.view === id ? "active" : ""}" data-view="${id}">
                  <span class="nav-icon">${icon}</span>
                  <span>${label}</span>
                  <span class="nav-meta">${meta}</span>
                </button>
              `
            )
            .join("")}
        </nav>

        <div class="sidebar-card">
          <h3>What is saved locally</h3>
          <ul>
            <li>${state.invoices.length} invoices</li>
            <li>${state.customers.length} customers</li>
            <li>${state.products.length} products</li>
          </ul>
        </div>
      </aside>

      <div class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Billing control center</p>
            <h1>${section.title}</h1>
            <p>${section.subtitle}</p>
          </div>
          <div class="topbar-actions">
            <input id="global-search" class="search" type="search" placeholder="Search invoices, clients, products..." value="${escapeAttr(state.search)}" />
            <button class="btn secondary print-hide" data-action="new-invoice">New Invoice</button>
            <button class="btn ghost print-hide" data-action="export-backup">Export</button>
            <button class="btn ghost print-hide" data-action="import-backup">Import</button>
          </div>
        </header>

        <main class="content-grid">
          ${section.html}
        </main>
      </div>
    </div>
  `;

  bindEvents();
  restoreFocus(focusInfo);
}

function renderSection() {
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "invoices") return renderInvoices();
  if (state.view === "customers") return renderCustomers();
  if (state.view === "products") return renderProducts();
  return renderSettings();
}

function renderDashboard() {
  const s = stats();
  const series = dashboardSeries();
  const openInvoices = state.invoices.filter((invoice) => statusLabel(invoice) !== "Paid");
  const recent = filteredInvoices().slice(0, 5);
  const customerRanks = topCustomers().slice(0, 5);

  return {
    title: "Dashboard",
    subtitle: "A clean business overview with invoice totals, outstanding balances, and recent activity.",
    html: `
      <section class="stats-grid">
        ${statCard("Revenue", formatMoney(s.revenue), `${s.invoiceCount} invoices stored`, "Total invoiced")}
        ${statCard("Collected", formatMoney(s.collected), `${s.paidCount} invoices fully paid`, "Cash realized")}
        ${statCard("Outstanding", formatMoney(s.outstanding), `${openInvoices.length} open invoices`, "Pending balance")}
        ${statCard("Customers", `${s.customerCount}`, `${s.productCount} catalog items`, "Client registry")}
      </section>

      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Revenue trend</h2>
              <p>Last six months of invoice activity.</p>
            </div>
          </div>
          <div class="bars">
            ${series
              .map(
                (entry) => `
                  <div class="bar-wrap">
                    <div class="bar" style="height:${entry.height}%"></div>
                    <div class="bar-value">${formatMoney(entry.value)}</div>
                    <div class="bar-label">${entry.label}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Quick signals</h2>
              <p>Simple live notes from your billing data.</p>
            </div>
          </div>
          <div class="mini-list">
            <div class="mini-item">
              <div><strong>${openInvoices.length} open invoices</strong><span>Follow up on overdue and partial payments.</span></div>
              <span class="chip ${openInvoices.length ? "partial" : "paid"}">${openInvoices.length ? "Attention" : "Good"}</span>
            </div>
            <div class="mini-item">
              <div><strong>${state.products.length} products ready</strong><span>Catalog items available for fast invoice entry.</span></div>
              <span class="chip sent">Live</span>
            </div>
            <div class="mini-item">
              <div><strong>${state.customers.length} customers saved</strong><span>Client records available for invoices.</span></div>
              <span class="chip sent">Live</span>
            </div>
          </div>
        </div>
      </section>

      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Recent invoices</h2>
              <p>Latest billing records with quick actions.</p>
            </div>
            <button class="btn small primary" data-action="new-invoice">Create invoice</button>
          </div>
          ${renderInvoiceTable(recent, true)}
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Top customers</h2>
              <p>Highest billed accounts in the current dataset.</p>
            </div>
          </div>
          <div class="mini-list">
            ${customerRanks.length ? customerRanks.map(renderCustomerMini).join("") : emptyState("No customer records yet.")}
          </div>
        </div>
      </section>
    `,
  };
}

function renderInvoices() {
  const previewInvoice = getPreviewInvoice();
  const savedActive = state.activeInvoiceId ? state.invoices.find((invoice) => invoice.id === state.activeInvoiceId) : null;
  return {
    title: "Invoices",
    subtitle: "Build, save, print, and download invoices with a clean print-ready preview.",
    html: `
      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Invoice builder</h2>
              <p>Add items, keep totals accurate, and save the invoice into the ledger.</p>
            </div>
            <div class="toolbar print-hide">
              <button class="btn small ghost" data-action="new-invoice">New</button>
              <button class="btn small secondary" data-action="duplicate-active" ${savedActive ? "" : "disabled"}>Duplicate</button>
              <button class="btn small primary" data-action="save-invoice">Save invoice</button>
            </div>
          </div>

          <form id="invoice-form" class="invoice-builder">
            <div class="form-grid">
              <div class="form-group">
                <label>Invoice Number</label>
                <input class="field" name="number" value="${escapeAttr(state.draftInvoice.number)}" readonly />
              </div>
              <div class="form-group">
                <label>Status</label>
                <select name="status">
                  ${["draft", "sent", "partial", "paid"].map((v) => `<option value="${v}" ${state.draftInvoice.status === v ? "selected" : ""}>${capitalize(v)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Customer</label>
                <select name="customerId">
                  <option value="">Walk-in customer</option>
                  ${state.customers.map((customer) => `<option value="${customer.id}" ${state.draftInvoice.customerId === customer.id ? "selected" : ""}>${escapeHtml(customer.name)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Issue Date</label>
                <input class="field" type="date" name="issueDate" value="${escapeAttr(state.draftInvoice.issueDate)}" />
              </div>
              <div class="form-group">
                <label>Due Date</label>
                <input class="field" type="date" name="dueDate" value="${escapeAttr(state.draftInvoice.dueDate)}" />
              </div>
              <div class="form-group">
                <label>Invoice Discount</label>
                <input class="field" type="number" min="0" step="0.01" name="discountValue" value="${escapeAttr(state.draftInvoice.discountValue)}" />
              </div>
              <div class="form-group">
                <label>Shipping / Extra</label>
                <input class="field" type="number" min="0" step="0.01" name="shipping" value="${escapeAttr(state.draftInvoice.shipping)}" />
              </div>
              <div class="form-group full">
                <label>Notes</label>
                <textarea name="notes" placeholder="Add delivery, payment, or other notes.">${escapeHtml(state.draftInvoice.notes)}</textarea>
              </div>
            </div>

            <div class="line-item-tools">
              <div class="panel-header" style="margin-bottom:12px;">
                <div>
                  <h3>Add line item</h3>
                  <p>Use product presets or create a custom row.</p>
                </div>
              </div>
              <form id="line-item-form" class="form-grid">
                <div class="form-group">
                  <label>Product preset</label>
                  <select id="product-select" name="productId">
                    <option value="">Custom line item</option>
                    ${state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label>Item name</label>
                  <input class="field" name="name" placeholder="Item name" />
                </div>
                <div class="form-group">
                  <label>Qty</label>
                  <input class="field" name="qty" type="number" min="1" step="1" value="1" />
                </div>
                <div class="form-group">
                  <label>Unit price</label>
                  <input class="field" name="price" type="number" min="0" step="0.01" />
                </div>
                <div class="form-group">
                  <label>Tax %</label>
                  <input class="field" name="taxRate" type="number" min="0" step="0.01" value="${escapeAttr(state.settings.taxRate)}" />
                </div>
                <div class="form-group">
                  <label>Discount</label>
                  <input class="field" name="discount" type="number" min="0" step="0.01" value="0" />
                </div>
                <div class="form-group full">
                  <div class="toolbar">
                    <button class="btn small primary" type="submit">Add item</button>
                    <span class="helper">Draft items can be removed before saving.</span>
                  </div>
                </div>
              </form>
            </div>

            <div>
              <div class="panel-header" style="margin-bottom:12px;">
                <div>
                  <h3>Draft line items</h3>
                  <p>${state.draftInvoice.items.length} item(s) in the current invoice draft.</p>
                </div>
              </div>
              ${renderDraftItems(state.draftInvoice.items)}
            </div>
          </form>
        </div>

        <div class="panel printable">
          <div class="panel-header">
            <div>
              <h2>Print-ready bill</h2>
              <p>Use the button below to print or save as PDF from your browser.</p>
            </div>
            <div class="toolbar print-hide">
              <button class="btn small secondary" data-action="print-invoice">Download / Print</button>
              <button class="btn small ghost" data-action="load-active" ${savedActive ? "" : "disabled"}>Load saved invoice</button>
            </div>
          </div>
          ${renderInvoicePreview(previewInvoice)}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Invoice ledger</h2>
            <p>Saved bills with edit, duplicate, and paid actions.</p>
          </div>
        </div>
        ${renderInvoiceTable(filteredInvoices(), false)}
      </section>
    `,
  };
}

function renderCustomers() {
  return {
    title: "Customers",
    subtitle: "Keep your client details organized for faster invoicing and cleaner records.",
    html: `
      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>${state.editCustomerId ? "Edit customer" : "Add customer"}</h2>
              <p>Store billing contacts, phone numbers, emails, and tax IDs.</p>
            </div>
            <button class="btn small ghost" data-action="reset-customer-form">Reset</button>
          </div>
          <form id="customer-form" class="form-grid">
            <div class="form-group">
              <label>Business name</label>
              <input class="field" name="name" value="${escapeAttr(state.draftCustomer.name)}" placeholder="Customer company" />
            </div>
            <div class="form-group">
              <label>Contact person</label>
              <input class="field" name="contactName" value="${escapeAttr(state.draftCustomer.contactName)}" placeholder="Contact person" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input class="field" name="phone" value="${escapeAttr(state.draftCustomer.phone)}" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input class="field" name="email" value="${escapeAttr(state.draftCustomer.email)}" />
            </div>
            <div class="form-group full">
              <label>Address</label>
              <textarea name="address">${escapeHtml(state.draftCustomer.address)}</textarea>
            </div>
            <div class="form-group">
              <label>GSTIN / Tax ID</label>
              <input class="field" name="gstin" value="${escapeAttr(state.draftCustomer.gstin)}" />
            </div>
            <div class="form-group">
              <label>&nbsp;</label>
              <button class="btn primary" type="submit">${state.editCustomerId ? "Update customer" : "Save customer"}</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Customer directory</h2>
              <p>Searchable list with billed totals.</p>
            </div>
          </div>
          <div class="mini-list">
            ${filteredCustomers().length ? filteredCustomers().map(renderCustomerCard).join("") : emptyState("No customer matches the current search.")}
          </div>
        </div>
      </section>
    `,
  };
}

function renderProducts() {
  return {
    title: "Products",
    subtitle: "Maintain pricing, tax rates, and stock counts for quick invoice entry.",
    html: `
      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>${state.editProductId ? "Edit product" : "Add product"}</h2>
              <p>Catalog items can be dropped directly into invoices.</p>
            </div>
            <button class="btn small ghost" data-action="reset-product-form">Reset</button>
          </div>
          <form id="product-form" class="form-grid">
            <div class="form-group">
              <label>Product name</label>
              <input class="field" name="name" value="${escapeAttr(state.draftProduct.name)}" />
            </div>
            <div class="form-group">
              <label>SKU</label>
              <input class="field" name="sku" value="${escapeAttr(state.draftProduct.sku)}" />
            </div>
            <div class="form-group">
              <label>Unit</label>
              <input class="field" name="unit" value="${escapeAttr(state.draftProduct.unit)}" />
            </div>
            <div class="form-group">
              <label>Price</label>
              <input class="field" type="number" min="0" step="0.01" name="price" value="${escapeAttr(state.draftProduct.price)}" />
            </div>
            <div class="form-group">
              <label>Tax %</label>
              <input class="field" type="number" min="0" step="0.01" name="taxRate" value="${escapeAttr(state.draftProduct.taxRate)}" />
            </div>
            <div class="form-group">
              <label>Stock</label>
              <input class="field" type="number" min="0" step="1" name="stock" value="${escapeAttr(state.draftProduct.stock)}" />
            </div>
            <div class="form-group full">
              <button class="btn primary" type="submit">${state.editProductId ? "Update product" : "Save product"}</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Product catalog</h2>
              <p>Use these items to speed up invoice creation.</p>
            </div>
          </div>
          <div class="mini-list">
            ${filteredProducts().length ? filteredProducts().map(renderProductCard).join("") : emptyState("No product matches the current search.")}
          </div>
        </div>
      </section>
    `,
  };
}

function renderSettings() {
  const logoPreview = state.settings.logoData
    ? `<img src="${escapeAttr(state.settings.logoData)}" alt="Logo" />`
    : `<span>${initials(state.settings.businessName)}</span>`;

  return {
    title: "Settings",
    subtitle: "Update company name, logo, currency, tax defaults, and backups.",
    html: `
      <section class="grid-2">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Business branding</h2>
              <p>Your company name and logo will print on every invoice.</p>
            </div>
          </div>
          <form id="settings-form" class="form-grid">
            <div class="form-group">
              <label>Business name</label>
              <input class="field" name="businessName" value="${escapeAttr(state.settings.businessName)}" />
            </div>
            <div class="form-group">
              <label>Trade name</label>
              <input class="field" name="tradeName" value="${escapeAttr(state.settings.tradeName)}" />
            </div>
            <div class="form-group">
              <label>Owner / Sender</label>
              <input class="field" name="ownerName" value="${escapeAttr(state.settings.ownerName)}" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input class="field" name="phone" value="${escapeAttr(state.settings.phone)}" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input class="field" name="email" value="${escapeAttr(state.settings.email)}" />
            </div>
            <div class="form-group">
              <label>Address</label>
              <input class="field" name="address" value="${escapeAttr(state.settings.address)}" />
            </div>
            <div class="form-group">
              <label>Currency code</label>
              <input class="field" name="currencyCode" value="${escapeAttr(state.settings.currencyCode)}" />
            </div>
            <div class="form-group">
              <label>Tax label</label>
              <input class="field" name="taxLabel" value="${escapeAttr(state.settings.taxLabel)}" />
            </div>
            <div class="form-group">
              <label>Default tax %</label>
              <input class="field" type="number" min="0" step="0.01" name="taxRate" value="${escapeAttr(state.settings.taxRate)}" />
            </div>
            <div class="form-group">
              <label>Invoice prefix</label>
              <input class="field" name="invoicePrefix" value="${escapeAttr(state.settings.invoicePrefix)}" />
            </div>
            <div class="form-group">
              <label>Next invoice number</label>
              <input class="field" type="number" min="1" step="1" name="nextInvoiceNumber" value="${escapeAttr(state.settings.nextInvoiceNumber)}" />
            </div>
            <div class="form-group">
              <label>Accent color</label>
              <input class="field" type="color" name="accentColor" value="${escapeAttr(state.settings.accentColor || "#f6b84d")}" />
            </div>
            <div class="form-group full">
              <label>Logo upload</label>
              <div class="toolbar">
                <div class="logo-preview">${logoPreview}</div>
                <input class="field" type="file" id="logo-input" accept="image/*" />
              </div>
            </div>
            <div class="form-group full">
              <label>Footer note</label>
              <textarea name="footerNote">${escapeHtml(state.settings.footerNote)}</textarea>
            </div>
            <div class="form-group">
              <label>&nbsp;</label>
              <button class="btn primary" type="submit">Save settings</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Backup center</h2>
              <p>Export or restore your local billing data.</p>
            </div>
          </div>
          <div class="stack">
            <div class="notice">
              Company name and logo now print on the invoice header, and invoices include a signature blank at the bottom.
            </div>
            <div class="toolbar">
              <button class="btn secondary" data-action="export-backup">Export JSON backup</button>
              <button class="btn ghost" data-action="import-backup">Import JSON backup</button>
              <button class="btn danger" data-action="reset-demo">Reset demo data</button>
            </div>
            <div class="panel" style="padding:16px; background: rgba(255,255,255,0.03); box-shadow:none;">
              <div class="grid-3">
                <div class="stat-card" style="box-shadow:none;">
                  <div class="stat-label">Invoices</div>
                  <div class="stat-value">${state.invoices.length}</div>
                </div>
                <div class="stat-card" style="box-shadow:none;">
                  <div class="stat-label">Customers</div>
                  <div class="stat-value">${state.customers.length}</div>
                </div>
                <div class="stat-card" style="box-shadow:none;">
                  <div class="stat-label">Products</div>
                  <div class="stat-value">${state.products.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `,
  };
}

function statCard(label, value, note, footer) {
  return `
    <article class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-note">${escapeHtml(note)}</div>
      <div class="helper" style="margin-top:10px;">${escapeHtml(footer)}</div>
    </article>
  `;
}

function renderInvoiceTable(invoices, compact) {
  if (!invoices.length) return emptyState("No invoices match the current search.");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
            <th>${compact ? "Balance" : "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((invoice) => {
            const totals = invoiceTotals(invoice);
            return `
              <tr>
                <td><strong>${escapeHtml(invoice.number)}</strong><div class="helper">${invoice.items.length} item(s)</div></td>
                <td>${escapeHtml(customerName(invoice.customerId))}<div class="helper">${escapeHtml(invoice.notes || "No notes")}</div></td>
                <td>${shortDate(invoice.issueDate)}<div class="helper">Due ${shortDate(invoice.dueDate)}</div></td>
                <td><span class="chip ${statusClass(invoice)}"><span class="status-dot ${statusClass(invoice)}"></span>${escapeHtml(statusLabel(invoice))}</span></td>
                <td><strong>${formatMoney(totals.total)}</strong></td>
                <td>
                  ${
                    compact
                      ? `<strong>${formatMoney(totals.balance)}</strong>`
                      : `
                      <div class="toolbar">
                        <button class="btn small ghost" data-action="edit-invoice" data-id="${invoice.id}">Edit</button>
                        <button class="btn small secondary" data-action="duplicate-invoice" data-id="${invoice.id}">Duplicate</button>
                        <button class="btn small ghost" data-action="print-invoice" data-id="${invoice.id}">Print</button>
                        <button class="btn small primary" data-action="mark-paid" data-id="${invoice.id}">Paid</button>
                        <button class="btn small danger" data-action="delete-invoice" data-id="${invoice.id}">Delete</button>
                      </div>
                    `
                  }
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDraftItems(items) {
  if (!items.length) return emptyState("No line items added yet.");
  const summary = invoiceTotals(state.draftInvoice);
  return `
    <div class="line-item-list">
      ${items.map((item) => `
        <div class="line-item">
          <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.unit)} • ${formatMoney(item.price)} each</small></div>
          <div>${item.qty}</div>
          <div>${formatMoney(item.price)}</div>
          <div>${escapeHtml(String(item.taxRate))}% tax</div>
          <div>${formatMoney(item.discount)} off</div>
          <div class="actions"><button class="btn small danger" data-action="remove-line-item" data-id="${item.id}">Remove</button></div>
        </div>
      `).join("")}
      <div class="panel" style="padding:14px; background: rgba(255,255,255,0.03); box-shadow:none;">
        <div class="grid-2">
          <div class="invoice-box"><h4>Subtotal</h4><p>${formatMoney(summary.subtotal)}</p></div>
          <div class="invoice-box"><h4>Tax</h4><p>${formatMoney(summary.tax)}</p></div>
          <div class="invoice-box"><h4>Discount</h4><p>${formatMoney(summary.discount + summary.invoiceDiscount)}</p></div>
          <div class="invoice-box"><h4>Grand total</h4><p><strong>${formatMoney(summary.total)}</strong></p></div>
        </div>
      </div>
    </div>
  `;
}

function renderInvoicePreview(invoice) {
  const customer = customerById(invoice.customerId);
  const totals = invoiceTotals(invoice);
  const logoMarkup = state.settings.logoData
    ? `<img src="${escapeAttr(state.settings.logoData)}" alt="Logo" />`
    : `<span>${initials(state.settings.businessName)}</span>`;

  return `
    <div class="invoice-sheet" id="invoice-preview">
      <div class="invoice-head">
        <div class="invoice-brand">
          <div class="invoice-logo">${logoMarkup}</div>
          <div>
            <h2 style="margin:0;">${escapeHtml(state.settings.businessName)}</h2>
            <div class="helper">${escapeHtml(state.settings.tradeName)}</div>
          </div>
        </div>
        <div class="invoice-meta">
          <strong>Invoice ${escapeHtml(invoice.number)}</strong>
          <div>Status: ${escapeHtml(statusLabel(invoice))}</div>
          <div>Issued: ${dateLabel(invoice.issueDate)}</div>
          <div>Due: ${dateLabel(invoice.dueDate)}</div>
        </div>
      </div>

      <div class="invoice-parties">
        <div class="invoice-box">
          <h4>Bill from</h4>
          <p>
            <strong>${escapeHtml(state.settings.businessName)}</strong><br />
            ${escapeHtml(state.settings.address)}<br />
            ${escapeHtml(state.settings.phone)}<br />
            ${escapeHtml(state.settings.email)}
          </p>
        </div>
        <div class="invoice-box">
          <h4>Bill to</h4>
          <p>
            <strong>${escapeHtml(customer?.name || "Walk-in customer")}</strong><br />
            ${escapeHtml(customer?.contactName || "No contact")}<br />
            ${escapeHtml(customer?.address || "No address")}<br />
            ${escapeHtml(customer?.phone || "No phone")}<br />
            ${escapeHtml(customer?.gstin || "No GSTIN")}
          </p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map((item) => {
              const lineBase = item.qty * item.price;
              const lineNet = Math.max(0, lineBase - numberValue(item.discount, 0));
              const lineTax = lineNet * (numberValue(item.taxRate, state.settings.taxRate) / 100);
              const lineTotal = lineNet + lineTax;
              return `
                <tr>
                  <td><strong>${escapeHtml(item.name)}</strong><div class="helper">${escapeHtml(item.unit)}</div></td>
                  <td>${item.qty}</td>
                  <td>${formatMoney(item.price)}</td>
                  <td>${formatMoney(item.discount)}</td>
                  <td>${formatMoney(lineTax)}</td>
                  <td><strong>${formatMoney(lineTotal)}</strong></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="invoice-totals">
        <div class="total-row"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
        <div class="total-row"><span>Item discount</span><strong>-${formatMoney(totals.discount)}</strong></div>
        <div class="total-row"><span>Invoice discount</span><strong>-${formatMoney(totals.invoiceDiscount)}</strong></div>
        <div class="total-row"><span>${escapeHtml(state.settings.taxLabel)} / tax</span><strong>${formatMoney(totals.tax)}</strong></div>
        <div class="total-row"><span>Shipping / extra</span><strong>${formatMoney(totals.shipping)}</strong></div>
        <div class="total-row grand"><span>Grand total</span><strong>${formatMoney(totals.total)}</strong></div>
        <div class="total-row"><span>Paid</span><strong>${formatMoney(totals.paid)}</strong></div>
        <div class="total-row"><span>Balance</span><strong>${formatMoney(totals.balance)}</strong></div>
      </div>

      <div class="invoice-box" style="margin-top:16px;">
        <h4>Notes</h4>
        <p>${escapeHtml(invoice.notes || state.settings.footerNote)}</p>
      </div>

      <div class="signature-area">
        <div class="signature-box">
          <div class="signature-line"></div>
          <div class="signature-label">Authorized Signature</div>
        </div>
      </div>
    </div>
  `;
}

function renderCustomerMini(customer) {
  return `
    <div class="mini-item">
      <div>
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.contactName || "No contact")}</span>
      </div>
      <div class="right">
        ${formatMoney(customer.value)}<br />
        ${customer.invoiceCount} invoices
      </div>
    </div>
  `;
}

function renderCustomerCard(customer) {
  const total = state.invoices.filter((invoice) => invoice.customerId === customer.id).reduce((sum, invoice) => sum + invoiceTotals(invoice).total, 0);
  return `
    <div class="mini-item">
      <div>
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.contactName || "No contact")} • ${escapeHtml(customer.phone || "No phone")}</span>
        <span>${escapeHtml(customer.email || "No email")} • ${escapeHtml(customer.gstin || "No GSTIN")}</span>
      </div>
      <div class="right">
        ${formatMoney(total)}<br />
        <div class="toolbar" style="justify-content:flex-end; margin-top:8px;">
          <button class="btn small ghost" data-action="edit-customer" data-id="${customer.id}">Edit</button>
          <button class="btn small danger" data-action="delete-customer" data-id="${customer.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function renderProductCard(product) {
  return `
    <div class="mini-item">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <span>SKU: ${escapeHtml(product.sku || "N/A")} • Unit: ${escapeHtml(product.unit || "unit")}</span>
        <span>${escapeHtml(String(product.taxRate))}% tax • Stock ${escapeHtml(String(product.stock ?? 0))}</span>
      </div>
      <div class="right">
        ${formatMoney(product.price)}<br />
        <div class="toolbar" style="justify-content:flex-end; margin-top:8px;">
          <button class="btn small ghost" data-action="edit-product" data-id="${product.id}">Edit</button>
          <button class="btn small danger" data-action="delete-product" data-id="${product.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function emptyState(message) {
  return `<div class="empty-state"><div style="font-weight:800; margin-bottom:6px;">Nothing here yet</div><div>${escapeHtml(message)}</div></div>`;
}

function initials(name) {
  return (name || "BF")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function restoreFocus(info) {
  if (!info) return;
  const el = document.getElementById(info.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (typeof el.setSelectionRange === "function" && info.start !== null && info.end !== null) {
    el.setSelectionRange(info.start, info.end);
  }
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      saveState();
      render();
    });
  });

  document.getElementById("global-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    saveState();
    render();
  });

  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleAction));

  bindInvoiceDraftForm();
  bindLineItemForm();
  bindCustomerForm();
  bindProductForm();
  bindSettingsForm();
  bindLogoInput();
}

function bindInvoiceDraftForm() {
  const form = document.getElementById("invoice-form");
  if (!form) return;
  const sync = () => syncDraftFromForm(form);
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
}

function syncDraftFromForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.draftInvoice.customerId = data.customerId || "";
  state.draftInvoice.issueDate = data.issueDate || todayIso();
  state.draftInvoice.dueDate = data.dueDate || addDaysIso(todayIso(), 7);
  state.draftInvoice.status = data.status || "draft";
  state.draftInvoice.discountValue = numberValue(data.discountValue, 0);
  state.draftInvoice.shipping = numberValue(data.shipping, 0);
  state.draftInvoice.notes = data.notes || "";
  state.draftDirty = true;
}

function bindLineItemForm() {
  const form = document.getElementById("line-item-form");
  if (!form) return;
  const productSelect = form.querySelector("#product-select");
  productSelect?.addEventListener("change", () => {
    const product = productById(productSelect.value);
    if (!product) return;
    const name = form.querySelector('[name="name"]');
    const price = form.querySelector('[name="price"]');
    const taxRate = form.querySelector('[name="taxRate"]');
    if (name && !name.value) name.value = product.name;
    if (price && !price.value) price.value = product.price;
    if (taxRate && !taxRate.value) taxRate.value = product.taxRate;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    let item = normalizeLineItem(data);
    if (data.productId) {
      const product = productById(data.productId);
      if (product) {
        item = normalizeLineItem({
          ...item,
          name: product.name,
          price: product.price,
          taxRate: product.taxRate,
          unit: product.unit,
        });
      }
    }
    state.draftInvoice.items.push(item);
    state.draftDirty = true;
    form.reset();
    form.querySelector('[name="qty"]').value = 1;
    form.querySelector('[name="taxRate"]').value = state.settings.taxRate;
    render();
  });
}

function bindCustomerForm() {
  const form = document.getElementById("customer-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const customer = {
      id: state.editCustomerId || uid("cus"),
      name: data.name?.trim() || "Untitled customer",
      contactName: data.contactName?.trim() || "",
      phone: data.phone?.trim() || "",
      email: data.email?.trim() || "",
      address: data.address?.trim() || "",
      gstin: data.gstin?.trim() || "",
    };
    const index = state.customers.findIndex((entry) => entry.id === customer.id);
    if (index >= 0) state.customers[index] = customer;
    else state.customers.unshift(customer);
    state.editCustomerId = null;
    state.draftCustomer = blankCustomer();
    saveState();
    render();
  });
}

function bindProductForm() {
  const form = document.getElementById("product-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const product = {
      id: state.editProductId || uid("prd"),
      name: data.name?.trim() || "Untitled product",
      sku: data.sku?.trim() || "",
      unit: data.unit?.trim() || "unit",
      price: numberValue(data.price, 0),
      taxRate: numberValue(data.taxRate, state.settings.taxRate),
      stock: numberValue(data.stock, 0),
    };
    const index = state.products.findIndex((entry) => entry.id === product.id);
    if (index >= 0) state.products[index] = product;
    else state.products.unshift(product);
    state.editProductId = null;
    state.draftProduct = blankProduct();
    saveState();
    render();
  });
}

function bindSettingsForm() {
  const form = document.getElementById("settings-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    state.settings = {
      ...state.settings,
      businessName: data.businessName?.trim() || defaultSettings.businessName,
      tradeName: data.tradeName?.trim() || defaultSettings.tradeName,
      ownerName: data.ownerName?.trim() || defaultSettings.ownerName,
      address: data.address?.trim() || "",
      phone: data.phone?.trim() || "",
      email: data.email?.trim() || "",
      currencyCode: data.currencyCode?.trim().toUpperCase() || "INR",
      taxRate: numberValue(data.taxRate, defaultSettings.taxRate),
      taxLabel: data.taxLabel?.trim() || "GST",
      invoicePrefix: data.invoicePrefix?.trim() || "BF-",
      nextInvoiceNumber: Math.max(1, Math.floor(numberValue(data.nextInvoiceNumber, 1))),
      accentColor: data.accentColor || "#f6b84d",
      footerNote: data.footerNote?.trim() || "",
      logoData: state.settings.logoData || "",
    };
    syncSequenceToSettings();
    applyAccent(state.settings.accentColor);
    saveState();
    render();
  });
}

function bindLogoInput() {
  const input = document.getElementById("logo-input");
  if (!input) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.logoData = String(reader.result || "");
      saveState();
      render();
    };
    reader.readAsDataURL(file);
  });
}

function renderDraftHeader() {
  return state.draftInvoice;
}

function getPreviewInvoice() {
  if (state.draftDirty) {
    return state.draftInvoice;
  }
  return state.activeInvoiceId ? state.invoices.find((invoice) => invoice.id === state.activeInvoiceId) || state.invoices[0] : state.invoices[0];
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  const id = event.currentTarget.dataset.id;

  if (action === "new-invoice") {
    state.view = "invoices";
    state.activeInvoiceId = null;
    state.draftInvoice = createDraftInvoice({ customerId: state.customers[0]?.id || "" });
    state.draftDirty = true;
    saveState();
    render();
    return;
  }

  if (action === "save-invoice") {
    saveInvoice();
    return;
  }

  if (action === "duplicate-active") {
    const invoice = state.invoices.find((entry) => entry.id === state.activeInvoiceId);
    if (!invoice) return;
    const number = issueInvoiceNumber();
    const copy = normalizeInvoice({
      ...structuredClone(invoice),
      id: uid("inv"),
      number,
      status: "draft",
      payments: [],
      issueDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 7),
    });
    state.invoices.unshift(copy);
    state.activeInvoiceId = copy.id;
    state.draftInvoice = normalizeDraftInvoice({ ...copy, id: null, number: currentInvoiceNumber(), status: "draft", payments: [] });
    state.draftDirty = true;
    saveState();
    render();
    return;
  }

  if (action === "edit-invoice") {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return;
    state.view = "invoices";
    state.activeInvoiceId = id;
    state.draftInvoice = normalizeDraftInvoice(structuredClone(invoice));
    state.draftDirty = true;
    saveState();
    render();
    return;
  }

  if (action === "print-invoice" || action === "load-active") {
    if (action === "load-active") {
      const invoice = state.invoices.find((entry) => entry.id === state.activeInvoiceId);
      if (!invoice) return;
      state.view = "invoices";
      state.draftInvoice = normalizeDraftInvoice(structuredClone(invoice));
      state.draftDirty = true;
      saveState();
      render();
      return;
    }
    printCurrentInvoice();
    return;
  }

  if (action === "duplicate-invoice") {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return;
    const number = issueInvoiceNumber();
    const copy = normalizeInvoice({
      ...structuredClone(invoice),
      id: uid("inv"),
      number,
      status: "draft",
      payments: [],
      issueDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 7),
    });
    state.invoices.unshift(copy);
    state.activeInvoiceId = copy.id;
    state.draftInvoice = normalizeDraftInvoice({ ...copy, id: null, number: currentInvoiceNumber(), status: "draft", payments: [] });
    state.draftDirty = true;
    saveState();
    render();
    return;
  }

  if (action === "mark-paid") {
    const invoice = state.invoices.find((entry) => entry.id === id);
    if (!invoice) return;
    const totals = invoiceTotals(invoice);
    invoice.status = "paid";
    invoice.payments = [{ amount: totals.total, date: todayIso(), method: "Manual", note: "Marked as paid" }];
    state.activeInvoiceId = id;
    saveState();
    render();
    return;
  }

  if (action === "delete-invoice") {
    if (!confirm("Delete this invoice permanently?")) return;
    state.invoices = state.invoices.filter((entry) => entry.id !== id);
    if (state.activeInvoiceId === id) state.activeInvoiceId = state.invoices[0]?.id || null;
    if (state.draftInvoice.id === id) state.draftInvoice = createDraftInvoice();
    state.draftDirty = false;
    saveState();
    render();
    return;
  }

  if (action === "remove-line-item") {
    state.draftInvoice.items = state.draftInvoice.items.filter((item) => item.id !== id);
    state.draftDirty = true;
    render();
    return;
  }

  if (action === "edit-customer") {
    const customer = state.customers.find((entry) => entry.id === id);
    if (!customer) return;
    state.view = "customers";
    state.editCustomerId = id;
    state.draftCustomer = structuredClone(customer);
    saveState();
    render();
    return;
  }

  if (action === "delete-customer") {
    if (!confirm("Delete this customer? Existing invoices will stay but show walk-in customer.")) return;
    state.customers = state.customers.filter((entry) => entry.id !== id);
    state.invoices = state.invoices.map((invoice) => (invoice.customerId === id ? { ...invoice, customerId: "" } : invoice));
    saveState();
    render();
    return;
  }

  if (action === "reset-customer-form") {
    state.editCustomerId = null;
    state.draftCustomer = blankCustomer();
    saveState();
    render();
    return;
  }

  if (action === "edit-product") {
    const product = state.products.find((entry) => entry.id === id);
    if (!product) return;
    state.view = "products";
    state.editProductId = id;
    state.draftProduct = structuredClone(product);
    saveState();
    render();
    return;
  }

  if (action === "delete-product") {
    if (!confirm("Delete this product?")) return;
    state.products = state.products.filter((entry) => entry.id !== id);
    saveState();
    render();
    return;
  }

  if (action === "reset-product-form") {
    state.editProductId = null;
    state.draftProduct = blankProduct();
    saveState();
    render();
    return;
  }

  if (action === "export-backup") {
    exportBackup();
    return;
  }

  if (action === "import-backup") {
    importBackup();
    return;
  }

  if (action === "reset-demo") {
    if (!confirm("Reset all billing data to demo values?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
    return;
  }
}

function saveInvoice() {
  const form = document.getElementById("invoice-form");
  if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const invoice = normalizeInvoice({
    ...state.draftInvoice,
    id: state.draftInvoice.id || uid("inv"),
    number: state.draftInvoice.number || currentInvoiceNumber(),
    customerId: data.customerId || "",
    issueDate: data.issueDate || todayIso(),
    dueDate: data.dueDate || addDaysIso(todayIso(), 7),
    status: data.status || "draft",
    notes: data.notes || "",
    discountValue: numberValue(data.discountValue, 0),
    shipping: numberValue(data.shipping, 0),
    items: state.draftInvoice.items.map(normalizeLineItem),
  });

  if (!invoice.items.length) {
    alert("Please add at least one line item before saving the invoice.");
    return;
  }

  const idx = state.invoices.findIndex((entry) => entry.id === invoice.id);
  if (idx >= 0) {
    state.invoices[idx] = invoice;
  } else {
    state.invoices.unshift(invoice);
    issueInvoiceNumber();
  }

  state.activeInvoiceId = invoice.id;
  state.draftInvoice = createDraftInvoice({ customerId: invoice.customerId });
  state.draftDirty = false;
  saveState();
  render();
}

function printCurrentInvoice() {
  const printable = getPreviewInvoice();
  if (!printable) return;
  if (!state.draftInvoice.items.length && !state.activeInvoiceId) return;
  saveState();
  setTimeout(() => window.print(), 40);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billforge-backup-${todayIso()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function importBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!confirm("Replace current data with this backup?")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merge(createDefaultState(), parsed)));
      location.reload();
    } catch {
      alert("That file does not look like a valid BillForge backup.");
    }
  });
  input.click();
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
