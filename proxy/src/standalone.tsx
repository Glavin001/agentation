import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";

const script = document.currentScript as HTMLScriptElement | null;
const endpoint = script?.dataset.endpoint || "http://localhost:4747";

const container = document.createElement("div");
container.id = "__agentation-root";
container.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;";
document.body.appendChild(container);

const root = createRoot(container);
root.render(<Agentation endpoint={endpoint} />);
