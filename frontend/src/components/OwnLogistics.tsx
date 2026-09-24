import { useState } from 'react';
import { api } from '../services/api';
import type { DonationAllocation } from '../types';
export function OwnLogistics({ allocation, onUpdate }: { allocation: DonationAllocation; onUpdate: () => void }) {
  const [code,setCode]=useState(''); const [pending,setPending]=useState(false); const [error,setError]=useState('');
  const delivery=allocation.delivery;
  if (!delivery || delivery.deliveryMode !== 'RECEIVER_LOGISTICS' || ['COMPLETED','EXPIRED','DELIVERY_FAILED'].includes(delivery.status)) return null;
  const pickedUp=!!delivery.pickupVerifiedAt;
  return <section className="border-t border-stone-200 pt-4 space-y-3"><h4 className="font-semibold text-sm">{pickedUp?'Confirm food has arrived':'Coordinate your pickup'}</h4>
    {!pickedUp && <p className="text-sm text-stone-600">Pickup: {allocation.donation?.pickupAddress || 'Refresh to load pickup details'}</p>}
    <p className="text-xs text-stone-600">{pickedUp?'Inspect the food and enter your delivery code to record receipt.':'Ask your personnel for the six-digit code provided by the donor at pickup.'}</p>
    <form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();setPending(true);setError('');try{if(pickedUp)await api.verifyDeliveryOtp(delivery.id,code);else await api.verifyPickupOtp(delivery.id,code);setCode('');onUpdate();}catch(err){setError((err as Error).message);}finally{setPending(false);}}}>
      <input className="border border-stone-300 rounded-md px-3 w-36" aria-label={pickedUp?'Delivery verification code':'Donor pickup verification code'} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>
      <button className="primary-button text-sm" disabled={pending}>{pending?'Verifying…':pickedUp?'Confirm receipt':'Verify pickup'}</button>
    </form>{error && <p role="alert" className="form-error text-sm">{error}</p>}
  </section>;
}
