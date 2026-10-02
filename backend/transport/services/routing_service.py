"""
Routing providers for THEMBA.

Used for:
  - PREDETERMINED route geometry (cached on the Route model)
  - AD-HOC passenger routes when Google Routes is unavailable
    (OpenRouteService fallback)

Order of preference for get_driving_route / get_ad_hoc_route:
  1. OpenRouteService (if ORS_API_KEY is set)
  2. OSRM-compatible service (if ROUTING_SERVICE_URL is set)
  3. Report route unavailable; do not present a straight line as a road route

ORS docs: https://openrouteservice.org/dev/#/api-docs/v2/directions
"""
import logging

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"

class RoutingServiceError(Exception):
    pass


def get_driving_route(origin, destination, timeout=8):
    """
    origin / destination: (lat, lng) tuples.

    Returns:
        {
            "geometry": [[lat, lng], ...],
            "distance_km": float,
            "duration_min": float,
            "source": "ors" | "osrm" | "fallback",
        }
    """
    # 1) OpenRouteService
    ors_key = getattr(settings, "ORS_API_KEY", None) or ""
    if ors_key.strip():
        try:
            return _ors_route(origin, destination, ors_key.strip(), timeout=timeout)
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenRouteService unavailable, trying OSRM: %s", exc)

    # 2) OSRM-compatible
    base_url = getattr(settings, "ROUTING_SERVICE_URL", None) or ""
    if base_url.strip():
        try:
            return _osrm_route(origin, destination, base_url.strip(), timeout=timeout)
        except Exception as exc:  # noqa: BLE001
            logger.warning("OSRM routing service unavailable, road routing unavailable: %s", exc)

    raise RoutingServiceError("Road routing is unavailable. Check ORS_API_KEY or ROUTING_SERVICE_URL and try again.")


def get_ad_hoc_route(origin, destination, timeout=8):
    """Same as get_driving_route; explicit name for passenger ad-hoc use."""
    return get_driving_route(origin, destination, timeout=timeout)


def _ors_route(origin, destination, api_key, timeout=8):
    """
    Call OpenRouteService driving-car directions.
    Coordinates are [lng, lat] in the ORS body (opposite of Google lat/lng habit).
    """
    body = {
        "coordinates": [
            [origin[1], origin[0]],
            [destination[1], destination[0]],
        ],
    }
    response = requests.post(
        ORS_DIRECTIONS_URL,
        json=body,
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=timeout,
    )
    if response.status_code == 401 or response.status_code == 403:
        raise RoutingServiceError(
            "OpenRouteService rejected the API key. Check ORS_API_KEY and that "
            "the key is active at https://openrouteservice.org/dev/#/account"
        )
    if response.status_code == 429:
        raise RoutingServiceError(
            "OpenRouteService quota exceeded. Wait a minute or upgrade the free plan."
        )
    response.raise_for_status()
    payload = response.json()
    features = payload.get("features") or []
    if not features:
        raise RoutingServiceError("OpenRouteService returned no route for these points.")
    route = features[0]
    summary = route.get("properties", {}).get("summary", {})
    distance_m = float(summary.get("distance") or 0)
    duration_s = float(summary.get("duration") or 0)
    coordinates = route.get("geometry", {}).get("coordinates", [])
    geometry = [[c[1], c[0]] for c in coordinates]
    if len(geometry) < 2:
        raise RoutingServiceError("OpenRouteService returned empty road geometry.")

    return {
        "geometry": geometry,
        "distance_km": round(distance_m / 1000, 3),
        "duration_min": round(duration_s / 60, 1),
        "source": "ors",
    }


def _decode_ors_geometry(route):
    """
    ORS JSON directions returns an encoded polyline in route['geometry'].
    Decode to [[lat, lng], ...]. Prefer explicit coordinates if ever present.
    """
    encoded = route.get("geometry")
    if not encoded or not isinstance(encoded, str):
        return []
    return _decode_polyline(encoded)


def _decode_polyline(encoded):
    """Google/ORS encoded polyline algorithm → list of [lat, lng]."""
    coordinates = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        result = 0
        shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        result = 0
        shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append([lat / 1e5, lng / 1e5])

    return coordinates


def _osrm_route(origin, destination, base_url, timeout=5):
    # OSRM expects lng,lat order.
    coords = f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
    url = f"{base_url.rstrip('/')}/route/v1/driving/{coords}"
    response = requests.get(
        url,
        params={"overview": "full", "geometries": "geojson"},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RoutingServiceError("No road route found between these points.")
    route = payload["routes"][0]
    coordinates = route["geometry"]["coordinates"]  # [[lng, lat], ...]
    geometry = [[c[1], c[0]] for c in coordinates]
    if len(geometry) < 2:
        raise RoutingServiceError("Routing service returned empty road geometry.")
    return {
        "geometry": geometry,
        "distance_km": round(route["distance"] / 1000, 3),
        "duration_min": round(route["duration"] / 60, 1),
        "source": "osrm",
    }


