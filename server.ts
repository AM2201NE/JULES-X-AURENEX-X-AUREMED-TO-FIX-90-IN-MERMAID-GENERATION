import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fetch, { RequestInit } from "node-fetch";
import bodyParser from "body-parser";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use raw body parsing so we can safely forward exact bodies to Notion API
  app.use(bodyParser.text({ type: '*/*', limit: '50mb' }));

  // API route for Notion Proxy
  app.use('/api/notion', async (req, res) => {
    try {
      // Strip the /api/notion prefix from the URL
      const notionPath = req.url.replace(/^\/api\/notion/, '');
      const targetUrl = `https://api.notion.com/v1${notionPath}`;
      console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}`);

      const authHeader = req.headers.authorization;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
          ...(authHeader ? { 'Authorization': authHeader } : {}),
        },
        body: (req.method !== 'GET' && req.method !== 'HEAD' && req.body) ? req.body : undefined,
      };

      const response = await fetch(targetUrl, fetchOptions);
      
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      
      const data = await response.text();
      res.send(data);
    } catch (error) {
      console.error('[Proxy Error]', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // API route for downloading images from external sources (bypass CORS)
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
      }

      console.log(`[Image Proxy] Fetching ${targetUrl}`);
      const response = await fetch(targetUrl);
      
      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch image');
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      
      const buffer = await response.buffer();
      res.end(buffer);
    } catch (error) {
      console.error('[Image Proxy Error]', error);
      res.status(500).send(String(error));
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
