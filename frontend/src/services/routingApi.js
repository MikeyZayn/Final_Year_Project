/**
 * Ad-hoc road routing — original themba-search-first client.
 * POST /api/routing/directions/ → ORS → OSRM → fallback (server).
 * Google Maps is NOT used for road geometry.
 */
import { api } from '../api';

export async function computeRoute(origin, destination) {
  const lat0 = Number(origin?.lat);
  const lng0 = Number(origin?.lng);
  const lat1 = Number(destination?.lat);
  const lng1 = Number(destination?.lng);

  if (![lat0, lng0, lat1, lng1].every((n) => Number.isFinite(n))) {
    throw new Error(
      'Origin and destination must both have valid latitude and longitude numbers.'
    );
  }

  try {
    const data = await api.directions(
      { lat: lat0, lng: lng0 },
      { lat: lat1, lng: lng1 }
    );

    const geometry = Array.isArray(data.geometry) ? data.geometry : [];
    if (geometry.length < 2) {
      throw new Error(
        'Routing service returned no usable path between these two points.'
      );
    }

    return {
      geometry,
      distanceKm: Number(data.distance_km) || 0,
      durationMin: Number(data.duration_min) || 0,
      trafficAware: false,
      source: data.source || 'ors',
      fare: data.fare ?? null,
      fareNotice: data.fare_notice ?? null,
      alternatives: [],
    };
  } catch (err) {
    throw new Error(routingErrorMessage(err));
  }
}

export async function computeGoogleRoute(origin, destination) {
  return computeRoute(origin, destination);
}

export async function computeOrsRoute(origin, destination) {
  return computeRoute(origin, destination);
}

export async function computeRouteWithFallback(origin, destination) {
  return computeRoute(origin, destination);
}

function routingErrorMessage(err) {
  const raw = err?.message || String(err);
  if (/ORS_API_KEY|API key|401|403|rejected/i.test(raw)) {
    return (
      'OpenRouteService rejected the request. Set ORS_API_KEY in backend/.env ' +
      '(https://openrouteservice.org/dev/#/signup) and restart Django.'
    );
  }
  if (/429|quota|rate/i.test(raw)) {
    return 'Routing quota reached. Try again shortly.';
  }
  if (/Cannot reach/i.test(raw)) {
    return raw;
  }
  return `Routing unavailable right now (${raw}).`;
}

export default computeRoute;
