import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import {
  GET_PAYMENT_METHODS_INFORMATION,
  UPGRADE_PROVIDER_SUBSCRIPTION,
} from '../api/graphql.js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_UZuwv5SEujgQze49pdvUY8zp';
const STRIPE_TOKENS_URL = 'https://api.stripe.com/v1/tokens';

async function createStripeToken(): Promise<string> {
  const res = await fetch(STRIPE_TOKENS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${STRIPE_PUBLISHABLE_KEY}`,
    },
    body: new URLSearchParams({
      'card[number]': '4111111111111111',
      'card[exp_month]': '9',
      'card[exp_year]': '2032',
      'card[cvc]': '123',
      'card[name]': 'Martina Goodram',
    }).toString(),
  });
  const json = await res.json();
  if (!json.id) {
    throw new Error(`Stripe token creation failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.id as string;
}

const VANTIV_EPROTECT_URL =
  'https://request.eprotect.vantivprelive.com/eProtect/paypage';

export async function getVantivPPRID(): Promise<string> {
  const params = new URLSearchParams({
    paypageId: '7criYPaXstiHVTwq',
    reportGroup: 'Care.com',
    orderId: '12345',
    id: '12345',
    accountNumber: '4111111111111111',
    cvv: '123',
  });
  const res = await fetch(VANTIV_EPROTECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json = await res.json();
  if (!json.paypageRegistrationId) {
    throw new Error(`Vantiv PPRID response missing ID: ${JSON.stringify(json)}`);
  }
  return json.paypageRegistrationId;
}

const SCREENING_PRICING: Record<string, { planId: string; schemeId: string }> = {
  basic: { planId: 'PRO_PB_FEB2512001', schemeId: 'PRO_PB_FEB2512' },
  premium: { planId: 'PRO_FEAT_FEB2512001', schemeId: 'PRO_FEAT_FEB2512' },
};

async function doVantivUpgrade(
  client: ApiClient,
  ctx: ProviderContext,
  planId: string,
  schemeId: string,
  label: string
): Promise<void> {
  const pprid = await getVantivPPRID();
  const result = await client.restPostSpi(
    'provider/upgrade/subscription',
    ctx.authToken,
    {
      firstNameOnCard: 'Martina',
      lastNameOnCard: 'Goodram',
      expirationMonth: '09',
      expirationYear: '32',
      billingZIP: '72204',
      dateOfBirth: '1995-07-26T00:00',
      cardType: 'Visa',
      pricingPlanId: planId,
      pricingSchemeId: schemeId,
      payPageResponseRegistrationId: pprid,
      lastFourDigits: '1111',
      firstSixDigits: '411111',
      usingVantivEprotectIframe: 'true',
    }
  );

  console.log(`    ${label} upgrade response:`, JSON.stringify(result).slice(0, 500));
  if (result?.statusCode !== 200) {
    throw new Error(`${label} upgrade failed: ${JSON.stringify(result).slice(0, 300)}`);
  }
}

export async function screeningUpgradeRest(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  const basic = SCREENING_PRICING.basic;
  await doVantivUpgrade(client, ctx, basic.planId, basic.schemeId, 'Basic screening');
  console.log('  ✓ Basic screening upgrade completed');

  if (ctx.tier === 'premium') {
    const premium = SCREENING_PRICING.premium;
    await doVantivUpgrade(client, ctx, premium.planId, premium.schemeId, 'Premium');
    console.log('  ✓ Premium upgrade completed');
  }
}

export async function setupPayment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.restPostSpi(
    'payment/stripe/addAccount',
    ctx.authToken,
    payloads.p2pStripeAccountInput,
  );

  console.log('  ✓ P2P Stripe account linked');
}

export async function upgradeSubscription(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () => client.graphql(GET_PAYMENT_METHODS_INFORMATION, {}),
    3,
    'Get payment methods (create Stripe customer)'
  );

  const stripeToken = await createStripeToken();
  console.log(`  ✓ Stripe token created: ${stripeToken.slice(0, 12)}…`);

  const pricing = payloads.pricingConfig[ctx.tier];
  const upgradeInput = {
    billingZIP: '72204',
    familyName: 'Goodram',
    givenName: 'Martina',
    pricingSchemeId: pricing.pricingSchemeId,
    pricingPlanId: pricing.pricingPlanId,
    promoCode: pricing.promoCode,
    paymentIdentifier: {
      id: stripeToken,
      type: 'STRIPE_TOKEN',
    },
  };

  await client.retryRequest(
    () =>
      client.graphql(UPGRADE_PROVIDER_SUBSCRIPTION, {
        input: upgradeInput,
      }),
    3,
    'Upgrade provider subscription'
  );

  console.log(`  ✓ Upgraded to ${ctx.tier}`);
}
