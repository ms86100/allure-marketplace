import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CategoryConfig } from '@/types/categories';
import { friendlyError } from '@/lib/utils';

export interface BulkRow {
  name: string;
  price: string;
  category: string;
  description: string;
  is_veg: boolean;
  prep_time_minutes: string;
  error?: string;
}

const EMPTY_ROW: BulkRow = { name: '', price: '', category: '', description: '', is_veg: true, prep_time_minutes: '' };

function getCategoryConfig(slug: string, categories: CategoryConfig[]): CategoryConfig | undefined {
  return categories.find(c => c.category === slug);
}

export function useBulkUpload(sellerId: string, allowedCategories: CategoryConfig[], onSuccess: () => void, onClose: () => void) {
  const [rows, setRows] = useState<BulkRow[]>([{ ...EMPTY_ROW, category: allowedCategories[0]?.category || '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: number; errors: number } | null>(null);

  const categorySlugs = useMemo(() => allowedCategories.map(c => c.category), [allowedCategories]);
  const anyShowVeg = useMemo(() => allowedCategories.some(c => c.formHints.showVegToggle), [allowedCategories]);
  const anyShowDuration = useMemo(() => allowedCategories.some(c => c.formHints.showDurationField), [allowedCategories]);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { ...EMPTY_ROW, category: allowedCategories[0]?.category || '' }]);
  }, [allowedCategories]);

  const removeRow = useCallback((index: number) => {
    setRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback((index: number, field: keyof BulkRow, value: any) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value, error: undefined } : r));
  }, []);

  const generateCSVTemplate = useCallback(() => {
    const headers = 'name,price,category,description,is_veg,prep_time_minutes';
    const example = `Paneer Butter Masala,250,${allowedCategories[0]?.category || 'home_food'},Rich creamy paneer dish,true,30`;
    const blob = new Blob([headers + '\n' + example + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'product_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [allowedCategories]);

  const handleCSVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV must have a header row and at least one data row'); return; }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf('name');
      const priceIdx = headers.indexOf('price');
      const categoryIdx = headers.indexOf('category');
      const descIdx = headers.indexOf('description');
      const vegIdx = headers.indexOf('is_veg');
      const prepIdx = headers.indexOf('prep_time_minutes');

      if (nameIdx === -1 || priceIdx === -1) { toast.error('CSV must have "name" and "price" columns'); return; }

      const parsed: BulkRow[] = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const cat = cols[categoryIdx] || allowedCategories[0]?.category || '';
        const config = getCategoryConfig(cat, allowedCategories);
        return {
          name: cols[nameIdx] || '', price: cols[priceIdx] || '', category: cat,
          description: cols[descIdx] || '',
          is_veg: config?.formHints.showVegToggle ? (vegIdx >= 0 ? cols[vegIdx]?.toLowerCase() === 'true' : true) : true,
          prep_time_minutes: config?.formHints.showDurationField ? (prepIdx >= 0 ? cols[prepIdx] || '' : '') : '',
        };
      });

      setRows(parsed);
      toast.success(`Parsed ${parsed.length} rows from CSV`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [allowedCategories]);

  const validate = useCallback((): boolean => {
    let hasErrors = false;
    const validated = rows.map((row, idx) => {
      const errors: string[] = [];
      if (!row.name.trim()) errors.push('Name required');
      const price = parseFloat(row.price);
      if (isNaN(price) || price <= 0) errors.push('Invalid price');
      if (row.category && !categorySlugs.includes(row.category)) errors.push('Invalid category');

      const config = getCategoryConfig(row.category, allowedCategories);
      if (config && !config.formHints.showVegToggle && !row.is_veg) errors.push('Veg toggle not applicable');

      const isDupe = rows.some((other, otherIdx) =>
        otherIdx !== idx && other.name.trim().toLowerCase() === row.name.trim().toLowerCase() && other.category === row.category
      );
      if (isDupe) errors.push('Duplicate');

      if (errors.length > 0) { hasErrors = true; return { ...row, error: errors.join(', ') }; }
      return { ...row, error: undefined };
    });
    setRows(validated);
    return !hasErrors;
  }, [rows, categorySlugs, allowedCategories]);

  const handleSave = useCallback(async () => {
    if (!validate()) { toast.error('Fix validation errors before saving'); return; }

    setIsSaving(true);
    setSaveResult(null);
    try {
      const products = rows.map(row => {
        const config = getCategoryConfig(row.category, allowedCategories);
        return {
          seller_id: sellerId, name: row.name.trim(), price: parseFloat(row.price),
          category: row.category, description: row.description.trim() || null,
          is_veg: config?.formHints.showVegToggle ? row.is_veg : true,
          prep_time_minutes: config?.formHints.showDurationField && row.prep_time_minutes ? parseInt(row.prep_time_minutes) : null,
          is_available: true, approval_status: 'draft',
        };
      });

      const { error } = await supabase.from('products').insert(products as any);
      if (error) throw error;

      setSaveResult({ success: products.length, errors: 0 });
      toast.success(`${products.length} products added as drafts`);
      onSuccess();

      setTimeout(() => {
        setRows([{ ...EMPTY_ROW, category: allowedCategories[0]?.category || '' }]);
        setSaveResult(null);
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Bulk save error:', error);
      toast.error(friendlyError(error));
      setSaveResult({ success: 0, errors: rows.length });
    } finally {
      setIsSaving(false);
    }
  }, [rows, validate, sellerId, allowedCategories, onSuccess, onClose]);

  const getRowConfig = useCallback((slug: string) => getCategoryConfig(slug, allowedCategories), [allowedCategories]);

  return {
    rows, isSaving, saveResult, anyShowVeg, anyShowDuration,
    addRow, removeRow, updateRow, generateCSVTemplate, handleCSVUpload,
    handleSave, getRowConfig, allowedCategories,
  };
}
