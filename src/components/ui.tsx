import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buzz, play } from '../lib/sound.ts';

type Variant = 'gold' | 'dark' | 'danger' | 'ghost' | 'green';

const VARIANTS: Record<Variant, string> = {
  gold: 'bg-gradient-to-b from-[#ffd961] to-[#e0a91b] text-[#3b2a00] shadow-[0_4px_0_#8a6a10,0_10px_24px_rgb(0,0,0,0.45)] active:shadow-[0_1px_0_#8a6a10]',
  dark: 'bg-[var(--color-panel-2)] text-ink border border-white/10 shadow-[0_4px_0_rgb(0,0,0,0.5)] active:shadow-none',
  green:
    'bg-gradient-to-b from-[#25a06d] to-[#14724b] text-white shadow-[0_4px_0_#0b4b31,0_10px_24px_rgb(0,0,0,0.4)] active:shadow-[0_1px_0_#0b4b31]',
  danger:
    'bg-gradient-to-b from-[#e05252] to-[#a52a2a] text-white shadow-[0_4px_0_#6d1a1a] active:shadow-[0_1px_0_#6d1a1a]',
  ghost: 'bg-white/5 text-[var(--color-muted)] border border-white/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  quiet?: boolean;
}

export function Button({
  variant = 'dark',
  size = 'md',
  full,
  quiet,
  className = '',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-3 text-sm',
    lg: 'px-5 py-4 text-lg',
  }[size];

  return (
    <button
      {...rest}
      className={`btn ${VARIANTS[variant]} ${sizes} ${full ? 'w-full' : ''} disabled:opacity-40 disabled:active:scale-100 ${className}`}
      onPointerDown={() => {
        if (rest.disabled) return;
        if (!quiet) play('tap');
        buzz(8);
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-lg font-bold text-ink outline-none placeholder:text-white/25 focus:border-[var(--color-gold)]/70 focus:ring-2 focus:ring-[var(--color-gold)]/20';

export function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col gap-2 rounded-2xl bg-black/30 p-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => {
            play('tap');
            buzz(6);
            onChange(o.value);
          }}
          className={`btn px-2 py-2.5 text-sm ${
            value === o.value
              ? 'bg-[var(--color-gold)] text-[#3b2a00]'
              : 'text-[var(--color-muted)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="animate-[rise_240ms_ease-out] relative max-h-[86vh] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[var(--color-panel)] pb-[calc(1.25rem+var(--sab))] shadow-[0_-10px_50px_rgb(0,0,0,0.6)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-[var(--color-panel)] px-5 py-4">
          <h2 className="text-base font-black uppercase tracking-[0.18em] text-[var(--color-gold)]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="btn bg-white/5 px-3 py-1.5 text-xs text-[var(--color-muted)]"
          >
            Close
          </button>
        </div>
        <div className="px-5 pt-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+var(--sat))] z-[60] flex justify-center px-4">
      <div className="animate-[pop_180ms_ease-out] pointer-events-auto flex items-center gap-3 rounded-2xl border border-red-400/30 bg-[#2a1414] px-4 py-3 text-sm font-semibold text-red-100 shadow-xl">
        <span>{message}</span>
        <button onClick={onDismiss} className="btn bg-white/10 px-2.5 py-1 text-xs">
          OK
        </button>
      </div>
    </div>
  );
}
