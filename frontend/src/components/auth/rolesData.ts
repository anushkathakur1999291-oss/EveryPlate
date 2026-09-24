export interface RoleConfig {
  id: 'DONOR' | 'RECEIVER' | 'DRIVER' | 'ADMIN';
  index: string;
  name: string;
  kicker: string;
  tagline: string;
  quote: string;
  description: string;
  stats: { label: string; value: string }[];
  tags: string[];
  image: string;
  accentColor: string;
  demoAccount: {
    name: string;
    email: string;
    roleLabel: string;
    organization: string;
  };
}

export const ROLES: RoleConfig[] = [
  {
    id: 'DONOR',
    index: '01',
    name: 'Donor',
    kicker: 'Tier 01 · Culinary & Food Sources',
    tagline: 'Commercial Kitchens & Restaurants',
    quote: "Turn today's surplus into someone's next meal.",
    description: 'Log kitchen excess in seconds, receive instant algorithmic matching with vetted shelters, and transfer custody safely with encrypted one-time verification tokens.',
    stats: [
      { label: 'Avg Match', value: '< 2.4 min' },
      { label: 'Custody Handover', value: 'Instant OTP' },
      { label: 'Tax Logs', value: 'Automated' },
    ],
    tags: ['Kitchen Surplus', 'Automated Routing', 'Direct Verification', 'Zero Waste Audit'],
    image: '/images/roles/donor.jpg',
    accentColor: '#244331',
    demoAccount: {
      name: 'Chef Marco',
      email: 'marco@greenbistro.com',
      roleLabel: 'Executive Chef',
      organization: 'The Green Bistro',
    },
  },
  {
    id: 'RECEIVER',
    index: '02',
    name: 'Receiver',
    kicker: 'Tier 02 · Shelters & Communities',
    tagline: 'Community Pantries & Meal Programs',
    quote: 'Receive the food your community needs most.',
    description: 'Track incoming capacity autoroutes, accept or reschedule donations with dual fulfillment (platform courier or own logistics), and record verified food intake.',
    stats: [
      { label: 'Safe Intake', value: '100% Verified' },
      { label: 'Logistics', value: 'Platform or Own' },
      { label: 'Capacity Guard', value: 'Authoritative' },
    ],
    tags: ['Capacity Authoring', 'Own-Logistics Option', 'Allergen Filters', 'Impact Ledger'],
    image: '/images/roles/receiver.jpg',
    accentColor: '#2B3B32',
    demoAccount: {
      name: 'Sister Mary',
      email: 'director@hopeshelter.org',
      roleLabel: 'Program Director',
      organization: 'Hope Community Shelter',
    },
  },
  {
    id: 'DRIVER',
    index: '03',
    name: 'Driver',
    kicker: 'Tier 03 · Rapid Transit Couriers',
    tagline: 'Urban Couriers & Cargo Logistics',
    quote: 'Move food where it needs to go, in minutes.',
    description: 'Claim available rescue deliveries inside equitable two-second dispatch windows, navigate turn-by-turn corridors, and execute custody handoffs with double cryptographic checks.',
    stats: [
      { label: 'Claim Window', value: '2.0s Fair Lock' },
      { label: 'Transit Routing', value: 'Turn-by-Turn' },
      { label: 'Custody Guard', value: 'Double Check' },
    ],
    tags: ['Fair Claim Lock', 'Live Transit', 'Double OTP Check', 'Mileage Credit'],
    image: '/images/roles/driver.jpg',
    accentColor: '#1E2C24',
    demoAccount: {
      name: 'Alex Rivera',
      email: 'alex.rivera@rescue.org',
      roleLabel: 'Courier Specialist',
      organization: 'Eco Logistics Fleet',
    },
  },
  {
    id: 'ADMIN',
    index: '04',
    name: 'Admin',
    kicker: 'Tier 04 · Operations & Governance',
    tagline: 'Central Telemetry & Impact Oversight',
    quote: 'Monitor the city-wide rescue network in real time.',
    description: 'Audit city-wide dispatch windows, monitor verified meal conversion, review cryptographic OTP audit trails, and inspect real-time CO₂ avoidance analytics.',
    stats: [
      { label: 'System Health', value: 'Live Autorouting' },
      { label: 'Security', value: 'Scrypt-v1 / GCM' },
      { label: 'Telemetry', value: 'Zero Trust RBAC' },
    ],
    tags: ['Network Map', 'Live Telemetry', 'Audit Trail', 'Carbon Offset Analytics'],
    image: '/images/roles/admin.jpg',
    accentColor: '#15241C',
    demoAccount: {
      name: 'Elena Rostova',
      email: 'admin@surplustoshelter.org',
      roleLabel: 'Operations Lead',
      organization: 'Central Command',
    },
  },
];
