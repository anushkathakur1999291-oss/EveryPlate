import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { allowedOrigins } from '../../config/runtime';
import { resolveIdentity } from '../auth/auth.service';
import { prisma } from '../../lib/prisma';
import { canReadDelivery, deliveryInclude, isTransporter } from '../../middleware/access';

export class SocketService {
  private static io: SocketIOServer | null = null;
  static initialize(server: HttpServer) {
    const io = this.io = new SocketIOServer(server, { cors: { origin: allowedOrigins, credentials: true }, maxHttpBufferSize: 8192 });
    io.use(async (socket, next) => {
      try {
        const origin = socket.handshake.headers.origin;
        if (origin && !allowedOrigins.includes(origin)) return next(new Error('Origin not allowed'));
        const user = await resolveIdentity(socket.handshake.headers.cookie, socket.handshake.auth?.userId);
        if (!user) return next(new Error('Authentication required'));
        socket.data.user = user;
        next();
      } catch { next(new Error('Authentication unavailable')); }
    });
    io.on('connection', socket => {
      const user = socket.data.user;
      socket.join([`user:${user.id}`, `role:${user.role}`]);
      // Rooms belong to the authenticated identity, never to caller-selected roles.
      const recheck = setInterval(async () => {
        try { if (!await resolveIdentity(socket.handshake.headers.cookie, socket.handshake.auth?.userId)) socket.disconnect(true); }
        catch { socket.disconnect(true); }
      }, 30000);
      recheck.unref();
      socket.on('disconnect', () => clearInterval(recheck));
      socket.on('join:delivery', async (id: unknown) => {
        if (typeof id !== 'string' || id.length > 100) return;
        try {
          const delivery = await prisma.delivery.findUnique({ where: { id }, include: deliveryInclude });
          if (delivery && canReadDelivery(delivery, user)) socket.join(`delivery:${id}`);
        } catch { socket.emit('SYNC_REQUIRED'); }
      });
      socket.on('join:donation', async (id: unknown) => {
        if (typeof id !== 'string' || id.length > 100) return;
        try {
          const donation = await prisma.donation.findUnique({ where: { id }, include: { donor: true } });
          if (donation && (donation.donor.userId === user.id || user.role === 'ADMIN')) socket.join(`donation:${id}`);
        } catch { socket.emit('SYNC_REQUIRED'); }
      });
      let lastLocation = 0;
      socket.on('driver:location', async (data: any) => {
        if (Date.now() - lastLocation < 5000) return;
        lastLocation = Date.now();
        if (typeof data?.deliveryId !== 'string' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90 || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180) return;
        try {
          const delivery = await prisma.delivery.findUnique({ where: { id: data.deliveryId }, include: deliveryInclude });
          if (!delivery || !isTransporter(delivery, user) || !['DRIVER_ASSIGNED','RECEIVER_LOGISTICS_ASSIGNED','EN_ROUTE_TO_PICKUP','PICKED_UP','EN_ROUTE_TO_RECEIVER'].includes(delivery.status)) return;
          await prisma.locationEvent.create({ data: { deliveryId: delivery.id, latitude: data.latitude, longitude: data.longitude, source: delivery.deliveryMode } });
          // Exact moving location goes only to operational receiver/admin, never to old room members.
          io.to([`user:${delivery.allocation.receiver.userId}`, 'role:ADMIN']).emit('DRIVER_LOCATION_UPDATE', { deliveryId: delivery.id, latitude: data.latitude, longitude: data.longitude });
        } catch { socket.emit('SYNC_REQUIRED'); }
      });
    });
    return io;
  }
  static getIO() { if (!this.io) throw new Error('Socket server not initialized'); return this.io; }
  static disconnectUser(id: string) { this.io?.in(`user:${id}`).disconnectSockets(true); }
  // Events are small invalidation hints. REST is the authoritative, privacy-filtered snapshot.
  private static async notify(event: string, resource: { deliveryId?: string; donationId?: string; allocationId?: string }, drivers = false) {
    if (!this.io) return;
    try {
      let donationId = resource.donationId;
      if (resource.deliveryId) {
        const delivery = await prisma.delivery.findUnique({ where: { id: resource.deliveryId }, select: { allocation: { select: { donationId: true } } } });
        donationId = delivery?.allocation.donationId;
      }
      if (!donationId && resource.allocationId) donationId = (await prisma.donationAllocation.findUnique({ where: { id: resource.allocationId } }))?.donationId;
      const rooms = new Set(['role:ADMIN']);
      if (drivers) rooms.add('role:DRIVER');
      if (donationId) {
        const donation = await prisma.donation.findUnique({ where: { id: donationId }, include: { donor: true, allocations: { include: { receiver: true, delivery: { include: { driverAssignments: { where: { status: 'ACCEPTED' }, include: { driver: true } } } } } } } });
        if (donation) {
          rooms.add(`user:${donation.donor.userId}`);
          for (const a of donation.allocations) {
            rooms.add(`user:${a.receiver.userId}`);
            for (const assignment of a.delivery?.driverAssignments || []) rooms.add(`user:${assignment.driver.userId}`);
          }
        }
      }
      this.io.to([...rooms]).emit(event, { id: resource.deliveryId || resource.allocationId || donationId, ...resource, donationId });
    } catch { console.error(JSON.stringify({ level: 'error', event: 'REALTIME_INVALIDATION_FAILED', type: event })); }
  }
  static emitDonationCreated(d: any) { void this.notify('DONATION_CREATED', { donationId: d.id }); }
  static emitMatchFound(_user: string, a: any) { void this.notify('MATCH_FOUND', { allocationId: a.id }); }
  static emitAllocationAccepted(id: string, a: any) { void this.notify('MATCH_ACCEPTED', { donationId: id, allocationId: a.id }); }
  static emitAllocationRejected(id: string, a: any, _summary?: any) { void this.notify('MATCH_REJECTED', { donationId: id, allocationId: a.id }); }
  static emitDriverRequested(d: any) { void this.notify('DRIVER_REQUESTED', { deliveryId: d.id }, true); }
  static emitDriverAssigned(d: any, _driver: string, _receiver?: string) { void this.notify('DRIVER_ASSIGNED', { deliveryId: d.id }, true); }
  static emitDriverCancelled(id: string, _reason: string, _receiver?: string) { void this.notify('DRIVER_CANCELLED', { deliveryId: id }, true); }
  static emitReceiverLogisticsSelected(d: any) { void this.notify('RECEIVER_LOGISTICS_SELECTED', { deliveryId: d.id }, true); }
  static emitPickupVerified(d: any, _donor?: string, _receiver?: string) { void this.notify('PICKUP_VERIFIED', { deliveryId: d.id }); }
  static emitDeliveryVerified(d: any, _impact: any, _donor?: string, _receiver?: string) {
    void this.notify('DELIVERY_VERIFIED', { deliveryId: d.id });
    this.io?.to('role:ADMIN').emit('IMPACT_UPDATED', {});
  }
}
