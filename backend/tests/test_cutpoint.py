"""
The p-value reported after an optimal-cutpoint search must be adjusted for the search.
"""
import math

import numpy as np
import pandas as pd
import pytest

from app.services.cutpoint import adjusted_min_pvalue
from app.services.survival import _find_optimal_cutpoint


class TestAdjustedMinPvalue:
    def test_matches_altman_1994_closed_form(self):
        # Altman et al. 1994 give, for a search over the central 80% (eps = 0.10):
        #   p_adj = -1.63 * p_min * (1 + 2.35 * ln p_min)
        # as an approximation to the same formula for small p_min.
        for p_min in (0.001, 0.005, 0.01, 0.02):
            altman = -1.63 * p_min * (1 + 2.35 * math.log(p_min))
            assert adjusted_min_pvalue(p_min, lower_quantile=0.10) == pytest.approx(altman, rel=0.12)

    def test_nominal_005_is_not_significant_after_an_iqr_search(self):
        # With a search over the middle half, a nominal 0.05 is roughly 0.3.
        adjusted = adjusted_min_pvalue(0.05, lower_quantile=0.25)
        assert 0.2 < adjusted < 0.4

    def test_never_smaller_than_nominal_and_never_above_one(self):
        for p in (1e-12, 1e-6, 1e-3, 0.01, 0.05, 0.2, 0.5, 0.9, 1.0):
            adjusted = adjusted_min_pvalue(p)
            assert p <= adjusted <= 1.0

    def test_monotone(self):
        ps = [1e-8, 1e-6, 1e-4, 1e-3, 1e-2, 5e-2]
        adj = [adjusted_min_pvalue(p) for p in ps]
        assert adj == sorted(adj)

    def test_wider_search_costs_more(self):
        assert adjusted_min_pvalue(0.001, 0.10) > adjusted_min_pvalue(0.001, 0.25)

    def test_edges(self):
        assert adjusted_min_pvalue(0.0) == 0.0
        assert adjusted_min_pvalue(1.0) == 1.0
        assert math.isnan(adjusted_min_pvalue(float("nan")))
        with pytest.raises(ValueError):
            adjusted_min_pvalue(0.01, lower_quantile=0.5)


class TestFalsePositiveRate:
    def test_adjustment_controls_false_positives_under_the_null(self):
        """
        Simulation check of the statistics, with no real effect present: expression
        is unrelated to survival. The nominal minimum p-value calls far too many of
        these 'significant'; the adjusted one must stay near or below 5%.
        (Generated numbers are used here only to test the method.)
        """
        rng = np.random.default_rng(20261126)
        n_sim, n = 200, 200
        nominal_hits = adjusted_hits = 0
        for _ in range(n_sim):
            df = pd.DataFrame({
                "expression": rng.normal(size=n),
                "time": rng.exponential(1000, size=n),
                "event": rng.random(n) < 0.6,
            })
            _, search = _find_optimal_cutpoint(df)
            p_min = min(point["p_value"] for point in search)
            nominal_hits += p_min < 0.05
            adjusted_hits += adjusted_min_pvalue(p_min, 0.25) < 0.05

        assert nominal_hits / n_sim > 0.15          # the bug this replaces
        assert adjusted_hits / n_sim <= 0.08        # close to the 5% it claims
