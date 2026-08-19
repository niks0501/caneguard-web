# Physical Android API connectivity

This guide defines the primary local connection path for an Android development build using wireless debugging.

The primary path is wireless ADB with an ADB reverse from the phone's `127.0.0.1:8000` to the development machine's Laravel server.

The reverse path keeps the phone on its existing Wi-Fi connection and does not require the development server to be exposed to the LAN.

## Primary workflow

Run these commands from the root of this repository.

```bash
# 1. Start the Laravel API on the development machine.
npm run api:dev

# 2. Verify the host-side health endpoint.
curl http://127.0.0.1:8000/api/health

# 3. Confirm that the phone is connected through wireless debugging.
adb devices

# 4. Forward the phone's local API port through the existing ADB transport.
adb reverse tcp:8000 tcp:8000
adb reverse --list
```

The health response should report `data.status` as `ok` and both current dependency checks as `ready`.

The reverse listing should include `tcp:8000 tcp:8000`.

Start Metro and the Android development build with the normal command used by the mobile repository after the reverse is established.

The mobile development build should use the existing local value below.

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

That mobile environment variable belongs to the mobile repository and is not configured through this web application's `VITE_` variables.

The web application's local API base remains `VITE_API_BASE_URL=http://localhost:8000` when the browser and Laravel server run on the same development machine.

## Why this is the team default

The Laravel development server started by `npm run api:dev` binds to `127.0.0.1:8000`.

ADB reverse makes that loopback binding reachable from the phone without changing the server binding or opening a firewall port.

Maestro and wireless ADB continue using the same wireless transport while the app's HTTP requests use the reverse port.

## Checking the two connectivity states

A device can have a working network connection while the CaneGuard API is unavailable.

The app must keep general network availability separate from the result of `GET /api/health`.

A successful health response means that the CaneGuard server is reachable and its reported dependencies are ready.

A timeout, transport failure, malformed health response, or degraded health response means that the API is not currently reachable for diagnostic purposes.

Health is diagnostic only.

A health check must not be made a prerequisite for a valid report upload because the upload endpoint remains the source of truth.

When Laravel is stopped while Wi-Fi and wireless ADB remain connected, the app should report that the CaneGuard server is unavailable rather than reporting that the device is offline.

After Laravel is restarted, a resume or user-triggered sync check should allow the API reachability state to recover without reinstalling the development build.

## Fallback when ADB reverse is unreliable

Use a private LAN API URL only when the reverse path is unreliable in the local WSL or Windows arrangement.

The fallback requires Laravel to bind to an interface reachable from the phone and requires a private-network firewall rule for port `8000`.

Do not expose the development server publicly.

Do not commit a LAN address or put one in a checked-in environment file.

The repository's `npm run api:dev` command intentionally keeps the default server on loopback, so a LAN fallback must be an explicitly reviewed local command for the developer's environment.

Return to the ADB reverse workflow when the local WSL or Windows setup supports it.

## Wireless-debugging test rules

Keep Wi-Fi on while Maestro or wireless ADB is controlling the phone.

Do not automate a Wi-Fi-off step in a wireless ADB smoke test because it intentionally destroys the control channel.

Use `MANUAL-WIFI-OFFLINE-RECOVERY-TEST.md` for true offline acceptance that requires turning Wi-Fi off and on.

Never place credentials, bearer tokens, local LAN addresses, `.env.local`, or production configuration in this guide.

## Troubleshooting

If `curl http://127.0.0.1:8000/api/health` fails, fix the Laravel process before inspecting the phone.

If `adb devices` does not show the phone as `device`, repair wireless debugging before starting the app smoke test.

If `adb reverse --list` does not show the port mapping, run `adb reverse tcp:8000 tcp:8000` again while the phone is connected.

If the host health check works but the app reports the server as unavailable, verify the mobile build's `EXPO_PUBLIC_API_BASE_URL` and rebuild or restart the development client after changing environment values.

If the app reports the server as unavailable while the phone remains controllable through Maestro, leave Wi-Fi on, restart Laravel, and trigger the normal resume or manual sync check.
