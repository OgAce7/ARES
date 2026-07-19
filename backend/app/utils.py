"""
Small shared helpers used across the simulation/prediction/optimization/
sustainability modules.

Kept deliberately tiny and dependency-free: this is NOT a place for
business logic, only truly generic helpers that were previously copy-
pasted identically in multiple files.
"""

# The three resource pools the whole simulation reasons about. Previously
# redefined identically in simulation.py, prediction.py, optimization.py,
# and sustainability.py - centralized here so the four modules can't
# silently drift out of sync with each other.
RESOURCE_NAMES: tuple[str, str, str] = ("oxygen", "water", "energy")


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    """Constrain `value` to the inclusive range [low, high].

    Previously redefined identically (as `_clamp`) in simulation.py,
    optimization.py, and sustainability.py.
    """
    return max(low, min(high, value))