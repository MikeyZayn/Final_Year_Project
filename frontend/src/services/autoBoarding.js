// A signed-in browser automatically supplies the receipt delivered by the backend.
export async function confirmDeliveredBookings(bookings, confirm) {
  const updated = [];
  for (const booking of bookings) {
    if (booking.verification_code && booking.boarded_at && !booking.passenger_confirmed_at && ['boarded', 'completed'].includes(booking.status)) {
      try { updated.push(await confirm(booking.id, booking.verification_code)); }
      catch { updated.push(booking); } // next refresh retries after reconnection
    } else updated.push(booking);
  }
  return updated;
}
