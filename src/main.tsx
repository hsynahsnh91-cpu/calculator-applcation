import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AdminApp from "./admin/AdminApp";

const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const Root = pathname.toLowerCase() === "/admin" ? AdminApp : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
