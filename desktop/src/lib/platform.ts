export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const APP_VERSION = __APP_VERSION__;
