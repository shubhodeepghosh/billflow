import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
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

const DB_PATH = join(process.cwd(), ".billflow.db");
const DEFAULT_PAGE_SIZE = 10;
const dbKey = "__billflow_sqlite_db__";

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

const addMissingColumns = (db: DatabaseSync, table: string, columns: Record<string, string>) => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const existing = new Set(rows.map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
};

const getDb = (): DatabaseSync => {
  const g = globalThis as typeof globalThis & {
    [dbKey]?: DatabaseSync;
  };
  if (!g[dbKey]) {
    const db = new DatabaseSync(DB_PATH);
    db.exec(`
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
    initializeDatabase(db);
    addMissingColumns(db, "settings", {
      smtp_host: "TEXT",
      smtp_port: "INTEGER",
      smtp_secure: "INTEGER",
      smtp_user: "TEXT",
      smtp_password: "TEXT",
      smtp_from_email: "TEXT",
      smtp_from_name: "TEXT",
    });
    g[dbKey] = db;
  }
  return g[dbKey]!;
};

const initializeDatabase = (db: DatabaseSync) => {
  const demoUserCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM users WHERE lower(email) = lower(?) OR lower(name) = lower(?)",
    )
    .get("demo@billflow.app", "demo admin") as { count: number };
  const demoSettingsCount = db
    .prepare("SELECT COUNT(*) as count FROM settings WHERE id = 1 AND company_name = ?")
    .get("BillFlow Studio") as { count: number };

  if (demoUserCount.count > 0 || demoSettingsCount.count > 0) {
    db.exec(`
      DELETE FROM invoice_items;
      DELETE FROM invoices;
      DELETE FROM expenses;
      DELETE FROM products;
      DELETE FROM clients;
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM settings;
    `);
  }

  const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get() as {
    count: number;
  };
  if (settingsCount.count > 0) return;

  db.prepare(
    `INSERT INTO settings (
      id, company_name, legal_name, email, phone, address, website,
      logo_url, currency, tax_rate, invoice_prefix, next_invoice_number,
      payment_terms, footer_message, smtp_host, smtp_port, smtp_secure,
      smtp_user, smtp_password, smtp_from_email, smtp_from_name
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
};

type DbRow = Record<string, unknown>;

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

const rowToInvoice = (row: DbRow, items: InvoiceItem[], client?: Client): Invoice => ({
  id: String(row.id),
  number: String(row.number),
  clientId: String(row.client_id),
  client,
  status: String(row.status) as InvoiceStatus,
  issueDate: String(row.issue_date),
  dueDate: String(row.due_date),
  sentAt: (row.sent_at as string | null | undefined) ?? undefined,
  items,
  subtotal: Number(row.subtotal),
  taxRate: Number(row.tax_rate),
  tax: Number(row.tax),
  total: Number(row.total),
  notes: (row.notes as string | null | undefined) ?? undefined,
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

const getSettings = (): AppSettings => {
  const row = getDb().prepare("SELECT * FROM settings WHERE id = 1").get();
  if (!row) {
    const settings = defaultSettings;
    updateSettings(settings);
    return settings;
  }
  return rowToSettings(row);
};

const resetWorkspaceData = () => {
  const db = getDb();
  db.exec(`
    DELETE FROM invoice_items;
    DELETE FROM invoices;
    DELETE FROM expenses;
    DELETE FROM products;
    DELETE FROM clients;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM settings;
  `);
  db.prepare(
    `INSERT INTO settings (
      id, company_name, legal_name, email, phone, address, website, logo_url, currency,
      tax_rate, invoice_prefix, next_invoice_number, payment_terms, footer_message,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_email, smtp_from_name
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
};

const updateSettings = (payload: Partial<AppSettings>): AppSettings => {
  const current = getSettings();
  const next: AppSettings = { ...current, ...payload };
  getDb()
    .prepare(
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
    )
    .run(
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
    );
  return next;
};

const getSessionUser = (request: Request): StoredUser | null => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token);
  return row ? (row as StoredUser) : null;
};

const requireUser = (request: Request): AuthUser => {
  const user = getSessionUser(request);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  const { password: _password, ...safeUser } = user;
  return safeUser;
};

const invoiceItemsFor = (invoiceId: string): InvoiceItem[] =>
  getDb()
    .prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid ASC")
    .all(invoiceId)
    .map((row: DbRow) => ({
      id: row.id,
      productId: row.product_id ?? undefined,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      total: row.total,
    }));

const clientFor = (clientId: string): Client | undefined => {
  const row = getDb().prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  return row ? rowToClient(row) : undefined;
};

const invoiceFor = (row: DbRow): Invoice =>
  rowToInvoice(row, invoiceItemsFor(row.id), clientFor(row.client_id));

const invoiceTotal = (items: InvoiceItem[], taxRate: number) => {
  const subtotal = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0,
  );
  const tax = subtotal * (taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
};

const createInvoiceNumber = (): string => {
  const settings = getSettings();
  return `${settings.invoicePrefix}-${new Date().getFullYear()}-${String(settings.nextInvoiceNumber).padStart(4, "0")}`;
};

const allocateInvoiceNumber = (): string => {
  let nextInvoiceNumber = Math.max(1, getSettings().nextInvoiceNumber);
  while (true) {
    const candidate = `${getSettings().invoicePrefix}-${new Date().getFullYear()}-${String(nextInvoiceNumber).padStart(4, "0")}`;
    const exists = Boolean(
      getDb().prepare("SELECT 1 FROM invoices WHERE number = ?").get(candidate),
    );
    if (!exists) {
      updateSettings({ nextInvoiceNumber: nextInvoiceNumber + 1 });
      return candidate;
    }
    nextInvoiceNumber += 1;
  }
};

const incrementInvoiceCounter = () => {
  const settings = getSettings();
  updateSettings({ nextInvoiceNumber: settings.nextInvoiceNumber + 1 });
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

const sortByDateDesc = <T extends { createdAt?: string }>(items: T[]) =>
  [...items].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );

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
      ? `আপনার ইনভয়েস ${invoice.number} সংযুক্ত/পেমেন্টের জন্য প্রস্তুত।`
      : `Please find your invoice ${invoice.number} attached/ready for payment.`,
    language === "bn"
      ? `দেয় পরিমাণ: ${settings.currency} ${invoice.total.toFixed(2)}`
      : `Amount due: ${settings.currency} ${invoice.total.toFixed(2)}`,
    language === "bn" ? `ডিউ তারিখ: ${invoice.dueDate}` : `Due date: ${invoice.dueDate}`,
    "",
    settings.paymentTerms,
    "",
    settings.footerMessage,
    "",
    `${
      language === "bn" ? "ইনভয়েস লিংক" : "Invoice link"
    }: ${typeof window !== "undefined" ? window.location.origin : ""}/invoices/${invoice.id}`,
  ].join("\n");
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to, subject, body, mailtoUrl };
};

const hasSmtpConfig = (settings: AppSettings) =>
  Boolean(settings.smtpHost && settings.smtpFromEmail);

const sendViaSmtp = async (
  settings: AppSettings,
  payload: { to: string; subject: string; body: string },
) => {
  if (!settings.smtpHost || !settings.smtpFromEmail) {
    throw new Error("SMTP settings are incomplete");
  }

  const port = settings.smtpPort ?? (settings.smtpSecure === false ? 587 : 465);
  const useTls = settings.smtpSecure !== false;
  const socket = useTls
    ? tls.connect({
        host: settings.smtpHost,
        port,
        servername: settings.smtpHost,
      })
    : net.createConnection({ host: settings.smtpHost, port });

  socket.setEncoding("utf8");

  let buffer = "";
  const readResponse = () =>
    new Promise<{ code: number; message: string }>((resolve, reject) => {
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onData = (chunk: string) => {
        buffer += chunk;
        while (true) {
          const index = buffer.indexOf("\n");
          if (index < 0) return;
          const line = buffer.slice(0, index).replace(/\r$/, "");
          buffer = buffer.slice(index + 1);
          responseLines.push(line);
          if (/^\d{3} /.test(line)) {
            cleanup();
            resolve({
              code: Number(line.slice(0, 3)),
              message: responseLines.join("\n"),
            });
            return;
          }
        }
      };
      const responseLines: string[] = [];
      socket.on("data", onData);
      socket.on("error", onError);
    });

  const sendCommand = async (command: string) => {
    await new Promise<void>((resolve, reject) => {
      socket.write(`${command}\r\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return readResponse();
  };

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });

  const greeting = await readResponse();
  if (greeting.code >= 400) throw new Error(greeting.message);

  const ehlo = await sendCommand(`EHLO ${process.env.HOSTNAME ?? "billflow.local"}`);
  if (ehlo.code >= 400) throw new Error(ehlo.message);

  if (settings.smtpUser && settings.smtpPassword) {
    const auth = await sendCommand("AUTH LOGIN");
    if (auth.code >= 400) throw new Error(auth.message);

    const user = await sendCommand(Buffer.from(settings.smtpUser).toString("base64"));
    if (user.code >= 400 && user.code !== 334) throw new Error(user.message);

    const pass = await sendCommand(Buffer.from(settings.smtpPassword).toString("base64"));
    if (pass.code >= 400) throw new Error(pass.message);
  }

  const from = settings.smtpFromEmail;
  const fromName = settings.smtpFromName || settings.companyName || "BillFlow";
  const message = [
    `From: "${fromName}" <${from}>`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    payload.body.replace(/^\./gm, ".."),
  ].join("\r\n");

  const mailFrom = await sendCommand(`MAIL FROM:<${from}>`);
  if (mailFrom.code >= 400) throw new Error(mailFrom.message);

  const rcptTo = await sendCommand(`RCPT TO:<${payload.to}>`);
  if (rcptTo.code >= 400) throw new Error(rcptTo.message);

  const data = await sendCommand("DATA");
  if (data.code >= 400) throw new Error(data.message);

  const dataAck = await new Promise<{ code: number; message: string }>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const onData = (chunk: string) => {
      buffer += chunk;
      const index = buffer.indexOf("\n");
      if (index < 0) return;
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      socket.off("data", onData);
      socket.off("error", onError);
      resolve({ code: Number(line.slice(0, 3)), message: line });
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.write(`${message}\r\n.\r\n`);
  });
  if (dataAck.code >= 400) throw new Error(dataAck.message);

  await sendCommand("QUIT");
  socket.end();
  return dataAck.message;
};

export const billingBackend = {
  login(email: string, password: string): AuthResponse {
    const userRow = getDb()
      .prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND password = ?")
      .get(email.trim(), password);
    if (!userRow) throw new Response("Invalid email or password", { status: 401 });
    const token = createId("token");
    getDb()
      .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .run(token, (userRow as DbRow).id, today());
    const { password: _password, ...safeUser } = userRow as StoredUser;
    return { user: safeUser, token };
  },

  register(name: string, email: string, password: string): AuthResponse {
    resetWorkspaceData();
    const id = createId("user");
    getDb()
      .prepare("INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)")
      .run(id, name.trim(), email.trim().toLowerCase(), password);
    const token = createId("token");
    getDb()
      .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .run(token, id, today());
    return { user: { id, name: name.trim(), email: email.trim().toLowerCase() }, token };
  },

  me(request: Request): AuthUser {
    return requireUser(request);
  },

  logout(request: Request): Response {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (token) {
      getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    return new Response(null, { status: 204 });
  },

  getSettings(): AppSettings {
    return getSettings();
  },

  updateSettings(payload: Partial<AppSettings>): AppSettings {
    return updateSettings(payload);
  },

  listClients(query: ClientQuery = {}): PaginatedResponse<Client> {
    const clients = filterClients(
      getDb().prepare("SELECT * FROM clients ORDER BY created_at DESC").all().map(rowToClient),
      query,
    );
    return paginate(clients, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  getClient(id: string): Client {
    const row = getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id);
    if (!row) throw new Response("Client not found", { status: 404 });
    return rowToClient(row);
  },

  createClient(payload: Partial<Client>): Client {
    const client: Client = {
      id: createId("client"),
      name: payload.name?.trim() ?? "",
      email: payload.email?.trim() ?? "",
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
      createdAt: today(),
    };
    getDb()
      .prepare(
        "INSERT INTO clients (id, name, email, company, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        client.id,
        client.name,
        client.email,
        client.company ?? null,
        client.phone ?? null,
        client.address ?? null,
        client.createdAt,
      );
    return client;
  },

  updateClient(id: string, payload: Partial<Client>): Client {
    const current = this.getClient(id);
    const updated = {
      ...current,
      ...payload,
      name: payload.name?.trim() ?? current.name,
      email: payload.email?.trim() ?? current.email,
      company: payload.company?.trim() || undefined,
      phone: payload.phone?.trim() || undefined,
      address: payload.address?.trim() || undefined,
    };
    getDb()
      .prepare(
        `UPDATE clients SET name = ?, email = ?, company = ?, phone = ?, address = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.email,
        updated.company ?? null,
        updated.phone ?? null,
        updated.address ?? null,
        id,
      );
    return updated;
  },

  deleteClient(id: string): void {
    getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
  },

  listProducts(query: ProductQuery = {}): PaginatedResponse<Product> {
    const products = filterProducts(
      getDb().prepare("SELECT * FROM products ORDER BY created_at DESC").all().map(rowToProduct),
      query,
    );
    return paginate(products, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  getProduct(id: string): Product {
    const row = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!row) throw new Response("Product not found", { status: 404 });
    return rowToProduct(row);
  },

  createProduct(payload: Partial<Product>): Product {
    const product: Product = {
      id: createId("product"),
      name: payload.name?.trim() ?? "",
      description: payload.description?.trim() || undefined,
      price: payload.price ?? 0,
      sku: payload.sku?.trim() || undefined,
      createdAt: today(),
    };
    getDb()
      .prepare(
        "INSERT INTO products (id, name, description, price, sku, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        product.id,
        product.name,
        product.description ?? null,
        product.price,
        product.sku ?? null,
        product.createdAt,
      );
    return product;
  },

  updateProduct(id: string, payload: Partial<Product>): Product {
    const current = this.getProduct(id);
    const updated = {
      ...current,
      ...payload,
      name: payload.name?.trim() ?? current.name,
      description: payload.description?.trim() || undefined,
      sku: payload.sku?.trim() || undefined,
      price: payload.price ?? current.price,
    };
    getDb()
      .prepare("UPDATE products SET name = ?, description = ?, price = ?, sku = ? WHERE id = ?")
      .run(updated.name, updated.description ?? null, updated.price, updated.sku ?? null, id);
    return updated;
  },

  deleteProduct(id: string): void {
    getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
  },

  listExpenses(query: ExpenseQuery = {}): PaginatedResponse<Expense> {
    const expenses = filterExpenses(
      getDb().prepare("SELECT * FROM expenses ORDER BY created_at DESC").all().map(rowToExpense),
      query,
    );
    return paginate(expenses, query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  getExpense(id: string): Expense {
    const row = getDb().prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    if (!row) throw new Response("Expense not found", { status: 404 });
    return rowToExpense(row);
  },

  createExpense(payload: Partial<Expense>): Expense {
    const expense: Expense = {
      id: createId("expense"),
      description: payload.description?.trim() ?? "",
      category: payload.category?.trim() ?? "Other",
      amount: payload.amount ?? 0,
      date: payload.date ?? new Date().toISOString().slice(0, 10),
      vendor: payload.vendor?.trim() || undefined,
      createdAt: today(),
    };
    getDb()
      .prepare(
        "INSERT INTO expenses (id, description, category, amount, date, vendor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        expense.id,
        expense.description,
        expense.category,
        expense.amount,
        expense.date,
        expense.vendor ?? null,
        expense.createdAt,
      );
    return expense;
  },

  updateExpense(id: string, payload: Partial<Expense>): Expense {
    const current = this.getExpense(id);
    const updated = {
      ...current,
      ...payload,
      description: payload.description?.trim() ?? current.description,
      category: payload.category?.trim() ?? current.category,
      amount: payload.amount ?? current.amount,
      date: payload.date ?? current.date,
      vendor: payload.vendor?.trim() || undefined,
    };
    getDb()
      .prepare(
        "UPDATE expenses SET description = ?, category = ?, amount = ?, date = ?, vendor = ? WHERE id = ?",
      )
      .run(
        updated.description,
        updated.category,
        updated.amount,
        updated.date,
        updated.vendor ?? null,
        id,
      );
    return updated;
  },

  deleteExpense(id: string): void {
    getDb().prepare("DELETE FROM expenses WHERE id = ?").run(id);
  },

  listInvoices(query: InvoiceQuery = {}): PaginatedResponse<Invoice> {
    const invoices = filterInvoices(
      getDb().prepare("SELECT * FROM invoices ORDER BY issue_date DESC").all().map(invoiceFor),
      query,
    );
    return paginate(sortInvoices(invoices), query.page ?? 1, query.pageSize ?? DEFAULT_PAGE_SIZE);
  },

  getInvoice(id: string): Invoice {
    const row = getDb().prepare("SELECT * FROM invoices WHERE id = ?").get(id);
    if (!row) throw new Response("Invoice not found", { status: 404 });
    return invoiceFor(row);
  },

  createInvoice(payload: Partial<Invoice>): Invoice {
    const settings = getSettings();
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
    const number = payload.number ?? allocateInvoiceNumber();
    getDb()
      .prepare(
        `INSERT INTO invoices (
          id, number, client_id, status, issue_date, due_date, sent_at,
          subtotal, tax_rate, tax, total, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );
    for (const item of items) {
      getDb()
        .prepare(
          "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          item.id ?? createId("item"),
          invoiceId,
          item.productId ?? null,
          item.description,
          item.quantity,
          item.unitPrice,
          item.total,
        );
    }
    return this.getInvoice(invoiceId);
  },

  updateInvoice(id: string, payload: Partial<Invoice>): Invoice {
    const current = this.getInvoice(id);
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
    getDb()
      .prepare(
        `UPDATE invoices SET
          client_id = ?, status = ?, issue_date = ?, due_date = ?, sent_at = ?,
          subtotal = ?, tax_rate = ?, tax = ?, total = ?, notes = ?
        WHERE id = ?`,
      )
      .run(
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
      );
    getDb().prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(id);
    for (const item of normalizedItems) {
      getDb()
        .prepare(
          "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          item.id ?? createId("item"),
          id,
          item.productId ?? null,
          item.description,
          item.quantity,
          item.unitPrice,
          item.total,
        );
    }
    return this.getInvoice(id);
  },

  deleteInvoice(id: string): void {
    getDb().prepare("DELETE FROM invoices WHERE id = ?").run(id);
  },

  async sendInvoice(id: string, language: Language = "en"): Promise<SendInvoiceResult> {
    const invoice = this.updateInvoice(id, { status: "sent", sentAt: today() });
    const settings = getSettings();
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

  exportBackup(): WorkspaceBackup {
    return {
      version: 1,
      exportedAt: today(),
      users: getDb()
        .prepare("SELECT id, name, email, password, avatar FROM users ORDER BY name ASC")
        .all()
        .map((row: DbRow) => ({
          id: String(row.id),
          name: String(row.name),
          email: String(row.email),
          password: String(row.password),
          avatar: (row.avatar as string | null | undefined) ?? undefined,
        })),
      settings: this.getSettings(),
      clients: this.listClients({ pageSize: 1000 }).data,
      products: this.listProducts({ pageSize: 1000 }).data,
      invoices: this.listInvoices({ pageSize: 1000 }).data,
      expenses: this.listExpenses({ pageSize: 1000 }).data,
    };
  },

  restoreBackup(snapshot: WorkspaceBackup): WorkspaceBackup {
    if (!snapshot || snapshot.version !== 1) {
      throw new Response("Invalid backup file", { status: 400 });
    }
    const db = getDb();
    resetWorkspaceData();
    const nextSettings = snapshot.settings ?? defaultSettings;
    updateSettings(nextSettings);
    for (const user of snapshot.users ?? []) {
      db.prepare(
        "INSERT INTO users (id, name, email, password, avatar) VALUES (?, ?, ?, ?, ?)",
      ).run(user.id, user.name, user.email, user.password, user.avatar ?? null);
    }
    for (const client of snapshot.clients ?? []) {
      db.prepare(
        "INSERT INTO clients (id, name, email, company, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        client.id,
        client.name,
        client.email,
        client.company ?? null,
        client.phone ?? null,
        client.address ?? null,
        client.createdAt ?? today(),
      );
    }
    for (const product of snapshot.products ?? []) {
      db.prepare(
        "INSERT INTO products (id, name, description, price, sku, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        product.id,
        product.name,
        product.description ?? null,
        product.price,
        product.sku ?? null,
        product.createdAt ?? today(),
      );
    }
    for (const expense of snapshot.expenses ?? []) {
      db.prepare(
        "INSERT INTO expenses (id, description, category, amount, date, vendor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        expense.id,
        expense.description,
        expense.category,
        expense.amount,
        expense.date,
        expense.vendor ?? null,
        expense.createdAt ?? today(),
      );
    }
    for (const invoice of snapshot.invoices ?? []) {
      db.prepare(
        `INSERT INTO invoices (
          id, number, client_id, status, issue_date, due_date, sent_at,
          subtotal, tax_rate, tax, total, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
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
      );
      for (const item of invoice.items) {
        db.prepare(
          "INSERT INTO invoice_items (id, invoice_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(
          item.id ?? createId("item"),
          invoice.id,
          item.productId ?? null,
          item.description,
          item.quantity,
          item.unitPrice,
          item.total,
        );
      }
    }
    return this.exportBackup();
  },

  overview(): AnalyticsOverview {
    const invoices = this.listInvoices({ pageSize: 1000 }).data;
    const expenses = this.listExpenses({ pageSize: 1000 }).data;
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

  revenue(range = "30d"): RevenuePoint[] {
    const invoices = this.listInvoices({ pageSize: 1000 }).data;
    const expenses = this.listExpenses({ pageSize: 1000 }).data;
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

  invoiceStatus(): InvoiceStatusDistribution[] {
    const invoices = this.listInvoices({ pageSize: 1000 }).data;
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
