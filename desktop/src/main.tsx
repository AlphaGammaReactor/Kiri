import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installTruncationTitles } from "./shell/truncation";
import App from "./App";
import "./styles/app.css";
import "./styles/next.css";
import "./styles/uprmt.css";

installTruncationTitles();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
