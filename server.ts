import { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { createApiApp } from './server/apiApp';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getCliArg = (flag: string): string | undefined => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
};

const cliPort = Number(getCliArg('--port'));
const envPort = Number(process.env.PORT);
const PORT =
  (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : undefined) ??
  (process.env.NODE_ENV === 'production'
    ? (Number.isFinite(envPort) && envPort > 0 ? envPort : 3000)
    : (Number.isFinite(envPort) && envPort > 0 && envPort !== 8080 ? envPort : 3000));
const HOST = getCliArg('--host') || '0.0.0.0';

const DATA_DIR = path.resolve(__dirname, 'data_storage');
const app = createApiApp({ dataDir: DATA_DIR });

const saasMw = app.locals.saasMw;

// API: Full Runnable Project ZIP for Google AI Studio & Local Deployment (Master Admin only)
app.post(
  '/api/export-full-codebase-zip',
  saasMw.requireAuth,
  saasMw.requireMasterAdmin,
  async (req: Request, res: Response) => {
    try {
      const rawBody = req.body;
      if (
        rawBody !== undefined &&
        (typeof rawBody !== 'object' ||
          rawBody === null ||
          Array.isArray(rawBody) ||
          Object.keys(rawBody).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype'))
      ) {
        return res.status(400).json({ success: false, error: 'Invalid backup payload.' });
      }
      const customData = rawBody;
      const zip = new JSZip();

    const addDirToZip = (dirPath: string, zipFolder: any, relBase = '') => {
      if (!fs.existsSync(dirPath)) return;
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        if (['node_modules', '.git', 'dist', '.aistudio', 'data_storage', 'backups', 'secrets', '.DS_Store'].includes(item)) {
          continue;
        }
        const fullPath = path.join(dirPath, item);
        const relPath = relBase ? `${relBase}/${item}` : item;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          addDirToZip(fullPath, zipFolder.folder(item), relPath);
        } else {
          const lower = item.toLowerCase();
          if (
            lower.endsWith('.zip') ||
            lower.endsWith('.pem') ||
            lower.endsWith('.key') ||
            lower.includes('firebase-adminsdk') ||
            (lower.startsWith('.env') && lower !== '.env.example') ||
            (relPath.startsWith('public/') &&
              (/^(Screenshot_|file_).*\.(png|jpe?g|webp)$/i.test(item) || lower.endsWith('.json')))
          ) {
            continue;
          }
          const content = fs.readFileSync(fullPath);
          zipFolder.file(item, content);
        }
      }
    };

    const rootFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.ts',
      'server.ts',
      'index.html',
      'metadata.json',
      '.env.example',
      '.gitignore',
      'firestore.rules',
      'firebase-applet-config.json',
      'firebase-blueprint.json',
      'netlify.toml',
      'vercel.json',
      'README.md',
    ];

    for (const f of rootFiles) {
      const fullPath = path.join(__dirname, f);
      if (fs.existsSync(fullPath)) {
        zip.file(f, fs.readFileSync(fullPath));
      }
    }

    for (const dirName of ['src', 'server', 'scripts', 'docs', 'public', 'netlify', 'api']) {
      const dirPath = path.join(__dirname, dirName);
      if (fs.existsSync(dirPath)) {
        addDirToZip(dirPath, zip.folder(dirName), dirName);
      }
    }

    if (customData && (customData.data || customData.stats)) {
      const compactJson = JSON.stringify(customData);
      zip.file('src/data/bakedSchoolData.json', compactJson);
    }

    const readmeAiStudio = `# Smart School BD ERP - Complete Runnable Project

This archive contains the full, production-ready codebase including:
- Server and API routes (server.ts & server/apiApp.ts)
- Netlify Functions serverless handler (netlify/functions/api.ts)
- React 19 Frontend and Tailwind CSS
- All school management modules (Students, Fees, Attendance, Exams, Homework, etc.)
- Pre-baked database records in src/data/bakedSchoolData.json

## How to run in Google AI Studio:
1. Extract or import this folder into Google AI Studio.
2. The dev server starts automatically with \`npm run dev\` on port 3000.
3. This ZIP can also be uploaded directly to Master Admin Backup & Restore.
`;
    zip.file('AI_STUDIO_README.md', readmeAiStudio);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `SmartSchoolBD_FullProject_AIStudio_${dateStr}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating codebase zip:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate codebase archive.' });
  }
});

// Serve favicon without 404
app.get('/favicon.ico', (_req: Request, res: Response) => {
  const icoPath = path.resolve(__dirname, 'public', 'favicon.ico');
  if (fs.existsSync(icoPath)) {
    return res.sendFile(icoPath);
  }
  return res.status(204).end();
});

// Serve frontend with Vite in dev, static files in production
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR !== 'false';
    const vite = await createViteServer({
      plugins: isHmrDisabled
        ? [
            {
              name: 'disable-hmr-client-ws',
              transform(code: string, id: string) {
                if (
                  id.endsWith('/vite/dist/client/client.mjs') ||
                  id.endsWith('\\vite\\dist\\client\\client.mjs')
                ) {
                  return code
                    .replace(
                      'transport.connect(createHMRHandler(handleMessage));',
                      '/* HMR WebSocket disabled when DISABLE_HMR is active */',
                    )
                    .replace(
                      'wsTransport.send(data);',
                      '/* HMR send disabled when DISABLE_HMR is active */',
                    );
                }
              },
            },
          ]
        : [],
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        ws: isHmrDisabled ? false : { server: httpServer },
        ...(isHmrDisabled ? { watch: null } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const expressModule = await import('express');
    app.use(expressModule.default.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`AmarSchool ERP Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
