import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";

import "./styles/index.scss";
import { App } from "./app/App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root #app was not found.");
}

createRoot(root).render(createElement(StrictMode, null, createElement(App)));
