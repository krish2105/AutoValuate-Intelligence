# Billing (Stripe test mode) — setup

The app ships with billing **off**. The pricing page shows an honest "Checkout isn't connected
yet" state and the `/billing/webhook` endpoint returns `503 billing not configured` until you set
the two secrets below. Turning it on requires **no code change and no redeploy of logic** — only
environment variables and a Stripe payment link. This runs entirely in Stripe **test mode**, so no
real money moves and the free tier is never affected.

The design in one line: **the signed Stripe webhook is the only thing that grants a paid tier.**
The browser is never trusted to claim "I paid" — it only opens Stripe's hosted checkout. Card data
never touches our servers.

---

## What you need

| Secret | Where it goes | Why |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Render (backend) env | Verifies the webhook signature (stdlib HMAC, no Stripe SDK) |
| `SUPABASE_SERVICE_ROLE_KEY` | Render (backend) env | Lets the webhook write `api_keys.tier` (bypasses RLS) |
| `NEXT_PUBLIC_STRIPE_LINK_PRO` | Vercel (frontend) env | The Pro payment link the button opens |
| `NEXT_PUBLIC_STRIPE_LINK_DEALER` | Vercel (frontend) env | The Dealer payment link |

`SUPABASE_URL` already defaults to the project URL; override it only if you move projects.

---

## Steps (all in the Stripe **test-mode** dashboard)

1. **Create two products** — "Pro" (AED 49/mo) and "Dealer" (AED 199/mo). Recurring prices.

2. **Create a Payment Link for each** (Product catalog → the product → Create payment link).
   - Under **Advanced / metadata**, add metadata `tier=pro` (and `tier=dealer` on the other link).
     This is how the webhook knows which tier was bought — it reads `session.metadata.tier`.
   - Copy each link URL into the Vercel env vars above and redeploy the frontend.

3. **Add the webhook endpoint** (Developers → Webhooks → Add endpoint):
   - URL: `https://autovaluate-api.onrender.com/billing/webhook`
   - Event to send: **`checkout.session.completed`** (that is the only event we act on).
   - After creating it, click **Reveal** the signing secret (`whsec_…`) and put it in Render as
     `STRIPE_WEBHOOK_SECRET`. Set `SUPABASE_SERVICE_ROLE_KEY` too (Supabase → Project settings →
     API → `service_role`). Redeploy the backend.

4. **Done.** A signed-in user clicking Upgrade now goes to Stripe; on payment their tier flips to
   `pro`/`dealer` in `public.api_keys`, lifting their daily quota (see `tier_quota()`).

---

## How the pieces connect

```
signed-in user clicks Upgrade
   │  pricing page appends ?client_reference_id=<supabase auth uid>
   ▼
Stripe hosted checkout (test card 4242 4242 4242 4242)
   │  on success Stripe POSTs checkout.session.completed
   ▼
POST /billing/webhook           backend-api/billing.py
   │  1. verify Stripe-Signature (HMAC-SHA256, 5-min replay window)
   │  2. read client_reference_id (uid) + metadata.tier
   │  3. PATCH api_keys.tier for that uid via the service role
   ▼
user's next API call is metered at the new tier's quota
```

**A signed-out user** has no `client_reference_id`, so a purchase can't be attributed. The webhook
acknowledges the event (200) but records `missing client_reference_id` and grants nothing — we never
take money we can't credit. The pricing button only carries the id once `supabase.auth.getUser()`
resolves a logged-in user.

---

## Testing without a card

Stripe CLI replays real signed events at your local or deployed endpoint:

```bash
stripe listen --forward-to https://autovaluate-api.onrender.com/billing/webhook
stripe trigger checkout.session.completed
```

To test the tier flip end-to-end, use the Stripe test card `4242 4242 4242 4242` (any future expiry,
any CVC) on the payment link while signed in.

Automated coverage lives in `eval/unit_tests.py` (`test_billing_*`): unconfigured → 503,
missing/!bad signature → 400, wrong event type → ignored, valid event → parsed. Those run without
any Stripe secret set (they exercise the signature and gating logic, not a live charge).

---

## Security notes

- **No card data ever reaches us.** Stripe hosts checkout; we only receive a signed "it completed"
  event with an id and a tier.
- **The webhook is not rate-limited or key-metered** (it isn't in `_RATE_PATHS`) because Stripe is
  the caller and it must read the *raw* request body to verify the signature.
- **Replay-protected:** events older than 5 minutes are rejected.
- **Service-role key is backend-only** — it is never exposed to the browser (unlike the anon key).
  Keep it in Render env, never in the frontend bundle.
