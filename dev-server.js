const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number(process.env.PORT) || 3000;
const root = __dirname;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  } catch {
    return null;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    const resolvedPath = !statError && stats.isDirectory()
      ? path.join(filePath, 'index.html')
      : filePath;

    fs.readFile(resolvedPath, (readError, data) => {
      if (readError) {
        response.writeHead(readError.code === 'ENOENT' ? 404 : 500, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end(readError.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(data);
    });
  });
});

server.listen(port, host, () => {
  console.log(`Workout Tracker is running at http://${host}:${port}`);
});
