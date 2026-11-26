/**
 * Kiri — Build information
 *
 * Asks the backend what kind of build this is (a person's own copy, or the
 * hosted test build) so the UI can show the test banner and hide what is
 * turned off there.
 */

import { useEffect, useState } from "react";
import { apiClient } from "./api";

export interface BuildMeta {
  version: string;
  server_mode: boolean;
  uploads_enabled: boolean;
  invite_code_required: boolean;
}

/** Used until the backend answers, and if it cannot be reached. */
const LOCAL_DEFAULTS: BuildMeta = {
  version: "",
  server_mode: false,
  uploads_enabled: true,
  invite_code_required: false,
};

let cached: Promise<BuildMeta> | null = null;

export function fetchBuildMeta(): Promise<BuildMeta> {
  if (!cached) {
    cached = apiClient
      .get<BuildMeta>("/v1/meta")
      .then((resp) => ({ ...LOCAL_DEFAULTS, ...resp.data }))
      .catch(() => {
        cached = null; // try again next time
        return LOCAL_DEFAULTS;
      });
  }
  return cached;
}

export function useBuildMeta(): BuildMeta {
  const [meta, setMeta] = useState<BuildMeta>(LOCAL_DEFAULTS);
  useEffect(() => {
    let alive = true;
    fetchBuildMeta().then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}
