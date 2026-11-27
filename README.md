# PokerOTP — Multi-Unit 4-Digit Buy-In OTP & Running Total Tracker

A streamlined, real-time mobile-first web app for poker hosts and players:

1. **Host Room Setup:** Create a room with a custom unique **Room ID or Name** (or auto-generated short ID) and set the **Fixed Buy-In Amount** (e.g. `RM 100`).
2. **Instant Player Join:** Players join immediately by entering the Room ID/Name + their Player Name (or via a direct invite link).
3. **Multi-Unit 4-Digit Buy-In OTPs:** Players can request buy-ins as many times as needed, in multiples of the fixed buy-in amount (`1×`, `2×`, `3×`, etc.). Requesting `N×` the fixed buy-in automatically generates **`N` unique 4-digit OTP codes** (e.g. `2×` buy-in generates 2 OTP codes) for the player to read to the host, who writes them down on paper and hands out the chips.
4. **Live Running Totals:** Every player has a live running total of their buy-ins visible to both the player and the host, synced in real time via Server-Sent Events (SSE).

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. To test Host + multiple Players side-by-side in one browser window, click **Launch Demo Room** on the home page or click **Test Player Tabs** inside the Host Console.
