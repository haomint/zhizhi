import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LearningService } from "./application/service.ts";
import { IndexedDBRepository } from "./platform/repository.ts";
import { createPlatform } from "./platform/platform.ts";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";
const root = document.getElementById("root");
if (!root) throw Error("应用根节点缺失");
const service = new LearningService(
  new IndexedDBRepository(),
  createPlatform(),
);
createRoot(root).render(
  <StrictMode>
    <App service={service} />
  </StrictMode>,
);
