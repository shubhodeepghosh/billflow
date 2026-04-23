import { createFileRoute } from "@tanstack/react-router";
import { billingBackend } from "@/server/billingBackend";

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
    ...init,
  });

const parseBody = async <T>(request: Request): Promise<T> => {
  if (request.method === "GET" || request.method === "HEAD") {
    return {} as T;
  }
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
};

const routeError = (error: unknown) => {
  if (error instanceof Response) return error;
  if (error instanceof Error) {
    return json({ message: error.message }, { status: 500 });
  }
  return json({ message: "Unexpected server error" }, { status: 500 });
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleApi(request, params._splat, "GET"),
      POST: async ({ request, params }) => handleApi(request, params._splat, "POST"),
      PUT: async ({ request, params }) => handleApi(request, params._splat, "PUT"),
      DELETE: async ({ request, params }) => handleApi(request, params._splat, "DELETE"),
    },
  },
});

async function handleApi(request: Request, splat: string, method: string) {
  try {
    const segments = splat.split("/").filter(Boolean);
    const [root, id, subresource] = segments;

    if (root === "health") {
      return json({ ok: true, service: "billflow-api" });
    }

    if (root === "auth") {
      if (method === "POST" && id === "login") {
        const body = await parseBody<{ email: string; password: string }>(request);
        return json(await billingBackend.login(body.email, body.password));
      }
      if (method === "POST" && id === "register") {
        const body = await parseBody<{ name: string; email: string; password: string }>(request);
        return json(await billingBackend.register(body.name, body.email, body.password));
      }
      if (method === "GET" && id === "me") {
        return json(await billingBackend.me(request));
      }
      if (method === "POST" && id === "logout") {
        return await billingBackend.logout(request);
      }
    }

    if (root === "analytics") {
      if (method === "GET" && id === "overview") {
        return json(await billingBackend.overview());
      }
      if (method === "GET" && id === "revenue") {
        const url = new URL(request.url);
        return json(await billingBackend.revenue(url.searchParams.get("range") ?? "30d"));
      }
      if (method === "GET" && id === "invoice-status") {
        return json(await billingBackend.invoiceStatus());
      }
    }

    if (root === "settings") {
      if (method === "GET") {
        return json(billingBackend.getSettings());
      }
      if (method === "PUT") {
        return json(billingBackend.updateSettings(await parseBody(request)));
      }
    }

    if (root === "backup") {
      if (method === "GET") {
        return json(billingBackend.exportBackup());
      }
      if (method === "POST" && id === "restore") {
        return json(billingBackend.restoreBackup(await parseBody(request)));
      }
    }

    if (root === "clients") {
      if (!id) {
        if (method === "GET") {
          const url = new URL(request.url);
          return json(
            await billingBackend.listClients({
              search: url.searchParams.get("search") ?? undefined,
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: Number(url.searchParams.get("pageSize") ?? 10),
            }),
          );
        }
        if (method === "POST") {
          return json(await billingBackend.createClient(await parseBody(request)));
        }
      } else {
        if (method === "GET") return json(await billingBackend.getClient(id));
        if (method === "PUT")
          return json(await billingBackend.updateClient(id, await parseBody(request)));
        if (method === "DELETE") {
          await billingBackend.deleteClient(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (root === "products") {
      if (!id) {
        if (method === "GET") {
          const url = new URL(request.url);
          return json(
            await billingBackend.listProducts({
              search: url.searchParams.get("search") ?? undefined,
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: Number(url.searchParams.get("pageSize") ?? 10),
            }),
          );
        }
        if (method === "POST") {
          return json(await billingBackend.createProduct(await parseBody(request)));
        }
      } else {
        if (method === "GET") return json(await billingBackend.getProduct(id));
        if (method === "PUT")
          return json(await billingBackend.updateProduct(id, await parseBody(request)));
        if (method === "DELETE") {
          await billingBackend.deleteProduct(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (root === "expenses") {
      if (!id) {
        if (method === "GET") {
          const url = new URL(request.url);
          return json(
            await billingBackend.listExpenses({
              search: url.searchParams.get("search") ?? undefined,
              category: url.searchParams.get("category") ?? undefined,
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: Number(url.searchParams.get("pageSize") ?? 10),
            }),
          );
        }
        if (method === "POST") {
          return json(await billingBackend.createExpense(await parseBody(request)));
        }
      } else {
        if (method === "GET") return json(await billingBackend.getExpense(id));
        if (method === "PUT")
          return json(await billingBackend.updateExpense(id, await parseBody(request)));
        if (method === "DELETE") {
          await billingBackend.deleteExpense(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (root === "invoices") {
      if (!id) {
        if (method === "GET") {
          const url = new URL(request.url);
          return json(
            await billingBackend.listInvoices({
              search: url.searchParams.get("search") ?? undefined,
              status: url.searchParams.get("status") ?? undefined,
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: Number(url.searchParams.get("pageSize") ?? 10),
            }),
          );
        }
        if (method === "POST") {
          return json(await billingBackend.createInvoice(await parseBody(request)));
        }
      } else {
        if (method === "GET") return json(await billingBackend.getInvoice(id));
        if (method === "PUT")
          return json(await billingBackend.updateInvoice(id, await parseBody(request)));
        if (method === "POST" && subresource === "send") {
          const language = (request.headers.get("x-billflow-language") ?? "en") as "en" | "bn";
          return json(await billingBackend.sendInvoice(id, language));
        }
        if (method === "DELETE") {
          await billingBackend.deleteInvoice(id);
          return new Response(null, { status: 204 });
        }
      }
    }

    return json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
