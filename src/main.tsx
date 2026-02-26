import "./index.css";
import { initializeCapacitorPlugins } from "./lib/capacitor";

const FALLBACK_HTML = (message: string) =>
  `<div style="display:flex;align-items:center;justify-content:center;height:100dvh;font-family:system-ui;padding:2rem;text-align:center"><div><h2>Something went wrong</h2><p style="color:#666;margin-top:8px">${message}</p><button style="margin-top:16px;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:white;cursor:pointer" onclick="window.location.reload()">Reload App</button></div></div>`;

function showFatalFallback(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = FALLBACK_HTML(message);
}

function rootLooksEmpty() {
  const root = document.getElementById("root");
  return !!root && root.childElementCount === 0;
}

function installGlobalRuntimeGuards() {
  window.addEventListener("error", (event) => {
    console.error("[Bootstrap] Unhandled error:", event.error || event.message);
    if (rootLooksEmpty()) {
      showFatalFallback("The app crashed while starting. Please reopen the app.");
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[Bootstrap] Unhandled rejection:", event.reason);
    if (rootLooksEmpty()) {
      showFatalFallback("Startup failed due to a runtime error. Please reopen the app.");
    }
  });
}

installGlobalRuntimeGuards();

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

  window.setTimeout(() => {
    if (rootLooksEmpty()) {
      showFatalFallback("The app did not initialize correctly. Please close and reopen the app.");
    }
  }, 8000);
}

bootstrap().catch((e) => {
  console.error('[Bootstrap] Fatal error:', e);
  showFatalFallback("Please close and reopen the app.");
});
