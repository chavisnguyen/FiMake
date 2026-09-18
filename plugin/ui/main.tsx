import { createRoot } from "react-dom/client";
import { App } from "./app";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing element: #root");
}
createRoot(root).render(<App />);
