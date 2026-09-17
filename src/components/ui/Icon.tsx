import type { SVGProps } from 'react';

const paths = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  upRight: 'M6 18 18 6M6 6h12v12',
  back: 'M20 12H4m6-6-6 6 6 6',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  target: 'M16 12a4 4 0 1 1-4-4M20 12a8 8 0 1 1-8-8m0 8 8-8m-4 0h4v4',
  branch: 'M6 4v11a4 4 0 0 0 4 4h8M6 10h8a4 4 0 0 0 4-4V4m-3 12 3 3-3 3',
  chart: 'M4 3v17h17M8 15v-4m5 4V6m5 9v-6',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  bulb: 'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 1H9z',
  info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff:
    'm3 3 18 18M9 5a10 10 0 0 1 3 0c6 0 10 7 10 7a19 19 0 0 1-4 4M6 6a20 20 0 0 0-4 6s4 7 10 7a11 11 0 0 0 5-1',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  plus: 'M12 5v14M5 12h14',
  edit: 'm15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20H4z',
  save: 'M4 3h13l4 4v14H3V3h1m3 0v6h10V3M7 21v-8h10v8',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  message: 'M21 4H3v13h5l4 4v-4h9zM7 9h10M7 13h6',
  book: 'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1m0-15c3-2 6-2 10-1v15c-4-1-7-1-10 1z',
  flag: 'M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0',
} as const;

export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
