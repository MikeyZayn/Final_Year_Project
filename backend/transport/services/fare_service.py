"""
Fare lookup has been consolidated onto Route.fare.

Routes carry a single predetermined fare, stored on the Route model
(see transport.models.Route). No dynamic fare calculation is performed
in the prototype. This module is retained only as a stub so existing
imports continue to resolve.
"""


def estimate_ad_hoc_fare(distance_km, route=None):
    """Deprecated. Fares are predetermined per route.

    If a route is provided, returns its stored fare. Otherwise returns None.
    """
    if route is not None:
        fare = getattr(route, "fare", None)
        return fare, "Fare is stored on the route."
    return None, "No fare available without a route."