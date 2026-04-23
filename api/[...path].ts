import { Readable } from "node:stream";

const appModule: any = await import("../dist/server/index.js");
const handler: any = appModule?.default?.fetch
  ? appModule.default
  : appModule?.fetch
    ? appModule
    : appModule?.default ?? appModule;

const toRequest = (req: any) => {
  const protocol =
    req.socket?.encrypted || req.headers?.["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.headers?.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }

  const method = req.method ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? (Readable.toWeb(req) as any) : undefined;

  return new Request(url, {
    method,
    headers,
    body,
    duplex: hasBody ? "half" : undefined,
  });
};

export default async function handle(req: any, res: any) {
  try {
    const response = await handler.fetch(toRequest(req), process.env, {
      waitUntil() {},
    });
    res.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
}
