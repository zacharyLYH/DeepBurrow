import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import { AuthGate } from "./app.tsx";
import "./index.css";
import { registerPwa } from "./lib/push";

registerPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReactFlowProvider>
      <AuthGate />
    </ReactFlowProvider>
  </StrictMode>,
);
