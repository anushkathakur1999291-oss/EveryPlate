import { Dialog } from '../../components/Dialog';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import { api } from '../../services/api';
import { Donation, LayaDonationParseResult } from '../../types';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Utensils, Clock, AlertCircle, Key, RefreshCw, PlusCircle, ShieldAlert, Sparkles, Zap } from 'lucide-react';

export const DonorPortal: React.FC = () => {
  const [actionError, setActionError] = useState('');
  const [isReplacingCode, setIsReplacingCode] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Form State
  const [foodCategory, setFoodCategory] = useState<string>('COOKED_MEALS');
  const [foodDescription, setFoodDescription] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(30);
  const [hoursUntilDeadline, setHoursUntilDeadline] = useState<number>(3);
  const [notes, setNotes] = useState<string>('');

  // Laya System-1 Intake Assistant State
  const [aiText, setAiText] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<LayaDonationParseResult | null>(null);

  // Pickup OTP Modal State
  const [activePickupOtp, setActivePickupOtp] = useState<{ deliveryId: string; otp: string } | null>(null);

  const fetchDonations = async (cursor?: string) => {
    try {
      setIsLoading(true);
      const data = await api.getMyDonations(cursor);
      setDonations(previous => cursor ? [...previous, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDonations();
  }, [currentUser]);

  useSocketEvent('connect', () => fetchDonations());
  useSocketEvent('SYNC_REQUIRED', () => fetchDonations());
  // Real-time updates
  useSocketEvent('DONATION_CREATED', () => fetchDonations());
  useSocketEvent('MATCH_REJECTED', () => fetchDonations());
  useSocketEvent('RECEIVER_LOGISTICS_SELECTED', () => fetchDonations());
  useSocketEvent('MATCH_ACCEPTED', () => fetchDonations());
  useSocketEvent('DRIVER_ASSIGNED', () => fetchDonations());
  useSocketEvent('PICKUP_VERIFIED', () => fetchDonations());
  useSocketEvent('DELIVERY_VERIFIED', () => fetchDonations());

  const handleCreateDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodDescription || quantity <= 0) return;

    try {
      setIsSubmitting(true);
      setError('');
      const safeDeadline = new Date(Date.now() + hoursUntilDeadline * 3600 * 1000).toISOString();

      await api.createDonation({
        foodCategory,
        foodDescription,
        quantity,
        safeDeadline,
        notes: notes || undefined,
      });

      setFoodDescription('');
      setNotes('');
      await fetchDonations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAiParse = async (textToParse?: string) => {
    const query = textToParse || aiText;
    if (!query.trim()) return;

    try {
      setIsAiLoading(true);
      const res = await api.parseDonationWithAI(query);
      setAiResult(res);
      setFoodCategory(res.foodCategory);
      setFoodDescription(res.foodDescription);
      setQuantity(res.quantity);
      setHoursUntilDeadline(Math.max(1, Math.round(res.safeHoursRemaining)));
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const showPickupOtp = async (deliveryId: string) => {
    try {
      const res = await api.getPickupOtp(deliveryId);
      setActivePickupOtp({ deliveryId, otp: res.pickupOtp });
    } catch (err: any) {
      setActionError(`Could not load OTP: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {actionError && <div role="alert" className="form-error flex flex-wrap justify-between gap-3"><span>{actionError}</span><button onClick={() => { setActionError(''); fetchDonations(); }} className="underline">Retry</button></div>}
      {/* Donor Header */}
      <div className="py-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold mb-1">
            <Utensils className="w-4 h-4" />
            <span>Make room for a good cause</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-950">{currentUser?.donorProfile?.organizationName || 'Donor'}</h1>
          <p className="text-xs text-stone-600 mt-1">
            {currentUser?.donorProfile?.address} • Operating as {currentUser?.donorProfile?.donorType}
          </p>
        </div>
        <button
          onClick={() => fetchDonations()}
          className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium border border-stone-300 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Donation Form */}
        <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-5 lg:col-span-1 h-fit">
          <div className="flex items-center gap-2 text-stone-950 font-bold text-base border-b border-stone-200 pb-3">
            <PlusCircle className="w-5 h-5 text-emerald-800" />
            <span>Create a donation</span>
          </div>

          {/* Engine Disclaimer (Section 3) */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-800 leading-relaxed">
            We match your food with organizations that need it and can receive it safely.
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Laya System-1 AI Intake Assistant */}
          <details className="bg-stone-50    border border-stone-300 rounded-lg p-3.5 space-y-3">
            <summary className="cursor-pointer font-medium text-sm">Quick fill from kitchen notes</summary>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Sparkles className="w-3.5 h-3.5 text-stone-700" />
                <span>Quick fill from kitchen notes</span>
              </div>
              <span className="text-xs font-mono text-stone-700 bg-stone-50 border border-stone-300 px-2 py-0.5 rounded-full">
                Review before posting
              </span>
            </div>

            <p className="text-xs text-stone-600">
              Type or paste raw kitchen notes to auto-extract category, quantity, deadline, and allergens.
            </p>

            <div className="space-y-2">
              <input
                type="text"
                aria-label="Kitchen notes" value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="e.g. 35 portions of warm chicken biryani, safe until 11 PM..."
                className="w-full bg-white border border-stone-300 text-stone-800 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-stone-300 placeholder:text-stone-500"
              />

              {/* Sample Chips */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const sample = '35 portions of warm chicken biryani from banquet, safe until 11:30 PM';
                    setAiText(sample);
                    handleAiParse(sample);
                  }}
                  className="text-xs bg-stone-100/80 hover:bg-stone-50 text-stone-700 hover:text-stone-700 px-2 py-0.5 rounded-md border border-stone-300/60 transition"
                >
                  🍗 35 Biryani Meals
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sample = '20 loaves of artisan sourdough bread and baguettes, consume within 12 hours';
                    setAiText(sample);
                    handleAiParse(sample);
                  }}
                  className="text-xs bg-stone-100/80 hover:bg-stone-50 text-stone-700 hover:text-stone-700 px-2 py-0.5 rounded-md border border-stone-300/60 transition"
                >
                  🥖 20 Sourdough Loaves
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sample = '40 meal portions of fresh apples and carrots';
                    setAiText(sample);
                    handleAiParse(sample);
                  }}
                  className="text-xs bg-stone-100/80 hover:bg-stone-50 text-stone-700 hover:text-stone-700 px-2 py-0.5 rounded-md border border-stone-300/60 transition"
                >
                  🍎 40 produce portions
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleAiParse()}
                disabled={isAiLoading || !aiText.trim()}
                className="w-full flex items-center justify-center gap-1.5 bg-stone-50   hover: hover: disabled:opacity-50 text-stone-950 font-semibold text-xs py-2 rounded-lg transition shadow-none"
              >
                {isAiLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                )}
                <span>{isAiLoading ? 'Analyzing with Laya...' : 'Fill in donation details'}</span>
              </button>
            </div>

            {aiResult && (
              <div className="bg-white/90 border border-stone-300 rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-stone-700 font-semibold">
                  <span>Detected: {aiResult.foodCategory.replace('_', ' ')} ({aiResult.quantity} {aiResult.unit})</span>
                  <span className="font-mono text-xs text-emerald-800">{(aiResult.confidence * 100).toFixed(0)}% Match</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-600">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${
                    aiResult.urgencyTier === 'CRITICAL' ? 'bg-rose-50 text-rose-800 border border-rose-800' :
                    aiResult.urgencyTier === 'HIGH' ? 'bg-amber-50 text-amber-800 border border-amber-800' :
                    'bg-stone-100 text-stone-700'
                  }`}>
                    {aiResult.urgencyTier} URGENCY
                  </span>
                  {aiResult.detectedAllergens.length > 0 && (
                    <span className="text-amber-800">Allergens: {aiResult.detectedAllergens.join(', ')}</span>
                  )}
                  <span className="ml-auto font-mono text-xs text-stone-500">{aiResult.executionTimeMs}ms</span>
                </div>
              </div>
            )}
          </details>

          <form onSubmit={handleCreateDonation} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">Food Category</label>
              <select
                aria-label="Food category" value={foodCategory}
                onChange={(e) => setFoodCategory(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
              >
                <option value="COOKED_MEALS">Cooked Meals / Catering</option>
                <option value="BAKERY">Bakery & Bread</option>
                <option value="PRODUCE">Fresh Produce</option>
                <option value="PACKAGED_GOODS">Packaged & Pantry Goods</option>
                <option value="DAIRY">Dairy & Refrigerated</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">Description & Allergens</label>
              <textarea
                aria-label="Food description and allergens" value={foodDescription}
                onChange={(e) => setFoodDescription(e.target.value)}
                placeholder="e.g. 30 trays of warm vegetable lasagna, packed in sealed aluminum trays (contains dairy)"
                rows={3}
                required
                className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg p-3 focus:outline-none focus:border-emerald-500 placeholder:text-stone-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">Quantity (Meals)</label>
                <input
                  type="number"
                  min="1"
                  aria-label="Quantity in meals" value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                  required
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">Safe Shelf Life</label>
                <select
                  aria-label="Safe deadline" value={hoursUntilDeadline}
                  onChange={(e) => setHoursUntilDeadline(parseFloat(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value={1.5}>1.5 Hours (High Urgency)</option>
                  <option value={3}>3 Hours (Standard Perishable)</option>
                  <option value={6}>6 Hours (Chilled)</option>
                  <option value={12}>12 Hours (Packaged)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">Pickup Instructions (Optional)</label>
              <input
                type="text"
                aria-label="Pickup instructions" value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Come to back kitchen loading dock"
                className="w-full bg-stone-50 border border-stone-200 text-stone-800 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder:text-stone-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-2.5 rounded-lg text-xs shadow-none shadow-none transition disabled:opacity-50"
            >
              {isSubmitting ? 'Evaluating Receiver Matches...' : 'Create donation'}
            </button>
          </form>
        </div>

        {/* Active Donations Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200">
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-800" />
              <span>Your donations</span>
            </h2>
            <span className="text-xs text-stone-600">{donations.length} total recorded</span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-stone-500 text-xs">Loading active rescue stream...</div>
          ) : donations.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-600 text-xs">
              No active donations. Create a surplus food posting to begin.
            </div>
          ) : (
            <div className="space-y-4">
              {donations.map((d) => (
                <div key={d.id} className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-800 border border-emerald-500/30">
                          {d.foodCategory.replace('_', ' ')}
                        </span>
                        <CountdownTimer deadline={d.safeDeadline} status={d.status} />
                      </div>
                      <h3 className="text-sm font-bold text-stone-950 mt-1.5">{d.foodDescription}</h3>
                      <div className="text-xs text-stone-700 font-semibold mt-0.5">{d.quantity} {d.unit}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
                      {d.status}
                    </span>
                  </div>

                  {/* Sibling Allocations (Section 11 & 28) */}
                  <div className="bg-stone-50 rounded-lg p-4 border border-stone-200/80 space-y-3">
                    <div className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
                      Matched Receiver Allocations
                    </div>

                    {d.allocations && d.allocations.length > 0 ? (
                      <div className="space-y-2.5">
                        {d.allocations.map((alloc) => (
                          <div key={alloc.id} className="bg-white border border-stone-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-emerald-800">
                                {alloc.receiver?.organizationName || 'Evaluating Matching...'}
                              </div>
                              <div className="text-xs text-stone-600">
                                Allocated: <strong className="text-stone-950">{alloc.allocatedQuantity} meals</strong> • Status: <span className="text-stone-700 font-medium">{alloc.status}</span>
                              </div>
                              {alloc.delivery && (
                                <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                                  <span>Mode: <strong className="text-stone-700">{alloc.delivery.deliveryMode === 'PLATFORM_DRIVER' ? 'Platform Courier' : 'Receiver-Owned Logistics'}</strong></span>
                                  <span>•</span>
                                  <span>Stage: <strong className="text-amber-800">{alloc.delivery.status.replace(/_/g, ' ')}</strong></span>
                                </div>
                              )}
                            </div>

                            {/* Donor View Pickup OTP button */}
                            {alloc.delivery && !alloc.delivery.pickupVerifiedAt && !['COMPLETED','EXPIRED','DELIVERY_FAILED'].includes(alloc.delivery.status) && (
                              <button
                                onClick={() => showPickupOtp(alloc.delivery!.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-500/30 transition shrink-0"
                              >
                                <Key className="w-3.5 h-3.5" />
                                <span>View Pickup OTP</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-stone-500 italic">Evaluating matching against eligible shelters...</div>
                    )}

                    <div className="text-xs text-stone-500 flex items-center gap-1 pt-1">
                      <ShieldAlert className="w-3 h-3 text-stone-500" />
                      <span>Receiver contact details stay private.</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pickup OTP Modal */}
      {activePickupOtp && (
        <Dialog label="Pickup verification code" onClose={() => setActivePickupOtp(null)}>
          <div className="bg-white border border-stone-200 rounded-lg max-w-sm w-full p-6 shadow-none text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-800 rounded-lg flex items-center justify-center mx-auto border border-emerald-500/30">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-950">Donor Pickup OTP</h3>
              <p className="text-xs text-stone-600 mt-1">
                Provide this 6-digit token to the transporter upon food collection.
              </p>
            </div>
            <div className="text-4xl font-mono font-semibold tracking-widest text-emerald-800 bg-stone-50 py-3 rounded-lg border border-stone-200">
              {activePickupOtp.otp}
            </div>
            <button disabled={isReplacingCode} className="text-sm underline text-stone-600" onClick={async () => { setIsReplacingCode(true); try { const result = await api.reissueOtp(activePickupOtp.deliveryId, 'PICKUP'); setActivePickupOtp({ deliveryId: activePickupOtp.deliveryId, otp: result.otp }); } catch(err) { setActionError((err as Error).message); setActivePickupOtp(null); } finally { setIsReplacingCode(false); } }}>{isReplacingCode ? 'Replacing code…' : 'Generate a replacement code'}</button>
            <button
              onClick={() => setActivePickupOtp(null)}
              className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 py-2.5 rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </Dialog>
      )}
      {nextCursor && <button className="primary-button" disabled={isLoading} onClick={() => fetchDonations(nextCursor)}>Load more</button>}
    </div>
  );
};
