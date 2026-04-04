import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useSubcategories, Subcategory } from '@/hooks/useSubcategories';
import { Search, Star, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Identity Map ────────────────────────────────────────────────────────────
const IDENTITY_MAP: Record<string, string> = {
  daily_tiffin: 'Tiffin Provider',
  one_time_meals: 'Home Meal Provider',
  breakfast_items: 'Breakfast Specialist',
  cakes: 'Home Baker',
  cookies_biscuits: 'Home Baker',
  traditional_sweets: 'Sweet Maker',
  fresh_juices: 'Juice Bar',
  pickles: 'Homemade Specialty Seller',
  party_catering: 'Catering Service',
  party_snacks: 'Snack Caterer',
  organic_food: 'Organic Food Seller',
  regional_cuisine: 'Regional Cuisine Specialist',
  healthy_diet: 'Healthy Meal Provider',
  kids_meals: 'Kids Meal Specialist',
  namkeen_chips: 'Snack Seller',
  street_food: 'Street Food Specialist',
  tea_coffee: 'Chai & Coffee Seller',
  smoothies: 'Smoothie Bar',
  milkshakes: 'Milkshake Bar',
  homemade_chocolates: 'Chocolate Maker',
  jams_preserves: 'Preserves Maker',
  masala_spices: 'Spice Seller',
  papad_fryums: 'Homemade Snack Seller',
  free_food: 'Community Contributor',
  leftovers: 'Community Contributor',
};

function getIdentityLabel(subcategory: Subcategory | undefined, categoryName: string): string {
  if (!subcategory) return `${categoryName} Seller`;
  // Try slug match first
  const slug = subcategory.slug;
  if (IDENTITY_MAP[slug]) return IDENTITY_MAP[slug];
  // Fallback: use subcategory display name
  return `${subcategory.display_name} Seller`;
}

// ─── Search Scoring ──────────────────────────────────────────────────────────
function scoreSubcategory(sub: Subcategory, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const name = sub.display_name.toLowerCase();
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  if (name.includes(q)) return 1;
  return 0;
}

// ─── Selection State ─────────────────────────────────────────────────────────
export interface SubcategorySelection {
  primary: string | null;
  others: string[];
}

interface SubcategoryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryConfigId: string;
  categoryName: string;
  categoryIcon: string;
  selected: SubcategorySelection;
  onSave: (selection: SubcategorySelection) => void;
  context?: 'store' | 'product';
}

const SOFT_LIMIT = 5;

export function SubcategoryPickerDialog({
  open,
  onOpenChange,
  categoryConfigId,
  categoryName,
  categoryIcon,
  selected,
  onSave,
  context = 'store',
}: SubcategoryPickerDialogProps) {
  const { data: subcategories, isLoading } = useSubcategories(categoryConfigId);
  const [search, setSearch] = useState('');
  const [localSelection, setLocalSelection] = useState<SubcategorySelection>(selected);

  // Reset local state when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocalSelection(selected);
      setSearch('');
    }
    onOpenChange(nextOpen);
  };

  // Sorted & scored subcategories
  const sortedSubs = useMemo(() => {
    if (!subcategories) return [];
    const q = search.trim();
    if (!q) return [...subcategories].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
    return [...subcategories]
      .map(s => ({ ...s, _score: scoreSubcategory(s, q) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score);
  }, [subcategories, search]);

  const totalSelected = (localSelection.primary ? 1 : 0) + localSelection.others.length;

  const isSelected = (id: string) => localSelection.primary === id || localSelection.others.includes(id);
  const isPrimary = (id: string) => localSelection.primary === id;

  const toggleSubcategory = (id: string) => {
    setLocalSelection(prev => {
      // If already selected, remove it
      if (prev.primary === id) {
        // Demote: promote first other
        const [newPrimary, ...rest] = prev.others;
        return { primary: newPrimary || null, others: rest };
      }
      if (prev.others.includes(id)) {
        return { ...prev, others: prev.others.filter(o => o !== id) };
      }
      // New selection
      if (!prev.primary) {
        // First pick → primary
        return { ...prev, primary: id };
      }
      // Additional → secondary
      return { ...prev, others: [...prev.others, id] };
    });
  };

  const makePrimary = (id: string) => {
    setLocalSelection(prev => {
      if (prev.primary === id) return prev;
      const othersWithoutNew = prev.others.filter(o => o !== id);
      const newOthers = prev.primary ? [prev.primary, ...othersWithoutNew] : othersWithoutNew;
      return { primary: id, others: newOthers };
    });
  };

  const handleDone = () => {
    onSave(localSelection);
    onOpenChange(false);
  };

  const primarySub = subcategories?.find(s => s.id === localSelection.primary);
  const identityLabel = getIdentityLabel(primarySub, categoryName);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col pb-6">
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="flex items-center gap-2">
            <DynamicIcon name={categoryIcon} size={20} />
            {categoryName}
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='What are you looking to sell?'
            className="pl-9"
          />
        </div>

        {/* Guidance */}
        <p className="text-xs text-muted-foreground mb-2">
          ⭐ First pick becomes your <span className="font-semibold">primary specialty</span>. Pick 1–{SOFT_LIMIT} to start.
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 -mx-1 px-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          )}
          {!isLoading && sortedSubs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search.trim() ? 'No matches — try a different term or clear search' : 'No subcategories available'}
            </div>
          )}
          {sortedSubs.map((sub) => {
            const selected = isSelected(sub.id);
            const primary = isPrimary(sub.id);
            const isRecommended = '_score' in sub && (sub as any)._score === 3;

            return (
              <button
                key={sub.id}
                onClick={() => toggleSubcategory(sub.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                  selected
                    ? primary
                      ? 'border-primary bg-primary/10'
                      : 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                {/* Icon */}
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm',
                  selected ? 'bg-primary/20' : 'bg-muted'
                )}>
                  {sub.icon ? <DynamicIcon name={sub.icon} size={16} /> : '🍽️'}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{sub.display_name}</span>
                    {isRecommended && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        ⭐ Recommended
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Selection indicator */}
                <div className="shrink-0">
                  {primary ? (
                    <button
                      onClick={e => { e.stopPropagation(); }}
                      className="flex items-center gap-1"
                    >
                      <Star size={16} className="fill-primary text-primary" />
                    </button>
                  ) : selected ? (
                    <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
                      <Check size={12} className="text-primary" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded border border-border" />
                  )}
                </div>

                {/* Make primary button (for non-primary selected items) */}
                {selected && !primary && (
                  <button
                    onClick={e => { e.stopPropagation(); makePrimary(sub.id); }}
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    title="Make primary"
                  >
                    <Star size={14} />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Soft limit warning */}
        {totalSelected > SOFT_LIMIT && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-warning/10 text-warning text-xs">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Too many selections may confuse buyers. Consider picking your top {SOFT_LIMIT}.</span>
          </div>
        )}

        {/* Identity feedback */}
        {localSelection.primary && (
          <div className="mt-3 p-3 rounded-lg bg-muted text-center">
            <p className="text-xs text-muted-foreground">You'll appear as:</p>
            <p className="text-sm font-semibold text-foreground">{identityLabel}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex-1">
            {totalSelected === 0 ? 'No selections' : `${totalSelected} selected`}
          </span>
          <Button onClick={handleDone} className="min-w-[100px]">
            Done {totalSelected > 0 && `(${totalSelected})`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
