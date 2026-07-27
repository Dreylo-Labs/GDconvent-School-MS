CREATE TABLE "TransportVehicle" (
  "id" TEXT NOT NULL,
  "vehicleNo" TEXT NOT NULL,
  "registrationNo" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "driverName" TEXT NOT NULL,
  "driverPhone" TEXT NOT NULL,
  "attendantName" TEXT,
  "attendantPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportRoute" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vehicleId" TEXT,
  "morningStart" TEXT,
  "afternoonStart" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportStop" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "pickupTime" TEXT,
  "dropTime" TEXT,
  "landmark" TEXT,
  CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentTransportAssignment" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "stopId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentTransportAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportVehicle_vehicleNo_key" ON "TransportVehicle"("vehicleNo");
CREATE UNIQUE INDEX "TransportVehicle_registrationNo_key" ON "TransportVehicle"("registrationNo");
CREATE INDEX "TransportVehicle_type_status_idx" ON "TransportVehicle"("type", "status");
CREATE UNIQUE INDEX "TransportRoute_code_key" ON "TransportRoute"("code");
CREATE INDEX "TransportRoute_vehicleId_status_idx" ON "TransportRoute"("vehicleId", "status");
CREATE UNIQUE INDEX "TransportStop_routeId_sequence_key" ON "TransportStop"("routeId", "sequence");
CREATE INDEX "TransportStop_routeId_name_idx" ON "TransportStop"("routeId", "name");
CREATE UNIQUE INDEX "StudentTransportAssignment_studentId_key" ON "StudentTransportAssignment"("studentId");
CREATE INDEX "StudentTransportAssignment_routeId_status_idx" ON "StudentTransportAssignment"("routeId", "status");
CREATE INDEX "StudentTransportAssignment_stopId_idx" ON "StudentTransportAssignment"("stopId");

ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentTransportAssignment" ADD CONSTRAINT "StudentTransportAssignment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentTransportAssignment" ADD CONSTRAINT "StudentTransportAssignment_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentTransportAssignment" ADD CONSTRAINT "StudentTransportAssignment_stopId_fkey"
  FOREIGN KEY ("stopId") REFERENCES "TransportStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
