const RATES = { bike: { base: 25, per: 8 }, auto: { base: 35, per: 12 }, cab: { base: 60, per: 18 } };

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

exports.calculateFare = (pickup, destination, vehicle = "bike") => {
  const dist = haversine(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const rate = RATES[vehicle] || RATES.bike;
  return Math.round(rate.base + dist * rate.per);
};
