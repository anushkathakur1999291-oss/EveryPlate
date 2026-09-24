import React, { useState, useEffect } from 'react';
import { useSocketEvent } from '../../context/SocketContext';
import { api } from '../../services/api';
import { ImpactSummary } from '../../types';
import { RescueMap, MapPoint, MapRoute } from '../../components/RescueMap';
import {
  Activity,
  ShieldCheck,
  HeartHandshake,
  Truck,
  TrendingUp,
  RefreshCw,
  Layers,
  Award,
  Leaf,
  MapPin,
  TreePine,
  Car,
  Trash2,
  Droplets,
  Clock,
  Zap,
  Gauge,
  History,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const [actionError, setActionError] = useState('');
  const [impact, setImpact] = useState<ImpactSummary | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      const [imp, dash] = await Promise.all([
        api.getImpactSummary(),
        api.getAdminDashboard(),
      ]);
      setImpact(imp);
      setDashboardData(dash);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  useSocketEvent('connect', () => fetchAdminData());
  useSocketEvent('SYNC_REQUIRED', () => fetchAdminData());
  // Real-time events
  useSocketEvent('DONATION_CREATED', () => fetchAdminData());
  useSocketEvent('MATCH_ACCEPTED', () => fetchAdminData());
  useSocketEvent('DRIVER_ASSIGNED', () => fetchAdminData());
  useSocketEvent('DELIVERY_VERIFIED', () => fetchAdminData());
  useSocketEvent('IMPACT_UPDATED', () => fetchAdminData());

  if (isLoading && !dashboardData) return <div role="status" className="max-w-7xl mx-auto p-8">Loading operations and verified impact…</div>;
  if (!dashboardData && actionError) return <div role="alert" className="p-8"><p>{actionError}</p><button onClick={fetchAdminData}>Retry loading operations</button></div>;
  // Compute geospatial map data
  const mapPoints: MapPoint[] = [];

  dashboardData?.activeDonations?.forEach((d: any) => {
    if (d.pickupLatitude && d.pickupLongitude) {
      mapPoints.push({
        id: `donor-${d.id}`,
        name: d.donor?.organizationName || 'Donor',
        latitude: d.pickupLatitude,
        longitude: d.pickupLongitude,
        info: `${d.quantity} ${d.unit} - ${d.foodDescription}`,
        type: 'DONOR',
      });
    }
  });

  dashboardData?.activeReceivers?.forEach((r: any) => {
    if (r.latitude && r.longitude) {
      const freeCap = r.maxCapacity - r.currentOccupancy - r.reservedIncomingQuantity;
      mapPoints.push({
        id: `recv-${r.id}`,
        name: r.organizationName,
        latitude: r.latitude,
        longitude: r.longitude,
        info: `Need: ${r.needLevel} • Available Cap: ${freeCap} meals`,
        type: 'RECEIVER',
      });
    }
  });

  dashboardData?.availableDrivers?.forEach((drv: any) => {
    if (drv.currentLatitude && drv.currentLongitude) {
      mapPoints.push({
        id: `drv-${drv.id}`,
        name: drv.fullName,
        latitude: drv.currentLatitude,
        longitude: drv.currentLongitude,
        info: `Vehicle: ${drv.vehicleType}`,
        type: 'DRIVER',
      });
    }
  });

  const mapRoutes: MapRoute[] = [];
  dashboardData?.activeDeliveries?.forEach((del: any) => {
    const alloc = del.allocation;
    if (alloc?.donation && alloc?.receiver) {
      mapRoutes.push({
        id: del.id,
        donorCoords: [alloc.donation.pickupLatitude, alloc.donation.pickupLongitude],
        receiverCoords: [alloc.receiver.latitude, alloc.receiver.longitude],
        status: del.status,
        mode: del.deliveryMode,
      });
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {actionError && <div role="alert" className="form-error flex flex-wrap justify-between gap-3"><span>{actionError}</span><button onClick={() => { setActionError(''); fetchAdminData(); }} className="underline">Retry</button></div>}
      {/* Admin Header */}
      <div className="py-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-stone-700 text-sm font-semibold mb-1">
            <Activity className="w-4 h-4" />
            <span>Operations overview</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-950">Every rescue, in view</h1>
          <p className="text-xs text-stone-600 mt-1">
            Coordinate active deliveries and see the impact of verified rescues.
          </p>
        </div>
        <button
          onClick={fetchAdminData}
          className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium border border-stone-300 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Live Verified Impact Counters (Section 24) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-stone-50   border border-emerald-500/30 rounded-lg p-6 shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Meals Rescued</span>
            <Award className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="text-4xl font-semibold text-stone-950 font-mono">
            {impact?.totalMealsRescued ?? 0}
          </div>
          <p className="text-xs text-stone-600">From verified food deliveries</p>
        </div>

        <div className="bg-stone-50   border border-stone-300 rounded-lg p-6 shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Food Weight Diverted</span>
            <TrendingUp className="w-5 h-5 text-stone-700" />
          </div>
          <div className="text-4xl font-semibold text-stone-950 font-mono">
            {impact?.totalWeightDivertedKg ?? 0} <span className="text-lg font-normal text-stone-600">kg</span>
          </div>
          <p className="text-xs text-stone-600">Solid organic waste diverted from landfill decomposition</p>
        </div>

        <div className="bg-stone-50   border border-stone-300 rounded-lg p-6 shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">CO₂e Avoided</span>
            <Leaf className="w-5 h-5 text-stone-700" />
          </div>
          <div className="text-4xl font-semibold text-stone-950 font-mono">
            {impact?.totalCo2eAvoidedKg ?? 0} <span className="text-lg font-normal text-stone-600">kg</span>
          </div>
          <p className="text-xs text-stone-600">Greenhouse gas emissions prevented (2.50 kg CO₂e / kg food)</p>
        </div>
      </div>

      {/* Environmental Impact Equivalents Matrix (EPA / UN FAO Standard Conversions) */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-800" />
              <span>Estimated environmental impact</span>
            </h2>
            <span className="text-xs text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-300">
              Illustrative estimates
            </span>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            Illustrative equivalents based on verified rescued meals and the stated conversion factors.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Trees Equivalent */}
          <div className="bg-stone-50 border border-emerald-500/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Urban Trees Equiv.</span>
              <TreePine className="w-4 h-4 text-emerald-800" />
            </div>
            <div className="text-2xl font-semibold text-stone-950 font-mono">
              {impact?.environmentalEquivalents?.treesPlantedEquivalent ?? 0}
            </div>
            <p className="text-xs text-stone-600">
              Annual carbon absorption equivalent of mature urban trees (21.8 kg CO₂/tree/yr)
            </p>
          </div>

          {/* Vehicle Miles Offset */}
          <div className="bg-stone-50 border border-amber-500/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800">Vehicle Miles Offset</span>
              <Car className="w-4 h-4 text-amber-800" />
            </div>
            <div className="text-2xl font-semibold text-stone-950 font-mono">
              {impact?.environmentalEquivalents?.passengerVehicleMilesOffset ?? 0} <span className="text-sm font-normal text-stone-600">mi</span>
            </div>
            <p className="text-xs text-stone-600">
              Avoided tailpipe emissions from passenger vehicles (0.404 kg CO₂/mile)
            </p>
          </div>

          {/* Landfill Volume Spared */}
          <div className="bg-stone-50 border border-stone-300 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">Landfill Space Spared</span>
              <Trash2 className="w-4 h-4 text-stone-700" />
            </div>
            <div className="text-2xl font-semibold text-stone-950 font-mono">
              {impact?.environmentalEquivalents?.landfillVolumeSparedLiters ?? 0} <span className="text-sm font-normal text-stone-600">L</span>
            </div>
            <p className="text-xs text-stone-600">
              Compact landfill volume spared ({impact?.environmentalEquivalents?.landfillVolumeSparedM3 ?? 0} m³ solid waste)
            </p>
          </div>

          {/* Water Footprint Conserved */}
          <div className="bg-stone-50 border border-cyan-500/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-400">Freshwater Conserved</span>
              <Droplets className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-semibold text-stone-950 font-mono">
              {(impact?.environmentalEquivalents?.freshwaterPreservedLiters ?? 0).toLocaleString()} <span className="text-sm font-normal text-stone-600">L</span>
            </div>
            <p className="text-xs text-stone-600">
              Embedded agricultural & supply chain water footprint saved (1,000 L/kg)
            </p>
          </div>
        </div>
      </div>

      {/* Transit Efficiency & Turnaround Analytics */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-stone-700" />
              <span>Rescue Transit Efficiency & Speed Pipeline</span>
            </h2>
            <span className="text-xs font-mono font-bold text-stone-700 bg-stone-50 border border-stone-300 px-2.5 py-1 rounded-full">
              Avg Turnaround: {impact?.transitEfficiency?.averageTotalMinutes ?? 0} mins
            </span>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            End-to-end timeline tracking: automated matching, transporter pickup transit, and final-mile safe delivery
          </p>
        </div>

        {/* 4 Pipeline Stages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <Zap className="w-3.5 h-3.5 text-amber-800" />
              <span>Algorithmic Matching</span>
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950">
              {impact?.transitEfficiency?.averageMatchingMinutes ?? 0} <span className="text-xs font-normal text-stone-600">min</span>
            </div>
            <p className="text-xs text-stone-500">Donation broadcast to receiver match</p>
          </div>

          <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <Clock className="w-3.5 h-3.5 text-stone-700" />
              <span>Transporter Pickup</span>
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950">
              {impact?.transitEfficiency?.averagePickupMinutes ?? 0} <span className="text-xs font-normal text-stone-600">min</span>
            </div>
            <p className="text-xs text-stone-500">Dispatch to Stage 1 Pickup OTP</p>
          </div>

          <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <Truck className="w-3.5 h-3.5 text-stone-700" />
              <span>Final-Mile Transit</span>
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950">
              {impact?.transitEfficiency?.averageDeliveryMinutes ?? 0} <span className="text-xs font-normal text-stone-600">min</span>
            </div>
            <p className="text-xs text-stone-500">In-transit to Stage 2 Delivery OTP</p>
          </div>

          <div className="bg-stone-50 p-4 rounded-lg border border-stone-200 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800" />
              <span>Total Turnaround</span>
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950">
              {impact?.transitEfficiency?.averageTotalMinutes ?? 0} <span className="text-xs font-normal text-stone-600">min</span>
            </div>
            <p className="text-xs text-stone-500">Complete rescue cycle duration</p>
          </div>
        </div>

        {/* Mode Velocity Comparison */}
        <div className="bg-stone-50/70 p-4 rounded-lg border border-stone-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-stone-700">Fulfillment Mode Velocity Comparison</span>
            <span className="text-stone-500 text-xs">Average verified transit turnaround</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-700 font-medium">Mode A: Platform Driver Dispatch</span>
                <span className="font-mono text-stone-700 font-bold">{impact?.transitEfficiency?.platformDriverAverageTotalMinutes ?? 0} mins</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-stone-900 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(10, ((impact?.transitEfficiency?.platformDriverAverageTotalMinutes ?? 0) / 60) * 100))}%`
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-800 font-medium">Mode B: Receiver-Owned Logistics</span>
                <span className="font-mono text-stone-700 font-bold">{impact?.transitEfficiency?.receiverLogisticsAverageTotalMinutes ?? 0} mins</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(10, ((impact?.transitEfficiency?.receiverLogisticsAverageTotalMinutes ?? 0) / 60) * 100))}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Station Counters & Mode Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-1">
          <div className="text-stone-600 text-xs font-medium flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-emerald-800" />
            <span>Active Donations</span>
          </div>
          <div className="text-2xl font-bold text-stone-950 font-mono">
            {dashboardData?.activeDonationsCount ?? 0}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-1">
          <div className="text-stone-600 text-xs font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-stone-700" />
            <span>Registered Receivers</span>
          </div>
          <div className="text-2xl font-bold text-stone-950 font-mono">
            {dashboardData?.activeReceiversCount ?? 0}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-1">
          <div className="text-stone-600 text-xs font-medium flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-amber-800" />
            <span>Available Couriers</span>
          </div>
          <div className="text-2xl font-bold text-stone-950 font-mono">
            {dashboardData?.availableDriversCount ?? 0}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-none space-y-1">
          <div className="text-stone-600 text-xs font-medium flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-stone-700" />
            <span>In-Transit Rescues</span>
          </div>
          <div className="text-2xl font-bold text-stone-950 font-mono">
            {dashboardData?.activeDeliveriesCount ?? 0}
          </div>
        </div>
      </div>

      {/* Delivery Mode Breakdown (Section 25) */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <Layers className="w-4 h-4 text-stone-700" />
              <span>Logistics Fulfillment Mode Distribution</span>
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Completed deliveries by transport option.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-stone-700">
            {impact?.deliveryModeBreakdown.total ?? 0} Completed Deliveries
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="bg-stone-50 p-4 rounded-lg border border-stone-300 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-stone-700">Mode A: Platform Driver Dispatch</span>
              <span className="font-mono text-stone-950 font-bold">{impact?.deliveryModeBreakdown.platformDriver ?? 0} Rescues</span>
            </div>
            <p className="text-xs text-stone-600">
              Dispatched via platform courier network with automated lowest-ETA tie-breaking.
            </p>
          </div>

          <div className="bg-stone-50 p-4 rounded-lg border border-emerald-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-800">Mode B: Receiver-Owned Logistics</span>
              <span className="font-mono text-stone-950 font-bold">{impact?.deliveryModeBreakdown.receiverLogistics ?? 0} Rescues</span>
            </div>
            <p className="text-xs text-stone-600">
              Fulfilled directly by shelter staff or organization-arranged volunteers with OTP verification.
            </p>
          </div>
        </div>
      </div>

      {/* Category Breakdown (Section 25 / Spec 24) */}
      {impact?.categoryBreakdown && Object.keys(impact.categoryBreakdown).length > 0 && (
        <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-800" />
                <span>Rescued Surplus by Food Category</span>
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Breakdown of verified rescued meals and diverted weight across food types
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
            {Object.entries(impact.categoryBreakdown).map(([category, stats]) => (
              <div key={category} className="bg-stone-50 p-3.5 rounded-lg border border-stone-200 space-y-1">
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wider block">
                  {category.replace('_', ' ')}
                </span>
                <div className="text-xl font-bold font-mono text-stone-950">
                  {stats.meals} <span className="text-xs font-normal text-stone-600">meals</span>
                </div>
                <div className="text-xs text-emerald-800 font-mono">
                  {stats.weightKg} kg <span className="text-stone-500">({stats.co2eKg} kg CO₂e)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Verified Rescues Audit Feed */}
      {impact?.recentRescues && impact.recentRescues.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
                <History className="w-4 h-4 text-stone-700" />
                <span>Recent Verified Rescues Audit Feed</span>
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Authentic audit trail of completed rescues verified via two-stage OTP custody handoffs
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              {impact.recentRescues.length} Verified Deliveries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 text-stone-600 uppercase text-xs tracking-wider border-b border-stone-200">
                <tr>
                  <th className="p-3">Rescue ID</th>
                  <th className="p-3">Donor Organization</th>
                  <th className="p-3">Receiver Shelter</th>
                  <th className="p-3">Food & Category</th>
                  <th className="p-3">Rescued Meals</th>
                  <th className="p-3">CO₂e Avoided</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3">Verified At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {impact.recentRescues.map((rescue) => (
                  <tr key={rescue.id} className="hover:bg-stone-100/40">
                    <td className="p-3 font-mono font-bold text-emerald-800">#{rescue.id.slice(0, 8)}</td>
                    <td className="p-3 font-semibold text-stone-950">{rescue.donorName}</td>
                    <td className="p-3 font-semibold text-stone-950">{rescue.receiverName}</td>
                    <td className="p-3">
                      <div>{rescue.foodDescription}</div>
                      <span className="text-xs text-stone-600 uppercase">{rescue.foodCategory.replace('_', ' ')}</span>
                    </td>
                    <td className="p-3 font-mono font-bold text-stone-950">{rescue.mealsRescued} meals ({rescue.weightDivertedKg} kg)</td>
                    <td className="p-3 font-mono text-stone-700 font-bold">{rescue.co2eAvoidedKg} kg</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                        rescue.deliveryMode === 'PLATFORM_DRIVER'
                          ? 'bg-stone-50 text-stone-700 border-stone-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-800'
                      }`}>
                        {rescue.deliveryMode === 'PLATFORM_DRIVER' ? 'Platform Courier' : 'Receiver Logistics'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-stone-600 font-mono">
                      {new Date(rescue.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operational Geospatial Map (Section 26) */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-800" />
              <span>Real-Time Geospatial Rescue Grid</span>
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Live tracking of donors, eligible receivers, available couriers, and active delivery corridors
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-stone-700">
            {mapPoints.length} Active Nodes
          </span>
        </div>

        <RescueMap points={mapPoints} routes={mapRoutes} height="440px" />
      </div>

      {/* Active Operational Ledger */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 shadow-none space-y-4">
        <h2 className="text-base font-bold text-stone-950">Live System Donations & Allocations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-stone-50 text-stone-600 uppercase text-xs tracking-wider border-b border-stone-200">
              <tr>
                <th className="p-3">Donation ID</th>
                <th className="p-3">Donor</th>
                <th className="p-3">Food & Category</th>
                <th className="p-3">Allocations (1:N)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dashboardData?.activeDonations?.map((d: any) => (
                <tr key={d.id} className="hover:bg-stone-100/40">
                  <td className="p-3 font-mono font-bold text-emerald-800">#{d.id.slice(0, 8)}</td>
                  <td className="p-3 font-semibold text-stone-950">{d.donor?.organizationName}</td>
                  <td className="p-3">
                    <div>{d.foodDescription}</div>
                    <span className="text-xs text-stone-600">{d.quantity} {d.unit}</span>
                  </td>
                  <td className="p-3">
                    {d.allocations?.map((a: any) => (
                      <div key={a.id} className="text-xs text-stone-700">
                        • {a.receiver?.organizationName}: <strong className="text-stone-950">{a.allocatedQuantity} meals</strong> ({a.status})
                      </div>
                    ))}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-stone-100 text-stone-800 border border-stone-300">
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
