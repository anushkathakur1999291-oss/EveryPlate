import { Dialog } from '../../components/Dialog';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent, useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';
import { RescueMap, MapPoint, MapRoute } from '../../components/RescueMap';
import { Truck, MapPin, Navigation, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export const DriverPortal: React.FC = () => {
  const [actionError, setActionError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPending, setCancelPending] = useState(false);
  const { currentUser, demoMode, refreshUsers } = useAuth();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const { joinDelivery } = useSocket();
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // OTP Submission inputs
  const [pickupOtpInputs, setPickupOtpInputs] = useState<Record<string, string>>({});
  const [deliveryOtpInputs, setDeliveryOtpInputs] = useState<Record<string, string>>({});

  const driverProfile = currentUser?.driverProfile;

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const [avail, active] = await Promise.all([
        api.getAvailableJobs(),
        api.getMyJobs(),
      ]);
      setAvailableJobs(avail.items);
      setNextCursor(avail.nextCursor);
      setMyJobs(active);
      active.forEach((j) => {
        if (j.delivery?.id) joinDelivery(j.delivery.id);
      });
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [currentUser]);

  useSocketEvent('connect', () => fetchJobs());
  useSocketEvent('SYNC_REQUIRED', () => fetchJobs());
  // Real-time events
  useSocketEvent('RECEIVER_LOGISTICS_SELECTED', () => fetchJobs());
  useSocketEvent('DONATION_CREATED', () => fetchJobs());
  useSocketEvent('DRIVER_REQUESTED', () => fetchJobs());
  useSocketEvent('DRIVER_ASSIGNED', () => fetchJobs());
  useSocketEvent('DRIVER_CANCELLED', () => fetchJobs());
  useSocketEvent('PICKUP_VERIFIED', () => fetchJobs());
  useSocketEvent('DELIVERY_VERIFIED', () => fetchJobs());

  const updateLocation = async () => {
    try {
      const position = await new Promise<GeolocationPosition>((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:30000}));
      await api.updateDriverLocation({latitude:position.coords.latitude,longitude:position.coords.longitude});
      await refreshUsers(); await fetchJobs();
    } catch { setActionError('Allow location access to find pickups near you. New matches may take up to one minute.'); }
  };
  const handleClaimJob = async (deliveryId: string) => {
    try {
      setClaimingId(deliveryId);
      const coords = demoMode && driverProfile?.currentLatitude != null && driverProfile.currentLongitude != null
        ? { latitude: driverProfile.currentLatitude, longitude: driverProfile.currentLongitude }
        : await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('This browser does not support location. Use a location-enabled browser to accept a pickup.'));
          navigator.geolocation.getCurrentPosition(p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => reject(new Error('Allow location access to calculate a safe pickup route.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
        });
      await api.claimJob(deliveryId, coords);
      await refreshUsers();
      await fetchJobs();
    } catch (err: any) {
      setActionError(`Claim failed: ${err.message}`);
    } finally { setClaimingId(null); }
  };

  const handleCancelJob = (id: string) => { setCancellingId(id); setCancelReason(''); };
  const confirmCancellation = async () => {
    if (!cancellingId || !cancelReason.trim()) return;
    setCancelPending(true);
    try { await api.cancelJob(cancellingId, cancelReason); setCancellingId(null); await fetchJobs(); }
    catch (err) { setActionError((err as Error).message); }
    finally { setCancelPending(false); }
  };

  const handleVerifyPickupOtp = async (deliveryId: string) => {
    const otp = pickupOtpInputs[deliveryId];
    if (!otp) return setActionError('Enter the 6-digit Pickup OTP provided by the donor');

    try {
      await api.verifyPickupOtp(deliveryId, otp);
      setPickupOtpInputs((prev) => ({ ...prev, [deliveryId]: '' }));
      await fetchJobs();
    } catch (err: any) {
      setActionError(`Pickup verification failed: ${err.message}`);
    }
  };

  const handleVerifyDeliveryOtp = async (deliveryId: string) => {
    const otp = deliveryOtpInputs[deliveryId];
    if (!otp) return setActionError('Enter the 6-digit Delivery OTP provided by the receiver');

    try {
      await api.verifyDeliveryOtp(deliveryId, otp);
      setDeliveryOtpInputs((prev) => ({ ...prev, [deliveryId]: '' }));
      await fetchJobs();
    } catch (err: any) {
      setActionError(`Delivery verification failed: ${err.message}`);
    }
  };

  // Map points and routes for courier navigation
  const driverLat = driverProfile?.currentLatitude;
  const driverLng = driverProfile?.currentLongitude;

  const mapPoints: MapPoint[] = driverLat != null && driverLng != null ? [
    {
      id: `driver-me`,
      name: `My Location (${driverProfile?.fullName || 'Courier'})`,
      latitude: driverLat,
      longitude: driverLng,
      type: 'DRIVER',
      info: `Current Position • Vehicle: ${driverProfile?.vehicleType}`,
    },
  ] : [];

  const mapRoutes: MapRoute[] = [];

  myJobs.forEach((j) => {
    const del = j.delivery;
    const don = del?.allocation?.donation;
    const recv = del?.allocation?.receiver;
    if (don && recv) {
      mapPoints.push({
        id: `donor-${don.id}`,
        name: don.donor?.organizationName || 'Pickup Location',
        latitude: don.pickupLatitude,
        longitude: don.pickupLongitude,
        type: 'DONOR',
        info: `Pickup: ${don.pickupAddress}`,
      });
      mapPoints.push({
        id: `recv-${recv.id}`,
        name: recv.organizationName,
        latitude: recv.latitude,
        longitude: recv.longitude,
        type: 'RECEIVER',
        info: `Delivery: ${recv.address}`,
      });
      mapRoutes.push({
        id: del.id,
        driverCoords: driverLat != null && driverLng != null ? [driverLat, driverLng] : undefined,
        donorCoords: [don.pickupLatitude, don.pickupLongitude],
        receiverCoords: [recv.latitude, recv.longitude],
        status: del.status,
        mode: del.deliveryMode,
      });
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {actionError && <div role="alert" className="form-error flex flex-wrap justify-between gap-3"><span>{actionError}</span><button onClick={() => { setActionError(''); fetchJobs(); }} className="underline">Retry</button></div>}
      {!demoMode && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600"><p>Share your location to help match safe, nearby pickups. Matches refresh within a minute.</p><button className="primary-button" onClick={updateLocation}>Update my location</button></div>}
      {/* Driver Header */}
      <div className="py-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold mb-1">
            <Truck className="w-4 h-4" />
            <span>Your delivery workspace</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-950">{driverProfile?.fullName || 'Driver'}</h1>
          <p className="text-xs text-stone-600 mt-1">
            Vehicle: <strong className="text-stone-800">{driverProfile?.vehicleType}</strong> • Status: <span className="text-emerald-800 font-semibold">{myJobs.length ? 'On a delivery' : 'Ready for a delivery'}</span>
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium border border-stone-300 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Jobs</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Available Open Jobs */}
        <div className={`space-y-4 ${myJobs.length ? 'order-2' : 'order-1'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200">
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-amber-800" />
              <span>Available pickups</span>
            </h2>
            <span className="text-xs text-stone-600">{availableJobs.length} open</span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-stone-500 text-xs">Scanning available jobs...</div>
          ) : availableJobs.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-600 text-xs">
              No platform delivery requests currently waiting. New requests broadcast here in real-time.
            </div>
          ) : (
            <div className="space-y-4">
              {availableJobs.map((job) => (
                <div key={job.deliveryId} className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-amber-500/20 text-amber-800 border border-amber-500/30">
                        {job.foodCategory?.replace('_', ' ')}
                      </span>
                      <h3 className="text-sm font-bold text-stone-950 mt-1.5">{job.foodDescription}</h3>
                      <div className="text-xs text-emerald-800 font-bold">{job.quantity} {job.unit}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-amber-800">{job.totalEtaMinutes == null ? 'Location needed' : `${job.totalEtaMinutes} min`}</div>
                      <div className="text-xs text-stone-500">Estimated total time</div>
                    </div>
                  </div>

                  {/* Route Summary */}
                  <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-stone-700">
                      <MapPin className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                      <div>
                        Pickup: <strong>{job.donorName}</strong> ({job.donorAddress})
                        <span className="text-xs text-stone-500 ml-2">{job.distanceToPickupKm == null ? 'Share your location when accepting' : `~${job.distanceToPickupKm} km (${job.etaToPickupMinutes}m away)`}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-stone-700">
                      <MapPin className="w-3.5 h-3.5 text-stone-700 shrink-0" />
                      <div>
                        Delivery: <strong>{job.receiverName}</strong> ({job.receiverAddress})
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={!!claimingId || myJobs.length > 0}
                    onClick={() => handleClaimJob(job.deliveryId)}
                    className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-lg text-xs shadow-none shadow-none transition flex items-center justify-center gap-2"
                  >
                    <span>{claimingId === job.deliveryId ? 'Comparing available couriers…' : myJobs.length ? 'Finish your current delivery first' : 'Accept pickup'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Claimed Deliveries */}
        <div className={`space-y-4 ${myJobs.length ? 'order-1' : 'order-2'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200">
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-800" />
              <span>Your current delivery</span>
            </h2>
            <span className="text-xs text-stone-600">{myJobs.length} active</span>
          </div>

          {myJobs.length > 0 && (
            <div className="mb-4">
              <RescueMap points={mapPoints} routes={mapRoutes} height="260px" />
            </div>
          )}

          {myJobs.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-600 text-xs">
              You have no active claimed deliveries. Accept an available pickup to begin.
            </div>
          ) : (
            <div className="space-y-4">
              {myJobs.map((item) => {
                const delivery = item.delivery;
                const isPickedUp = !!delivery.pickupVerifiedAt;
                const isCompleted = !!delivery.deliveryVerifiedAt;

                return (
                  <div key={item.id} className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-semibold text-stone-600">
                          Delivery #{delivery.id.slice(0, 8)}
                        </span>
                        <h3 className="text-sm font-bold text-stone-950 mt-0.5">
                          {delivery.allocation?.donation?.foodDescription}
                        </h3>
                        <div className="text-xs text-emerald-800 font-bold">
                          {delivery.allocation?.allocatedQuantity} meals
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-800 border border-emerald-500/30">
                        {delivery.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Step 1: Donor Pickup */}
                    <div className={`p-4 rounded-lg border space-y-3 transition ${
                      !isPickedUp
                        ? 'bg-stone-50 border-emerald-500/40 shadow-none'
                        : 'bg-stone-50/40 border-stone-200 opacity-70'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-stone-950 flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                            isPickedUp ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-emerald-800'
                          }`}>
                            1
                          </span>
                          <span>Pickup at {delivery.allocation?.donation?.donor?.organizationName}</span>
                        </div>
                        {isPickedUp && <CheckCircle2 className="w-4 h-4 text-emerald-800" />}
                      </div>

                      <div className="text-xs text-stone-700 pl-7">
                        Address: {delivery.allocation?.donation?.pickupAddress}
                      </div>

                      {!isPickedUp && (
                        <div className="sm:pl-7 flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="text"
                            aria-label="Pickup verification code" inputMode="numeric" autoComplete="one-time-code" placeholder="Pickup code"
                            value={pickupOtpInputs[delivery.id] || ''}
                            onChange={(e) =>
                              setPickupOtpInputs({ ...pickupOtpInputs, [delivery.id]: e.target.value })
                            }
                            maxLength={6}
                            className="bg-white border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2 w-44 font-mono font-bold tracking-widest text-center focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => handleVerifyPickupOtp(delivery.id)}
                            className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-4 py-2 rounded-lg text-xs transition"
                          >
                            Verify Pickup
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Step 2: Receiver Delivery */}
                    <div className={`p-4 rounded-lg border space-y-3 transition ${
                      isPickedUp && !isCompleted
                        ? 'bg-stone-50 border-stone-300 shadow-none'
                        : 'bg-stone-50/40 border-stone-200 opacity-70'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-stone-950 flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                            isCompleted ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'
                          }`}>
                            2
                          </span>
                          <span>Deliver to {delivery.allocation?.receiver?.organizationName}</span>
                        </div>
                        {isCompleted && <CheckCircle2 className="w-4 h-4 text-stone-700" />}
                      </div>

                      <div className="text-xs text-stone-700 pl-7">
                        Address: {delivery.allocation?.receiver?.address}
                      </div>

                      {isPickedUp && !isCompleted && (
                        <div className="sm:pl-7 flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="text"
                            aria-label="Delivery verification code" inputMode="numeric" autoComplete="one-time-code" placeholder="Delivery code"
                            value={deliveryOtpInputs[delivery.id] || ''}
                            onChange={(e) =>
                              setDeliveryOtpInputs({ ...deliveryOtpInputs, [delivery.id]: e.target.value })
                            }
                            maxLength={6}
                            className="bg-white border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2 w-44 font-mono font-bold tracking-widest text-center focus:outline-none focus:border-stone-300"
                          />
                          <button
                            onClick={() => handleVerifyDeliveryOtp(delivery.id)}
                            className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-4 py-2 rounded-lg text-xs transition"
                          >
                            Verify Delivery
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Driver Cancellation */}
                    {!isPickedUp && (
                      <button
                        onClick={() => handleCancelJob(delivery.id)}
                        className="text-xs text-rose-800 hover:text-rose-800 font-semibold pt-2 flex items-center gap-1.5 transition"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Cancel Delivery Claim (Requires Reason)</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {cancellingId && <Dialog label="Cancel delivery assignment" onClose={() => setCancellingId(null)}><form className="bg-white rounded-lg p-6 max-w-md w-full space-y-4" onSubmit={e => { e.preventDefault(); void confirmCancellation(); }}><h2 className="text-lg font-semibold">Release this delivery?</h2><p className="text-sm text-stone-600">The receiver will be notified and another courier can claim the pickup.</p><label className="block text-sm" htmlFor="cancel-reason">Reason for cancellation</label><input id="cancel-reason" required maxLength={500} className="border border-stone-300 rounded-md p-3 w-full" value={cancelReason} onChange={e => setCancelReason(e.target.value)}/><div className="flex gap-3"><button type="button" onClick={() => setCancellingId(null)}>Keep delivery</button><button disabled={cancelPending} className="primary-button">{cancelPending ? 'Releasing…' : 'Release delivery'}</button></div></form></Dialog>}
      {nextCursor && <button className="primary-button" onClick={async () => { try { const page = await api.getAvailableJobs(nextCursor); setAvailableJobs(previous => [...previous, ...page.items]); setNextCursor(page.nextCursor); } catch (err) { setActionError((err as Error).message); } }}>Load more pickups</button>}
    </div>
  );
};
