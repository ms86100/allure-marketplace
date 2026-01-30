import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, X, Loader2, Camera, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  folder: string; // e.g., 'products', 'sellers', 'profiles'
  userId: string;
  className?: string;
  aspectRatio?: 'square' | 'video' | 'portrait';
  placeholder?: string;
}

export function ImageUpload({
  value,
  onChange,
  folder,
  userId,
  className,
  aspectRatio = 'square',
  placeholder = 'Upload Image',
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      // Generate unique filename
      const ext = file.name.split('.').pop();
      const fileName = `${userId}/${folder}/${Date.now()}.${ext}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('app-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('app-images')
        .getPublicUrl(data.path);

      onChange(urlData.publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setIsUploading(false);
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      // Extract path from URL
      const url = new URL(value);
      const pathMatch = url.pathname.match(/\/app-images\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('app-images').remove([pathMatch[1]]);
      }
    } catch (e) {
      console.log('Could not delete old image');
    }

    onChange(null);
  };

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {value ? (
        <div className={cn('relative rounded-lg overflow-hidden border border-border', aspectClasses[aspectRatio])}>
          <img
            src={value}
            alt="Uploaded"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              <Camera size={16} className="mr-1" />
              Change
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X size={16} />
            </Button>
          </div>
          {isUploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            'w-full rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors',
            'flex flex-col items-center justify-center gap-2 text-muted-foreground',
            aspectClasses[aspectRatio]
          )}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <ImageIcon size={20} />
              </div>
              <span className="text-sm font-medium">{placeholder}</span>
              <span className="text-xs">JPG, PNG, WebP (max 5MB)</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
