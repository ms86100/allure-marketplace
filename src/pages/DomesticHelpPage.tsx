import { Navigate } from 'react-router-dom';

/**
 * @deprecated This page has been replaced by WorkforceManagementPage.
 * All domestic help registration now goes through the unified workforce flow.
 */
export default function DomesticHelpPage() {
  return <Navigate to="/workforce" replace />;
}
