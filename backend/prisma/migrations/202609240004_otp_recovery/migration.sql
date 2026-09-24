-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "allocationId" TEXT NOT NULL,
    "deliveryMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_DISPATCH',
    "pickupOtp" TEXT NOT NULL,
    "deliveryOtp" TEXT NOT NULL,
    "pickupOtpVersion" INTEGER NOT NULL DEFAULT 1,
    "deliveryOtpVersion" INTEGER NOT NULL DEFAULT 1,
    "pickupOtpReissuedAt" DATETIME,
    "deliveryOtpReissuedAt" DATETIME,
    "pickupVerifiedAt" DATETIME,
    "deliveryVerifiedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Delivery_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "DonationAllocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Delivery" ("allocationId", "completedAt", "createdAt", "deliveryMode", "deliveryOtp", "deliveryVerifiedAt", "id", "pickupOtp", "pickupVerifiedAt", "startedAt", "status", "updatedAt") SELECT "allocationId", "completedAt", "createdAt", "deliveryMode", "deliveryOtp", "deliveryVerifiedAt", "id", "pickupOtp", "pickupVerifiedAt", "startedAt", "status", "updatedAt" FROM "Delivery";
DROP TABLE "Delivery";
ALTER TABLE "new_Delivery" RENAME TO "Delivery";
CREATE UNIQUE INDEX "Delivery_allocationId_key" ON "Delivery"("allocationId");
CREATE INDEX "Delivery_status_deliveryMode_createdAt_idx" ON "Delivery"("status", "deliveryMode", "createdAt");
CREATE TABLE "new_OTPVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "otpType" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "submittedOtp" TEXT NOT NULL,
    "isSuccessful" BOOLEAN NOT NULL,
    "verifiedByUserId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OTPVerification_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OTPVerification" ("deliveryId", "id", "isSuccessful", "otpType", "submittedOtp", "timestamp", "verifiedByUserId") SELECT "deliveryId", "id", "isSuccessful", "otpType", "submittedOtp", "timestamp", "verifiedByUserId" FROM "OTPVerification";
DROP TABLE "OTPVerification";
ALTER TABLE "new_OTPVerification" RENAME TO "OTPVerification";
CREATE INDEX "OTPVerification_deliveryId_otpType_generation_isSuccessful_idx" ON "OTPVerification"("deliveryId", "otpType", "generation", "isSuccessful");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

