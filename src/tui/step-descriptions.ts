import type { Step } from '../types.js';

export const STEP_DESCRIPTIONS: Record<Step, string> = {
  'at-get-started': 'Browser at the "Get Started" page. No data entered yet.',
  'at-soft-intro-combined': 'Clicked "Find Jobs". Browser at the soft intro screen.',
  'at-vertical-selection': 'Passed intro. Browser at the vertical/service type selection.',
  'at-location': 'Browser at the ZIP code entry page. Account not yet created.',
  'at-preferences': 'ZIP entered. Browser at the preferences/experience page.',
  'at-family-count': 'Preferences set. Browser at the family count page (some verticals skip this).',
  'at-account-creation': 'Browser at the account creation form. Email/password not yet submitted.',
  'at-family-connection': 'Account created. Browser at the family connection page.',
  'at-safety-screening': 'Browser at the safety screening info page.',
  'at-subscriptions': 'Browser at the subscription tier selection (Basic/Premium).',
  'at-basic-payment': 'Selected Basic tier. Browser at the payment/checkout page.',
  'at-premium-payment': 'Selected Premium tier. Browser at the payment/checkout page.',
  'at-app-download': 'Payment complete. Browser at the app download page. Fully enrolled (web).',
  'account-created': 'Provider account created via API. Email and memberId available.',
  'at-build-profile': 'Account created. Profile verticals and attributes set.',
  'at-availability': 'Profile attributes set. Availability schedule configured (Mon-Fri 9-5).',
  'profile-complete': 'Profile fully built: preferences, availability, skills, bio, and photo uploaded.',
  'upgraded': 'Premium subscription activated. Payment processed via Stripe.',
  'at-disclosure': 'Disclosure accepted. Ready for background check.',
  'fully-enrolled': 'Background check submitted and completed via Sterling callback. Fully enrolled.',
};
