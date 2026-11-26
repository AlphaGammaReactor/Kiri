"""
Kiri — p-values after an optimal cutpoint search

Choosing the cutpoint that gives the smallest p-value and then reporting that
p-value as if the cutpoint had been fixed in advance overstates significance:
with a search over the middle half of the data, a nominal p of 0.05 happens
by chance roughly 30% of the time. Kiri therefore reports a p-value adjusted
for the search.

The adjustment is the Miller & Siegmund (1982) approximation for maximally
selected test statistics, in the form given by Altman et al. (1994, JNCI
86:829) and Lausen & Schumacher (1992):

    p_adj = phi(z) * (z - 1/z) * ln[(1 - eps)^2 / eps^2] + 4 * phi(z) / z

where z is the standard normal quantile at 1 - p_min/2, phi is the normal
density, and the search covers cutpoints between the eps and 1 - eps quantiles.
"""

import math

from scipy.stats import norm


def adjusted_min_pvalue(p_min: float, lower_quantile: float = 0.25) -> float:
    """
    Adjust the smallest p-value from a cutpoint search for the search itself.

    Args:
        p_min: smallest nominal two-sided p-value over the candidate cutpoints
        lower_quantile: eps, the fraction of the data below the first candidate
            (the search is assumed symmetric, up to 1 - eps)

    Returns:
        Adjusted p-value in [p_min, 1].
    """
    if not (0.0 < lower_quantile < 0.5):
        raise ValueError("lower_quantile must be between 0 and 0.5")
    if p_min is None or math.isnan(p_min):
        return float("nan")
    if p_min >= 1.0:
        return 1.0
    if p_min <= 0.0:
        return 0.0

    z = float(norm.isf(p_min / 2.0))
    # The approximation is only meaningful in the upper tail. Below it, a search
    # this wide gives no evidence at all, so report 1.
    if z <= 1.0:
        return 1.0

    eps = lower_quantile
    phi = float(norm.pdf(z))
    p_adj = phi * (z - 1.0 / z) * math.log((1.0 - eps) ** 2 / eps**2) + 4.0 * phi / z
    return float(min(1.0, max(p_min, p_adj)))


ADJUSTMENT_LABEL = "adjusted for the cutpoint search (Miller-Siegmund / Altman 1994)"
