import type { SVGProps, ReactNode } from 'react';

export type IconName =
  | 'arrow'
  | 'close'
  | 'shield'
  | 'globe'
  | 'camera'
  | 'camera-off'
  | 'mic'
  | 'mic-off'
  | 'next'
  | 'stop'
  | 'flag'
  | 'block'
  | 'check'
  | 'back'
  | 'refresh'
  | 'menu'
  | 'users'
  | 'bolt'
  | 'phone-end'
  | 'more'
  | 'lock';

const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M4 12h15M13 5l7 7-7 7" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  'camera-off': (
    <path d="M16 10V7a2 2 0 0 0-2-2H9M5 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3m0-4 5-3v10l-5-3M3 3l18 18" />
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
    </>
  ),
  'mic-off': (
    <path d="M9 5a3 3 0 0 1 6 1v5M9 9v3a3 3 0 0 0 5 2M5 10v2a7 7 0 0 0 12 5M19 10v2a7 7 0 0 1-.5 2.5M12 19v3m-4 0h8M3 3l18 18" />
  ),
  next: <path d="m7 5 7 7-7 7M18 5v14" />,
  'phone-end': (
    <path d="M3 13c5-5 13-5 18 0v4a1 1 0 0 1-1.4.9l-4-1.6a1 1 0 0 1-.6-.9v-2a10 10 0 0 0-6 0v2a1 1 0 0 1-.6.9l-4 1.6A1 1 0 0 1 3 17v-4Z" />
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  flag: <path d="M5 21V3c5-4 9 4 14 0v11c-5 4-9-4-14 0" />,
  block: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  back: <path d="M20 12H4m7-7-7 7 7 7" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  users: (
    <>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 6.7M21 20v-1.5a4 4 0 0 0-2.8-3.8" />
    </>
  ),
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
