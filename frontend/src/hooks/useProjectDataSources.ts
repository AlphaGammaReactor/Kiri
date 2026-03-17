/**
 * Kiri — useProjectDataSources Hook
 *
 * Reads the active project's data sources from Redux and maps them 
 * into the formats each analysis module expects. Replaces all hardcoded
 * TCGA/GEO/Custom lists across Atlas, Clinical, Drug Discovery, etc.
 */

import { useMemo } from "react";
import { useAppSelector } from "../store";
import type { RootState } from "../store";

export interface AvailableSource {
  type: string;
  label: string;
  /** Short subtitle shown under the label (e.g. project IDs or accession) */
  detail: string;
  icon: string;
  config: Record<string, unknown>;
  id?: string;
}

const SOURCE_META: Record<string, { icon: string; label: string }> = {
  tcga:             { icon: "🧬", label: "TCGA" },
  geo:              { icon: "📊", label: "GEO" },
  cptac:            { icon: "🔬", label: "CPTAC" },
  scrna:            { icon: "🔵", label: "Single-Cell" },
  custom:           { icon: "📁", label: "Custom Upload" },
  string:           { icon: "🔗", label: "STRING-DB" },
  drugbank:         { icon: "💊", label: "DrugBank" },
  pubchem:          { icon: "🧪", label: "PubChem" },
  chembl:           { icon: "📐", label: "ChEMBL" },
  massive:          { icon: "📡", label: "MassIVE" },
  proteomecentral:  { icon: "🧫", label: "ProteomeCentral" },
};

export function useProjectDataSources() {
  const activeProject = useAppSelector((s: RootState) => s.project.activeProject);
  const rawSources = activeProject?.data_sources;
  const projectSources = useMemo(() => rawSources ?? [], [rawSources]);
  const cancerType = activeProject?.cancer_type ?? "";

  /**
   * Expression / Atlas sources: types relevant to the heatmap module.
   * Shows ALL project sources so users see their full config, with expression
   * types first (usable for heatmap) and others shown as info-only.
   */
  const expressionSources = useMemo<AvailableSource[]>(() => {
    const expressionTypes = new Set(["tcga", "geo", "cptac", "scrna", "custom"]);
    const sources: AvailableSource[] = [];
    const seenTypes = new Set<string>();

    // Expression-relevant sources first
    for (const ds of projectSources) {
      if (expressionTypes.has(ds.source_type) && !seenTypes.has(ds.source_type)) {
        const meta = SOURCE_META[ds.source_type] ?? { icon: "📄", label: ds.source_type.toUpperCase() };
        const projectId = ds.config?.project_id as string | undefined;
        const accession = ds.config?.accession as string | undefined;
        const detail = projectId ? `TCGA-${projectId}` : accession || ds.label || "";
        sources.push({
          type: ds.source_type,
          label: meta.label,
          detail,
          icon: meta.icon,
          config: ds.config,
          id: ds.id,
        });
        seenTypes.add(ds.source_type);
      }
    }

    // Always allow custom upload
    if (!seenTypes.has("custom")) {
      sources.push({
        type: "custom",
        label: "Custom Upload",
        detail: "CSV/TSV",
        icon: "📁",
        config: {},
      });
    }

    // If no expression sources at all, provide TCGA + GEO as defaults
    if (sources.filter(s => expressionTypes.has(s.type)).length <= 1) {
      const defaultMapping: Record<string, string> = {
        COAD: "TCGA-COAD, TCGA-READ", READ: "TCGA-COAD, TCGA-READ",
        CRC: "TCGA-COAD, TCGA-READ", BRCA: "TCGA-BRCA",
        LUAD: "TCGA-LUAD", LUSC: "TCGA-LUSC", PRAD: "TCGA-PRAD",
      };
      const tcgaDetail = defaultMapping[cancerType] || "TCGA-COAD, TCGA-READ";
      if (!seenTypes.has("tcga")) {
        sources.unshift({ type: "tcga", label: "TCGA", detail: tcgaDetail, icon: "🧬", config: {} });
      }
      if (!seenTypes.has("geo")) {
        sources.splice(sources.length - 1, 0, { type: "geo", label: "GEO", detail: "NCBI Omnibus", icon: "📊", config: {} });
      }
    }

    // Append non-expression project sources so the Atlas sidebar
    // reflects the FULL project data source configuration
    for (const ds of projectSources) {
      if (!seenTypes.has(ds.source_type)) {
        const meta = SOURCE_META[ds.source_type] ?? { icon: "📄", label: ds.source_type.toUpperCase() };
        sources.push({
          type: ds.source_type,
          label: meta.label,
          detail: ds.label !== meta.label ? ds.label : "",
          icon: meta.icon,
          config: ds.config,
          id: ds.id,
        });
        seenTypes.add(ds.source_type);
      }
    }

    return sources;
  }, [projectSources, cancerType]);

  /**
   * Clinical analysis TCGA project IDs (derived from cancer type + project sources).
   */
  const clinicalProjectIds = useMemo<string[]>(() => {
    // Check if the user explicitly added TCGA with project_id config
    const tcgaSources = projectSources.filter(ds => ds.source_type === "tcga");
    if (tcgaSources.length > 0) {
      const ids = tcgaSources
        .flatMap(ds => (ds.config?.project_id as string || "").split(","))
        .map(id => id.trim())
        .filter(Boolean)
        .map(id => id.startsWith("TCGA-") ? id : `TCGA-${id}`);

      // Retroactive cross-fill for legacy CRC projects that only saved "TCGA-COAD"
      if (cancerType === "COAD" || cancerType === "READ" || cancerType === "CRC") {
        if (ids.includes("TCGA-COAD") && !ids.includes("TCGA-READ")) ids.push("TCGA-READ");
        if (ids.includes("TCGA-READ") && !ids.includes("TCGA-COAD")) ids.push("TCGA-COAD");
      }

      if (ids.length > 0) return Array.from(new Set(ids));
    }

    // Fallback: derive from cancer_type
    const mapping: Record<string, string[]> = {
      COAD: ["TCGA-COAD", "TCGA-READ"],
      READ: ["TCGA-COAD", "TCGA-READ"],
      CRC:  ["TCGA-COAD", "TCGA-READ"],
      BRCA: ["TCGA-BRCA"],
      LUAD: ["TCGA-LUAD"],
      LUSC: ["TCGA-LUSC"],
      PRAD: ["TCGA-PRAD"],
      LIHC: ["TCGA-LIHC"],
      STAD: ["TCGA-STAD"],
      OV:   ["TCGA-OV"],
      GBM:  ["TCGA-GBM"],
    };
    return mapping[cancerType] ?? ["TCGA-COAD", "TCGA-READ"];
  }, [projectSources, cancerType]);

  /**
   * Drug interaction sources: types relevant to Drug Discovery module.
   */
  const drugSources = useMemo<AvailableSource[]>(() => {
    const drugTypes = new Set(["drugbank", "pubchem", "chembl"]);
    return projectSources
      .filter(ds => drugTypes.has(ds.source_type))
      .map(ds => {
        const meta = SOURCE_META[ds.source_type] ?? { icon: "💊", label: ds.source_type.toUpperCase() };
        return {
          type: ds.source_type,
          label: ds.label || meta.label,
          detail: (ds.config?.version as string) || "",
          icon: meta.icon,
          config: ds.config,
          id: ds.id,
        };
      });
  }, [projectSources]);

  /**
   * Interaction / PPI sources (STRING-DB).
   */
  const interactionSources = useMemo<AvailableSource[]>(() => {
    const interactionTypes = new Set(["string"]);
    return projectSources
      .filter(ds => interactionTypes.has(ds.source_type))
      .map(ds => {
        const meta = SOURCE_META[ds.source_type] ?? { icon: "🔗", label: ds.source_type.toUpperCase() };
        return {
          type: ds.source_type,
          label: ds.label || meta.label,
          detail: (ds.config?.version as string) || "v12.0",
          icon: meta.icon,
          config: ds.config,
          id: ds.id,
        };
      });
  }, [projectSources]);

  /** All sources with metadata for Project Settings */
  const allSources = useMemo<AvailableSource[]>(() => {
    return projectSources.map(ds => {
      const meta = SOURCE_META[ds.source_type] ?? { icon: "📄", label: ds.source_type.toUpperCase() };
      const projectId = ds.config?.project_id as string | undefined;
      const accession = ds.config?.accession as string | undefined;
      return {
        type: ds.source_type,
        label: ds.label || meta.label,
        detail: projectId || accession || "",
        icon: meta.icon,
        config: ds.config,
        id: ds.id,
      };
    });
  }, [projectSources]);

  /** Project protein gene symbols (for auto-setting selectedGenes) */
  const projectGenes = useMemo(() => {
    return activeProject?.proteins?.map(p => p.gene_symbol) ?? [];
  }, [activeProject?.proteins]);

  return {
    expressionSources,
    clinicalProjectIds,
    drugSources,
    interactionSources,
    allSources,
    projectGenes,
    cancerType,
    hasProject: !!activeProject,
    projectId: activeProject?.id,
  };
}
