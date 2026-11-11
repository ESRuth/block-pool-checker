import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyManifest } from "./lib/access";
import { installLinkHandler } from "./lib/router";
import "./styles.css";

applyManifest();
installLinkHandler();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
