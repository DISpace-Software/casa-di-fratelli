import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import TenantBrandingProvider from "../context/TenantBrandingProvider";
import SeasonalZonesProvider from "../context/SeasonalZonesProvider";
import AdminApp from "./AdminApp";

createRoot(document.getElementById("root")).render(
  <StrictMode><TenantBrandingProvider><SeasonalZonesProvider><AdminApp /></SeasonalZonesProvider></TenantBrandingProvider></StrictMode>,
);
