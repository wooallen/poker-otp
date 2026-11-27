# PokerOTP — Live 4-Digit Buy-In OTP & Running Total Tracker

Live URL: **https://wooallen.github.io/poker-otp/**

A mobile-first, high-contrast web application for managing poker room buy-in OTPs and player running totals in real time across devices:

1. **Host Room Setup:** Create a room with a unique **6+ character Room ID or Name** and set the **Fixed Buy-In Amount** (defaults to `RM500`).
2. **Instant Player Join:** Players join immediately by entering the Room ID/Name + their Player Name (or via a direct invite link).
3. **Multi-Unit 4-Digit Buy-In OTPs:** Players can request buy-ins at any time in multiples of the fixed buy-in amount (`1×`, `2×`, `3×`, etc.). Buying `N×` the fixed buy-in atomically generates **`N` unique 4-digit OTP codes** (each timestamped) for the player to read to the host.
4. **Live Running Totals & PDF Summary:** Syncs running totals across phones via Cloud Firestore (`asia-southeast1`). When the host clicks **Close Room**, new buy-ins lock, the session end time is recorded, and a complete timestamped PDF summary (`PokerOTP-<room>-<date>.pdf`) is generated for download.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Run `npm run deploy` to build the static export and publish updates directly to `https://wooallen.github.io/poker-otp/`.
