-- Additive migration preserves custom indexes/triggers and existing custody history.
ALTER TABLE Delivery ADD COLUMN pickupOtpVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Delivery ADD COLUMN deliveryOtpVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Delivery ADD COLUMN pickupOtpReissuedAt DATETIME;
ALTER TABLE Delivery ADD COLUMN deliveryOtpReissuedAt DATETIME;
ALTER TABLE OTPVerification ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
DROP INDEX OTPVerification_deliveryId_otpType_isSuccessful_idx;
CREATE INDEX OTPVerification_deliveryId_otpType_generation_isSuccessful_idx ON OTPVerification(deliveryId,otpType,generation,isSuccessful);
