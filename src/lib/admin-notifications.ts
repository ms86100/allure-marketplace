import { supabase } from '@/integrations/supabase/client';
import { sendPushNotification } from '@/lib/notifications';

/**
 * Shared notification layer for all admin review actions.
 * Every seller/license/product status change MUST go through these functions.
 */

export async function notifySellerStatusChange(
  userId: string,
  businessName: string,
  status: 'approved' | 'rejected' | 'suspended',
  rejectionNote?: string,
) {
  const titleMap: Record<string, string> = {
    approved: '🎉 Congratulations! Your store is approved!',
    rejected: '❌ Store application rejected',
    suspended: '⚠️ Store suspended',
  };

  const bodyMap: Record<string, string> = {
    approved: `Your store "${businessName}" has been approved and is now live. Start selling to your neighbors!`,
    rejected: rejectionNote
      ? `Your store application for "${businessName}" was rejected. Reason: ${rejectionNote}`
      : `Your store application for "${businessName}" was rejected. Please review and resubmit.`,
    suspended: `Your store "${businessName}" has been suspended. Please contact your admin for details.`,
  };

  const typeMap: Record<string, string> = {
    approved: 'seller_approved',
    rejected: 'seller_rejected',
    suspended: 'seller_suspended',
  };

  const title = titleMap[status];
  const body = bodyMap[status];
  const type = typeMap[status];

  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    title,
    body,
    type,
    is_read: false,
  });
  if (error) console.error('Failed to insert seller notification:', error);

  sendPushNotification({ userId, title, body }).catch(() => {});
}

export async function notifyLicenseStatusChange(
  userId: string,
  licenseType: string,
  status: 'approved' | 'rejected',
  adminNotes?: string,
) {
  const title = status === 'approved'
    ? `✅ Your ${licenseType} has been verified!`
    : `❌ Your ${licenseType} was rejected`;

  const body = status === 'approved'
    ? `Your ${licenseType} has been verified. You're all set!`
    : `Your ${licenseType} was rejected.${adminNotes ? ` Reason: ${adminNotes}` : ' Please re-upload a valid document.'}`;

  const type = status === 'approved' ? 'license_approved' : 'license_rejected';

  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    title,
    body,
    type,
    is_read: false,
  });
  if (error) console.error('Failed to insert license notification:', error);

  sendPushNotification({ userId, title, body }).catch(() => {});
}

export async function notifyProductStatusChange(
  userId: string,
  productName: string,
  businessName: string,
  status: 'approved' | 'rejected',
  rejectionNote?: string,
) {
  const title = status === 'approved'
    ? `✅ Product "${productName}" approved!`
    : `❌ Product "${productName}" rejected`;

  const body = status === 'approved'
    ? `Your product "${productName}" from "${businessName}" is now live on the marketplace.`
    : `Your product "${productName}" was rejected.${rejectionNote ? ` Reason: ${rejectionNote}` : ' Please review and update.'}`;

  const type = status === 'approved' ? 'product_approved' : 'product_rejected';

  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    title,
    body,
    type,
    is_read: false,
  });
  if (error) console.error('Failed to insert product notification:', error);

  sendPushNotification({ userId, title, body }).catch(() => {});
}
