import { createServer } from "node:http";
import { Readable } from "node:stream";
import app from "./dist/server/index.js";

const handler = app?.fetch ? app : app?.default ?? app;
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";

if (!handler?.fetch) {
  throw new Error("Server handler is missing. Run `npm run build` before starting the app.");
}

const toRequest = (req) => {
  const protocol =
    req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const hasBody = !["GET", "HEAD"].includes(req.method ?? "GET");
  const body = hasBody ? Readable.toWeb(req) : undefined;

  return new Request(url, {
    method: req.method ?? "GET",
    headers,
    body,
    duplex: hasBody ? "half" : undefined,
  });
};

const server = createServer(async (req, res) => {
  try {
    const request = toRequest(req);
    const response = await handler.fetch(request, process.env, {
      waitUntil() {},
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
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
});

server.listen(port, host, () => {
  console.log(`BillFlow running on http://${host}:${port}`);
});
