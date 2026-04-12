// @ts-nocheck
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Menu, X } from 'lucide-react';
import appIcon from '@/assets/sociva_app_icon.png';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];

export function LandingNav() {
  const { platformName } = useSystemSettings();
  const [open, setOpen] = useState(false);

  const scrollTo = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id.replace('#', ''));
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="sticky z-50 glass border-b border-border" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="container mx-auto flex items-center justify-between h-14 px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 overflow-visible py-0.5">
          <img src={appIcon} alt="Sociva" className="w-10 h-10 rounded-xl object-cover ring-2 ring-primary/40 shadow-md shadow-primary/20 shrink-0" />
          <span className="font-bold text-lg text-foreground">{platformName}</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <button key={l.href} onClick={() => scrollTo(l.href)} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth"><Button variant="ghost" size="sm">Sign In</Button></Link>
          <Link to="/auth"><Button size="sm">Get Started</Button></Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3 animate-slide-down">
          {NAV_LINKS.map(l => (
            <button key={l.href} onClick={() => scrollTo(l.href)} className="block w-full text-left text-sm font-medium text-muted-foreground hover:text-foreground py-2">
              {l.label}
            </button>
          ))}
          <div className="flex gap-2 pt-2">
            <Link to="/auth" className="flex-1"><Button variant="outline" size="sm" className="w-full">Sign In</Button></Link>
            <Link to="/auth" className="flex-1"><Button size="sm" className="w-full">Get Started</Button></Link>
          </div>
        </div>
      )}
    </nav>
  );
}
