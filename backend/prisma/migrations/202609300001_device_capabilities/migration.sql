ALTER TABLE "Device"
ADD COLUMN "vehicleId" UUID,
ADD COLUMN "allowedEventTypes" "CheckpointEventType"[] NOT NULL DEFAULT ARRAY[]::"CheckpointEventType"[];

CREATE INDEX "Device_vehicleId_idx" ON "Device"("vehicleId");

ALTER TABLE "Device"
ADD CONSTRAINT "Device_vehicleId_fkey"
FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
