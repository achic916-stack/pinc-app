export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: RouteCoordinate[];
  distanceKm: number;
  durationMins: number;
  success: boolean;
}

/**
 * Calculates straight-line distance in kilometers between two GPS points using Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Fetches driving route coordinates between origin and destination using OSRM API.
 * Falls back to a direct 2-point polyline if network request times out or fails.
 */
export async function fetchInAppRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate
): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM API error status: ${response.status}`);
    }

    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const rawCoords: [number, number][] = route.geometry.coordinates;

      const coordinates: RouteCoordinate[] = rawCoords.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
      const durationMins = Math.max(1, Math.round(route.duration / 60));

      return {
        coordinates,
        distanceKm,
        durationMins,
        success: true,
      };
    }
  } catch (error) {
    console.warn("OSRM routing API fallback to straight-line polyline:", error);
  }

  // Fallback: Direct straight-line polyline
  const directDistanceKm = calculateHaversineDistance(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude
  );
  // Estimate driving duration at ~30 km/h average speed in city
  const estimatedMins = Math.max(1, Math.round((directDistanceKm / 30) * 60));

  return {
    coordinates: [origin, destination],
    distanceKm: directDistanceKm,
    durationMins: estimatedMins,
    success: false,
  };
}
