import { EventEmitter } from "node:events";

export interface LocationUpdate {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  stale: boolean;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishLocation(update: LocationUpdate): void { emitter.emit(update.vehicleId, update); }
export function subscribeLocation(vehicleId: string, listener: (update: LocationUpdate) => void): () => void {
  emitter.on(vehicleId, listener);
  return () => emitter.off(vehicleId, listener);
}
