import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.5-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

export const PrevIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="4" y="5" width="2.6" height="14" rx="1.2" />
    <path d="M20 6.4v11.2a1 1 0 0 1-1.53.85l-9.1-5.6a1 1 0 0 1 0-1.7l9.1-5.6A1 1 0 0 1 20 6.4Z" />
  </svg>
);

export const NextIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="17.4" y="5" width="2.6" height="14" rx="1.2" />
    <path d="M4 6.4v11.2a1 1 0 0 0 1.53.85l9.1-5.6a1 1 0 0 0 0-1.7l-9.1-5.6A1 1 0 0 0 4 6.4Z" />
  </svg>
);

export const ShuffleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16 4h4v4" />
    <path d="M20 4 13 11" />
    <path d="M4 20l6.5-6.5" />
    <path d="M16 20h4v-4" />
    <path d="M20 20 15 15" />
    <path d="M4 4l4.5 4.5" />
  </svg>
);

export const RepeatIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 3.5 20.5 7 17 10.5" />
    <path d="M20.5 7H7a3.5 3.5 0 0 0-3.5 3.5V12" />
    <path d="M7 20.5 3.5 17 7 13.5" />
    <path d="M3.5 17H17a3.5 3.5 0 0 0 3.5-3.5V12" />
  </svg>
);

export const RepeatOneIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 3.5 20.5 7 17 10.5" />
    <path d="M20.5 7H7a3.5 3.5 0 0 0-3.5 3.5V12" />
    <path d="M7 20.5 3.5 17 7 13.5" />
    <path d="M3.5 17H17a3.5 3.5 0 0 0 3.5-3.5V12" />
    <path d="M11.2 14.5h1.4V9.6l-1.6 1" strokeWidth={1.5} />
  </svg>
);

export const VolumeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6.5 9H4v6h2.5L11 19V5Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export const MuteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6.5 9H4v6h2.5L11 19V5Z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7.5-4.3-7.5-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.7C19.5 15.7 12 20 12 20Z" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const MusicIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18V5l10-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);

export const AlbumIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

export const ArtistIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const QueueIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h11M4 12h11M4 17h7" />
    <path d="M18 15.5V6l3 1" />
  </svg>
);

export const LyricIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h10M4 11h13M4 16h8" />
    <path d="M17.5 20v-6.2l3 .8" />
    <circle cx="16" cy="20" r="1.6" />
  </svg>
);

export const RefreshIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 1 0-2.3 6" />
    <path d="M20 4.5V11h-6.4" />
  </svg>
);

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
);

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 7h14M9.5 7V5h5v2M7 7l1 13h8l1-13" />
  </svg>
);

export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </svg>
);

export const UploadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20V9" />
    <path d="m7.5 13.5 4.5-4.5 4.5 4.5" />
    <path d="M4.5 4.5h15" />
  </svg>
);
