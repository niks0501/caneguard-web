# Physical Android API connectivity

This guide covers the primary private-LAN connection for an Android development build. Keep the phone and development PC on the same private Wi-Fi network. Do not expose the development server publicly.

> **Current mobile automation:** The companion Mobile repository owns device automation.
>
> Follow its [Agent Device guide](https://github.com/niks0501/caneguard-mobile/blob/main/.agent-device/README.md) for current device-flow commands and evidence.

## Primary workflow: private LAN

If `api/.env` does not exist, create it from the example.

```bash
test -f api/.env || cp api/.env.example api/.env
```

Success: `api/.env` exists locally and is not committed.

Set the API URL and trusted host to the PC's current private LAN address. Edit the local file.

```bash
nano api/.env
```

Set these values in `api/.env`.

```env
APP_URL=http://<PC-LAN-IP>:8000
APP_TRUSTED_HOSTS=localhost,<PC-LAN-IP>
```

Success: both settings include the current private LAN address. Keep these local values out of commits. Do not change `.env.example`.

Run the API command from the root of this repository.

```bash
npm run api:dev
```

Success: the PHP server listens on `0.0.0.0:8000`.

In another WSL terminal, check the API through the PC's private LAN address.

```bash
curl http://<PC-LAN-IP>:8000/api/health
```

Success: `data.status` is `ok`, and both dependency checks are `ready`.

From Windows PowerShell, check the same address.

```powershell
curl.exe http://<PC-LAN-IP>:8000/api/health
```

Success: the response reports `data.status` as `ok`.

From the mobile repository, start Expo on the LAN.

```bash
npx expo start --lan --port 8081
```

Success: Expo displays a LAN development URL on port `8081` and a QR code. Open that development build on the phone using the QR code.

Set the mobile repository's local environment value to the PC's current private LAN address.

```env
EXPO_PUBLIC_API_BASE_URL=http://<PC-LAN-IP>:8000
```

Success: the development build can reach the API health endpoint. Keep this value in the mobile repository's local environment file, not in this repository or a commit.

## Alternate workflow: ADB reverse

Use this path when the phone is connected with wireless debugging and LAN access is unavailable. Start the API with `npm run api:dev`, then run these commands from a terminal with ADB available.

```bash
adb devices
adb reverse tcp:8000 tcp:8000
adb reverse --list
```

Success: the phone appears as `device`, and the reverse listing includes `tcp:8000 tcp:8000`. Set the mobile repository's local value to `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`.

## Connectivity checks

General network availability and API health are separate. A successful `GET /api/health` means the server is reachable and its reported dependencies are ready. A timeout, transport failure, malformed response, or degraded health response means the API is not currently reachable for diagnostic purposes.

Health is diagnostic only. A health check must not be a prerequisite for a valid report upload. The upload endpoint remains the source of truth.

## Troubleshooting

If `curl http://<PC-LAN-IP>:8000/api/health` fails in WSL, fix the Laravel process before checking the phone. If it works in WSL but not from Windows or the phone, check the private-network firewall rules for TCP ports `8000` and `8081` and confirm both devices are on the same Wi-Fi network.

If the phone can open the Metro URL but the app reports the API as unavailable, check `EXPO_PUBLIC_API_BASE_URL` and restart the development build after changing it. If the app refuses the `http` LAN URL on first launch, the Android build may need one manifest cleartext-traffic flag.

Never commit a LAN address, bearer token, credential, local environment file, or production configuration.
