import { Navigate } from 'react-router-dom';

/**
 * @deprecated This page has been replaced by GuardKioskPage.
 * All security verification now goes through the unified guard kiosk.
 */
export default function SecurityVerifyPage() {
  return <Navigate to="/guard-kiosk" replace />;
}
