import { RequestHandler } from 'express';
import { AuthenticatedUser } from './auth';
import { prisma } from '../lib/prisma';

export const deliveryInclude = {
  allocation: { include: { donation: { include: { donor: true } }, receiver: true } },
  driverAssignments: { where: { status: 'ACCEPTED' as const }, include: { driver: true } },
};
export function isTransporter(delivery: any, user?: AuthenticatedUser): boolean {
  if (!user) return false;
  return (delivery.deliveryMode === 'PLATFORM_DRIVER' && user.role === 'DRIVER' &&
    delivery.driverAssignments?.some((a: any) => a.status === 'ACCEPTED' && a.driverId === user.driverProfile?.id)) ||
    (delivery.deliveryMode === 'RECEIVER_LOGISTICS' && user.role === 'RECEIVER' && delivery.allocation.receiverId === user.receiverProfile?.id);
}
export function canReadDelivery(delivery: any, user?: AuthenticatedUser): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || delivery.allocation?.donation?.donorId === user.donorProfile?.id ||
    delivery.allocation?.receiverId === user.receiverProfile?.id || isTransporter(delivery, user);
}
export const authorizeDelivery = (action: 'read' | 'transport' | 'switch'): RequestHandler => async (req, res, next) => {
  try {
    const delivery = await prisma.delivery.findUnique({ where: { id: req.params.id }, include: deliveryInclude });
    const allowed = delivery && (action === 'read' ? canReadDelivery(delivery, req.user) : action === 'transport' ? isTransporter(delivery, req.user) :
      req.user?.role === 'RECEIVER' && delivery.allocation.receiverId === req.user.receiverProfile?.id);
    if (!allowed) return void res.status(404).json({ error: 'Delivery not found' });
    next();
  } catch (err) { next(err); }
};
