# THEMBA.

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

## Local investor rehearsal

Double-click `Start-THEMBA.cmd` in this checkout, or run `./run-investor.ps1 Preview` in PowerShell. When the terminal reports that the server started, open [the local app](http://127.0.0.1:5182/). Keep the terminal open during the rehearsal. The preview serves the web app and API from the same port, uses a dedicated SQLite database, and prints signup and recovery emails in the terminal.

| Demo account | Phone |
| --- | --- |
| Passenger | 0821111111 |
| Ongoye operator | 0820000003 |
| Ongoye admin | 0700000001 |
| Driver | 0830000001 |

The seeded local accounts use the password `Passw0rd!`. For a rehearsal after the seeded departure dates pass, use the admin’s **Departure queue** to schedule a fresh trip. Use `KDL001` to rehearse an operator application at Ongoye.

To rehearse commuter passes, book one seat using **Commuter pass**. As the operator, engage that trip, complete the on-site checks, and select **Record pass use** when the passenger presents their pass. Then confirm boarding. The rank administrator can see the presentation in **Commuter pass usage**. The record contains the booking, operator, and time. No card number or fare is collected by THEMBA for this payment method.
