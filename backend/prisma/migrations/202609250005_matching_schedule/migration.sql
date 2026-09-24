ALTER TABLE Donation ADD COLUMN nextMatchAttemptAt DATETIME;
ALTER TABLE DriverProfile ADD COLUMN locationUpdatedAt DATETIME;
CREATE INDEX Donation_status_nextMatchAttemptAt_safeDeadline_idx ON Donation(status,nextMatchAttemptAt,safeDeadline);
-- Claims cannot reference deleted/nonexistent resources, even outside Prisma.
CREATE TRIGGER DriverClaim_valid_insert BEFORE INSERT ON DriverClaim
WHEN NOT EXISTS (SELECT 1 FROM Delivery WHERE id = NEW.deliveryId) OR NOT EXISTS (SELECT 1 FROM DriverProfile WHERE id = NEW.driverId)
BEGIN SELECT RAISE(ABORT, 'Claim references missing resource'); END;
CREATE TRIGGER DriverClaim_delivery_delete AFTER DELETE ON Delivery
BEGIN DELETE FROM DriverClaim WHERE deliveryId = OLD.id; END;
CREATE TRIGGER DriverClaim_driver_delete AFTER DELETE ON DriverProfile
BEGIN DELETE FROM DriverClaim WHERE driverId = OLD.id; END;
