/**
 * Small inline icon set for the passenger booking flow.
 *
 * The Figma design uses lucide-react. Rather than adding a dependency to the
 * shared repo (and another `npm install` for every teammate), the handful of
 * glyphs the flow needs are declared here as plain SVG. They follow the same
 * 24x24 / 1.8 stroke convention, so they look identical at UI sizes.
 */
function Icon({ size = 18, className, children, filled = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ArrowLeft = (p) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Icon>
);

export const ArrowRight = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);

export const Banknote = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Icon>
);

export const Bell = (p) => (
  <Icon {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 20a2 2 0 0 0 3.4 0" />
  </Icon>
);

export const BusFront = (p) => (
  <Icon {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17h-11A2.5 2.5 0 0 1 4 14.5z" />
    <path d="M4 11h16" />
    <path d="M8 17v2M16 17v2" />
    <path d="M7.5 14h.01M16.5 14h.01" />
  </Icon>
);

export const CalendarDays = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </Icon>
);

export const Check = (p) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const CheckCircle2 = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Icon>
);

export const ChevronDown = (p) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const CircleUserRound = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.5 18.2a6.5 6.5 0 0 1 11 0" />
  </Icon>
);

export const Clock3 = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const CreditCard = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19" />
    <path d="M6 15h4" />
  </Icon>
);

export const History = (p) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4.5l3 1.7" />
  </Icon>
);

export const Home = (p) => (
  <Icon {...p}>
    <path d="m3.5 10.5 8.5-7 8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);

export const LocateFixed = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
  </Icon>
);

export const MapPin = (p) => (
  <Icon {...p}>
    <path d="M20 10.5c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 1 1 16 0" />
    <circle cx="12" cy="10.3" r="2.8" />
  </Icon>
);

export const Menu = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const Navigation = (p) => (
  <Icon {...p}>
    <path d="m3.5 11 17-7-7 17-2.6-7.4z" />
  </Icon>
);

export const Search = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Icon>
);

export const ShieldCheck = (p) => (
  <Icon {...p}>
    <path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z" />
    <path d="m9 11.8 2.2 2.2L15.5 10" />
  </Icon>
);

export const Star = ({ size = 18, className }) => (
  <Icon size={size} className={className} filled>
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z" />
  </Icon>
);

export const TicketCheck = (p) => (
  <Icon {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 0 5.5 6h13A2.5 2.5 0 0 0 21 8.5v1.2a2.3 2.3 0 0 0 0 4.6v1.2A2.5 2.5 0 0 0 18.5 18h-13A2.5 2.5 0 0 0 3 15.5v-1.2a2.3 2.3 0 0 0 0-4.6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const Users = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.6a3 3 0 0 1 0 5.8" />
    <path d="M17.5 14.2A4.7 4.7 0 0 1 20.5 18" />
  </Icon>
);

export const X = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
