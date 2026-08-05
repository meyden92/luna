export function Brandmark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 40 40"
        className="block h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="luna-brandmark-gradient"
            x1="0"
            x2="1"
            y1="0"
            y2="1"
          >
            <stop
              offset="0"
              stopColor="var(--luna-accent)"
            />
            <stop
              offset="1"
              stopColor="var(--luna-accent-2)"
            />
          </linearGradient>
        </defs>
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="var(--luna-ink)"
          strokeWidth="1.3"
        />
        <path
          d="M27 14a10 10 0 1 0 0 12 8 8 0 0 1 0-12z"
          fill="url(#luna-brandmark-gradient)"
        />
        <circle
          cx="30"
          cy="10"
          r="3"
          fill="var(--luna-accent)"
        />
      </svg>
    </div>
  );
}
