-- Repair assignments left open by the previous completion implementation.
UPDATE DriverProfile SET isAvailable = 1
WHERE id IN (SELECT driverId FROM DriverAssignment WHERE status = 'ACCEPTED' AND deliveryId IN (SELECT id FROM Delivery WHERE status = 'COMPLETED'))
AND id NOT IN (SELECT driverId FROM DriverAssignment WHERE status = 'ACCEPTED' AND deliveryId IN (SELECT id FROM Delivery WHERE status != 'COMPLETED'));
UPDATE DriverAssignment SET status = 'COMPLETED'
WHERE status = 'ACCEPTED' AND deliveryId IN (SELECT id FROM Delivery WHERE status = 'COMPLETED');
UPDATE Delivery SET pickupOtp = '', deliveryOtp = '' WHERE status IN ('COMPLETED', 'EXPIRED', 'DELIVERY_FAILED');
UPDATE OTPVerification SET submittedOtp = '[REDACTED]';
