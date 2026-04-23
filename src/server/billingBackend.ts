import { createClient, type Transaction, type InArgs } from "@libsql/client";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as net from "node:net";
import * as tls from "node:tls";
import type {
  AnalyticsOverview,
  AppSettings,
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
} from "@/types";
import type { Language } from "@/lib/i18n";

type StoredUser = AuthUser & { password: string };
type DbRow = Record<string, unknown>;

interface ClientQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

type ProductQuery = ClientQuery;

type ExpenseQuery = ClientQuery & {
  category?: string;
};

type InvoiceQuery = ClientQuery & {
  status?: string;
};

interface SendInvoiceResult {
  invoice: Invoice;
  email: {
    to: string;
    subject: string;
    body: string;
    mailtoUrl: string;
    delivered?: boolean;
    transport?: "smtp" | "mailto" | "preview";
    providerMessage?: string;
  };
}

interface WorkspaceBackup {
  version: 1;
  exportedAt: string;
  users: StoredUser[];
  settings: AppSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  expenses: Expense[];
}

const DB_PATH = process.env.BILLFLOW_DB_PATH ?? join(process.cwd(), ".billflow.db");
const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TURSO_DATABASE_URL ??
  process.env.LIBSQL_URL ??
  pathToFileURL(DB_PATH).href;
const DB_AUTH_TOKEN =
  process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;

const DEFAULT_PAGE_SIZE = 10;
const db = createClient({
  url: DB_URL,
  ...(DB_AUTH_TOKEN ? { authToken: DB_AUTH_TOKEN } : {}),
});

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

let initPromise: Promise<void> | null = null;

const rawExecute = (sql: string, args?: InArgs) => db.execute(sql, args);
const rawExecuteMultiple = (sql: string) => db.executeMultiple(sql);
const rawOne = async <T extends DbRow>(sql: string, args?: InArgs): Promise<T | undefined> => {
  const rs = await rawExecute(sql, args);
  return (rs.rows[0] as T | undefined) ?? undefined;
};
const rawMany = async <T extends DbRow>(sql: string, args?: InArgs): Promise<T[]> => {
  const rs = await rawExecute(sql, args);
  return rs.rows as T[];
};

const ensureInitialized = async () => {
  if (!initPromise) initPromise = initializeDatabase();
  await initPromise;
};

const execute = async (sql: string, args?: InArgs) => {
  await ensureInitialized();
  return rawExecute(sql, args);
};

const executeMultiple = async (sql: string) => {
  await ensureInitialized();
  return rawExecuteMultiple(sql);
};

const one = async <T extends DbRow>(sql: string, args?: InArgs): Promise<T | undefined> => {
  const rs = await execute(sql, args);
  return (rs.rows[0] as T | undefined) ?? undefined;
};

const many = async <T extends DbRow>(sql: string, args?: InArgs): Promise<T[]> => {
  const rs = await execute(sql, args);
  return rs.rows as T[];
};

const addMissingColumns = async (table: string, columns: Record<string, string>) => {
  const rows = await rawMany<{ name: string }>(`PRAGMA table_info(${table})`);
  const existing = new Set(rows.map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      await execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
};

const initializeDatabase = async () => {
  await rawExecuteMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      avatar TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL,
      legal_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      website TEXT,
      logo_url TEXT,
      currency TEXT NOT NULL,
      tax_rate REAL NOT NULL,
      invoice_prefix TEXT NOT NULL,
      next_invoice_number INTEGER NOT NULL,
      payment_terms TEXT NOT NULL,
      footer_message TEXT NOT NULL,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_secure INTEGER,
      smtp_user TEXT,
      smtp_password TEXT,
      smtp_from_email TEXT,
      smtp_from_name TEXT
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      sku TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      vendor TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      status TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      sent_at TEXT,
      subtotal REAL NOT NULL,
      tax_rate REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);

  await addMissingColumns("settings", {
    smtp_host: "TEXT",
    smtp_port: "INTEGER",
    smtp_secure: "INTEGER",
    smtp_user: "TEXT",
    smtp_password: "TEXT",
    smtp_from_email: "TEXT",
    smtp_from_name: "TEXT",
  });

  const settingsCount = await rawOne<{ count: number }>("SELECT COUNT(*) as count FROM settings");
  if (!settingsCount || Number(settingsCount.count) === 0) {
    await rawExecute(
      `INSERT INTO settings (
        id, company_name, legal_name, email, phone, address, website, logo_url, currency,
        tax_rate, invoice_prefix, next_invoice_number, payment_terms, footer_message,
        smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email, smtp_from_name
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        defaultSettings.companyName,
        defaultSettings.legalName || null,
        defaultSettings.email || null,
        defaultSettings.phone || null,
        defaultSettings.address || null,
        defaultSettings.website || null,
        null,
        defaultSettings.currency,
        defaultSettings.taxRate,
        defaultSettings.invoicePrefix,
        defaultSettings.nextInvoiceNumber,
        defaultSettings.paymentTerms,
        defaultSettings.footerMessage,
        defaultSettings.smtpHost || null,
        defaultSettings.smtpPort || null,
        defaultSettings.smtpSecure ? 1 : 0,
        defaultSettings.smtpUser || null,
        defaultSettings.smtpPassword || null,
        defaultSettings.smtpFromEmail || null,
        defaultSettings.smtpFromName || null,
      ],
    );
  }
};

const rowToClient = (row: DbRow): Client => ({
  id: String(row.id),
  name: String(row.name),
  email: String(row.email),
  company: (row.company as string | null | undefined) ?? undefined,
  phone: (row.phone as string | null | undefined) ?? undefined,
  address: (row.address as string | null | undefined) ?? undefined,
  createdAt: String(row.created_at),
});

const rowToProduct = (row: DbRow): Product => ({
  id: String(row.id),
  name: String(row.name),
  description: (row.description as string | null | undefined) ?? undefined,
  price: Number(row.price),
  sku: (row.sku as string | null | undefined) ?? undefined,
  createdAt: String(row.created_at),
});

const rowToExpense = (row: DbRow): Expense => ({
  id: String(row.id),
  description: String(row.description),
  category: String(row.category),
  amount: Number(row.amount),
  date: String(row.date),
  vendor: (row.vendor as string | null | undefined) ?? undefined,
  createdAt: String(row.created_at),
});

const rowToSettings = (row: DbRow): AppSettings => ({
  companyName: String(row.company_name),
  legalName: (row.legal_name as string | null | undefined) ?? undefined,
  email: (row.email as string | null | undefined) ?? undefined,
  phone: (row.phone as string | null | undefined) ?? undefined,
  address: (row.address as string | null | undefined) ?? undefined,
  website: (row.website as string | null | undefined) ?? undefined,
  logoUrl: (row.logo_url as string | null | undefined) ?? undefined,
  currency: String(row.currency),
  taxRate: Number(row.tax_rate),
  invoicePrefix: String(row.invoice_prefix),
  nextInvoiceNumber: Number(row.next_invoice_number),
  paymentTerms: String(row.payment_terms),
  footerMessage: String(row.footer_message),
  smtpHost: (row.smtp_host as string | null | undefined) ?? undefined,
  smtpPort:
    row.smtp_port === null || row.smtp_port === undefined ? undefined : Number(row.smtp_port),
  smtpSecure:
    row.smtp_secure === null || row.smtp_secure === undefined
      ? undefined
      : Boolean(row.smtp_secure),
  smtpUser: (row.smtp_user as string | null | undefined) ?? undefined,
  smtpPassword: (row.smtp_password as string | null | undefined) ?? undefined,
  smtpFromEmail: (row.smtp_from_email as string | null | undefined) ?? undefined,
  smtpFromName: (row.smtp_from_name as string | null | undefined) ?? undefined,
});

const rowToInvoice = async (row: DbRow): Promise<Invoice> => ({
  id: String(row.id),
  number: String(row.number),
  clientId: String(row.client_id),
  client: await clientFor(String(row.client_id)),
  status: String(row.status) as InvoiceStatus,
  issueDate: String(row.issue_date),
  dueDate: String(row.due_date),
  sentAt: (row.sent_at as string | null | undefined) ?? undefined,
  items: await invoiceItemsFor(String(row.id)),
  subtotal: Number(row.subtotal),
  taxRate: Number(row.tax_rate),
  tax: Number(row.tax),
  total: Number(row.total),
  notes: (row.notes as string | null | undefined) ?? undefined,
  createdAt: String(row.created_at),
});

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

const getSettings = async (): Promise<AppSettings> => {
  const row = await one<DbRow>("SELECT * FROM settings WHERE id = 1");
  if (!row) {
    await updateSettings(defaultSettings);
    return defaultSettings;
  }
  return rowToSettings(row);
};

const updateSettings = async (payload: Partial<AppSettings>): Promise<AppSettings> => {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...payload };
  await rawExecute(
    `UPDATE settings SET
      company_name = ?,
      legal_name = ?,
      email = ?,
      phone = ?,
      address = ?,
      website = ?,
      logo_url = ?,
      currency = ?,
      tax_rate = ?,
      invoice_prefix = ?,
      next_invoice_number = ?,
      payment_terms = ?,
      footer_message = ?,
      smtp_host = ?,
      smtp_port = ?,
      smtp_secure = ?,
      smtp_user = ?,
      smtp_password = ?,
      smtp_from_email = ?,
      smtp_from_name = ?
    WHERE id = 1`,
    [
      next.companyName,
      next.legalName ?? null,
      next.email ?? null,
      next.phone ?? null,
      next.address ?? null,
      next.website ?? null,
      next.logoUrl ?? null,
      next.currency,
      next.taxRate,
      next.invoicePrefix,
      next.nextInvoiceNumber,
      next.paymentTerms,
      next.footerMessage,
      next.smtpHost || null,
      next.smtpPort ?? null,
      next.smtpSecure ? 1 : 0,
      next.smtpUser || null,
      next.smtpPassword || null,
      next.smtpFromEmail || null,
      next.smtpFromName || null,
    ],
  );
  return next;
};

const resetWorkspaceData = async () => {
  await rawExecuteMultiple(`
    DELETE FROM invoice_items;
    DELETE FROM invoices;
    DELETE FROM expenses;
    DELETE FROM products;
    DELETE FROM clients;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM settings;
  `);
  await rawExecute(
    `INSERT INTO settings (
      id, company_name, legal_name, email, phone, address, website, logo_url, currency,
      tax_rate, invoice_prefix, next_invoice_number, payment_terms, footer_message,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email, smtp_from_name
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      defaultSettings.companyName,
      defaultSettings.legalName || null,
      defaultSettings.email || null,
      defaultSettings.phone || null,
      defaultSettings.address || null,
      defaultSettings.website || null,
      null,
      defaultSettings.currency,
      defaultSettings.taxRate,
      defaultSettings.invoicePrefix,
      defaultSettings.nextInvoiceNumber,
      defaultSettings.paymentTerms,
      defaultSettings.footerMessage,
      defaultSettings.smtpHost || null,
      defaultSettings.smtpPort || null,
      defaultSettings.smtpSecure ? 1 : 0,
      defaultSettings.smtpUser || null,
      defaultSettings.smtpPassword || null,
      defaultSettings.smtpFromEmail || null,
      defaultSettings.smtpFromName || null,
    ],
  );
};

const getSessionUser = async (request: Request): Promise<StoredUser | null> => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return null;
  const row = await one<StoredUser>(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token],
  );
  return row ?? null;
};

const requireUser = async (request: Request): Promise<AuthUser> => {
  const user = await getSessionUser(request);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  const { password: _password, ...safeUser } = user;
  return safeUser;
};

const invoiceItemsFor = async (invoiceId: string): Promise<InvoiceItem[]> => {
  const rows = await many<DbRow>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid ASC",
    [invoiceId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    productId: (row.product_id as string | null | undefined) ?? undefined,
    description: String(row.description),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
  }));
};

const clientFor = async (clientId: string): Promise<Client | undefined> => {
  const row = await one<DbRow>("SELECT * FROM clients WHERE id = ?", [clientId]);
  return row ? rowToClient(row) : undefined;
};

const invoiceFor = async (row: DbRow): Promise<Invoice> =>
  rowToInvoice(row);

const invoiceTotal = (items: InvoiceItem[], taxRate: number) => {
  const subtotal = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0,
  );
  const tax = subtotal * (taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
};

const nextInvoiceNumber = async (settings: AppSettings): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `${settings.invoicePrefix}-${year}-`;
  const rows = await many<{ number: string }>("SELECT number FROM invoices WHERE number LIKE ?", [
    `${prefix}%`,
  ]);
  const used = new Set(
    rows
      .map((row) => {
        const match = row.number.match(new RegExp(`^${settings.invoicePrefix}-${year}-(\\d+)$`));
        return match ? Number(match[1]) : NaN;
      })
      .filter((value) => Number.isFinite(value)),
  );
  let next = Math.max(1, settings.nextInvoiceNumber);
  while (used.has(next)) next += 1;
  await updateSettings({ nextInvoiceNumber: next + 1 });
  return `${settings.invoicePrefix}-${year}-${String(next).padStart(4, "0")}`;
};

const filterClients = (clients: Client[], query: ClientQuery) => {
  const search = normalizeText(query.search);
  return clients.filter((client) => {
    if (!search) return true;
    return [client.name, client.email, client.company, client.phone]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });
};

const filterProducts = (products: Product[], query: ProductQuery) => {
  const search = normalizeText(query.search);
  return products.filter((product) => {
    if (!search) return true;
    return [product.name, product.sku, product.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });
};

const filterExpenses = (expenses: Expense[], query: ExpenseQuery) => {
  const search = normalizeText(query.search);
  const category = normalizeText(query.category);
  return expenses.filter((expense) => {
    const matchesSearch =
      !search ||
      expense.description.toLowerCase().includes(search) ||
      expense.vendor?.toLowerCase().includes(search) ||
      expense.category.toLowerCase().includes(search);
    const matchesCategory = !category || expense.category.toLowerCase() === category;
    return matchesSearch && matchesCategory;
  });
};

const filterInvoices = (invoices: Invoice[], query: InvoiceQuery) => {
  const search = normalizeText(query.search);
  const status = query.status && query.status !== "all" ? query.status : "";
  return invoices.filter((invoice) => {
    const matchesStatus = !status || invoice.status === status;
    const matchesSearch =
      !search ||
      invoice.number.toLowerCase().includes(search) ||
      invoice.client?.name.toLowerCase().includes(search) ||
      invoice.client?.email.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });
};

const sortInvoices = (items: Invoice[]) =>
  [...items].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

const makeEmailPreview = (invoice: Invoice, settings: AppSettings, language: Language) => {
  const to = invoice.client?.email ?? "";
  const subject =
    language === "bn"
      ? `${settings.companyName} ইনভয়েস ${invoice.number}`
      : `${settings.companyName} invoice ${invoice.number}`;
  const body = [
    language === "bn"
      ? `প্রিয় ${invoice.client?.name ?? "গ্রাহক"},`
      : `Hi ${invoice.client?.name ?? "there"},`,
    "",
    language === "bn"
      ? `আপনার ইনভয়েস ${invoice.number} সংযুক্ত করা হলো।`
      : `Your invoice ${invoice.number} is attached below.`,
    "",
    language === "bn"
      ? `মোট পরিমাণ: ${invoice.total.toFixed(2)}`
      : `Total amount: ${invoice.total.toFixed(2)}`,
    "",
    settings.footerMessage || settings.paymentTerms,
  ].join("\n");
  return {
    to,
    subject,
    body,
    mailtoUrl: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
};

const hasSmtpConfig = (settings: AppSettings) =>
  Boolean(
    settings.smtpHost &&
      settings.smtpPort &&
      settings.smtpUser &&
      settings.smtpPassword &&
      settings.smtpFromEmail,
  );

const sendViaSmtp = async (
  settings: AppSettings,
  payload: { to: string; subject: string; body: string },
) => {
  const port = settings.smtpPort ?? 465;
  const secure = settings.smtpSecure ?? port === 465;
  const socket = secure
    ? tls.connect({ host: settings.smtpHost!, port, servername: settings.smtpHost! })
    : net.createConnection({ host: settings.smtpHost!, port });

  const readLine = async () =>
    new Promise<string>((resolve, reject) => {
      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\r\n");
        if (lines.length > 1) {
          cleanup();
          resolve(lines[0]);
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      socket.on("data", onData);
      socket.on("error", onError);
    });

  const sendCommand = async (command: string) => {
    socket.write(`${command}\r\n`);
    const line = await readLine();
    const code = Number(line.slice(0, 3));
    const message = line.slice(4);
    return { code, message };
  };

  const greet = await readLine();
  if (!greet.startsWith("220")) throw new Error(greet);

  const helo = await sendCommand(`EHLO ${settings.smtpFromName || "billflow.app"}`);
  if (helo.code >= 400) throw new Error(helo.message);

  if (secure) {
    const auth = Buffer.from(`\0${settings.smtpUser}\0${settings.smtpPassword}`).toString("base64");
    const authResp = await sendCommand(`AUTH PLAIN ${auth}`);
    if (authResp.code >= 400) throw new Error(authResp.message);
  } else {
    const startTls = await sendCommand("STARTTLS");
    if (startTls.code >= 400) throw new Error(startTls.message);
  }

  const from = settings.smtpFromEmail!;
  const rcpt = await sendCommand(`MAIL FROM:<${from}>`);
  if (rcpt.code >= 400) throw new Error(rcpt.message);
  const to = await sendCommand(`RCPT TO:<${payload.to}>`);
  if (to.code >= 400) throw new Error(to.message);
  const data = await sendCommand("DATA");
  if (data.code >= 400) throw new Error(data.message);

  const headers = [
    `From: ${settings.smtpFromName || from} <${from}>`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    payload.body,
  ].join("\r\n");
  socket.write(`${headers}\r\n.\r\n`);
  const dataAck = await readLine();
  if (!dataAck.startsWith("250")) throw new Error(dataAck);
  await sendCommand("QUIT");
  socket.end();
  return dataAck;
};

export const billingBackend = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const userRow = await one<StoredUser>(
      "SELECT * FROM users WHERE lower(email) = lower(?) AND password = ?",
      [email.trim(), password],
    );
    if (!userRow) throw new Response("Invalid email or password", { status: 401 });
    const token = createId("token");
    await rawExecute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [
      token,
      userRow.id,
      today(),
    ]);
    const { password: _password, ...safeUser } = userRow;
    return { user: safeUser, token };
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    await resetWorkspaceData();
    const id = createId("user");
    await rawExecute("INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)", [
      id,
      name.trim(),
      email.trim().toLowerCase(),
      password,
    ]);
    const token = createId("token");
    await rawExecute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [
      token,
      id,
      today(),
    ]);
    return { user: { id, name: name.trim(), email: email.trim().toLowerCase() }, token };
  },

  async me(request: Request): Promise<AuthUser> {
    return requireUser(request);
  },

  async logout(request: Request): Promise<Response> {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (token) {
      await rawExecute("DELETE FROM sessions WHERE token = ?", [token]);
    }
    return new Response(null, { status: 204 });
  },

  async getSettings(): Promise<AppSettings> {
    return getSettings();
  },

  async updateSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
    return updateSettings(payload);
  },

  async listClients(query: ClientQuery = {}): Promise<PaginatedResponse<Client>> {
    const clients = filterClients(
      (await many<DbRow>("SELECT * FROM clients ORDER BY created_at DESC")).map(rowToClient),
      query,
    );
    return paginate(clients, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  async getClient(id: string): Promise<Client> {
    const row = await one<DbRow>("SELECT * FROM clients WHERE id = ?", [id]);
    if (!row) throw new Response("Client not found", { status: 404 });
    return rowToClient(row);
  },

  async createClient(payload: Partial<Client>): Promise<Client> {
    const client: Client = {
      id: createId("client"),
      name: payload.name?.trim() ?? "",
      email: payload.email?.trim() ?? "",
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
      createdAt: today(),
    };
    await rawExecute(
      "INSERT INTO clients (id, name, email, company, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        client.id,
        client.name,
        client.email,
        client.company ?? null,
        client.phone ?? null,
        client.address ?? null,
        client.createdAt,
      ],
    );
    return client;
  },

  async updateClient(id: string, payload: Partial<Client>): Promise<Client> {
    const current = await this.getClient(id);
    const updated = {
      ...current,
      ...payload,
      name: payload.name?.trim() ?? current.name,
      email: payload.email?.trim() ?? current.email,
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
    };
    await rawExecute("UPDATE clients SET name = ?, email = ?, company = ?, phone = ?, address = ? WHERE id = ?", [
      updated.name,
      updated.email,
      updated.company ?? null,
      updated.phone ?? null,
      updated.address ?? null,
      id,
    ]);
    return updated;
  },

  async deleteClient(id: string): Promise<void> {
    await rawExecute("DELETE FROM clients WHERE id = ?", [id]);
  },

  async listProducts(query: ProductQuery = {}): Promise<PaginatedResponse<Product>> {
    const products = filterProducts(
      (await many<DbRow>("SELECT * FROM products ORDER BY created_at DESC")).map(rowToProduct),
      query,
    );
    return paginate(products, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  async getProduct(id: string): Promise<Product> {
    const row = await one<DbRow>("SELECT * FROM products WHERE id = ?", [id]);
    if (!row) throw new Response("Product not found", { status: 404 });
    return rowToProduct(row);
  },

  async createProduct(payload: Partial<Product>): Promise<Product> {
    const product: Product = {
      id: createId("product"),
      name: payload.name?.trim() ?? "",
      description: payload.description?.trim() || undefined,
      price: payload.price ?? 0,
      sku: payload.sku?.trim() || undefined,
      createdAt: today(),
    };
    await rawExecute(
      "INSERT INTO products (id, name, description, price, sku, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        product.id,
        product.name,
        product.description ?? null,
        product.price,
        product.sku ?? null,
        product.createdAt,
      ],
    );
    return product;
  },

  async updateProduct(id: string, payload: Partial<Product>): Promise<Product> {
    const current = await this.getProduct(id);
    const updated = {
      ...current,
      ...payload,
      name: payload.name?.trim() ?? current.name,
      description: payload.description?.trim() || undefined,
      sku: payload.sku?.trim() || undefined,
      price: payload.price ?? current.price,
    };
    await rawExecute("UPDATE products SET name = ?, description = ?, price = ?, sku = ? WHERE id = ?", [
      updated.name,
      updated.description ?? null,
      updated.price,
      updated.sku ?? null,
      id,
    ]);
    return updated;
  },

  async deleteProduct(id: string): Promise<void> {
    await rawExecute("DELETE FROM products WHERE id = ?", [id]);
  },

  async listExpenses(query: ExpenseQuery = {}): Promise<PaginatedResponse<Expense>> {
    const expenses = filterExpenses(
      (await many<DbRow>("SELECT * FROM expenses ORDER BY created_at DESC")).map(rowToExpense),
      query,
    );
    return paginate(expenses, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  async getExpense(id: string): Promise<Expense> {
    const row = await one<DbRow>("SELECT * FROM expenses WHERE id = ?", [id]);
    if (!row) throw new Response("Expense not found", { status: 404 });
    return rowToExpense(row);
  },

  async createExpense(payload: Partial<Expense>): Promise<Expense> {
    const expense: Expense = {
      id: createId("expense"),
      description: payload.description?.trim() ?? "",
      category: payload.category?.trim() ?? "Other",
      amount: payload.amount ?? 0,
      date: payload.date ?? new Date().toISOString().slice(0, 10),
      vendor: payload.vendor?.trim() || undefined,
      createdAt: today(),
    };
    await rawExecute(
      "INSERT INTO expenses (id, description, category, amount, date, vendor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        expense.id,
        expense.description,
        expense.category,
        expense.amount,
        expense.date,
        expense.vendor ?? null,
        expense.createdAt,
      ],
    );
    return expense;
  },

  async updateExpense(id: string, payload: Partial<Expense>): Promise<Expense> {
    const current = await this.getExpense(id);
    const updated = {
      ...current,
      ...payload,
      description: payload.description?.trim() ?? current.description,
      category: payload.category?.trim() ?? current.category,
      amount: payload.amount ?? current.amount,
      date: payload.date ?? current.date,
      vendor: payload.vendor?.trim() || undefined,
    };
    await rawExecute(
      "UPDATE expenses SET description = ?, category = ?, amount = ?, date = ?, vendor = ? WHERE id = ?",
      [
        updated.description,
        updated.category,
        updated.amount,
        updated.date,
        updated.vendor ?? null,
        id,
      ],
    );
    return updated;
  },

  async deleteExpense(id: string): Promise<void> {
    await rawExecute("DELETE FROM expenses WHERE id = ?", [id]);
  },

  async listInvoices(query: InvoiceQuery = {}): Promise<PaginatedResponse<Invoice>> {
    const invoices = await Promise.all(
      (await many<DbRow>("SELECT * FROM invoices ORDER BY issue_date DESC")).map((row) =>
        invoiceFor(row),
      ),
    );
    const filtered = filterInvoices(invoices, query);
    return paginate(sortInvoices(filtered), query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  async getInvoice(id: string): Promise<Invoice> {
    const row = await one<DbRow>("SELECT * FROM invoices WHERE id = ?", [id]);
    if (!row) throw new Response("Invoice not found", { status: 404 });
    return invoiceFor(row);
  },

  async createInvoice(payload: Partial<Invoice>): Promise<Invoice> {
    const settings = await getSettings();
    const invoiceId = payload.id ?? createId("invoice");
    const issueDate = payload.issueDate ?? new Date().toISOString().slice(0, 10);
    const dueDate = payload.dueDate ?? issueDate;
    const items = (payload.items ?? []).map((item) => ({
      ...item,
      id: item.id ?? createId("item"),
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
      total: (item.quantity ?? 0) * (item.unitPrice ?? 0),
    }));
    const taxRate = payload.taxRate ?? settings.taxRate;
    const { subtotal, tax, total } = invoiceTotal(items, taxRate);
    const number = payload.number ?? (await nextInvoiceNumber(settings));

    const tx = await db.transaction("write");
    try {
      await tx.execute(
        `INSERT INTO invoices (
          id, number, client_id, status, issue_date, due_date, sent_at,
          subtotal, tax_rate, tax, total, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          number,
          payload.clientId ?? "",
          payload.status ?? "draft",
          issueDate,
          dueDate,
          null,
          subtotal,
          taxRate,
          tax,
          total,
          payload.notes ?? null,
          today(),
        ],
      );
      for (const item of items) {
        await tx.execute(
          "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            item.id ?? createId("item"),
            invoiceId,
            item.productId ?? null,
            item.description,
            item.quantity,
            item.unitPrice,
            item.total,
          ],
        );
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    } finally {
      tx.close();
    }
    return this.getInvoice(invoiceId);
  },

  async updateInvoice(id: string, payload: Partial<Invoice>): Promise<Invoice> {
    const current = await this.getInvoice(id);
    const updatedItems = payload.items ? payload.items : current.items;
    const taxRate = payload.taxRate ?? current.taxRate;
    const normalizedItems = updatedItems.map((item) => ({
      ...item,
      id: item.id ?? createId("item"),
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
      total: (item.quantity ?? 0) * (item.unitPrice ?? 0),
    }));
    const { subtotal, tax, total } = invoiceTotal(normalizedItems, taxRate);

    const tx = await db.transaction("write");
    try {
      await tx.execute(
        `UPDATE invoices SET
          client_id = ?, status = ?, issue_date = ?, due_date = ?, sent_at = ?,
          subtotal = ?, tax_rate = ?, tax = ?, total = ?, notes = ?
        WHERE id = ?`,
        [
          payload.clientId ?? current.clientId,
          (payload.status ?? current.status) as InvoiceStatus,
          payload.issueDate ?? current.issueDate,
          payload.dueDate ?? current.dueDate,
          payload.sentAt ?? current.sentAt ?? null,
          subtotal,
          taxRate,
          tax,
          total,
          payload.notes ?? current.notes ?? null,
          id,
        ],
      );
      await tx.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
      for (const item of normalizedItems) {
        await tx.execute(
          "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            item.id ?? createId("item"),
            id,
            item.productId ?? null,
            item.description,
            item.quantity,
            item.unitPrice,
            item.total,
          ],
        );
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    } finally {
      tx.close();
    }
    return this.getInvoice(id);
  },

  async deleteInvoice(id: string): Promise<void> {
    await rawExecute("DELETE FROM invoices WHERE id = ?", [id]);
  },

  async sendInvoice(id: string, language: Language = "en"): Promise<SendInvoiceResult> {
    const invoice = await this.updateInvoice(id, { status: "sent", sentAt: today() });
    const settings = await getSettings();
    const email = makeEmailPreview(invoice, settings, language);
    if (hasSmtpConfig(settings)) {
      try {
        const providerMessage = await sendViaSmtp(settings, {
          to: email.to,
          subject: email.subject,
          body: email.body,
        });
        return {
          invoice,
          email: {
            ...email,
            delivered: true,
            transport: "smtp",
            mailtoUrl: "",
            providerMessage,
          },
        };
      } catch (error) {
        return {
          invoice,
          email: {
            ...email,
            delivered: false,
            transport: "preview",
            providerMessage: error instanceof Error ? error.message : "SMTP send failed",
          },
        };
      }
    }
    return {
      invoice,
      email: {
        ...email,
        delivered: false,
        transport: "mailto",
      },
    };
  },

  async exportBackup(): Promise<WorkspaceBackup> {
    return {
      version: 1,
      exportedAt: today(),
      users: (await many<DbRow>("SELECT id, name, email, password, avatar FROM users ORDER BY name ASC")).map(
        (row) => ({
          id: String(row.id),
          name: String(row.name),
          email: String(row.email),
          password: String(row.password),
          avatar: (row.avatar as string | null | undefined) ?? undefined,
        }),
      ),
      settings: await this.getSettings(),
      clients: (await this.listClients({ pageSize: 1000 })).data,
      products: (await this.listProducts({ pageSize: 1000 })).data,
      invoices: (await this.listInvoices({ pageSize: 1000 })).data,
      expenses: (await this.listExpenses({ pageSize: 1000 })).data,
    };
  },

  async restoreBackup(snapshot: WorkspaceBackup): Promise<WorkspaceBackup> {
    if (!snapshot || snapshot.version !== 1) {
      throw new Response("Invalid backup file", { status: 400 });
    }
    await resetWorkspaceData();
    await updateSettings(snapshot.settings ?? defaultSettings);

    const tx = await db.transaction("write");
    try {
      for (const user of snapshot.users ?? []) {
        await tx.execute("INSERT INTO users (id, name, email, password, avatar) VALUES (?, ?, ?, ?, ?)", [
          user.id,
          user.name,
          user.email,
          user.password,
          user.avatar ?? null,
        ]);
      }
      for (const client of snapshot.clients ?? []) {
        await tx.execute(
          "INSERT INTO clients (id, name, email, company, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            client.id,
            client.name,
            client.email,
            client.company ?? null,
            client.phone ?? null,
            client.address ?? null,
            client.createdAt ?? today(),
          ],
        );
      }
      for (const product of snapshot.products ?? []) {
        await tx.execute(
          "INSERT INTO products (id, name, description, price, sku, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            product.id,
            product.name,
            product.description ?? null,
            product.price,
            product.sku ?? null,
            product.createdAt ?? today(),
          ],
        );
      }
      for (const expense of snapshot.expenses ?? []) {
        await tx.execute(
          "INSERT INTO expenses (id, description, category, amount, date, vendor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            expense.id,
            expense.description,
            expense.category,
            expense.amount,
            expense.date,
            expense.vendor ?? null,
            expense.createdAt ?? today(),
          ],
        );
      }
      for (const invoice of snapshot.invoices ?? []) {
        await tx.execute(
          `INSERT INTO invoices (
            id, number, client_id, status, issue_date, due_date, sent_at,
            subtotal, tax_rate, tax, total, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoice.id,
            invoice.number,
            invoice.clientId,
            invoice.status,
            invoice.issueDate,
            invoice.dueDate,
            invoice.sentAt ?? null,
            invoice.subtotal,
            invoice.taxRate,
            invoice.tax,
            invoice.total,
            invoice.notes ?? null,
            invoice.createdAt,
          ],
        );
        for (const item of invoice.items) {
          await tx.execute(
            "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
              item.id ?? createId("item"),
              invoice.id,
              item.productId ?? null,
              item.description,
              item.quantity,
              item.unitPrice,
              item.total,
            ],
          );
        }
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    } finally {
      tx.close();
    }
    return this.exportBackup();
  },

  async overview(): Promise<AnalyticsOverview> {
    const invoices = (await this.listInvoices({ pageSize: 1000 })).data;
    const expenses = (await this.listExpenses({ pageSize: 1000 })).data;
    const totalRevenue = invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoice.total, 0);
    const paidInvoices = invoices.filter((invoice) => invoice.status === "paid").length;
    const pendingInvoices = invoices.filter(
      (invoice) => invoice.status === "draft" || invoice.status === "sent",
    ).length;
    const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue").length;
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      totalRevenue,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      revenueChange: 12.4,
      expensesChange: 4.8,
    };
  },

  async revenue(range = "30d"): Promise<RevenuePoint[]> {
    const invoices = (await this.listInvoices({ pageSize: 1000 })).data;
    const expenses = (await this.listExpenses({ pageSize: 1000 })).data;
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    return Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - index - 1));
      const dayKey = date.toISOString().slice(0, 10);
      const revenue = invoices
        .filter((invoice) => invoice.status === "paid" && invoice.issueDate.slice(0, 10) === dayKey)
        .reduce((sum, invoice) => sum + invoice.total, 0);
      const expenseTotal = expenses
        .filter((expense) => expense.date === dayKey)
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { date: dayKey.slice(5), revenue, expenses: expenseTotal };
    });
  },

  async invoiceStatus(): Promise<InvoiceStatusDistribution[]> {
    const invoices = (await this.listInvoices({ pageSize: 1000 })).data;
    const statuses: InvoiceStatus[] = ["paid", "sent", "draft", "overdue", "cancelled"];
    return statuses.map((status) => {
      const rows = invoices.filter((invoice) => invoice.status === status);
      return {
        status,
        count: rows.length,
        amount: rows.reduce((sum, invoice) => sum + invoice.total, 0),
      };
    });
  },
};
