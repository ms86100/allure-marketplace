import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeCapacitorPlugins } from "./lib/capacitor";

// Initialize native plugins
initializeCapacitorPlugins();

createRoot(document.getElementById("root")!).render(<App />);
