"""
Kiri — Regulatory Network Construction Service

Integrates interaction, co-expression, differential expression,
and substrate prediction data into a core regulatory network
showing how target genes regulate downstream mitochondrial
functions via substrate cleavage.

All parameters are project-scoped (generic, not gene-specific).
"""

import logging
from typing import Any

from app.core.cache import cache

logger = logging.getLogger("kiri.regulatory_network")

# Functional categories for mitochondrial processes
MITO_FUNCTIONS: dict[str, dict[str, Any]] = {
    "mitophagy": {
        "label": "Mitophagy",
        "genes": ["PINK1", "PRKN", "BNIP3", "BNIP3L", "FUNDC1", "MAP1LC3B"],
        "color": "#e74c3c",
    },
    "fusion": {
        "label": "Mitochondrial Fusion",
        "genes": ["OPA1", "MFN1", "MFN2"],
        "color": "#3498db",
    },
    "fission": {
        "label": "Mitochondrial Fission",
        "genes": ["DNM1L", "FIS1", "MIEF1", "MIEF2", "MFF"],
        "color": "#9b59b6",
    },
    "apoptosis": {
        "label": "Apoptosis",
        "genes": ["DIABLO", "CYCS", "BAX", "BCL2", "MCL1"],
        "color": "#e67e22",
    },
    "ros_metabolism": {
        "label": "ROS Metabolism",
        "genes": ["SOD1", "SOD2", "GPX4", "PRDX3", "PRDX5"],
        "color": "#2ecc71",
    },
    "protein_import": {
        "label": "Mitochondrial Protein Import",
        "genes": ["TOMM20", "TOMM22", "TOMM40", "TOMM70", "TIMM23", "TIMM44", "TIMM50"],
        "color": "#1abc9c",
    },
    "oxphos": {
        "label": "Oxidative Phosphorylation",
        "genes": ["NDUFS1", "SDHA", "UQCRC1", "COX4I1", "ATP5F1A"],
        "color": "#f39c12",
    },
    "quality_control": {
        "label": "Mitochondrial Quality Control",
        "genes": ["OMA1", "YME1L1", "AFG3L2", "CLPP", "LONP1", "CLPB"],
        "color": "#8e44ad",
    },
}


async def build_regulatory_network(
    target_genes: list[str],
    ppi_data: dict[str, Any] | None = None,
    coexpression_data: dict[str, Any] | None = None,
    de_data: dict[str, Any] | None = None,
    substrate_data: dict[str, Any] | None = None,
    score_threshold: float = 0.5,
) -> dict[str, Any]:
    """
    Build an integrated regulatory network from multiple evidence sources.

    Args:
        target_genes: Central genes (e.g., project proteins)
        ppi_data: PPI network result (from merge_ppi_sources)
        coexpression_data: Co-expression scan results
        de_data: Differential expression results
        substrate_data: Substrate prediction results
        score_threshold: Minimum combined score for including edges

    Returns:
        Cytoscape.js-compatible regulatory network with:
        - Nodes colored by functional category
        - Edges weighted by evidence type and confidence
        - Functional annotations linking to mito processes
    """
    target_set = {g.upper() for g in target_genes}

    # Build node map
    node_map: dict[str, dict[str, Any]] = {}

    # 1. Add target genes as central nodes
    for gene in target_set:
        node_map[gene] = {
            "id": gene,
            "label": gene,
            "node_type": "target",
            "functional_categories": [],
            "evidence_sources": [],
            "color": "#ff6b6b",
        }

    # 2. Add function category nodes
    function_nodes: dict[str, dict] = {}
    for func_id, func_info in MITO_FUNCTIONS.items():
        func_node_id = f"FUNC_{func_id.upper()}"
        function_nodes[func_node_id] = {
            "id": func_node_id,
            "label": func_info["label"],
            "node_type": "function",
            "color": func_info["color"],
            "genes": func_info["genes"],
        }

    # Edge collection
    edges: list[dict[str, Any]] = []
    edge_keys: set[str] = set()

    def _add_edge(
        source: str, target: str, edge_type: str,
        weight: float, details: str = "",
    ):
        key = f"{source}_{target}_{edge_type}"
        rev_key = f"{target}_{source}_{edge_type}"
        if key not in edge_keys and rev_key not in edge_keys:
            edge_keys.add(key)
            edges.append({
                "source": source,
                "target": target,
                "edge_type": edge_type,
                "weight": round(weight, 3),
                "details": details,
            })

    # 3. Process PPI data
    if ppi_data and ppi_data.get("edges"):
        for edge in ppi_data["edges"]:
            src = edge.get("source", "")
            tgt = edge.get("target", "")
            score = edge.get("string_score", 0)

            # Only include edges connected to target genes
            if src in target_set or tgt in target_set:
                other = tgt if src in target_set else src
                if other not in node_map:
                    node_map[other] = {
                        "id": other,
                        "label": other,
                        "node_type": "interactor",
                        "functional_categories": [],
                        "evidence_sources": ["PPI"],
                        "color": "#74b9ff",
                    }
                else:
                    if "PPI" not in node_map[other].get("evidence_sources", []):
                        node_map[other].setdefault("evidence_sources", []).append("PPI")

                _add_edge(src, tgt, "ppi", score, f"STRING score: {score}")

    # 4. Process co-expression data
    if coexpression_data:
        scans = coexpression_data if isinstance(coexpression_data, dict) else {}
        for gene, scan in scans.items():
            if not isinstance(scan, dict):
                continue
            for corr in scan.get("correlated_genes", [])[:30]:
                corr_gene = corr.get("gene", "")
                r_val = corr.get("r", 0)
                if abs(r_val) >= 0.6 and corr_gene:
                    if corr_gene not in node_map:
                        node_map[corr_gene] = {
                            "id": corr_gene,
                            "label": corr_gene,
                            "node_type": "co-expressed",
                            "functional_categories": [],
                            "evidence_sources": ["co-expression"],
                            "color": "#00b894",
                        }
                    else:
                        if "co-expression" not in node_map[corr_gene].get("evidence_sources", []):
                            node_map[corr_gene].setdefault("evidence_sources", []).append("co-expression")

                    _add_edge(gene.upper(), corr_gene, "coexpression", abs(r_val), f"r = {r_val:.3f}")

    # 5. Process DE data
    if de_data and de_data.get("results"):
        for deg in de_data["results"]:
            if not deg.get("significant"):
                continue
            gene = deg.get("gene", "")
            lfc = deg.get("log2_fold_change", 0)

            if gene not in node_map:
                node_map[gene] = {
                    "id": gene,
                    "label": gene,
                    "node_type": "deg",
                    "functional_categories": [],
                    "evidence_sources": ["differential-expression"],
                    "color": "#fd79a8" if lfc > 0 else "#a29bfe",
                }
            else:
                if "differential-expression" not in node_map[gene].get("evidence_sources", []):
                    node_map[gene].setdefault("evidence_sources", []).append("differential-expression")

            # Connect DE genes to target if they're substrates
            if deg.get("is_known_substrate"):
                for tg in target_set:
                    _add_edge(tg, gene, "substrate_de", abs(lfc), f"log2FC = {lfc:.2f}")

    # 6. Process substrate prediction data
    if substrate_data and substrate_data.get("candidates"):
        for candidate in substrate_data["candidates"]:
            gene = candidate.get("gene", "")
            score = candidate.get("score", 0)

            if gene not in node_map:
                node_map[gene] = {
                    "id": gene,
                    "label": gene,
                    "node_type": "substrate",
                    "functional_categories": [],
                    "evidence_sources": ["substrate-prediction"],
                    "color": "#fdcb6e",
                }
            else:
                if "substrate-prediction" not in node_map[gene].get("evidence_sources", []):
                    node_map[gene].setdefault("evidence_sources", []).append("substrate-prediction")

            # Connect substrates to target genes
            for tg in target_set:
                _add_edge(
                    tg, gene, "cleavage",
                    min(score / 10.0, 1.0),
                    f"TM hits: {candidate.get('tm_hit_count', 0)}, score: {score}",
                )

    # 7. Annotate functional categories
    for gene, node in node_map.items():
        for func_id, func_info in MITO_FUNCTIONS.items():
            if gene in func_info["genes"]:
                node["functional_categories"].append(func_id)

    # 8. Add function cluster edges (gene → function node)
    for func_id, func_node in function_nodes.items():
        genes_in_network = [g for g in func_node["genes"] if g in node_map]
        if genes_in_network:
            node_map[func_id] = func_node
            for gene in genes_in_network:
                _add_edge(gene, func_id, "function_member", 0.8, f"Member of {func_node['label']}")

    # Edge type color mapping
    edge_colors = {
        "ppi": "#74b9ff",
        "coexpression": "#00b894",
        "cleavage": "#fdcb6e",
        "substrate_de": "#fd79a8",
        "function_member": "#636e72",
    }

    # Add color to edges
    for edge in edges:
        edge["color"] = edge_colors.get(edge["edge_type"], "#b2bec3")

    return {
        "nodes": list(node_map.values()),
        "edges": edges,
        "meta": {
            "total_nodes": len(node_map),
            "total_edges": len(edges),
            "target_genes": list(target_set),
            "functional_categories": list(MITO_FUNCTIONS.keys()),
            "evidence_types": ["ppi", "coexpression", "cleavage", "substrate_de", "function_member"],
            "edge_colors": edge_colors,
        },
        "functions": {
            fid: {
                "label": fi["label"],
                "color": fi["color"],
                "genes_in_network": [g for g in fi["genes"] if g in node_map],
            }
            for fid, fi in MITO_FUNCTIONS.items()
        },
    }
