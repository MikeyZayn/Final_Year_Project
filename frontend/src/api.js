import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
});

api.interceptors.request.use((config) => {
  const publicAccountRequest =
    /\/accounts\/api\/(login|register[^/]*|password-reset)(\/|$)/
      .test(config.url || "");

  const token = sessionStorage.getItem("token");

  if (token && !publicAccountRequest) {
    config.headers.Authorization = `Token ${token}`;
  } else {
    delete config.headers.Authorization;
  }

  return config;
});

// ----- Convenience methods used by teammate's pages -----

api.myVehicle = async () => {
  const { data } = await api.get("/transport/api/driver/vehicle/");
  return data;
};

api.driverTrips = async () => {
  const { data } = await api.get("/transport/api/driver/trips/");
  return data;
};

api.driverProfile = async () => {
  const { data } = await api.get("/transport/api/driver/profile/");
  return data;
};

api.postLocation = async (vehicleId, payload) => {
  const { data } = await api.post(
    `/transport/api/driver/vehicle/${vehicleId}/location/`,
    payload
  );
  return data;
};

api.confirmTrip = async (tripCode) => {
  const { data } = await api.post("/transport/api/driver/trips/confirm/", {
    trip_code: tripCode,
  });
  return data;
};

api.directions = async (origin, destination) => {
  const { data } = await api.post("/transport/api/routing/directions/", {
    origin,
    destination,
  });
  return data;
};

// Both import styles work:
//   import api from './api'      (our existing code)
//   import { api } from './api'  (teammate's code)
export { api };
export default api;

// ----- Passenger booking + payment -----

// One departure with driver, operator, rating and check-in state.
api.tripDetail = async (tripId) => {
  const { data } = await api.get(`/transport/api/trips/${tripId}/`);
  return data;
};

// Booking is only valid with a payment method (card or cash).
api.bookTrip = async (payload) => {
  const { data } = await api.post("/transport/api/my-bookings/", payload);
  return data;
};

// Payment confirmed / cash pending / refund / boarding receipts.
api.myNotifications = async () => {
  const { data } = await api.get("/transport/api/my-notifications/");
  return data;
};

// Operator verifies a cash passenger at the rank.
api.verifyCashPayment = async (tripId, bookingId) => {
  const { data } = await api.post(
    `/transport/api/my-trips/${tripId}/bookings/${bookingId}/verify-cash/`
  );
  return data;
};

// Refund every paid passenger when the driver was not at the rank at departure.
api.driverNoShowRefunds = async (tripId, payload = {}) => {
  const { data } = await api.post(
    `/transport/api/my-trips/${tripId}/driver-no-show-refunds/`,
    payload
  );
  return data;
};

api.requestPasswordReset = async (phone) => {
  const { data } = await api.post("/accounts/api/password-reset/request/", { phone });
  return data;
};

api.confirmPasswordReset = async (phone, code, new_password) => {
  const { data } = await api.post("/accounts/api/password-reset/confirm/", {
    phone, code, new_password,
  });
  return data;
};