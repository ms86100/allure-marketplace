import { Moon, Sun, Leaf } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const themes = [
  { key: 'light', icon: Sun, label: '☀️', ariaLabel: 'Light mode' },
  { key: 'dark', icon: Moon, label: '🌙', ariaLabel: 'Dark mode' },
  { key: 'nature', icon: Leaf, label: '🌿', ariaLabel: 'Nature mode' },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const idx = themes.findIndex(t => t.key === theme);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.key);
  };

  const current = themes.find(t => t.key === theme) || themes[0];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        'inline-flex items-center justify-center h-9 w-9 rounded-full transition-all duration-300',
        'hover:bg-secondary text-foreground',
        theme === 'nature' && 'text-[hsl(var(--primary))]',
        className
      )}
      aria-label={current.ariaLabel}
    >
      <Icon className="h-[18px] w-[18px] transition-transform duration-300" />
    </button>
  );
}

/** Expanded 3-option picker for settings pages */
export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn('inline-flex items-center gap-1 rounded-full bg-muted p-1', className)}>
      {themes.map(({ key, icon: Icon, ariaLabel }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTheme(key)}
          className={cn(
            'flex items-center justify-center h-8 w-8 rounded-full transition-all duration-300',
            theme === key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={ariaLabel}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
