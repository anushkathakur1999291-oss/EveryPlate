-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriverClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "DriverClaim_deliveryId_status_closesAt_idx" ON "DriverClaim"("deliveryId", "status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverClaim_deliveryId_driverId_closesAt_key" ON "DriverClaim"("deliveryId", "driverId", "closesAt");

-- CreateIndex
CREATE INDEX "CapacityReservation_receiverId_status_idx" ON "CapacityReservation"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Delivery_status_deliveryMode_createdAt_idx" ON "Delivery"("status", "deliveryMode", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryId_timestamp_idx" ON "DeliveryEvent"("deliveryId", "timestamp");

-- CreateIndex
CREATE INDEX "Donation_donorId_createdAt_idx" ON "Donation"("donorId", "createdAt");

-- CreateIndex
CREATE INDEX "Donation_status_safeDeadline_idx" ON "Donation"("status", "safeDeadline");

-- CreateIndex
CREATE INDEX "DonationAllocation_donationId_status_idx" ON "DonationAllocation"("donationId", "status");

-- CreateIndex
CREATE INDEX "DonationAllocation_receiverId_createdAt_idx" ON "DonationAllocation"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverAssignment_driverId_status_idx" ON "DriverAssignment"("driverId", "status");

-- CreateIndex
CREATE INDEX "DriverAssignment_deliveryId_status_idx" ON "DriverAssignment"("deliveryId", "status");

-- CreateIndex
CREATE INDEX "ImpactRecord_completedAt_idx" ON "ImpactRecord"("completedAt");

-- CreateIndex
CREATE INDEX "LocationEvent_deliveryId_timestamp_idx" ON "LocationEvent"("deliveryId", "timestamp");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "OTPVerification_deliveryId_otpType_isSuccessful_idx" ON "OTPVerification"("deliveryId", "otpType", "isSuccessful");


-- At most one accepted assignment per delivery and per driver, including across processes.
CREATE UNIQUE INDEX "DriverAssignment_one_active_delivery" ON "DriverAssignment"("deliveryId") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "DriverAssignment_one_active_driver" ON "DriverAssignment"("driverId") WHERE "status" = 'ACCEPTED';

CREATE TRIGGER "ReceiverProfile_capacity_insert" BEFORE INSERT ON "ReceiverProfile"
WHEN NEW.maxCapacity < 0 OR NEW.currentOccupancy < 0 OR NEW.reservedIncomingQuantity < 0 OR NEW.currentOccupancy + NEW.reservedIncomingQuantity > NEW.maxCapacity
BEGIN SELECT RAISE(ABORT, 'Invalid receiver capacity'); END;
CREATE TRIGGER "ReceiverProfile_capacity_update" BEFORE UPDATE ON "ReceiverProfile"
WHEN NEW.maxCapacity < 0 OR NEW.currentOccupancy < 0 OR NEW.reservedIncomingQuantity < 0 OR NEW.currentOccupancy + NEW.reservedIncomingQuantity > NEW.maxCapacity
BEGIN SELECT RAISE(ABORT, 'Invalid receiver capacity'); END;
CREATE TRIGGER "DonationAllocation_quantity_insert" BEFORE INSERT ON "DonationAllocation"
WHEN NEW.allocatedQuantity <= 0 OR (NEW.status NOT IN ('REJECTED','CANCELLED') AND NEW.allocatedQuantity + COALESCE((SELECT SUM(allocatedQuantity) FROM DonationAllocation WHERE donationId = NEW.donationId AND status NOT IN ('REJECTED','CANCELLED')), 0) > (SELECT quantity FROM Donation WHERE id = NEW.donationId))
BEGIN SELECT RAISE(ABORT, 'Allocation exceeds donation quantity'); END;
CREATE TRIGGER "DonationAllocation_quantity_update" BEFORE UPDATE ON "DonationAllocation"
WHEN NEW.allocatedQuantity <= 0 OR (NEW.status NOT IN ('REJECTED','CANCELLED') AND NEW.allocatedQuantity + COALESCE((SELECT SUM(allocatedQuantity) FROM DonationAllocation WHERE donationId = NEW.donationId AND id != NEW.id AND status NOT IN ('REJECTED','CANCELLED')), 0) > (SELECT quantity FROM Donation WHERE id = NEW.donationId))
BEGIN SELECT RAISE(ABORT, 'Allocation exceeds donation quantity'); END;
CREATE TRIGGER "Donation_quantity_update" BEFORE UPDATE OF quantity ON "Donation"
WHEN NEW.quantity <= 0 OR NEW.quantity < COALESCE((SELECT SUM(allocatedQuantity) FROM DonationAllocation WHERE donationId = NEW.id AND status NOT IN ('REJECTED','CANCELLED')), 0)
BEGIN SELECT RAISE(ABORT, 'Donation quantity conflicts with allocations'); END;
