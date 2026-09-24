import { Dialog } from '../../components/Dialog';
import { OwnLogistics } from '../../components/OwnLogistics';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { api } from '../../services/api';
import { DonationAllocation, DeliveryMode, LayaDispatchRecommendation } from '../../types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { ShieldCheck, Truck, UserCheck, Key, CheckCircle, XCircle, RefreshCw, ArrowRightLeft, Sparkles } from 'lucide-react';

export const ReceiverPortal: React.FC = () => {
  const [actionError, setActionError] = useState('');
  const [isReplacingCode, setIsReplacingCode] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { currentUser, refreshUsers } = useAuth();
  const [allocations, setAllocations] = useState<DonationAllocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fulfillment selector modal
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('PLATFORM_DRIVER');
  const [driverName, setDriverName] = useState<string>('');
  const [vehicleInfo, setVehicleInfo] = useState<string>('');
  const [contactMechanism, setContactMechanism] = useState<string>('');
  const [aiRecommendation, setAiRecommendation] = useState<LayaDispatchRecommendation | null>(null);

  const [switchingDeliveryId, setSwitchingDeliveryId] = useState<string | null>(null);
  // Rejection modal
  const [rejectingAllocationId, setRejectingAllocationId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Delivery OTP Modal
  const [activeDeliveryOtp, setActiveDeliveryOtp] = useState<{ deliveryId: string; otp: string } | null>(null);

  const receiverProfile = currentUser?.receiverProfile;

  const fetchAllocations = async (cursor?: string) => {
    try {
      setIsLoading(true);
      const data = await api.getMyAllocations(cursor);
      setAllocations(previous => cursor ? [...previous, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, [currentUser]);

  useSocketEvent('connect', () => fetchAllocations());
  useSocketEvent('SYNC_REQUIRED', () => fetchAllocations());
  // Real-time updates
  useSocketEvent('MATCH_FOUND', () => { fetchAllocations(); refreshUsers(); });
  useSocketEvent('DONATION_CREATED', () => { fetchAllocations(); refreshUsers(); });
  useSocketEvent('MATCH_REJECTED', () => { fetchAllocations(); refreshUsers(); });
  useSocketEvent('RECEIVER_LOGISTICS_SELECTED', () => fetchAllocations());
  useSocketEvent('DRIVER_ASSIGNED', () => fetchAllocations());
  useSocketEvent('DRIVER_CANCELLED', () => fetchAllocations());
  useSocketEvent('PICKUP_VERIFIED', () => fetchAllocations());
  useSocketEvent('DELIVERY_VERIFIED', () => {
    fetchAllocations();
    refreshUsers(); // update occupancy
  });

  const handleAccept = async (id: string) => {
    try {
      await api.acceptAllocation(id);
      setSelectedAllocationId(id); // Prompt for fulfillment method immediately
      await fetchAllocations();
    } catch (err: any) {
      setActionError(`Accept failed: ${err.message}`);
    }
  };

  const handleReject = async () => {
    if (!rejectingAllocationId) return;
    try {
      await api.rejectAllocation(rejectingAllocationId, rejectionReason || 'Declined by receiver');
      setRejectingAllocationId(null);
      setRejectionReason('');
      await fetchAllocations();
      await refreshUsers();
    } catch (err: any) {
      setActionError(`Reject failed: ${err.message}`);
    }
  };

  const openFulfillmentModal = async (alloc: DonationAllocation) => {
    setSelectedAllocationId(alloc.id);
    setAiRecommendation(null);

    try {
      const rec = await api.getAIModeRecommendation({ allocationId: alloc.id });
      setAiRecommendation(rec);
      setDeliveryMode(rec.recommendedMode);
    } catch (err) {
      console.warn('Laya dispatch recommendation failed:', err);
    }
  };

  const handleConfirmFulfillment = async () => {
    if (!selectedAllocationId) return;
    try {
      const payload = {
        deliveryMode,
        driverName: deliveryMode === 'RECEIVER_LOGISTICS' ? driverName : undefined,
        vehicleInfo: deliveryMode === 'RECEIVER_LOGISTICS' ? vehicleInfo : undefined,
        contactMechanism: deliveryMode === 'RECEIVER_LOGISTICS' ? contactMechanism : undefined,
      };
      if (switchingDeliveryId) await api.switchDeliveryMode(switchingDeliveryId, { newMode: deliveryMode, driverName: payload.driverName, vehicleInfo: payload.vehicleInfo, contactMechanism: payload.contactMechanism });
      else await api.selectFulfillment(selectedAllocationId, payload);
      setSwitchingDeliveryId(null);
      setSelectedAllocationId(null);
      setDriverName('');
      setVehicleInfo('');
      setContactMechanism('');
      await fetchAllocations();
    } catch (err: any) {
      setActionError(`Fulfillment selection failed: ${err.message}`);
    }
  };

  const showDeliveryOtp = async (deliveryId: string) => {
    try {
      const res = await api.getDeliveryOtp(deliveryId);
      setActiveDeliveryOtp({ deliveryId, otp: res.deliveryOtp });
    } catch (err: any) {
      setActiveDeliveryOtp({ deliveryId, otp: '' });
      setActionError(`Could not load OTP: ${err.message}`);
    }
  };

  const handleSwitchMode = (deliveryId: string, currentMode: DeliveryMode) => {
    setSwitchingDeliveryId(deliveryId); setSelectedAllocationId('switch'); setAiRecommendation(null);
    setDeliveryMode(currentMode === 'PLATFORM_DRIVER' ? 'RECEIVER_LOGISTICS' : 'PLATFORM_DRIVER');
  };

  // Capacity calculations
  const maxCap = receiverProfile?.maxCapacity ?? 0;
  const currentOcc = receiverProfile?.currentOccupancy || 0;
  const reserved = receiverProfile?.reservedIncomingQuantity || 0;
  const available = Math.max(0, maxCap - currentOcc - reserved);
  const occPct = (currentOcc / (maxCap || 1)) * 100;
  const resPct = (reserved / (maxCap || 1)) * 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {actionError && <div role="alert" className="form-error flex flex-wrap justify-between gap-3"><span>{actionError}</span><button onClick={() => { setActionError(''); fetchAllocations(); }} className="underline">Retry</button></div>}
      {/* Receiver Capacity & Header Banner */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-stone-700 text-sm font-semibold mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Food for your community</span>
            </div>
            <h1 className="text-2xl font-semibold text-stone-950">{receiverProfile?.organizationName || 'Receiver'}</h1>
            <p className="text-xs text-stone-600 mt-1">
              {receiverProfile?.address} • Need Level: <strong className="text-amber-800">{receiverProfile?.needLevel}</strong> • Own Logistics: <strong className="text-stone-700">{receiverProfile?.hasOwnLogistics ? 'Available' : 'None'}</strong>
            </p>
          </div>
          <button
            onClick={() => { fetchAllocations(); refreshUsers(); }}
            className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium border border-stone-300 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>

        {/* Atomic Capacity Meter */}
        <div className="bg-stone-50 p-4 rounded-lg border border-stone-200/80 space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-stone-700">Your capacity</span>
            <span className="font-mono text-emerald-800 font-bold">{available} meals available</span>
          </div>

          <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden flex">
            <div style={{ width: `${occPct}%` }} className="bg-stone-900 h-full capacity-gauge-fill" title={`Occupied: ${currentOcc}`} />
            <div style={{ width: `${resPct}%` }} className="bg-amber-500 h-full capacity-gauge-fill" title={`Reserved Incoming: ${reserved}`} />
          </div>

          <div className="flex items-center justify-between text-xs text-stone-600 pt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-stone-900 inline-block" />
              <span>Current Occupancy: <strong className="text-stone-950">{currentOcc}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span>Reserved Incoming: <strong className="text-stone-950">{reserved}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Max Capacity: <strong className="text-stone-950">{maxCap}</strong></span>
            </span>
          </div>
        </div>
      </div>

      {/* Allocations & Recommendations Stream */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-stone-700" />
            <span>Incoming Allocations & Active Rescues</span>
          </h2>
          <span className="text-xs text-stone-600">{allocations.length} total</span>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-stone-500 text-xs">Loading inbound rescues...</div>
        ) : allocations.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-600 text-xs">
            No incoming allocations at this moment. You will be alerted in real-time when the matching engine proposes a rescue.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {allocations.map((alloc) => (
              <div key={alloc.id} className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-4 flex flex-col justify-between interactive-card reveal-on-scroll">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-stone-100 text-stone-700 border border-stone-300">
                      {alloc.donation?.foodCategory.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                      alloc.status === 'PROPOSED' ? 'bg-amber-500/20 text-amber-800 border border-amber-500/30' :
                      alloc.status === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-800 border border-emerald-500/30' :
                      alloc.status === 'COMPLETED' ? 'bg-stone-100 text-stone-700 border border-stone-300' :
                      'bg-stone-100 text-stone-700'
                    }`}>
                      {alloc.status === 'PROPOSED' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600 pulse-radar" />}
                      <span>{alloc.status}</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-stone-950">{alloc.donation?.foodDescription}</h3>
                  <div className="text-xs text-stone-600 mt-1">
                    Donor: <strong className="text-stone-800">{alloc.donation?.donor?.organizationName}</strong>
                  </div>
                  <div className="text-xs text-emerald-800 font-bold mt-1">
                    Allocated Quantity: {alloc.allocatedQuantity} meals
                  </div>

                  {alloc.donation?.safeDeadline && (
                    <div className="mt-2">
                      <CountdownTimer
                        deadline={alloc.donation.safeDeadline}
                        pickupVerifiedAt={alloc.delivery?.pickupVerifiedAt}
                        status={alloc.delivery?.status || alloc.status}
                      />
                    </div>
                  )}

                  {/* Active Delivery Card */}
                  {alloc.delivery && (
                    <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-stone-700">
                          {alloc.delivery.deliveryMode === 'PLATFORM_DRIVER' ? '🚗 Platform Driver' : '🏢 Receiver Logistics'}
                        </span>
                        <span className="text-xs font-bold text-amber-800">
                          {alloc.delivery.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {alloc.delivery.receiverLogisticsAssignment && (
                        <div className="text-xs text-stone-600">
                          Assigned Staff: <strong className="text-stone-950">{alloc.delivery.receiverLogisticsAssignment.driverName}</strong>
                        </div>
                      )}

                      {/* Mode Switching Button (Section 23) */}
                      {!alloc.delivery.pickupVerifiedAt && alloc.delivery.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleSwitchMode(alloc.delivery!.id, alloc.delivery!.deliveryMode)}
                          className="flex items-center gap-1.5 text-xs text-stone-700 hover:text-stone-700 font-semibold pt-1 transition"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Switch to {alloc.delivery.deliveryMode === 'PLATFORM_DRIVER' ? 'Our Own Logistics' : 'Platform Driver'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <OwnLogistics allocation={alloc} onUpdate={() => { fetchAllocations(); refreshUsers(); }} />
                {/* Actions */}
                <div className="pt-2 border-t border-stone-200 flex items-center justify-between gap-2">
                  {alloc.status === 'PROPOSED' && (
                    <div className="flex items-center gap-2 w-full">
                      <button
                        onClick={() => handleAccept(alloc.id)}
                        className="interactive-btn flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        onClick={() => setRejectingAllocationId(alloc.id)}
                        className="interactive-btn flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-800 border border-rose-500/30 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  )}

                  {alloc.status === 'ACCEPTED' && !alloc.delivery && (
                    <button
                      onClick={() => openFulfillmentModal(alloc)}
                      className="interactive-btn w-full bg-stone-900 hover:bg-stone-800 text-white py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Select Fulfillment Method</span>
                    </button>
                  )}

                  {alloc.delivery && !['COMPLETED','EXPIRED','DELIVERY_FAILED'].includes(alloc.delivery.status) && (
                    <button
                      onClick={() => showDeliveryOtp(alloc.delivery!.id)}
                      className="interactive-btn w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold border border-stone-300 transition"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>View Delivery OTP (To Confirm Receipt)</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fulfillment Selection Modal (Sections 5, 7, 8, 9) */}
      {selectedAllocationId && (
        <Dialog label="Arrange fulfillment" onClose={() => { setSelectedAllocationId(null); setSwitchingDeliveryId(null); }}>
          <div className="bg-white border border-stone-200 rounded-lg max-w-md w-full p-6 shadow-none space-y-5">
            <div>
              <h3 className="text-lg font-bold text-stone-950">Select Fulfillment Logistics</h3>
              <p className="text-xs text-stone-600 mt-1">
                How will this surplus food be collected from the donor?
              </p>
            </div>

            {/* Laya System-1 Dispatch Advisor Recommendation */}
            {aiRecommendation && (
              <div className={`p-3.5 rounded-lg border space-y-1.5 ${
                aiRecommendation.recommendedMode === 'RECEIVER_LOGISTICS'
                  ? 'bg-emerald-50 border-emerald-500/30'
                  : 'bg-stone-50 border-stone-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-950">
                    <Sparkles className="w-3.5 h-3.5 text-stone-700" />
                    <span>Suggested option: {aiRecommendation.recommendedMode === 'RECEIVER_LOGISTICS' ? 'Own Logistics' : 'Platform Courier'}</span>
                  </div>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full border font-bold ${
                    aiRecommendation.riskLevel === 'CRITICAL' ? 'bg-rose-50 text-rose-800 border-rose-800' :
                    aiRecommendation.riskLevel === 'HIGH' ? 'bg-amber-50 text-amber-800 border-amber-800' :
                    'bg-stone-100 text-stone-700 border-stone-300'
                  }`}>
                    {(aiRecommendation.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  {aiRecommendation.reasoning}
                </p>
                <div className="text-xs text-stone-500 font-mono flex items-center justify-between pt-0.5">
                  <span>Engine: {aiRecommendation.engine}</span>
                  <span>{aiRecommendation.executionTimeMs}ms inference</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryMode('PLATFORM_DRIVER')}
                className={`p-3.5 rounded-lg border text-left space-y-1 transition ${
                  deliveryMode === 'PLATFORM_DRIVER'
                    ? 'bg-stone-100 border-stone-300 text-stone-950'
                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                <Truck className="w-5 h-5 text-stone-700 mb-1" />
                <div className="text-xs font-bold">Platform Driver</div>
                <div className="text-xs text-stone-600">Broadcast to platform driver network</div>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryMode('RECEIVER_LOGISTICS')}
                className={`p-3.5 rounded-lg border text-left space-y-1 transition ${
                  deliveryMode === 'RECEIVER_LOGISTICS'
                    ? 'bg-emerald-500/20 border-emerald-500 text-stone-950'
                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                <UserCheck className="w-5 h-5 text-emerald-800 mb-1" />
                <div className="text-xs font-bold">Own Logistics</div>
                <div className="text-xs text-stone-600">We'll pick it up ourselves</div>
              </button>
            </div>

            {deliveryMode === 'RECEIVER_LOGISTICS' && (
              <div className="space-y-3 bg-stone-50 p-4 rounded-lg border border-stone-200">
                <div className="text-xs font-semibold text-emerald-800">Receiver Pickup Personnel</div>
                <input
                  type="text"
                  aria-label="Pickup personnel name" placeholder="Driver / Staff Name *"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  required
                  className="w-full bg-white border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  aria-label="Vehicle information" placeholder="Vehicle Info (e.g. White Van - Plate 402)"
                  value={vehicleInfo}
                  onChange={(e) => setVehicleInfo(e.target.value)}
                  className="w-full bg-white border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedAllocationId(null); setSwitchingDeliveryId(null); }}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFulfillment}
                className="flex-1 bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-lg text-xs font-bold transition"
              >
                Confirm Logistics
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Rejection Modal */}
      {rejectingAllocationId && (
        <Dialog label="Decline allocation" onClose={() => setRejectingAllocationId(null)}>
          <div className="bg-white border border-stone-200 rounded-lg max-w-sm w-full p-6 shadow-none space-y-4">
            <h3 className="text-base font-bold text-stone-950">Decline Recommendation</h3>
            <p className="text-xs text-stone-600">
              Declining will immediately release your reserved capacity and automatically rematch the donation to another shelter.
            </p>
            <input
              type="text"
              aria-label="Reason for declining" placeholder="Reason (optional, e.g. cooler full)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg p-3 focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectingAllocationId(null)}
                className="flex-1 bg-stone-100 text-stone-700 py-2 rounded-lg text-xs font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleReject}
                className="flex-1 bg-rose-500 text-stone-950 py-2 rounded-lg text-xs font-bold"
              >
                Decline & Rematch
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delivery OTP Modal */}
      {activeDeliveryOtp && (
        <Dialog label="Delivery verification code" onClose={() => setActiveDeliveryOtp(null)}>
          <div className="bg-white border border-stone-200 rounded-lg max-w-sm w-full p-6 shadow-none text-center space-y-4">
            <div className="w-12 h-12 bg-stone-100 text-stone-700 rounded-lg flex items-center justify-center mx-auto border border-stone-300">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-950">Receiver Delivery OTP</h3>
              <p className="text-xs text-stone-600 mt-1">
                Provide this 6-digit token to the transporter upon food arrival to verify delivery and record impact.
              </p>
            </div>
            <div className="text-4xl font-mono font-semibold tracking-widest text-stone-700 bg-stone-50 py-3 rounded-lg border border-stone-200">
              {activeDeliveryOtp.otp || 'Unavailable'}
            </div>
            <button disabled={isReplacingCode} className="text-sm underline text-stone-600" onClick={async () => { setIsReplacingCode(true); try { const result = await api.reissueOtp(activeDeliveryOtp.deliveryId, 'DELIVERY'); setActiveDeliveryOtp({ deliveryId: activeDeliveryOtp.deliveryId, otp: result.otp }); } catch(err) { setActionError((err as Error).message); setActiveDeliveryOtp(null); } finally { setIsReplacingCode(false); } }}>{isReplacingCode ? 'Replacing code…' : 'Generate a replacement code'}</button>
            <button
              onClick={() => setActiveDeliveryOtp(null)}
              className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 py-2.5 rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </Dialog>
      )}
      {nextCursor && <button className="primary-button" disabled={isLoading} onClick={() => fetchAllocations(nextCursor)}>Load more</button>}
    </div>
  );
};
