import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { LogIn } from 'lucide-react';

export function AuthOnboardingDocs() {
  return (
    <div>
      <DocHero
        icon={LogIn}
        title="Authentication & Onboarding"
        subtitle="Multi-step signup, society assignment, admin-controlled verification, and guided walkthrough for new users."
      />

      <DocSection title="Authentication Flow">
        <p>The AuthPage supports both Login and Signup modes with animated transitions. A hero banner with the platform name and trust badge ("Exclusively for verified residential society members") sets the context.</p>

        <DocSubSection title="Login">
          <DocList items={[
            'Email + password with show/hide toggle',
            '"Forgot Password" link navigates to /reset-password',
            'On success, redirects to Home (/)',
            'If profile not found after login, user sees the society setup step',
          ]} />
        </DocSubSection>

        <DocSubSection title="Signup — Multi-Step Wizard">
          <DocStep number={1} title="Account Details">
            <p>Email, password (with strength indicator: weak/fair/strong/excellent), confirm password, full name. Password requirements shown inline.</p>
          </DocStep>
          <DocStep number={2} title="Society Selection">
            <p>Three sub-steps: (a) Search for society by name with debounced search, (b) Select a matching society, (c) Enter flat/unit details — flat number, block (optional), phase (optional). If no society found, option to request a new one.</p>
          </DocStep>
          <DocStep number={3} title="Phone Verification">
            <p>Phone number input. After signup, user must verify email before they can log in.</p>
          </DocStep>
        </DocSubSection>

        <DocInfoCard variant="info" title="Email Verification Required">
          Users must verify their email before first login. Auto-confirm is disabled by default — admins control this setting.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Verification Pending Screen">
        <p>After signup and email verification, if the user's <code>verification_status</code> is not <code>approved</code>, they see a VerificationPendingScreen explaining their account is under admin review. No access to the app until approved.</p>
      </DocSection>

      <DocSection title="Onboarding Walkthrough">
        <p>First-time approved users see an OnboardingWalkthrough — a multi-step carousel introducing key features (browse marketplace, become a seller, community features). Completion is stored per-user to prevent repeat display.</p>
      </DocSection>

      <DocSection title="Password Reset">
        <p>The /reset-password page allows users to set a new password after clicking the email recovery link. Validates password strength before submission.</p>
      </DocSection>

      <DocSection title="Database & Security">
        <DocList items={[
          'profiles table stores name, phone, flat_number, block, phase, society_id, verification_status, avatar_url',
          'Societies table stores community information with address, latitude, longitude',
          'RLS policies ensure users can only read/update their own profile',
          'Admin verification workflow: admin approves/rejects pending profiles from the Admin Panel',
        ]} />
      </DocSection>
    </div>
  );
}
