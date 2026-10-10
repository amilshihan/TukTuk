# Tuk Tuk Meter

A taxi meter app for tuk tuk drivers. It measures distance with GPS, adds waiting time while the passenger is out shopping, and shows the fare live.

## Features

- **Live meter**: base fare for the first km, a per-km rate after that, and the total rounded to the nearest 10 (adjustable).
- **Waiting mode**: tap **Start waiting** when the passenger gets out and **Resume trip** when they're back. Waiting is charged per started minute, and you can set free minutes.
- **GPS filtering**: ignores jitter while parked, inaccurate fixes and impossible jumps.
- **Crash safe**: the running hire is saved on every update. If the app is killed, the meter resumes when you reopen it.
- **Screen stays on** during a hire.
- **Receipt** for each trip, which you can share by SMS or WhatsApp.
- **Trip history** grouped by day, with today's earnings on the home screen.
- **Rates you can edit** in Settings (currency, base fare, per km, waiting per minute, rounding).
- **Optional cloud backup** of trips to Supabase. Each driver signs in with email and only sees their own trips.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on an Android phone.

## Cloud backup (optional)

1. Create a project at https://supabase.com.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env.local`, then fill in the project URL and publishable key from **Project Settings → API**.
4. Restart `npx expo start`.

Without these keys the app works fully offline.

## Development

```bash
npm test           # fare and meter logic tests
npm run typecheck
npx expo lint
```

Code layout:

- `src/app/`: screens (Expo Router)
- `src/lib/fare.ts`: fare calculation
- `src/lib/geo.ts`: GPS distance and filtering
- `src/lib/meter.ts`: meter state (start, location, waiting, finish)
- `src/lib/storage.ts`: SQLite trip history and saved settings
- `src/lib/sync.ts`: upload to Supabase

## Known limitations

- GPS only updates while the app is open. The screen is kept on during a hire, but if the driver switches apps, distance pauses and the meter catches up with a straight line when they come back. Background tracking needs a development build (`eas build`), not Expo Go.
- The default rates (Rs 100 first km, Rs 85/km, Rs 5/min waiting) are placeholders. Set your own in Settings.
