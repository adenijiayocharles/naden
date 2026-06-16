interface AppLogoProps {
  className?: string;
}

export default function AppLogo({ className }: AppLogoProps) {
  return (
    <svg
      viewBox="0 0 48 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ color: "var(--color-accent)" }}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="13" rx="3" stroke="currentColor" strokeWidth="2.8" />
      <circle cx="10" cy="8.5" r="1.8" fill="currentColor" />
      <circle cx="16.5" cy="8.5" r="1.8" fill="currentColor" />
      <rect x="26" y="6" width="14" height="5" rx="2.5" fill="currentColor" />

      <rect x="2" y="21" width="44" height="13" rx="3" stroke="currentColor" strokeWidth="2.8" />
      <circle cx="10" cy="27.5" r="1.8" fill="currentColor" />
      <circle cx="16.5" cy="27.5" r="1.8" fill="currentColor" />
      <rect x="26" y="25" width="14" height="5" rx="2.5" fill="currentColor" />
    </svg>
  );
}
