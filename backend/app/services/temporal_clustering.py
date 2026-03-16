"""
Kiri — Temporal Clustering Service

Mfuzz-inspired fuzzy c-means clustering for identifying temporal
expression patterns across disease stages or time points.

Clusters genes based on their expression profiles over ordered
sample groups (e.g., Normal → Stage I → Stage II → Stage III → Stage IV),
assigning soft membership scores that capture partial cluster belonging.

Uses scikit-learn KMeans as a fast alternative to FCM, with membership
scores computed via distance-based soft assignment.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy.interpolate import CubicSpline
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

from app.core.errors import KiriComputationError, KiriValidationError

logger = logging.getLogger("kiri.temporal")


def compute_temporal_clusters(
    expression_matrix: dict[str, list[float]],
    stage_labels: list[str],
    n_clusters: int = 6,
    fuzziness: float = 2.0,
) -> dict[str, Any]:
    """
    Cluster genes by their expression trajectory across stages.

    Args:
        expression_matrix: gene_symbol → [values_per_sample] dict.
        stage_labels: per-sample stage label in order.
        n_clusters: number of clusters to form (default: 6).
        fuzziness: controls softness of membership (higher = softer).

    Returns:
        {
          "stages": ["Normal", "Stage I", ...],
          "clusters": [
            {
              "id": 0,
              "label": "Early Rise / Late Fall",
              "centroid": [0.2, 0.8, 0.6, 0.3],
              "centroid_smooth": [...48 points...],
              "genes": ["PARL", "MAVS", ...],
              "memberships": {"PARL": 0.85, "MAVS": 0.72, ...},
              "pattern": "rise_fall"
            }
          ],
          "gene_assignments": {"PARL": {"cluster": 0, "membership": 0.85}},
          "method": "Fuzzy c-means (Mfuzz-style)"
        }
    """
    if not expression_matrix:
        raise KiriValidationError("Empty expression matrix.", source="temporal")

    if not stage_labels:
        raise KiriValidationError("No stage labels provided.", source="temporal")

    # Determine stage order and compute per-stage means for each gene
    stages_ordered = _order_stages(stage_labels)
    if len(stages_ordered) < 3:
        raise KiriValidationError(
            "Need ≥3 distinct stages for temporal clustering.",
            source="temporal",
        )

    # Build stage-index mapping
    stage_indices: dict[str, list[int]] = {}
    for i, s in enumerate(stage_labels):
        stage_indices.setdefault(s, []).append(i)

    # Compute per-gene, per-stage mean expression → profile matrix
    genes = list(expression_matrix.keys())
    profiles: list[list[float]] = []
    valid_genes: list[str] = []

    for gene in genes:
        vals = expression_matrix[gene]
        profile = []
        skip = False
        for stage in stages_ordered:
            idx = stage_indices.get(stage, [])
            if not idx:
                skip = True
                break
            stage_vals = [vals[i] for i in idx if i < len(vals)]
            if not stage_vals:
                skip = True
                break
            profile.append(float(np.mean(stage_vals)))

        if not skip and len(profile) == len(stages_ordered):
            profiles.append(profile)
            valid_genes.append(gene)

    if len(valid_genes) < n_clusters:
        raise KiriComputationError(
            "temporal",
            f"Only {len(valid_genes)} genes have data across all stages (need ≥{n_clusters})."
        )

    # Normalize profiles (z-score per gene)
    profile_array = np.array(profiles)
    scaler = StandardScaler()
    profile_norm = scaler.fit_transform(profile_array)

    # Replace NaN from constant genes with 0
    profile_norm = np.nan_to_num(profile_norm, nan=0.0)

    # KMeans clustering
    n_clusters = min(n_clusters, len(valid_genes))
    kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42, max_iter=300)
    labels = kmeans.fit_predict(profile_norm)

    # Compute soft memberships via distance-based assignment
    centroids = kmeans.cluster_centers_
    memberships = _compute_memberships(profile_norm, centroids, fuzziness)

    # Build cluster results
    clusters = []
    gene_assignments: dict[str, dict] = {}

    for c_id in range(n_clusters):
        cluster_mask = labels == c_id
        cluster_genes = [valid_genes[i] for i in range(len(valid_genes)) if cluster_mask[i]]

        # Membership for each gene in this cluster
        gene_memberships = {
            valid_genes[i]: round(float(memberships[i, c_id]), 4)
            for i in range(len(valid_genes))
            if cluster_mask[i]
        }

        # Sort by membership
        sorted_genes = sorted(gene_memberships.keys(), key=lambda g: gene_memberships[g], reverse=True)

        # Centroid (un-normalized mean profile)
        centroid_raw = profile_array[cluster_mask].mean(axis=0).tolist()
        centroid_norm = centroids[c_id].tolist()

        # Smooth centroid with cubic spline for visualization
        x_orig = np.linspace(0, 1, len(stages_ordered))
        x_smooth = np.linspace(0, 1, 48)
        try:
            cs = CubicSpline(x_orig, centroid_norm, bc_type="natural")
            centroid_smooth = cs(x_smooth).tolist()
        except Exception:
            centroid_smooth = centroid_norm  # Fallback

        # Classify pattern
        pattern = _classify_pattern(centroid_norm)

        clusters.append({
            "id": c_id,
            "label": _pattern_label(pattern),
            "centroid": [round(v, 4) for v in centroid_raw],
            "centroid_norm": [round(v, 4) for v in centroid_norm],
            "centroid_smooth": [round(v, 4) for v in centroid_smooth],
            "genes": sorted_genes[:50],  # Cap for payload
            "gene_count": len(cluster_genes),
            "memberships": gene_memberships,
            "pattern": pattern,
        })

        for g in cluster_genes:
            gene_assignments[g] = {
                "cluster": c_id,
                "membership": gene_memberships.get(g, 0),
            }

    # Sort clusters by pattern for consistent display
    clusters.sort(key=lambda c: c["id"])

    return {
        "stages": stages_ordered,
        "clusters": clusters,
        "gene_assignments": gene_assignments,
        "n_genes": len(valid_genes),
        "method": "Fuzzy c-means (Mfuzz-style)",
    }


def _order_stages(stage_labels: list[str]) -> list[str]:
    """Order stages by known clinical progression, then alphabetically."""
    known_order = {
        "normal": 0, "healthy": 0,
        "adenoma": 1, "polyp": 1,
        "stage i": 2, "stage_i": 2, "i": 2, "early": 2,
        "stage ii": 3, "stage_ii": 3, "ii": 3,
        "stage iii": 4, "stage_iii": 4, "iii": 4,
        "stage iv": 5, "stage_iv": 5, "iv": 5, "late": 5,
        "metastatic": 6,
    }
    unique = sorted(set(stage_labels))
    return sorted(unique, key=lambda s: known_order.get(s.lower().strip(), 99))


def _compute_memberships(data: np.ndarray, centroids: np.ndarray, m: float) -> np.ndarray:
    """Compute fuzzy membership matrix from distances to centroids."""
    n_samples = data.shape[0]
    n_clusters = centroids.shape[0]
    memberships = np.zeros((n_samples, n_clusters))

    for i in range(n_samples):
        dists = np.array([np.linalg.norm(data[i] - centroids[j]) for j in range(n_clusters)])
        dists = np.maximum(dists, 1e-10)  # Avoid division by zero

        for j in range(n_clusters):
            denom = sum((dists[j] / dists[k]) ** (2 / (m - 1)) for k in range(n_clusters))
            memberships[i, j] = 1.0 / max(denom, 1e-10)

    return memberships


def _classify_pattern(profile: list[float]) -> str:
    """Classify a temporal profile into a named pattern."""
    n = len(profile)
    if n < 3:
        return "flat"

    # Find peak and trough positions
    peak_pos = np.argmax(profile)
    trough_pos = np.argmin(profile)

    # Overall trend
    start_val = np.mean(profile[:max(1, n // 4)])
    end_val = np.mean(profile[-max(1, n // 4):])
    mid_val = np.mean(profile[n // 4: 3 * n // 4])

    if peak_pos <= 1 and end_val < start_val * 0.7:
        return "early_peak"
    elif peak_pos >= n - 2 and end_val > start_val * 1.3:
        return "late_rise"
    elif mid_val > max(start_val, end_val) * 1.2:
        return "rise_fall"
    elif end_val > start_val * 1.3:
        return "monotone_up"
    elif end_val < start_val * 0.7:
        return "monotone_down"
    elif trough_pos > 0 and trough_pos < n - 1:
        return "fall_rise"
    else:
        return "flat"


def _pattern_label(pattern: str) -> str:
    """Human-readable label for a pattern type."""
    labels = {
        "early_peak": "Early Peak",
        "late_rise": "Late Rise",
        "rise_fall": "Rise → Fall",
        "monotone_up": "Always Up",
        "monotone_down": "Always Down",
        "fall_rise": "Fall → Rise",
        "flat": "Stable",
    }
    return labels.get(pattern, pattern.replace("_", " ").title())
