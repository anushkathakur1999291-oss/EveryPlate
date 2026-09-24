import { PrismaClient, OTPType } from '@prisma/client';
import { OtpService } from './otp.service';
import { DomainError } from '../../lib/errors';

export class OtpRecoveryService {
  constructor(private prisma: PrismaClient) {}
  async reissue(deliveryId: string, stage: OTPType, actorUserId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE Delivery SET id = id WHERE id = ${deliveryId}`;
      const delivery = await tx.delivery.findUnique({ where: { id: deliveryId }, include: { allocation: { include: { donation: { include: { donor: true } }, receiver: true } } } });
      if (!delivery) throw new DomainError('Delivery not found',404);
      const owner = stage === 'PICKUP' ? delivery.allocation.donation.donor.userId : delivery.allocation.receiver.userId;
      if (owner !== actorUserId) throw new DomainError('Delivery not found',404);
      if (['COMPLETED','EXPIRED','DELIVERY_FAILED'].includes(delivery.status) || delivery.allocation.donation.safeDeadline <= new Date() || (stage === 'PICKUP' ? delivery.pickupVerifiedAt : delivery.deliveryVerifiedAt)) throw new DomainError('This custody stage is no longer available for a replacement code');
      const version = stage === 'PICKUP' ? delivery.pickupOtpVersion : delivery.deliveryOtpVersion;
      const lastReissued = stage === 'PICKUP' ? delivery.pickupOtpReissuedAt : delivery.deliveryOtpReissuedAt;
      if (version >= 3) throw new DomainError('The replacement-code limit has been reached. Contact your coordinator.',429,'OTP_RECOVERY_LIMIT');
      if (lastReissued && Date.now()-lastReissued.getTime()<60000) throw new DomainError('Wait one minute before replacing this code again.',429,'OTP_RECOVERY_COOLDOWN');
      const otp = OtpService.generateOtp();
      const sealed = OtpService.seal(otp,`${delivery.allocationId}:${stage}`,delivery.allocation.donation.safeDeadline);
      await tx.delivery.update({ where: { id: deliveryId }, data: stage === 'PICKUP' ? { pickupOtp: sealed, pickupOtpVersion: version+1, pickupOtpReissuedAt: new Date() } : { deliveryOtp: sealed, deliveryOtpVersion: version+1, deliveryOtpReissuedAt: new Date() } });
      await tx.deliveryEvent.create({ data: { deliveryId, fromStatus: delivery.status, toStatus: delivery.status, actorId: actorUserId, actorRole: stage === 'PICKUP' ? 'DONOR' : 'RECEIVER', metadata: JSON.stringify({event:'OTP_REISSUED',stage,generation:version+1}) } });
      return { deliveryId, otp, expiresAt: delivery.allocation.donation.safeDeadline };
    });
  }
}
