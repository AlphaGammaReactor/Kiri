import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import { setAuthStore } from "./services/api";
import "./services/i18n";
import "./styles/index.css";
import App from "./App";

// Inject the Redux store into the API client so it can attach auth tokens
setAuthStore(store);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
