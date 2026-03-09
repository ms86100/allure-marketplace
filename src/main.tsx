import "./index.css";
import { initializeCapacitorPlugins } from "./lib/capacitor";

function showFatalFallback() {
  const fails = Number(sessionStorage.getItem('boot-fails') || '0') + 1;
  sessionStorage.setItem('boot-fails', String(fails));

  const root = document.getElementById("root");
  if (!root) return;

  const showClear = fails >= 3;
  root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100dvh;font-family:system-ui;padding:2rem;text-align:center"><div><h2>Something went wrong</h2><p style="color:#666;margin-top:8px">The app did not initialize correctly. Please try again.</p><button id="retry-boot-btn" style="margin-top:16px;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:white;cursor:pointer">Reload App</button>${showClear ? '<button id="clear-btn" style="margin-top:8px;padding:10px 14px;border-radius:10px;border:1px solid #e55;background:#fee;color:#c00;cursor:pointer;display:block;width:100%">Clear Data &amp; Retry</button>' : ''}</div></div>`;

  document.getElementById("retry-boot-btn")?.addEventListener("click", () => {
    try { localStorage.removeItem('sb-rvvctaikytfeyzkwoqxg-auth-token'); } catch {}
    root.innerHTML = "";
    bootstrap();
  });

  if (showClear) {
    document.getElementById("clear-btn")?.addEventListener("click", () => {
      sessionStorage.clear();
      localStorage.clear();
      window.location.reload();
    });
  }
}

function appDidNotMount() {
  const root = document.getElementById("root");
  return !!root && !root.hasAttribute("data-app-mounted");
}

function isChunkError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('Failed to fetch dynamically imported module') ||
         msg.includes('Loading chunk') ||
         msg.includes('Loading CSS chunk');
}

function handleChunkError(): boolean {
  const lastReload = Number(sessionStorage.getItem('chunk-reload-ts') || '0');
  const now = Date.now();
  if (now - lastReload > 10_000) {
    sessionStorage.setItem('chunk-reload-ts', String(now));
    window.location.reload();
    return true;
  }
  return false;
}

window.addEventListener("error", (event) => {
  if (isChunkError(event.error || event.message)) {
    if (handleChunkError()) return;
  }
  console.error("[Bootstrap] Unhandled error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkError(event.reason)) {
    if (handleChunkError()) return;
  }
  console.error("[Bootstrap] Unhandled rejection:", event.reason);
});

async function bootstrap() {
  try {
    await initializeCapacitorPlugins();
  } catch (e) {
    console.error('[Bootstrap] Capacitor init failed, continuing without native plugins:', e);
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("[Bootstrap] Missing root element");
  }

  const [{ createRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  createRoot(rootElement).render(<App />);

  sessionStorage.removeItem('boot-fails');

  window.setTimeout(() => {
    if (appDidNotMount()) {
      console.error("[Bootstrap] App did not mount within 10 seconds");
      showFatalFallback();
    }
  }, 10000);
}

bootstrap().catch((e) => {
  console.error('[Bootstrap] Fatal error:', e);
  showFatalFallback();
});
