import { demoMode } from '../config/runtime';
import { authorizeDelivery } from '../middleware/access';
import { validate, schemas } from '../middleware/validation';
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { DonationController } from '../controllers/donation.controller';
import { ReceiverController } from '../controllers/receiver.controller';
import { DriverController } from '../controllers/driver.controller';
import { DeliveryController } from '../controllers/delivery.controller';
import { ImpactController } from '../controllers/impact.controller';
import { AIController } from '../controllers/ai.controller';
import { requireRole } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

// 1. Auth & Users
router.post('/auth/login', AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/config', (_req, res) => res.json({ demoMode }));
router.get('/auth/users', AuthController.getUsers);
router.get('/auth/me', AuthController.getMe);
router.use(requireRole());

// 2. Donations (Donor operations)
router.post('/donations', requireRole(Role.DONOR), validate(schemas.donation), DonationController.createDonation);
router.get('/donations/my', requireRole(Role.DONOR), DonationController.getMyDonations);
router.get('/donations/:id', DonationController.getDonationById);
router.get('/donations/deliveries/:deliveryId/pickup-otp', DonationController.getPickupOtp);

// 3. Receivers & Allocations
router.get('/receivers/my/allocations', requireRole(Role.RECEIVER), ReceiverController.getMyAllocations);
router.post('/allocations/:id/accept', requireRole(Role.RECEIVER), ReceiverController.acceptAllocation);
router.post('/allocations/:id/reject', requireRole(Role.RECEIVER), validate(schemas.reason), ReceiverController.rejectAllocation);
router.post('/allocations/:id/fulfillment', requireRole(Role.RECEIVER), validate(schemas.fulfillment), ReceiverController.selectFulfillmentMethod);
router.get('/receivers/deliveries/:deliveryId/delivery-otp', ReceiverController.getDeliveryOtp);

// 4. Drivers (Platform Driver operations)
router.patch('/drivers/my/location', requireRole(Role.DRIVER), validate(schemas.coordinates), DriverController.updateLocation);
router.get('/drivers/available-jobs', requireRole(Role.DRIVER), DriverController.getAvailableJobs);
router.get('/drivers/my-jobs', requireRole(Role.DRIVER), DriverController.getMyJobs);
router.post('/deliveries/:id/claim', requireRole(Role.DRIVER), validate(schemas.claim), DriverController.claimJob);
router.post('/deliveries/:id/cancel-claim', requireRole(Role.DRIVER), validate(schemas.reason), DriverController.cancelJob);

// 5. Deliveries & OTP Custody Handoff
router.post('/deliveries/:id/reissue-otp', requireRole(Role.DONOR, Role.RECEIVER), DeliveryController.reissueOtp);
router.get('/deliveries/:id', authorizeDelivery('read'), DeliveryController.getDeliveryDetails);
router.post('/deliveries/:id/verify-pickup-otp', authorizeDelivery('transport'), validate(schemas.otp), DeliveryController.verifyPickupOtp);
router.post('/deliveries/:id/verify-delivery-otp', authorizeDelivery('transport'), validate(schemas.otp), DeliveryController.verifyDeliveryOtp);
router.post('/deliveries/:id/switch-mode', authorizeDelivery('switch'), validate(schemas.switch), DeliveryController.switchMode);

// 6. Impact & Admin Monitoring
router.get('/impact/summary', ImpactController.getImpactSummary);
router.get('/admin/dashboard', requireRole(Role.ADMIN), ImpactController.getAdminDashboard);

// 7. AI System-1 Decision Engine (Laya)
router.post('/ai/parse-donation', AIController.parseDonation);
router.post('/ai/recommend-mode', AIController.recommendMode);

export default router;
