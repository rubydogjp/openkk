"use client";

export function MaskIcon({
  src,
  size,
  color,
}: {
  src: string;
  size: number;
  color: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        flexShrink: 0,
        backgroundColor: color,
        maskImage: `url('${src}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${src}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export function AssistIcon({ size, color }: { size: number; color: string }) {
  return <MaskIcon src="/icons/assist.svg" size={size} color={color} />;
}

export function LockIcon({ size, color }: { size: number; color: string }) {
  return <MaskIcon src="/icons/lock.svg" size={size} color={color} />;
}

export function StepsIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path
        d="M8 12l3 3 5-5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function JournalIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke={color}
        strokeWidth="1.6"
      />
      <line
        x1="8"
        y1="8"
        x2="16"
        y2="8"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12"
        x2="16"
        y2="12"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="16"
        x2="13"
        y2="16"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PersonIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoutIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="16 17 21 12 16 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="21"
        y1="12"
        x2="9"
        y2="12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <polyline
        points="10 17 15 12 10 7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="15"
        y1="12"
        x2="3"
        y2="12"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExternalLinkIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="15 3 21 3 21 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="14"
        x2="21"
        y2="3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronDownIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points="6 9 12 15 18 9"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points="5 12 10 17 19 7"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckCircleIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.6" />
      <path
        d="M7.5 12l3.2 3.2 5.8-6.4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WarningIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.8" fill={color} />
    </svg>
  );
}

export function ErrorIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.6" />
      <line
        x1="12"
        y1="8"
        x2="12"
        y2="13"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="0.8" fill={color} />
    </svg>
  );
}

export function PlusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MinusIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line
        x1="6"
        y1="6"
        x2="18"
        y2="18"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="6"
        x2="6"
        y2="18"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
