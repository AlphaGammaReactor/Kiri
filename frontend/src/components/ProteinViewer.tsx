/**
 * Kiri — 3D Protein Structure Viewer
 *
 * Three.js-based viewer for AlphaFold predicted structures.
 * Supports three view modes:
 *   - Single: one protein at a time with pLDDT coloring
 *   - Compare: all visible proteins side-by-side in one scene
 *   - Complex: predicted multimer complex (graceful fallback)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, ProvenanceFooter, LoadingSkeleton, StatusBadge } from "./ui";
import type { Provenance } from "../services/api";
import { useAppDispatch } from "../store";
import { addPanel } from "../store/publicationSlice";
import { addToast } from "../store/errorSlice";

// ── Types ──

export interface StructureData {
  found: boolean;
  uniprot_id: string;
  entry_id: string;
  gene: string;
  model_url: string;
  cif_url: string;
  pae_image_url: string;
  sequence_length: number;
  confidence_version: number;
  plddt_thresholds: {
    very_high: number;
    confident: number;
    low: number;
    very_low: number;
  };
  error?: string;
}

interface ProteinViewerProps {
  /** Primary structure data (single mode) */
  data: StructureData | null;
  provenance: Provenance | null;
  loading: boolean;
  cleavageSites?: number[];
  geneName?: string;
  /** All visible structures for compare mode (gene → data) */
  allStructures?: Map<string, StructureData>;
  /** All visible gene names (preserves order) */
  visibleGenes?: string[];
}

// ── Constants ──

const PLDDT_COLORS = {
  veryHigh: { label: ">90", color: "#0053d6" },
  confident: { label: "70-90", color: "#65cbf3" },
  low: { label: "50-70", color: "#ffdb13" },
  veryLow: { label: "<50", color: "#ff7d45" },
};

const PLDDT_RGB = {
  veryHigh: [0.0, 0.33, 0.84] as const,
  confident: [0.4, 0.8, 0.95] as const,
  low: [1.0, 0.86, 0.07] as const,
  veryLow: [1.0, 0.49, 0.27] as const,
};

const CLEAVAGE_RGB = [0.94, 0.27, 0.27] as const;

/** Distinct accent colors for each protein in Compare mode */
const PROTEIN_TINTS: [number, number, number][] = [
  [0.1, 0.8, 0.6],   // teal
  [0.9, 0.4, 0.3],   // coral
  [0.4, 0.6, 1.0],   // periwinkle
  [0.9, 0.7, 0.1],   // gold
  [0.6, 0.3, 0.9],   // purple
  [0.2, 0.9, 0.3],   // green
];

// ── PDB Parsing ──

interface ParsedAtom {
  x: number;
  y: number;
  z: number;
  bFactor: number;
  residueSeq: number;
}

function parsePDB(pdbText: string): ParsedAtom[] {
  const atoms: ParsedAtom[] = [];
  for (const line of pdbText.split("\n")) {
    if (!line.startsWith("ATOM  ")) continue;
    const atomName = line.substring(12, 16).trim();
    if (atomName !== "CA") continue;
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const bFactor = parseFloat(line.substring(60, 66));
    const residueSeq = parseInt(line.substring(22, 26).trim(), 10);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      atoms.push({ x, y, z, bFactor: isNaN(bFactor) ? 70 : bFactor, residueSeq });
    }
  }
  return atoms;
}

function plddtColor(score: number): readonly [number, number, number] {
  if (score > 90) return PLDDT_RGB.veryHigh;
  if (score > 70) return PLDDT_RGB.confident;
  if (score > 50) return PLDDT_RGB.low;
  return PLDDT_RGB.veryLow;
}

async function fetchPDBAtoms(modelUrl: string): Promise<ParsedAtom[]> {
  const resp = await fetch(modelUrl);
  if (!resp.ok) throw new Error(`PDB fetch failed: ${resp.status}`);
  return parsePDB(await resp.text());
}

// ── View Modes ──

type ViewMode = "single" | "compare" | "complex";
type RepresentationMode = "tube" | "ballstick";

// ── Scene Builder Helpers ──

async function buildTube(
  THREE: typeof import("three"),
  atoms: ParsedAtom[],
  cleavageSet: Set<number>,
  offset: InstanceType<typeof THREE.Vector3>,
  tintOverride?: [number, number, number],
) {
  const points: InstanceType<typeof THREE.Vector3>[] = [];
  const atomColors: [number, number, number][] = [];

  for (const atom of atoms) {
    points.push(new THREE.Vector3(atom.x + offset.x, atom.y + offset.y, atom.z + offset.z));
    const isCleavage = cleavageSet.has(atom.residueSeq) ||
      Array.from(cleavageSet).some(site => Math.abs(site - atom.residueSeq) <= 1);
    if (isCleavage) {
      atomColors.push([...CLEAVAGE_RGB]);
    } else if (tintOverride) {
      // In compare mode, blend pLDDT with the tint
      const plddt = plddtColor(atom.bFactor);
      atomColors.push([
        plddt[0] * 0.3 + tintOverride[0] * 0.7,
        plddt[1] * 0.3 + tintOverride[1] * 0.7,
        plddt[2] * 0.3 + tintOverride[2] * 0.7,
      ]);
    } else {
      atomColors.push([...plddtColor(atom.bFactor)]);
    }
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(atoms.length * 2, 200);
  const geom = new THREE.TubeGeometry(curve, segments, 0.6, 8, false);

  const posCount = geom.attributes.position.count;
  const colorAttr = new Float32Array(posCount * 3);
  for (let i = 0; i < posCount; i++) {
    const t = i / posCount;
    const idx = Math.min(Math.floor(t * atoms.length), atoms.length - 1);
    const [r, g, b] = atomColors[idx];
    colorAttr[i * 3] = r;
    colorAttr[i * 3 + 1] = g;
    colorAttr[i * 3 + 2] = b;
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colorAttr, 3));

  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60 });
  return { mesh: new THREE.Mesh(geom, mat), disposables: [geom, mat] as { dispose: () => void }[] };
}

// ── Component ──

export function ProteinViewer({
  data,
  provenance,
  loading,
  cleavageSites = [],
  geneName,
  allStructures,
  visibleGenes = [],
}: ProteinViewerProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [pdbLoading, setPdbLoading] = useState(false);
  const [representation, setRepresentation] = useState<RepresentationMode>("tube");
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const cleanupRef = useRef<(() => void) | null>(null);
  const isRotatingRef = useRef(isRotating);
  isRotatingRef.current = isRotating;

  // Cache of parsed atom data (gene → atoms)
  const atomCacheRef = useRef<Map<string, ParsedAtom[]>>(new Map());

  // ── Shared scene scaffolding ──
  const setupScene = useCallback(async () => {
    if (!canvasRef.current) return null;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const THREE = await import("three");
    const container = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0e);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404040, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 50, 50);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    backLight.position.set(-50, -50, -50);
    scene.add(backLight);

    return { THREE, scene, camera, renderer, container, lights: [dirLight, backLight] };
  }, []);

  const finalizeScene = useCallback((
    sceneCtx: Awaited<ReturnType<typeof setupScene>>,
    disposables: { dispose: () => void }[],
  ) => {
    if (!sceneCtx) return;
    const { THREE, scene, camera, renderer, container } = sceneCtx;

    // Group all non-light objects
    const group = new THREE.Group();
    const ambientLights = scene.children.filter(c => c.type === "AmbientLight");
    const lightChildren = new Set([...sceneCtx.lights, ...ambientLights]);
    const toMove = scene.children.filter(c => !lightChildren.has(c));
    toMove.forEach(c => group.add(c));
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.z = maxDim * 1.6;
    camera.far = maxDim * 10;
    camera.updateProjectionMatrix();

    // Orbit controls
    let isDragging = false, prevX = 0, prevY = 0, rotX = 0, rotY = 0;
    const onDown = (e: MouseEvent) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
    const onMove = (e: MouseEvent) => { if (!isDragging) return; rotY += (e.clientX - prevX) * 0.005; rotX += (e.clientY - prevY) * 0.005; prevX = e.clientX; prevY = e.clientY; };
    const onUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => { camera.position.z = Math.max(10, Math.min(maxDim * 5, camera.position.z + e.deltaY * 0.05)); };

    renderer.domElement.addEventListener("mousedown", onDown);
    renderer.domElement.addEventListener("mousemove", onMove);
    renderer.domElement.addEventListener("mouseup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel);

    let autoRot = 0;
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (isRotatingRef.current) autoRot += 0.003;
      group.rotation.y = rotY + autoRot;
      group.rotation.x = rotX;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener("mousedown", onDown);
      renderer.domElement.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("mouseup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      disposables.forEach(d => d.dispose());
    };
  }, []);

  // ── Single Mode ──
  const buildSingle = useCallback(async (atoms: ParsedAtom[]) => {
    if (atoms.length < 2) return;
    const ctx = await setupScene();
    if (!ctx) return;
    const { THREE, scene } = ctx;
    const cleavageSet = new Set(cleavageSites);
    const { mesh, disposables } = await buildTube(THREE, atoms, cleavageSet, new THREE.Vector3(0, 0, 0));
    scene.add(mesh);
    finalizeScene(ctx, disposables);
  }, [cleavageSites, setupScene, finalizeScene]);

  // ── Compare Mode ──
  const buildCompare = useCallback(async (structureMap: Map<string, ParsedAtom[]>, genes: string[]) => {
    if (structureMap.size === 0) return;
    const ctx = await setupScene();
    if (!ctx) return;
    const { THREE, scene } = ctx;
    const allDisposables: { dispose: () => void }[] = [];

    // Calculate bounding boxes to space proteins apart
    const entries = genes.filter(g => structureMap.has(g)).map(g => ({ gene: g, atoms: structureMap.get(g)! }));
    if (entries.length === 0) return;

    // Center each protein individually and calculate its width
    const proteinWidths: number[] = [];
    for (const entry of entries) {
      const xs = entry.atoms.map(a => a.x);
      const span = Math.max(...xs) - Math.min(...xs);
      proteinWidths.push(span);
    }

    // Place proteins along the X axis with gaps
    const gap = 20;
    let currentX = 0;

    for (let i = 0; i < entries.length; i++) {
      const { gene, atoms } = entries[i];
      const tint = PROTEIN_TINTS[i % PROTEIN_TINTS.length];

      // Center each protein's own atoms
      const centerX = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
      const centerY = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
      const centerZ = atoms.reduce((s, a) => s + a.z, 0) / atoms.length;

      const offset = new THREE.Vector3(
        currentX - centerX,
        -centerY,
        -centerZ,
      );

      const { mesh, disposables } = await buildTube(THREE, atoms, new Set(), offset, tint);
      scene.add(mesh);
      allDisposables.push(...disposables);

      // Add a floating label
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 256;
      labelCanvas.height = 64;
      const lCtx = labelCanvas.getContext("2d")!;
      lCtx.fillStyle = `rgb(${Math.round(tint[0] * 255)}, ${Math.round(tint[1] * 255)}, ${Math.round(tint[2] * 255)})`;
      lCtx.font = "bold 32px sans-serif";
      lCtx.textAlign = "center";
      lCtx.fillText(gene, 128, 40);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
      const sprite = new THREE.Sprite(labelMat);
      // Position label above the protein
      const maxY = Math.max(...atoms.map(a => a.y));
      sprite.position.set(currentX, maxY - centerY + 15, 0);
      sprite.scale.set(30, 8, 1);
      scene.add(sprite);
      allDisposables.push(labelTex, labelMat);

      currentX += proteinWidths[i] / 2 + gap + (proteinWidths[i + 1] || 0) / 2;
    }

    finalizeScene(ctx, allDisposables);
  }, [setupScene, finalizeScene]);

  // Cache for the current single-protein atoms
  const parsedAtomsRef = useRef<ParsedAtom[]>([]);

  // ── Single-mode data loading ──
  useEffect(() => {
    if (viewMode !== "single") return;
    if (!data || !data.found || !data.model_url) {
      parsedAtomsRef.current = [];
      return;
    }
    let cancelled = false;
    const load = async () => {
      setPdbLoading(true);
      setViewerError(null);
      try {
        // Check cache first
        const cacheKey = data.model_url;
        let atoms = atomCacheRef.current.get(cacheKey);
        if (!atoms) {
          atoms = await fetchPDBAtoms(data.model_url);
          atomCacheRef.current.set(cacheKey, atoms);
        }
        if (cancelled) return;
        if (atoms.length < 2) { setViewerError("Insufficient atom data."); setPdbLoading(false); return; }
        parsedAtomsRef.current = atoms;
        await buildSingle(atoms);
      } catch (err) {
        if (cancelled) return;
        setViewerError(err instanceof Error ? err.message : "Failed to load structure");
      } finally {
        if (!cancelled) setPdbLoading(false);
      }
    };
    load();
    return () => { cancelled = true; if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.model_url, data?.found, cleavageSites, viewMode]);

  // ── Compare-mode data loading ──
  useEffect(() => {
    if (viewMode !== "compare") return;
    if (!allStructures || allStructures.size === 0) return;
    let cancelled = false;
    const load = async () => {
      setPdbLoading(true);
      setViewerError(null);
      try {
        const parsed = new Map<string, ParsedAtom[]>();
        const entries = Array.from(allStructures.entries()).filter(([, s]) => s.found && s.model_url);
        await Promise.all(entries.map(async ([gene, struct]) => {
          let atoms = atomCacheRef.current.get(struct.model_url);
          if (!atoms) {
            atoms = await fetchPDBAtoms(struct.model_url);
            atomCacheRef.current.set(struct.model_url, atoms);
          }
          if (atoms.length >= 2) parsed.set(gene, atoms);
        }));
        if (cancelled) return;
        if (parsed.size === 0) { setViewerError("No structures available for comparison."); setPdbLoading(false); return; }
        await buildCompare(parsed, visibleGenes);
      } catch (err) {
        if (cancelled) return;
        setViewerError(err instanceof Error ? err.message : "Failed to load structures");
      } finally {
        if (!cancelled) setPdbLoading(false);
      }
    };
    load();
    return () => { cancelled = true; if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, allStructures, visibleGenes.join(",")]);

  // Rebuild single scene on representation change
  useEffect(() => {
    if (viewMode === "single" && parsedAtomsRef.current.length > 0) {
      buildSingle(parsedAtomsRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [representation]);

  const displayName = geneName || data?.gene || "";
  const canCompare = (allStructures?.size ?? 0) >= 2;

  const handleAddToFigure = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current.querySelector("canvas");
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    
    let title = t("modules.interaction.structure_title");
    if (viewMode === "single") title += ` (${displayName})`;
    else if (viewMode === "compare") title += ` (${visibleGenes.length} proteins)`;
    else title = "Predicted Complex Structure";

    dispatch(addPanel({
      sourceModule: "interaction",
      type: "png",
      data: dataUrl,
      title,
      legend: `Method: AlphaFold 3 3D Rendering | Source: UniProt/PDB`,
      dataSource: "UniProt / PDB",
      citation: "Jumper et al. (2021) Nature",
    }));

    dispatch(addToast({
      type: 'success',
      title: t('export.figure_added', '"{{name}}" added to Publication Engine', { name: title }),
      message: "3D Structure exported successfully.",
      duration: 3000,
    }));
  }, [dispatch, t, viewMode, displayName, visibleGenes.length, canvasRef]);

  return (
    <Card
      title={t("modules.interaction.structure_title")}
      className="h-full flex flex-col"
    >
      {loading ? (
        <LoadingSkeleton lines={5} />
      ) : viewerError ? (
        <div className="flex flex-col items-center justify-center h-64 gap-2">
          <span className="text-kiri-error text-sm">{viewerError}</span>
          {data?.model_url && (
            <a href={data.model_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-kiri-accent hover:underline">
              Download PDB file directly ↗
            </a>
          )}
        </div>
      ) : !data || !data.found ? (
        viewMode === "compare" ? (
          <div className="flex items-center justify-center h-64 text-kiri-text-muted text-sm">
            Select at least 2 proteins to compare structures
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-kiri-text-muted text-sm">
            {data?.error || t("modules.interaction.no_structure")}
          </div>
        )
      ) : (
        <>
          {/* Top controls */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-kiri-text-muted">
              {viewMode === "single" && (
                <>
                  {displayName && <span className="font-semibold text-kiri-text">{displayName}</span>}
                  <span className="font-mono text-kiri-accent">{data.entry_id}</span>
                  <StatusBadge label={`${data.sequence_length} aa`} variant="info" />
                </>
              )}
              {viewMode === "compare" && (
                <span className="font-semibold text-kiri-text">
                  {visibleGenes.length} proteins compared
                </span>
              )}
              {viewMode === "complex" && (
                <span className="font-semibold text-kiri-text">Complex Prediction</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRepresentation(representation === "tube" ? "ballstick" : "tube")}
                className="text-xs px-2 py-1 rounded border border-kiri-border text-kiri-text-muted hover:text-kiri-text transition-colors"
              >
                {representation === "tube" ? "🧬 Tube" : "⚛ B&S"}
              </button>
              <button
                onClick={() => setIsRotating(!isRotating)}
                className="text-xs px-2 py-1 rounded border border-kiri-border text-kiri-text-muted hover:text-kiri-text transition-colors"
              >
                {isRotating ? "⏸ Pause" : "▶ Rotate"}
              </button>
              <div className="w-px h-4 bg-kiri-border mx-1" />
              <button
                onClick={handleAddToFigure}
                className="text-[10px] text-kiri-accent hover:text-white px-2 py-1 rounded border border-kiri-accent/30 hover:bg-kiri-accent/20 transition-colors flex items-center gap-1"
                title="Add to Publication Engine Cart"
              >
                ＋ Figure
              </button>
            </div>
          </div>

          {/* View mode tabs */}
          <div className="flex items-center gap-1 mb-2">
            {(["single", "compare", "complex"] as ViewMode[]).map((mode) => {
              const disabled = mode === "compare" && !canCompare;
              return (
                <button
                  key={mode}
                  onClick={() => !disabled && setViewMode(mode)}
                  disabled={disabled}
                  className={`
                    text-[11px] px-3 py-1 rounded-full font-medium transition-all
                    ${viewMode === mode
                      ? "bg-kiri-accent/20 text-kiri-accent border border-kiri-accent/40"
                      : disabled
                        ? "text-kiri-text-dim/40 border border-kiri-border/30 cursor-not-allowed"
                        : "text-kiri-text-dim border border-kiri-border hover:text-kiri-text-muted hover:border-kiri-text-muted"
                    }
                  `}
                >
                  {mode === "single" ? "🔬 Single" : mode === "compare" ? "🔀 Compare" : "🧩 Complex"}
                </button>
              );
            })}
          </div>

          {/* Complex mode: show explanation */}
          {viewMode === "complex" ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-center px-4">
              <div className="text-3xl mb-3 opacity-40">🧩</div>
              <h4 className="text-sm font-semibold text-kiri-text-muted mb-2">
                Predicted Complex Structure
              </h4>
              <p className="text-xs text-kiri-text-dim max-w-sm mb-3">
                AlphaFold Multimer can predict how proteins physically dock together.
                This requires running AlphaFold 3 on the protein pair — pre-computed
                complexes are only available for a limited set of known interactions.
              </p>
              <a
                href="https://alphafoldserver.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-4 py-2 rounded-lg bg-kiri-accent/10 border border-kiri-accent/30 text-kiri-accent hover:bg-kiri-accent/20 transition-colors"
              >
                Open AlphaFold Server ↗
              </a>
              <p className="text-[10px] text-kiri-text-dim mt-2 max-w-xs">
                Submit your protein pair to get a predicted complex structure.
                Free for non-commercial research.
              </p>
            </div>
          ) : (
            <>
              {/* 3D viewer */}
              <div className="relative flex-1 min-h-[300px]">
                <div
                  ref={canvasRef}
                  className="absolute inset-0 rounded bg-kiri-bg border border-kiri-border cursor-grab active:cursor-grabbing"
                />
                {pdbLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-kiri-bg/80 rounded z-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-kiri-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-kiri-text-muted">
                        {viewMode === "compare"
                          ? `Loading ${visibleGenes.length} structures…`
                          : "Loading structure…"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Legend */}
          {viewMode !== "complex" && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3 text-[10px] text-kiri-text-dim">
                {viewMode === "single" ? (
                  <>
                    <span className="uppercase tracking-wider">pLDDT:</span>
                    {Object.entries(PLDDT_COLORS).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: val.color }} />
                        <span>{val.label}</span>
                      </div>
                    ))}
                    {cleavageSites.length > 0 && (
                      <div className="flex items-center gap-1 ml-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                        <span>{t("modules.interaction.cleavage_site")}</span>
                      </div>
                    )}
                  </>
                ) : (
                  // Compare mode legend — show protein colors
                  visibleGenes.map((gene, i) => (
                    <div key={gene} className="flex items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{
                          backgroundColor: `rgb(${Math.round(PROTEIN_TINTS[i % PROTEIN_TINTS.length][0] * 255)}, ${Math.round(PROTEIN_TINTS[i % PROTEIN_TINTS.length][1] * 255)}, ${Math.round(PROTEIN_TINTS[i % PROTEIN_TINTS.length][2] * 255)})`
                        }}
                      />
                      <span>{gene}</span>
                    </div>
                  ))
                )}
              </div>
              {viewMode === "single" && data.model_url && (
                <a href={data.model_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-kiri-accent hover:underline" title="Download PDB file">
                  PDB ↗
                </a>
              )}
            </div>
          )}

          <ProvenanceFooter provenance={provenance} compact />
        </>
      )}
    </Card>
  );
}
