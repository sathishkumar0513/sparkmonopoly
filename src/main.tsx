import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/dev" element={<App />} />
        <Route path="*" element={<Navigate to="/dev" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
