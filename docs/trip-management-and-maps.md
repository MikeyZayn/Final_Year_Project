# Maps, trip groups and audited edits

Implemented locally on 4 October 2026.

## Try it

- Passenger: choose **View my route**, or open **All departures** and choose **View route**. The map appears first and scrolls into view. **Hide route · back to dashboard** closes it.
- Select either map pin or the rank card below the map for **06:30–19:30 daily**, in South Africa time. These are demonstration hours shared by every rank.
- Operator: open a trip and use **Change driver / vehicle**. Replacement drivers must be verified, pass the stored DOT-status checks, and have active access to the departure rank. Each changed asset requires its own reason. The change applies immediately; it does not require another administrator approval. Changing assets clears the prior on-site verification.
- Operator: once a trip is engaged, open **Family & travel groups**. Choose a lead passenger (registered or walk-in), select other existing passengers and/or add children/companions, then confirm a shared emergency contact. New companions reserve seats and must be explicitly selected for physical boarding.
- Registered group members keep their accounts and individual boarding receipts. Shared emergency contacts belong to the trip bookings; passenger profile contacts are not edited. If an unboarded lead cancels, registered companions keep their bookings and the contact snapshot.
- Administrator: **Trip management → Edit trip** supports assignments, route, operator, departure date/time, capacity and notes. **Change history** shows actor, role, time, reason and before/after values, including operator changes. Existing asset-change records remain visible.

## Rules

Assignments/schedules can be edited before departure. Closed/in-progress trips allow administrative note corrections only. Route/operator changes are blocked while bookings exist. Cancellations require a reason and cannot cancel an in-progress trip or a trip with boarded passengers.

Vehicles must be roadworthy and have enough seats. Overlapping active driver/vehicle assignments are rejected, using the route's typical duration or 60 minutes when absent. An unspecified departure time conservatively occupies the day.

Audit history is read-only through the application API. Database administrators still control the database; this is not a cryptographically tamper-proof log. The new migration does not reconstruct earlier administrative edits for which no history was saved.

## Maps

The default remains OpenStreetMap, with modern route styling, labelled pins, fit/zoom controls, rank cards and popups. No map key is required for that default.

Optional CARTO Voyager tiles: obtain a basemap key from [CARTO](https://carto.com/basemaps/apikey/) and set `VITE_CARTO_BASEMAP_KEY` in the frontend environment, then restart Vite or rebuild/redeploy. [CARTO's current terms](https://carto.com/legal/basemap-terms/) require a key and attribution. Failed CARTO tiles fall back to OpenStreetMap. No key is stored in source.

Road geometry still comes from the existing backend routing service. Opening hours do not restrict bookings; they are informational demo values.

## Database and deployment

The additive migration is `transport.0011_tripchange`. It creates the trip audit table and has been applied to the local SQLite database.

Deploy backend code and run migrations before deploying the updated frontend. Existing local or deployed trip records are not reseeded. These changes have not been pushed or deployed.
