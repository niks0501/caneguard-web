import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre 6's implicit sibling URL does not survive Vite chunking.
// Bundle its module worker and dependencies at a hashed, same-origin URL.
setWorkerUrl(workerUrl);
