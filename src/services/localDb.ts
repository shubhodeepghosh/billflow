import type {
  AnalyticsOverview,
  AuthResponse,
  AuthUser,
  Client,
  Expense,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceStatusDistribution,
  PaginatedResponse,
  Product,
  RevenuePoint,
  AppSettings,
} from "@/types";

const DB_KEY = "billflow_local_db_v1";
const TOKEN_KEY = "billflow_token";
const DEFAULT_PAGE_SIZE = 10;

type StoredUser = AuthUser & { password: string };

interface LocalDb {
  users: StoredUser[];
  sessions: Record<string, string>;
  settings: AppSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  expenses: Expense[];
}

interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface ClientQuery extends PaginationQuery {
  search?: string;
}

export interface ProductQuery extends PaginationQuery {
  search?: string;
}

export interface ExpenseQuery extends PaginationQuery {
  search?: string;
  category?: string;
}

export interface InvoiceQuery extends PaginationQuery {
  search?: string;
  status?: string;
}

const defaultSettings: AppSettings = {
  companyName: "",
  legalName: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  currency: "INR",
  taxRate: 0,
  invoicePrefix: "INV",
  nextInvoiceNumber: 1,
  paymentTerms: "Due on receipt",
  footerMessage: "",
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPassword: "",
  smtpFromEmail: "",
  smtpFromName: "",
};

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
};

const today = () => new Date().toISOString();

const emptyDb = (): LocalDb => ({
  users: [],
  sessions: {},
  settings: defaultSettings,
  clients: [],
  products: [],
  invoices: [],
  expenses: [],
});

const isLegacySeedDb = (db: Partial<LocalDb>) => {
  const userMatch = db.users?.some((user) => {
    const email = user.email.toLowerCase();
    const name = user.name.toLowerCase();
    return email === "demo@billflow.app" || name === "demo admin";
  });
  return Boolean(userMatch) || db.settings?.companyName === "BillFlow Studio";
};

const readDb = (): LocalDb => {
  if (typeof window === "undefined") return emptyDb();
  const raw = window.localStorage.getItem(DB_KEY);
  if (!raw) {
    const db = emptyDb();
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    if (isLegacySeedDb(parsed)) {
      const db = emptyDb();
      window.localStorage.setItem(DB_KEY, JSON.stringify(db));
      return db;
    }
    return {
      ...emptyDb(),
      ...parsed,
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? {},
      settings: parsed.settings ?? defaultSettings,
      clients: parsed.clients ?? [],
      products: parsed.products ?? [],
      invoices: parsed.invoices ?? [],
      expenses: parsed.expenses ?? [],
    };
  } catch {
    const db = emptyDb();
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
};

const writeDb = (db: LocalDb) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
};

const getSessionToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
};

const setSessionToken = (token: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
};

const clearSessionToken = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
};

const paginate = <T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): PaginatedResponse<T> => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safePageSize;
  return {
    data: items.slice(start, start + safePageSize),
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
  };
};

const normalizeText = (value?: string) => value?.trim().toLowerCase() ?? "";

const invoiceTotal = (items: InvoiceItem[], taxRate: number) => {
  const subtotal = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0,
  );
  const tax = subtotal * (taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
};

const findUserByToken = (db: LocalDb, token: string | null) => {
  if (!token) return null;
  const userId = db.sessions[token];
  return db.users.find((u) => u.id === userId) ?? null;
};

const createAuthResponse = (user: AuthUser, token: string): AuthResponse => ({ user, token });

export const localDataMode = true;

export const localAuth = {
  login(email: string, password: string): AuthResponse {
    const db = readDb();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!user) {
      throw new Error("Invalid email or password");
    }
    const token = createId("token");
    db.sessions[token] = user.id;
    writeDb(db);
    setSessionToken(token);
    const { password: _password, ...safeUser } = user;
    return createAuthResponse(safeUser, token);
  },
  register(name: string, email: string, password: string): AuthResponse {
    const user: StoredUser = {
      id: createId("user"),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    };
    const token = createId("token");
    const db = {
      ...emptyDb(),
      users: [user],
      sessions: { [token]: user.id },
    };
    writeDb(db);
    setSessionToken(token);
    const { password: _password, ...safeUser } = user;
    return createAuthResponse(safeUser, token);
  },
  me(): AuthUser {
    const db = readDb();
    const token = getSessionToken();
    const user = findUserByToken(db, token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    const { password: _password, ...safeUser } = user;
    return safeUser;
  },
  logout() {
    const db = readDb();
    const token = getSessionToken();
    if (token) {
      delete db.sessions[token];
      writeDb(db);
    }
    clearSessionToken();
  },
};

const filterInvoices = (items: Invoice[], query: InvoiceQuery = {}) => {
  const search = normalizeText(query.search);
  const status = query.status && query.status !== "all" ? query.status : "";
  return items.filter((invoice) => {
    const matchesStatus = !status || invoice.status === status;
    const matchesSearch =
      !search ||
      invoice.number.toLowerCase().includes(search) ||
      invoice.client?.name.toLowerCase().includes(search) ||
      invoice.client?.email.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });
};

const sortByDateDesc = <T extends { createdAt?: string }>(items: T[]) =>
  [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt ?? 0).getTime();
    const bTime = new Date(b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });

const sortInvoices = (items: Invoice[]) =>
  [...items].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

const syncInvoiceClient = (db: LocalDb, invoice: Invoice): Invoice => {
  const client = db.clients.find((c) => c.id === invoice.clientId);
  return {
    ...invoice,
    client,
  };
};

const recalculateInvoice = (invoice: Invoice): Invoice => {
  const items = invoice.items.map((item) => ({
    ...item,
    id: item.id ?? createId("item"),
    total: (item.quantity || 0) * (item.unitPrice || 0),
  }));
  const taxRate = invoice.taxRate ?? 0;
  const { subtotal, tax, total } = invoiceTotal(items, taxRate);
  return {
    ...invoice,
    items,
    subtotal,
    taxRate,
    tax,
    total,
  };
};

const normalizeInvoicePayload = (db: LocalDb, payload: Partial<Invoice>): Invoice => {
  const issueDate = payload.issueDate ?? new Date().toISOString().slice(0, 10);
  const dueDate = payload.dueDate ?? issueDate;
  const items = (payload.items ?? []).map((item) => ({
    ...item,
    id: item.id ?? createId("item"),
    quantity: item.quantity ?? 0,
    unitPrice: item.unitPrice ?? 0,
    total: (item.quantity ?? 0) * (item.unitPrice ?? 0),
  }));
  const taxRate = payload.taxRate ?? 0;
  const { subtotal, tax, total } = invoiceTotal(items, taxRate);
  return syncInvoiceClient(db, {
    id: payload.id ?? createId("invoice"),
    number:
      payload.number ??
      `INV-${new Date().getFullYear()}-${String(db.invoices.length + 1).padStart(4, "0")}`,
    clientId: payload.clientId ?? "",
    client: db.clients.find((c) => c.id === payload.clientId),
    status: (payload.status as InvoiceStatus) ?? "draft",
    issueDate,
    dueDate,
    sentAt: payload.sentAt,
    items,
    subtotal,
    taxRate,
    tax,
    total,
    notes: payload.notes,
    createdAt: payload.createdAt ?? today(),
  });
};

export const localInvoices = {
  getAll(query: InvoiceQuery = {}): PaginatedResponse<Invoice> {
    const db = readDb();
    const filtered = filterInvoices(
      db.invoices.map((inv) => syncInvoiceClient(db, inv)),
      query,
    );
    return paginate(sortInvoices(filtered), query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },
  getById(id: string): Invoice {
    const db = readDb();
    const invoice = db.invoices.find((inv) => inv.id === id);
    if (!invoice) throw new Error("Invoice not found");
    return syncInvoiceClient(db, invoice);
  },
  create(payload: Partial<Invoice>): Invoice {
    const db = readDb();
    const invoice = normalizeInvoicePayload(db, payload);
    db.invoices.unshift(invoice);
    writeDb(db);
    return syncInvoiceClient(db, invoice);
  },
  update(id: string, payload: Partial<Invoice>): Invoice {
    const db = readDb();
    const index = db.invoices.findIndex((inv) => inv.id === id);
    if (index === -1) throw new Error("Invoice not found");
    const merged = recalculateInvoice({
      ...db.invoices[index],
      ...payload,
      items: payload.items ?? db.invoices[index].items,
      taxRate: payload.taxRate ?? db.invoices[index].taxRate,
      sentAt: payload.sentAt ?? db.invoices[index].sentAt,
    } as Invoice);
    const updated = syncInvoiceClient(db, merged);
    db.invoices[index] = updated;
    writeDb(db);
    return updated;
  },
  delete(id: string) {
    const db = readDb();
    db.invoices = db.invoices.filter((inv) => inv.id !== id);
    writeDb(db);
  },
};

const filterClients = (items: Client[], query: ClientQuery = {}) => {
  const search = normalizeText(query.search);
  return items.filter((client) => {
    if (!search) return true;
    return [client.name, client.email, client.company, client.phone]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });
};

export const localClients = {
  getAll(query: ClientQuery = {}): PaginatedResponse<Client> {
    const db = readDb();
    const filtered = sortByDateDesc(filterClients(db.clients, query));
    return paginate(filtered, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },
  getById(id: string): Client {
    const db = readDb();
    const client = db.clients.find((c) => c.id === id);
    if (!client) throw new Error("Client not found");
    return client;
  },
  create(payload: Partial<Client>): Client {
    const db = readDb();
    const client: Client = {
      id: createId("client"),
      name: payload.name?.trim() ?? "",
      email: payload.email?.trim() ?? "",
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
      createdAt: today(),
    };
    db.clients.unshift(client);
    writeDb(db);
    return client;
  },
  update(id: string, payload: Partial<Client>): Client {
    const db = readDb();
    const index = db.clients.findIndex((client) => client.id === id);
    if (index === -1) throw new Error("Client not found");
    const updated = {
      ...db.clients[index],
      ...payload,
      name: payload.name?.trim() ?? db.clients[index].name,
      email: payload.email?.trim() ?? db.clients[index].email,
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
    };
    db.clients[index] = updated;
    db.invoices = db.invoices.map((invoice) =>
      invoice.clientId === id ? { ...invoice, client: updated } : invoice,
    );
    writeDb(db);
    return updated;
  },
  delete(id: string) {
    const db = readDb();
    db.clients = db.clients.filter((client) => client.id !== id);
    db.invoices = db.invoices.filter((invoice) => invoice.clientId !== id);
    writeDb(db);
  },
};

const filterProducts = (items: Product[], query: ProductQuery = {}) => {
  const search = normalizeText(query.search);
  return items.filter((product) => {
    if (!search) return true;
    return [product.name, product.sku, product.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });
};

export const localProducts = {
  getAll(query: ProductQuery = {}): PaginatedResponse<Product> {
    const db = readDb();
    const filtered = sortByDateDesc(filterProducts(db.products, query));
    return paginate(filtered, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },
  getById(id: string): Product {
    const db = readDb();
    const product = db.products.find((p) => p.id === id);
    if (!product) throw new Error("Product not found");
    return product;
  },
  create(payload: Partial<Product>): Product {
    const db = readDb();
    const product: Product = {
      id: createId("product"),
      name: payload.name?.trim() ?? "",
      description: payload.description?.trim() || undefined,
      price: payload.price ?? 0,
      sku: payload.sku?.trim() || undefined,
      createdAt: today(),
    };
    db.products.unshift(product);
    writeDb(db);
    return product;
  },
  update(id: string, payload: Partial<Product>): Product {
    const db = readDb();
    const index = db.products.findIndex((product) => product.id === id);
    if (index === -1) throw new Error("Product not found");
    const updated = {
      ...db.products[index],
      ...payload,
      name: payload.name?.trim() ?? db.products[index].name,
      description: payload.description?.trim() || undefined,
      sku: payload.sku?.trim() || undefined,
      price: payload.price ?? db.products[index].price,
    };
    db.products[index] = updated;
    writeDb(db);
    return updated;
  },
  delete(id: string) {
    const db = readDb();
    db.products = db.products.filter((product) => product.id !== id);
    db.invoices = db.invoices.map((invoice) => ({
      ...invoice,
      items: invoice.items.map((item) =>
        item.productId === id ? { ...item, productId: undefined } : item,
      ),
    }));
    writeDb(db);
  },
};

const filterExpenses = (items: Expense[], query: ExpenseQuery = {}) => {
  const search = normalizeText(query.search);
  const category = normalizeText(query.category);
  return items.filter((expense) => {
    const matchesSearch =
      !search ||
      expense.description.toLowerCase().includes(search) ||
      expense.vendor?.toLowerCase().includes(search) ||
      expense.category.toLowerCase().includes(search);
    const matchesCategory = !category || expense.category.toLowerCase() === category;
    return matchesSearch && matchesCategory;
  });
};

export const localExpenses = {
  getAll(query: ExpenseQuery = {}): PaginatedResponse<Expense> {
    const db = readDb();
    const filtered = sortByDateDesc(filterExpenses(db.expenses, query));
    return paginate(filtered, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },
  getById(id: string): Expense {
    const db = readDb();
    const expense = db.expenses.find((e) => e.id === id);
    if (!expense) throw new Error("Expense not found");
    return expense;
  },
  create(payload: Partial<Expense>): Expense {
    const db = readDb();
    const expense: Expense = {
      id: createId("expense"),
      description: payload.description?.trim() ?? "",
      category: payload.category?.trim() ?? "Other",
      amount: payload.amount ?? 0,
      date: payload.date ?? new Date().toISOString().slice(0, 10),
      vendor: payload.vendor?.trim() || undefined,
      createdAt: today(),
    };
    db.expenses.unshift(expense);
    writeDb(db);
    return expense;
  },
  update(id: string, payload: Partial<Expense>): Expense {
    const db = readDb();
    const index = db.expenses.findIndex((expense) => expense.id === id);
    if (index === -1) throw new Error("Expense not found");
    const updated = {
      ...db.expenses[index],
      ...payload,
      description: payload.description?.trim() ?? db.expenses[index].description,
      category: payload.category?.trim() ?? db.expenses[index].category,
      amount: payload.amount ?? db.expenses[index].amount,
      date: payload.date ?? db.expenses[index].date,
      vendor: payload.vendor?.trim() || undefined,
    };
    db.expenses[index] = updated;
    writeDb(db);
    return updated;
  },
  delete(id: string) {
    const db = readDb();
    db.expenses = db.expenses.filter((expense) => expense.id !== id);
    writeDb(db);
  },
};

export const localAnalytics = {
  overview(): AnalyticsOverview {
    const db = readDb();
    const totalRevenue = db.invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.total, 0);
    const paidInvoices = db.invoices.filter((invoice) => invoice.status === "paid").length;
    const pendingInvoices = db.invoices.filter(
      (invoice) => invoice.status === "draft" || invoice.status === "sent",
    ).length;
    const overdueInvoices = db.invoices.filter((invoice) => invoice.status === "overdue").length;
    const totalExpenses = db.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const revenueChange = 12.4;
    const expensesChange = 4.8;
    return {
      totalRevenue,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      totalExpenses,
      netProfit,
      revenueChange,
      expensesChange,
    };
  },
  revenue(range = "30d"): RevenuePoint[] {
    const db = readDb();
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const points = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - index - 1));
      const dayKey = date.toISOString().slice(0, 10);
      const revenue = db.invoices
        .filter((invoice) => invoice.status === "paid" && invoice.issueDate.slice(0, 10) === dayKey)
        .reduce((sum, invoice) => sum + invoice.total, 0);
      const expenses = db.expenses
        .filter((expense) => expense.date === dayKey)
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { date: dayKey.slice(5), revenue, expenses };
    });
    return points;
  },
  invoiceStatus(): InvoiceStatusDistribution[] {
    const db = readDb();
    const statuses: InvoiceStatus[] = ["paid", "sent", "draft", "overdue", "cancelled"];
    return statuses.map((status) => {
      const invoices = db.invoices.filter((invoice) => invoice.status === status);
      return {
        status,
        count: invoices.length,
        amount: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
      };
    });
  },
};

export const localStorageHelpers = {
  resetAppData() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DB_KEY, JSON.stringify(emptyDb()));
    window.localStorage.removeItem(TOKEN_KEY);
  },
  exportAppData() {
    return readDb();
  },
  importAppData(next: Partial<LocalDb>) {
    const db = {
      ...emptyDb(),
      users: next.users ?? [],
      sessions: next.sessions ?? {},
      settings: next.settings ?? defaultSettings,
      clients: next.clients ?? [],
      products: next.products ?? [],
      invoices: next.invoices ?? [],
      expenses: next.expenses ?? [],
    };
    writeDb(db);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
    }
    return db;
  },
};

export const localSettings = {
  get(): AppSettings {
    return readDb().settings;
  },
  update(payload: Partial<AppSettings>): AppSettings {
    const db = readDb();
    db.settings = { ...db.settings, ...payload };
    writeDb(db);
    return db.settings;
  },
};

export const localTokenHelpers = {
  getSessionToken,
  setSessionToken,
  clearSessionToken,
};
