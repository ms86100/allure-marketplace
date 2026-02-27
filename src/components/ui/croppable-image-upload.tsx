import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Camera, X, Loader2, ImageIcon } from 'lucide-react';
import { cn, friendlyError } from '@/lib/utils';
import { ImageCropDialog } from './image-crop-dialog';
import { Capacitor } from '@capacitor/core';

interface CroppableImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  userId: string;
  className?: string;
  aspectRatio?: 'square' | 'video' | 'portrait';
  placeholder?: string;
  cropAspect?: number;
}

export function CroppableImageUpload({
  value,
  onChange,
  folder,
  userId,
  className,
  aspectRatio = 'square',
  placeholder = 'Upload Image',
  cropAspect,
}: CroppableImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveCropAspect = cropAspect ?? (aspectRatio === 'video' ? 16 / 9 : aspectRatio === 'portrait' ? 3 / 4 : 1);

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  const handleUploadBlob = useCallback(async (blob: Blob) => {
    setIsUploading(true);
    try {
      const fileName = `${userId}/${folder}/${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('app-images')
        .upload(fileName, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('app-images').getPublicUrl(data.path);
      onChange(urlData.publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(friendlyError(error));
    } finally {
      setIsUploading(false);
    }
  }, [userId, folder, onChange]);

  const handleNativePick = useCallback(async () => {
    try {
      const { pickOrCaptureImage } = await import('@/lib/native-media');
      const blob = await pickOrCaptureImage();
      if (blob) {
        // Show crop dialog with the native image
        const objectUrl = URL.createObjectURL(blob);
        setCropSrc(objectUrl);
      }
    } catch (err: any) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('canceled')) return;
      console.error('Native pick error:', err);
      toast.error('Failed to select image');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images are allowed');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image must be less than 5MB');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropSrc(null);
    await handleUploadBlob(blob);
  };

  const handleRemove = async () => {
    if (!value) return;
    try {
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

  const handlePickImage = () => {
    if (Capacitor.isNativePlatform()) {
      handleNativePick();
    } else {
      inputRef.current?.click();
    }
  };

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {value ? (
        <div className={cn('relative rounded-lg overflow-hidden border border-border max-h-48', aspectClasses[aspectRatio])}>
          <img src={value} alt="Uploaded" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={handlePickImage} disabled={isUploading}>
              <Camera size={16} className="mr-1" /> Change
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={handleRemove} disabled={isUploading}>
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
          onClick={handlePickImage}
          disabled={isUploading}
          className={cn(
            'w-full rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors',
            'flex items-center justify-center gap-3 text-muted-foreground h-24 px-4'
          )}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <ImageIcon size={18} />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium block">{placeholder}</span>
                <span className="text-[10px]">JPG, PNG, WebP (max 5MB)</span>
              </div>
            </>
          )}
        </button>
      )}

      {cropSrc && (
        <ImageCropDialog
          open={!!cropSrc}
          onOpenChange={(open) => { if (!open) { URL.revokeObjectURL(cropSrc); setCropSrc(null); } }}
          imageSrc={cropSrc}
          aspectRatio={effectiveCropAspect}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
