# Tuk Tuk Meter

A taxi meter app for tuk tuk drivers. It measures distance with GPS, charges waiting time automatically while the tuk tuk is stopped (for example while the passenger is shopping), and shows the fare live.

## Features

- **Driver registration and login**: drivers register with their name, mobile number, address, NIC, tuk tuk registration number and driving licence number, then log in with mobile number + password. The details are stored in the `drivers` table for the operator's records. You must be logged in to use the meter.
- **Live meter**: base fare for the first km, a per-km rate after that, and the total rounded to the nearest 10 (adjustable).
- **Automatic waiting**: when the tuk tuk stands still for the number of seconds set in Settings (default 5), the waiting charge starts. When it moves again, even slowly in traffic, waiting stops and the distance charge carries on. Waiting is charged per started minute, and you can set free minutes.
- **Night rate**: an optional % surcharge on hires that start inside a night window (for example 22:00–05:00).
- **Background tracking** (installed app only): distance and waiting keep counting with the screen off or another app open. Android shows a "Tuk Tuk Meter is running" notification during a hire.
- **Sinhala, Tamil and English**: switch on the login screen or in Settings.
- **Receipt** with the route on a map. Share it as an image to WhatsApp or SMS.
- **GPS filtering**: ignores jitter while parked, inaccurate fixes and impossible jumps.
- **Crash safe**: the running hire is saved on every update. If the app is killed, the meter resumes when you reopen it.
- **Trip history** grouped by day, with today's earnings on the home screen, backed up to Supabase.
- **Rates you can edit** in Settings.

## Supabase setup (required)

Driver accounts and trip backup live in Supabase.

1. In the Supabase dashboard, open **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
2. Open **Authentication → Sign In / Providers → Email**, turn **Confirm email** off, and save. Drivers log in with their mobile number, which the app maps to an internal login id. No emails or SMS are ever sent.
3. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key from **Project Settings → API Keys**.
4. For APK builds, add the same two values as EAS environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) for the `preview` environment.

To see your records in **Table Editor**:

- **trip_log**: every trip (newest first, Sri Lanka time) with the driver, tuk tuk no., km, duration, waiting time and stops, each charge, start and end addresses, and a Google Maps link. Running hires show as `in_progress` and are updated every minute.
- **driver_summary**: each driver's details with trip count, total fares, total km and whether they're on a hire now.
- **drivers** / **trips**: the raw tables. Completed trips can't be changed or deleted from the app.

Re-run `supabase/schema.sql` after updating the app; it's safe to run again.

## Run it

```bash
npm install
npx expo start --tunnel
```

Scan the QR code with **Expo Go**. Background tracking doesn't work in Expo Go; it falls back to tracking only while the app is open.

Build an installable Android APK:

```bash
npx eas-cli@latest build -p android --profile preview
```

## Development

```bash
npm test           # fare, meter and phone logic tests
npm run typecheck
npx expo lint
```

Code layout:

- `src/app/`: screens (Expo Router). `login` and `register` are shown until the driver is signed in.
- `src/lib/fare.ts`: fare calculation, including the night rate
- `src/lib/geo.ts`: GPS distance and filtering
- `src/lib/meter.ts`: meter state (start, location, auto waiting, route, finish)
- `src/lib/tracking.ts`: background / foreground location
- `src/lib/auth.tsx`: driver registration and login
- `src/lib/i18n.tsx`: English, Sinhala and Tamil text
- `src/lib/storage.ts`: SQLite trip history and saved settings
- `src/lib/sync.ts`: upload to Supabase

## Notes

- The default rates (Rs 100 first km, Rs 85/km, Rs 5/min waiting, no night rate) are placeholders. Set your own in Settings.
- **Maps with Google** (`EXPO_PUBLIC_GOOGLE_MAPS_KEY` set): native Google map on Android, Apple Maps on iPhone, Google place search (Places API New) and traffic-aware routes avoiding expressways (Routes API). Enable **Maps SDK for Android**, **Places API (New)** and **Routes API** on the key, restrict the key to those three APIs, and set daily quotas in Google Cloud.
- **Without a Google key**: OpenFreeMap tiles via MapLibre, Valhalla routes and Photon search, all free with no key (community servers with fair-use limits).
- The Sinhala and Tamil text should be checked by a native speaker.
