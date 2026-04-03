import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useSubcategories, Subcategory } from '@/hooks/useSubcategories';
import { useParentGroups } from '@/hooks/useParentGroups';
import { SubcategoryPickerDialog, SubcategorySelection } from '@/components/seller/SubcategoryPickerDialog';
import { Search, Sparkles, X, Star, ChevronRight, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder';
import type { SellerFormData, SubcategoryPreferences } from '@/hooks/useSellerApplication';
import type { CategoryConfig } from '@/types/categories';

const ALIAS_MAP: Record<string, string[]> = {
  daily_tiffin: ['home food', 'dabba', 'meal service', 'lunch delivery', 'tiffin', 'food delivery', 'home cooked'],
  one_time_meals: ['special meals', 'party food', 'bulk food', 'catering food'],
  breakfast_items: ['breakfast', 'morning food', 'idli', 'dosa', 'paratha', 'poha'],
  cakes: ['cake', 'birthday cake', 'baking', 'pastry', 'bakery'],
  cookies_biscuits: ['cookies', 'biscuits', 'baked snacks'],
  traditional_sweets: ['sweets', 'mithai', 'laddu', 'barfi', 'halwa'],
  fresh_juices: ['juice', 'fresh juice', 'fruit juice'],
  pickles: ['pickle', 'achar', 'homemade pickle'],
  party_catering: ['catering', 'party food', 'event food', 'bulk order'],
  party_snacks: ['snacks', 'party snacks', 'finger food'],
  organic_food: ['organic', 'natural food', 'health food'],
  regional_cuisine: ['regional food', 'south indian', 'north indian', 'bengali food'],
  healthy_diet: ['diet food', 'healthy meals', 'low calorie', 'keto'],
  kids_meals: ['kids food', 'baby food', 'children meals'],
  namkeen_chips: ['namkeen', 'chips', 'mixture', 'chivda'],
  street_food: ['chaat', 'pani puri', 'vada pav', 'samosa'],
  tea_coffee: ['tea', 'chai', 'coffee', 'beverages'],
  smoothies: ['smoothie', 'protein shake', 'health drink'],
  milkshakes: ['milkshake', 'cold coffee', 'lassi'],
  homemade_chocolates: ['chocolate', 'homemade chocolate', 'truffle'],
  jams_preserves: ['jam', 'preserve', 'marmalade'],
  masala_spices: ['masala', 'spice', 'spices', 'garam masala'],
  papad_fryums: ['papad', 'fryums', 'appalam'],
  yoga: ['meditation', 'wellness', 'mindfulness', 'pranayama', 'fitness class', 'therapy', 'yoga therapy', 'ayurvedic therapy', 'ayurveda', 'naturopathy', 'holistic healing', 'mind body', 'stress relief'],
  dance: ['dance class', 'dancing', 'zumba', 'bharatnatyam', 'salsa'],
  music: ['music class', 'guitar', 'piano', 'singing', 'vocal training'],
  art_craft: ['art class', 'craft', 'painting', 'drawing', 'pottery'],
  tuition: ['tuition', 'tutor', 'coaching', 'home tuition', 'maths tuition'],
  language: ['language class', 'english class', 'spoken english', 'french class'],
  fitness: ['gym', 'personal trainer', 'workout', 'exercise', 'crossfit'],
  coaching: ['coaching', 'entrance exam', 'competitive exam'],
  daycare: ['daycare', 'creche', 'childcare', 'babysitting'],
  electrician: ['wiring', 'electrical repair', 'electrical', 'switch repair', 'fan repair'],
  plumber: ['plumbing', 'pipe repair', 'tap repair', 'water leak', 'plumber'],
  carpenter: ['carpentry', 'furniture repair', 'wood work', 'door repair'],
  ac_service: ['ac repair', 'ac service', 'air conditioner', 'ac installation'],
  pest_control: ['pest control', 'cockroach', 'termite', 'mosquito control'],
  appliance_repair: ['appliance repair', 'washing machine', 'fridge repair', 'microwave repair'],
  maid: ['cleaning', 'house cleaning', 'home cleaning', 'maid', 'domestic help', 'housekeeping'],
  cook: ['cook', 'home cook', 'chef', 'cooking service'],
  driver: ['driver', 'personal driver', 'chauffeur'],
  nanny: ['nanny', 'babysitter', 'child care'],
  beauty: ['parlour', 'parlor', 'makeup', 'facial', 'beauty service', 'bridal makeup', 'skin care', 'spa', 'massage', 'body massage', 'ayurvedic massage'],
  salon: ['salon', 'haircut', 'hair styling', 'grooming', 'beard trim', 'hair spa'],
  tailoring: ['tailor', 'stitching', 'alteration', 'blouse stitching', 'kurta stitching'],
  laundry: ['laundry', 'dry cleaning', 'ironing', 'washing clothes'],
  mehendi: ['mehendi', 'henna', 'mehndi'],
  tax_consultant: ['tax', 'gst', 'income tax', 'tax filing', 'ca service'],
  it_support: ['computer repair', 'laptop repair', 'it support', 'tech support'],
  tutoring: ['private tutor', 'home tutor', 'online tutor'],
  resume_writing: ['resume editing', 'cv writing', 'resume help', 'resume', 'job application'],
  equipment_rental: ['equipment rent', 'tool rental', 'generator rental'],
  vehicle_rental: ['car rental', 'bike rental', 'vehicle rent', 'scooter rent'],
  party_supplies: ['tent', 'chair rental', 'table rental', 'party decoration rental'],
  baby_gear: ['stroller rental', 'baby gear', 'baby equipment'],
  furniture: ['used furniture', 'sofa', 'bed', 'table', 'chair'],
  electronics: ['used phone', 'second hand laptop', 'old electronics'],
  books: ['used books', 'second hand books', 'old books', 'textbooks'],
  clothing: ['used clothes', 'second hand clothing', 'pre-owned clothes'],
  decoration: ['event decoration', 'birthday decoration', 'balloon decoration', 'party decoration'],
  photography: ['photographer', 'photo shoot', 'event photography', 'wedding photography'],
  dj_music: ['dj', 'music system', 'event music', 'sound system'],
  pet_food: ['pet food', 'dog food', 'cat food'],
  pet_grooming: ['pet grooming', 'dog grooming', 'pet salon'],
  pet_sitting: ['pet sitting', 'pet boarding', 'dog boarding'],
  dog_walking: ['dog walking', 'pet walking'],
};

const POPULAR_SLUGS = [
  'daily_tiffin', 'cakes', 'yoga', 'maid', 'electrician', 'beauty', 'tuition', 'furniture',
];

interface SearchItem {
  type: 'subcategory' | 'category';
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentGroupSlug: string;
  parentGroupLabel: string;
  parentGroupIcon: string;
  parentGroupColor: string;
  categoryConfigId: string;
  categoryName: string;
  hasSubcategories: boolean;
}

interface ScoredItem extends SearchItem {
  score: number;
}

interface CategorySearchPickerProps {
  formData: SellerFormData;
  setFormData: React.Dispatch<React.SetStateAction<SellerFormData>>;
  groupedConfigs: Record<string, CategoryConfig[]>;
  configs: CategoryConfig[];
  handleCategoryChange: (cat: string, checked: boolean) => void;
  onContinue: () => void;
  onGroupResolved: (group: string) => void;
  parentGroupInfos: { value: string; label: string; icon: string; color: string; description: string }[];
}

export function CategorySearchPicker({
  formData, setFormData, groupedConfigs, configs, handleCategoryChange,
  onContinue, onGroupResolved, parentGroupInfos,
}: CategorySearchPickerProps) {
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [browseGroup, setBrowseGroup] = useState<string | null>(null);

  const allSubsQuery = useSubcategories();
  const allSubs = allSubsQuery.data || [];

  const searchIndex = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    const groupMap = new Map(parentGroupInfos.map(g => [g.value, g]));

    for (const config of configs) {
      const group = groupMap.get(config.parentGroup);
      if (!group) continue;

      const configSubs = allSubs.filter(s => s.category_config_id === config.id);

      for (const sub of configSubs) {
        items.push({
          type: 'subcategory',
          id: sub.id,
          name: sub.display_name,
          slug: sub.slug,
          icon: sub.icon,
          parentGroupSlug: config.parentGroup,
          parentGroupLabel: group.label,
          parentGroupIcon: group.icon,
          parentGroupColor: group.color,
          categoryConfigId: config.id,
          categoryName: config.displayName,
          hasSubcategories: true,
        });
      }

      if (configSubs.length === 0) {
        items.push({
          type: 'category',
          id: config.id,
          name: config.displayName,
          slug: config.category,
          icon: config.icon,
          parentGroupSlug: config.parentGroup,
          parentGroupLabel: group.label,
          parentGroupIcon: group.icon,
          parentGroupColor: group.color,
          categoryConfigId: config.id,
          categoryName: config.displayName,
          hasSubcategories: false,
        });
      }
    }
    return items;
  }, [configs, allSubs, parentGroupInfos]);

  const scoreItem = useCallback((item: SearchItem, query: string): number => {
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    const name = item.name.toLowerCase();
    if (name === q) return 3;
    if (name.startsWith(q)) return 2;
    if (name.includes(q)) return 1;

    if (item.type === 'subcategory') {
      const catName = item.categoryName.toLowerCase();
      if (catName === q) return 2;
      if (catName.startsWith(q)) return 1.5;
      if (catName.includes(q)) return 0.8;
    }

    const aliases = ALIAS_MAP[item.slug];
    if (aliases) {
      for (const alias of aliases) {
        if (alias === q) return 2;
        if (alias.startsWith(q)) return 1.5;
        if (alias.includes(q)) return 1;
        if (q.includes(alias)) return 1;
      }
    }

    const queryWords = q.split(/\s+/);
    if (aliases) {
      for (const alias of aliases) {
        const aliasWords = alias.split(/\s+/);
        const matchCount = queryWords.filter(w => aliasWords.some(aw => aw.includes(w) || w.includes(aw))).length;
        if (matchCount > 0) return 0.5 + (matchCount * 0.3);
      }
    }

    return 0;
  }, []);

  const searchResults = useMemo<ScoredItem[]>(() => {
    const q = search.trim();
    if (q.length < 2) return [];

    return searchIndex
      .map(item => ({ ...item, score: scoreItem(item, q) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }, [search, searchIndex, scoreItem]);

  const suggestion = useMemo<ScoredItem | null>(() => {
    if (searchResults.length === 0) return null;
    const top = searchResults[0];
    const second = searchResults[1];
    if (top.score >= 2 && (!second || (top.score - second.score) >= 1)) {
      return top;
    }
    return null;
  }, [searchResults]);

  const popularItems = useMemo<SearchItem[]>(() => {
    return POPULAR_SLUGS
      .map(slug => searchIndex.find(item => item.slug === slug))
      .filter(Boolean) as SearchItem[];
  }, [searchIndex]);

  const browseItems = useMemo<SearchItem[]>(() => {
    if (!browseGroup) return [];
    return searchIndex.filter(item => item.parentGroupSlug === browseGroup);
  }, [browseGroup, searchIndex]);

  const pickerCategory = configs.find(c => c.id === pickerCategoryId);

  const getSubCount = (configId: string) => allSubs.filter(s => s.category_config_id === configId).length;

  const handleItemSelect = (item: SearchItem) => {
    if (formData.categories.length === 0) {
      onGroupResolved(item.parentGroupSlug);
    }

    if (item.type === 'subcategory') {
      setPickerCategoryId(item.categoryConfigId);
      setPickerOpen(true);
    } else {
      const isSelected = formData.categories.includes(item.slug);
      handleCategoryChange(item.slug, !isSelected);
      if (!isSelected) {
        onGroupResolved(item.parentGroupSlug);
      }
    }
  };

  const handlePickerSave = (configId: string, category: string, selection: SubcategorySelection) => {
    setFormData(f => {
      const newPrefsData = { ...f.subcategory_preferences.data };
      if (selection.primary || selection.others.length > 0) {
        newPrefsData[configId] = selection;
      } else {
        delete newPrefsData[configId];
      }

      const configSlugMap = new Map(configs.map(c => [c.id, c.category]));
      const catsFromPrefs = Object.keys(newPrefsData).map(id => configSlugMap.get(id)).filter(Boolean) as string[];
      const directToggles = f.categories.filter(cat => {
        const cfg = configs.find(c => c.category === cat);
        return cfg && getSubCount(cfg.id) === 0;
      });
      const mergedCats = [...new Set([...catsFromPrefs, ...directToggles])];

      if (selection.primary || selection.others.length > 0) {
        if (!mergedCats.includes(category)) mergedCats.push(category);
      } else {
        const idx = mergedCats.indexOf(category);
        if (idx >= 0) mergedCats.splice(idx, 1);
      }

      return { ...f, categories: mergedCats, subcategory_preferences: { v: 1, data: newPrefsData } };
    });
  };

  const removeSubcategory = (configId: string, subId: string) => {
    setFormData(f => {
      const pref = f.subcategory_preferences.data[configId];
      if (!pref) return f;
      let newPref: SubcategorySelection;
      if (pref.primary === subId) {
        const [newPrimary, ...rest] = pref.others;
        newPref = { primary: newPrimary || null, others: rest };
      } else {
        newPref = { ...pref, others: pref.others.filter(o => o !== subId) };
      }
      const newData = { ...f.subcategory_preferences.data };
      if (!newPref.primary && newPref.others.length === 0) {
        delete newData[configId];
        const cfg = configs.find(c => c.id === configId);
        return {
          ...f,
          categories: cfg ? f.categories.filter(c => c !== cfg.category) : f.categories,
          subcategory_preferences: { v: 1, data: newData },
        };
      }
      newData[configId] = newPref;
      return { ...f, subcategory_preferences: { v: 1, data: newData } };
    });
  };

  const removeDirectCategory = (cat: string) => {
    handleCategoryChange(cat, false);
  };

  const allSelectedChips: { configId: string; subId: string | null; isPrimary: boolean; displayName: string; categoryName: string; parentGroup: string; isDirect: boolean }[] = [];

  Object.entries(formData.subcategory_preferences.data).forEach(([configId, pref]) => {
    const cfg = configs.find(c => c.id === configId);
    const catName = cfg?.displayName || '';
    const pg = cfg?.parentGroup || '';
    if (pref.primary) {
      const sub = allSubs.find(s => s.id === pref.primary);
      allSelectedChips.push({ configId, subId: pref.primary, isPrimary: true, displayName: sub?.display_name || 'Selected', categoryName: catName, parentGroup: pg, isDirect: false });
    }
    pref.others.forEach(id => {
      const sub = allSubs.find(s => s.id === id);
      allSelectedChips.push({ configId, subId: id, isPrimary: false, displayName: sub?.display_name || 'Selected', categoryName: catName, parentGroup: pg, isDirect: false });
    });
  });

  formData.categories.forEach(cat => {
    const cfg = configs.find(c => c.category === cat);
    if (!cfg) return;
    if (getSubCount(cfg.id) > 0) return;
    if (formData.subcategory_preferences.data[cfg.id]) return;
    const group = parentGroupInfos.find(g => g.value === cfg.parentGroup);
    allSelectedChips.push({ configId: cfg.id, subId: null, isPrimary: false, displayName: cfg.displayName, categoryName: cfg.displayName, parentGroup: cfg.parentGroup, isDirect: true });
  });

  const hasAnySelection = allSelectedChips.length > 0 || formData.categories.length > 0;
  const isSearching = search.trim().length >= 2;
  const noResults = isSearching && searchResults.length === 0;

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search... e.g. yoga, tiffin, electrician"
          className="pl-10 h-12 text-base rounded-2xl bg-muted/50 border-border/50 focus:bg-background"
          autoComplete="off"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {allSelectedChips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <p className="text-xs font-medium text-muted-foreground">Your selections:</p>
            <div className="flex flex-wrap gap-1.5">
              {allSelectedChips.map((chip, i) => (
                <Badge
                  key={`${chip.configId}-${chip.subId || 'direct'}-${i}`}
                  variant={chip.isPrimary ? 'default' : 'secondary'}
                  className="text-xs py-1 px-2.5 gap-1.5 animate-in fade-in"
                >
                  {chip.isPrimary && <Star size={10} className="fill-current" />}
                  {chip.displayName}
                  <span className="text-[9px] opacity-60">· {chip.categoryName}</span>
                  <button
                    onClick={() => chip.isDirect ? removeDirectCategory(chip.configId) : chip.subId && removeSubcategory(chip.configId, chip.subId)}
                    className="ml-0.5 hover:opacity-70"
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {suggestion && !noResults && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles size={14} />
              Suggested for you
            </div>
            <button
              onClick={() => handleItemSelect(suggestion)}
              className="w-full flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                {suggestion.icon ? <DynamicIcon name={suggestion.icon} size={20} /> : <DynamicIcon name={suggestion.parentGroupIcon} size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{suggestion.name}</p>
                <p className="text-xs text-muted-foreground">{suggestion.parentGroupLabel} · {suggestion.categoryName}</p>
              </div>
              <Button size="sm" className="shrink-0 h-8 rounded-xl text-xs">
                Use this
              </Button>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isSearching && !noResults && (
        <div className="space-y-2">
          {suggestion && <p className="text-xs font-medium text-muted-foreground">Other matches</p>}
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {searchResults
              .filter(r => !suggestion || r.id !== suggestion.id)
              .map(item => {
                const isSelected = item.type === 'subcategory'
                  ? Object.values(formData.subcategory_preferences.data).some(
                      p => p.primary === item.id || p.others.includes(item.id)
                    )
                  : formData.categories.includes(item.slug);

                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleItemSelect(item)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', isSelected ? 'bg-primary/15' : 'bg-muted')}>
                      {item.icon ? <DynamicIcon name={item.icon} size={16} /> : <DynamicIcon name={item.parentGroupIcon} size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.parentGroupLabel} · {item.categoryName}</p>
                    </div>
                    {isSelected ? (
                      <CheckCircle size={18} className="text-primary shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {noResults && (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Search size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">We couldn't find an exact match</p>
            <p className="text-xs text-muted-foreground mt-1">But you can still list your service — browse categories below</p>
          </div>
        </div>
      )}

      {!isSearching && popularItems.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">Popular categories</p>
          <div className="grid grid-cols-2 gap-2">
            {popularItems.map(item => {
              const isSelected = item.type === 'subcategory'
                ? Object.values(formData.subcategory_preferences.data).some(
                    p => p.primary === item.id || p.others.includes(item.id)
                  )
                : formData.categories.includes(item.slug);

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemSelect(item)}
                  className={cn(
                    'flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm', isSelected ? 'bg-primary/15' : 'bg-muted')}>
                    {item.icon ? <DynamicIcon name={item.icon} size={16} /> : <DynamicIcon name={item.parentGroupIcon} size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.parentGroupLabel}</p>
                  </div>
                  {isSelected && <CheckCircle size={14} className="text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          {isSearching && noResults ? 'Browse all categories' : 'Or browse by category'}
        </p>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {parentGroupInfos.map(group => (
            <button
              key={group.value}
              onClick={() => setBrowseGroup(browseGroup === group.value ? null : group.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl border whitespace-nowrap transition-all text-xs font-medium shrink-0',
                browseGroup === group.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 hover:border-primary/30'
              )}
            >
              <DynamicIcon name={group.icon} size={14} />
              {group.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {browseGroup && (
            <motion.div
              key={browseGroup}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5"
            >
              {browseItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No active categories in this group yet</p>
              ) : (
                browseItems.map(item => {
                  const isSelected = item.type === 'subcategory'
                    ? Object.values(formData.subcategory_preferences.data).some(
                        p => p.primary === item.id || p.others.includes(item.id)
                      )
                    : formData.categories.includes(item.slug);

                  return (
                    <button
                      key={`browse-${item.id}`}
                      onClick={() => handleItemSelect(item)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      )}
                    >
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', isSelected ? 'bg-primary/15' : 'bg-muted')}>
                        {item.icon ? <DynamicIcon name={item.icon} size={16} /> : <DynamicIcon name={item.parentGroupIcon} size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.categoryName}</p>
                      </div>
                      {isSelected ? (
                        <CheckCircle size={16} className="text-primary shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-3 pt-2">
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
          <ArrowRight size={12} />Next: You'll name your store and set operating hours
        </p>
        <Button className="w-full" onClick={onContinue} disabled={!hasAnySelection}>
          Continue<ChevronRight size={16} className="ml-1" />
        </Button>
        {!hasAnySelection && (
          <button
            onClick={onContinue}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Skip for now
          </button>
        )}
      </div>

      {pickerCategory && (
        <SubcategoryPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          categoryConfigId={pickerCategory.id}
          categoryName={pickerCategory.displayName}
          categoryIcon={pickerCategory.icon}
          selected={formData.subcategory_preferences.data[pickerCategory.id] || { primary: null, others: [] }}
          onSave={(sel) => handlePickerSave(pickerCategory.id, pickerCategory.category, sel)}
        />
      )}
    </div>
  );
}
