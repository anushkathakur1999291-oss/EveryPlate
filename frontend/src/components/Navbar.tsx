import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { HeartHandshake, PackageCheck, Truck, ChartNoAxesCombined, ArrowUpRight, LogOut } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import type { Role } from '../types';
const modes = [
  { role: 'DONOR' as Role, label: 'Donate food', icon: HeartHandshake },
  { role: 'RECEIVER' as Role, label: 'Receive food', icon: PackageCheck },
  { role: 'DRIVER' as Role, label: 'Deliver', icon: Truck },
  { role: 'ADMIN' as Role, label: 'Operations & impact', icon: ChartNoAxesCombined },
];
export function Navbar() {
  const { users, currentUser, setCurrentUser, switchRole, demoMode, logout } = useAuth();
  const { isConnected } = useSocket();
  const visibleModes = demoMode ? modes : modes.filter(m => m.role === currentUser?.role);
  return <><a className="skip-link" href="#main-content">Skip to workspace</a><header className="product-header">
    <div className="product-topline"><a href="#main-content" className="wordmark"><span className="brand-mark"><ArrowUpRight size={22}/></span><span>Surplus<span className="brand-secondary"> to Shelter</span></span></a>
      <div className="account-tools">
        <span className="connection-indicator"><i className={isConnected ? 'connected' : ''}/>{isConnected ? 'Live updates' : 'Reconnecting'}</span>
        <ThemeToggle />
        {demoMode ? <label className="demo-selector"><span>Demo account</span><select aria-label="Choose demo account" value={currentUser?.id || ''} onChange={e => { const user=users.find(u=>u.id===e.target.value);if(user)setCurrentUser(user); }}>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label> : <button className="account-signout" onClick={() => void logout()} aria-label="Sign out"><LogOut size={17}/><span>Sign out</span></button>}
      </div></div>
    <div className="product-navline"><nav aria-label="Product modes" className="product-modes">{visibleModes.map(({role,label,icon:Icon})=><button key={role} onClick={()=>switchRole(role)} aria-current={currentUser?.role===role?'page':undefined}><Icon size={19}/><span>{label}</span></button>)}</nav><span className="workspace-name">{currentUser?.donorProfile?.organizationName || currentUser?.receiverProfile?.organizationName || currentUser?.name}</span></div>
  </header></>;
}

