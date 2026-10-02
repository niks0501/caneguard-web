type MapImageRegistry = {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: { width: number; height: number; data: Uint8Array }) => void;
};

/** Provide a tiny neutral fallback so an optional sprite entry cannot break the map style. */
export function registerMissingMapImage(
  map: MapImageRegistry,
  id: string,
): void {
  if (map.hasImage(id)) return;
  map.addImage(id, {
    width: 1,
    height: 1,
    data: new Uint8Array([45, 107, 64, 255]),
  });
}
