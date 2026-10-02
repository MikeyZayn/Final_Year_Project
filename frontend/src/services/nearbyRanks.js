export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = x => x * Math.PI / 180;
  const a = Math.sin(rad(lat2-lat1)/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lng2-lng1)/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
export function nearestRank(ranks, position, maximumKm = 25) {
  if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return null;
  const candidates = ranks.filter(r => r.latitude !== null && r.latitude !== undefined && r.longitude !== null && r.longitude !== undefined && r.latitude !== '' && r.longitude !== '' && Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)))
    .map(rank => ({ rank, distance: distanceKm(position.latitude, position.longitude, Number(rank.latitude), Number(rank.longitude)) }))
    .sort((a,b) => a.distance - b.distance || a.rank.id-b.rank.id);
  return candidates[0]?.distance <= maximumKm ? candidates[0] : null;
}
