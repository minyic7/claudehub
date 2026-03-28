import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import App from "./App.js";
import "./styles/globals.css";
import "./styles/animations.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/claudehub">
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
