import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initializeDatabase } from "./lib/db";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

initializeDatabase()
  .catch((error) => {
    console.error("数据库初始化失败", error);
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
