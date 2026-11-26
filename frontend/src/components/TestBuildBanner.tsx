/**
 * TestBuildBanner — shown on every screen of the hosted test build.
 *
 * Says plainly that this copy is for testing with sample and public data.
 */

import { useTranslation } from "react-i18next";
import { useBuildMeta } from "../services/meta";

export function TestBuildBanner() {
  const { t } = useTranslation();
  const meta = useBuildMeta();

  if (!meta.server_mode) return null;

  return (
    <div
      role="status"
      className="w-full px-4 py-1.5 text-center text-xs border-b border-kiri-warning/40 bg-kiri-warning/10 text-kiri-text"
    >
      <strong className="font-semibold">{t("test_build.title")}</strong>
      <span className="mx-2">·</span>
      <span>{t("test_build.body")}</span>
      <form method="post" action="/gate/logout" className="inline ml-3">
        <button type="submit" className="underline text-kiri-text-muted hover:text-kiri-text">
          {t("test_build.sign_out")}
        </button>
      </form>
    </div>
  );
}
