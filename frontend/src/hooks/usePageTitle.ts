import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

/**
 * Route segment → i18n nav key mapping.
 * Falls back to a capitalized segment if no key exists.
 */
const ROUTE_NAV_KEY: Record<string, string> = {
  atlas: "nav.atlas",
  mito: "nav.mito",
  interaction: "nav.interaction",
  interactomics: "nav.interactomics",
  docking: "nav.docking",
  clinical: "nav.clinical",
  discovery: "nav.discovery",
  export: "nav.export",
  drugs: "nav.drugs",
  pdm: "nav.pdm",
  crossval: "nav.crossval",
  settings: "nav.settings",
  history: "nav.history",
};

/** Top-level route → readable page name */
const TOP_LEVEL_TITLES: Record<string, string> = {
  projects: "projects.title", // "Research Projects"
  login: "auth.login_title",  // "Welcome Back"
};

/**
 * Dynamically sets `document.title` based on the current route.
 *
 * Format examples:
 *   /login                        → "Welcome Back · Kiri"
 *   /projects                     → "Research Projects · Kiri"
 *   /projects/new                 → "New Project · Kiri"
 *   /projects/:id/atlas           → "Multi-Omics Atlas · Kiri"
 *   /projects/:id/clinical        → "Clinical Suite · Kiri"
 *   /                             → "Kiri Research Platform"
 */
export function usePageTitle() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  useEffect(() => {
    const appName = t("app.title");      // "Kiri"
    const segments = pathname.split("/").filter(Boolean);

    let pageTitle = "";

    if (segments.length === 0) {
      // Root — show full brand
      document.title = `${appName} ${t("app.subtitle")}`;
      return;
    }

    // Top-level routes: /login, /projects
    const topSegment = segments[0];
    if (TOP_LEVEL_TITLES[topSegment]) {
      pageTitle = t(TOP_LEVEL_TITLES[topSegment]);
    }

    // /projects/new
    if (topSegment === "projects" && segments[1] === "new") {
      pageTitle = t("projects.new_project");
    }

    // /projects/:projectId/<module>
    if (topSegment === "projects" && segments.length >= 3) {
      const moduleSegment = segments[2];
      const navKey = ROUTE_NAV_KEY[moduleSegment];
      if (navKey) {
        pageTitle = t(navKey);
      } else {
        // Fallback: capitalize the segment
        pageTitle = moduleSegment.charAt(0).toUpperCase() + moduleSegment.slice(1);
      }
    }

    document.title = pageTitle ? `${pageTitle} · ${appName}` : `${appName} ${t("app.subtitle")}`;
  }, [pathname, t]);
}
