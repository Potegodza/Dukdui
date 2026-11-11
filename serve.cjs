const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "app");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad Request");
    return;
  }

  if (pathname === "/") {
    response.writeHead(302, { Location: "/app/login/login.html" }).end();
    return;
  }
  if (pathname === "/app") {
    pathname = "/app/";
  }
  if (pathname.startsWith("/app/")) {
    pathname = pathname.slice("/app".length);
  }

  const file = path.resolve(root, `.${pathname}`);
  const relativePath = path.relative(root, file);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method Not Allowed");
    return;
  }

  fs.readFile(file, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Unable to read requested file");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

const port = Number(process.env.PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Dukdui local server: http://localhost:${port}/app/login/login.html`);
});
