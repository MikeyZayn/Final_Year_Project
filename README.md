# THEMBA

**T**ransport **H**ub with **E**valuated **M**obility, **B**oarding and **A**ccountability

A final-year project building a minibus taxi transport information platform, centered on a trip-verified passenger feedback mechanism.

## What THEMBA does

Minibus taxis are central to South African public transport but largely undocumented, there's no consistent way to look up fares, routes, or hold drivers accountable for service. THEMBA gives four kinds of users a shared platform:

- **Passengers**: look up routes and fares, register for trips, and leave feedback that's tied to a real, verified trip rather than an anonymous review
- **Drivers**: register under a taxi association and are verified against a driver-licensing lookup before being assigned to trips
- **Operators**: manage a taxi association's drivers, vehicles, routes, and service announcements
- **Administrators**: approve driver and operator accounts, oversee complaints, and manage the platform

The project's central contribution is the **trip-verified feedback mechanism**: ratings and complaints are only ever attributable to a specific, confirmed trip and driver, making the feedback trustworthy rather than open to manipulation.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Django + Django REST Framework |
| Frontend | React (Vite) |
| Database | PostgreSQL |
| External verification | A simulated Department of Transport driver-licensing lookup, standing in for a real government integration |
| Mapping | Leaflet.js + MapTiler |
