import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createApp } from './app';
import { loadConfig } from './config';

/**
 * Entry point for the packaged server.exe: starts the game server, opens a free Cloudflare
 * quick tunnel so friends can reach it over https, and prints a ready-to-share link.
 *
 *   server.exe [--web https://your-app.vercel.app] [--no-tunnel] [--port 3001]
 *
 * The web address can also come from WEB_URL or a one-line web-url.txt next to the exe.
 */

const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const exeDir = dirname(process.execPath);
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function webUrl(): string | undefined {
  const fromFile = (() => {
    try {
      return readFileSync(join(exeDir, 'web-url.txt'), 'utf8').trim();
    } catch {
      return undefined;
    }
  })();
  const raw = flag('--web') ?? process.env.WEB_URL ?? fromFile;
  return raw ? raw.replace(/\/$/, '') : undefined;
}

async function ensureCloudflared(): Promise<string> {
  const local = join(exeDir, 'cloudflared.exe');
  if (existsSync(local)) return local;
  console.log('Downloading cloudflared (one time, about 60 MB)...');
  const res = await fetch(CLOUDFLARED_URL);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(local));
  return local;
}

function startTunnel(bin: string, port: number): Promise<{ url: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true });
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the tunnel URL')), 45_000);
    const onData = (chunk: Buffer) => {
      const m = TUNNEL_URL_RE.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        resolve({ url: m[0], child });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
  });
}

function copyToClipboard(text: string): void {
  try {
    const p = spawn('clip', { windowsHide: true, shell: true });
    p.stdin.end(text);
  } catch {
    /* clipboard is a convenience only */
  }
}

async function pauseBeforeExit(): Promise<void> {
  console.log('\nPress Enter to close.');
  await new Promise<void>((r) => process.stdin.once('data', () => r()));
}

async function main(): Promise<void> {
  const portFlag = flag('--port');
  if (portFlag) process.env.PORT = portFlag;
  // A laptop-hosted server has no secrets to protect, so accept any web origin unless told otherwise.
  process.env.CLIENT_ORIGINS ??= '*';

  const config = loadConfig();
  const app = createApp(config);
  await new Promise<void>((resolve, reject) => {
    app.http.once('error', reject);
    app.http.listen(config.port, resolve);
  });
  console.log(`Kachuful server running on http://localhost:${config.port}`);

  let tunnel: ChildProcess | undefined;
  let publicUrl = `http://localhost:${config.port}`;
  if (!args.includes('--no-tunnel')) {
    console.log('Opening a public tunnel...');
    try {
      const t = await startTunnel(await ensureCloudflared(), config.port);
      tunnel = t.child;
      publicUrl = t.url;
    } catch (err) {
      console.log(`Could not open a tunnel: ${(err as Error).message}`);
      console.log('Only players on this machine can connect. Re-run once you are online.');
    }
  }

  const web = webUrl();
  const link = web ? `${web}/?server=${encodeURIComponent(publicUrl)}` : undefined;
  console.log('\n================================================');
  console.log(`Server address: ${publicUrl}`);
  if (link) {
    console.log(`\nShare this link with players (copied to clipboard):\n\n  ${link}\n`);
    copyToClipboard(link);
  } else {
    console.log('\nNo web address set. Open your Vercel site, click "Server", and paste the address above.');
    console.log('To get a ready-made link, run with --web https://your-app.vercel.app (or put it in web-url.txt).');
    copyToClipboard(publicUrl);
  }
  console.log('================================================');
  console.log('Keep this window open while you play. Close it to stop the server.\n');

  const stop = () => {
    tunnel?.kill();
    void app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', () => tunnel?.kill());
}

main().catch(async (err: Error) => {
  console.error(`\nFailed to start: ${err.message}`);
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') console.error('That port is in use. Close the other server or use --port 3002.');
  await pauseBeforeExit();
  process.exit(1);
});
