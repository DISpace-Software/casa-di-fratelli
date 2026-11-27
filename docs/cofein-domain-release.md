# Cofein custom domain — 26 November 2026

## Production configuration

Canonical website: https://www.cofeinclub.com (the apex redirects here).
Render service: `srv-d7drmgl8nd3s73dvukn0`.

Updated service environment settings, scoped to the existing Cofein tenant:

- `Tenancy__Tenants__1__Domain`: `www.cofeinclub.com`
- `Tenancy__Tenants__1__FrontendUrl`: `https://www.cofeinclub.com`
- `Tenancy__Tenants__1__FrontendOrigins__1`: `https://cofeinclub.com`
- `Tenancy__Tenants__1__FrontendOrigins__2`: `https://www.cofeinclub.com`

Origin index 0 retains the previous Vercel URL for compatibility. No wildcard
origin was added. These runtime settings feed the public mobile catalogue,
admin media base URL, tenant resolution, CORS and generated public links.
The source tree contains no production Cofein URL override; test fixtures with
the old URL exercise generic asset resolution and intentionally remain fixtures.

Applied using deploy `dep-dc4actajnfac73c1fj40`, reusing live commit
`772b9b9174f3508e50eabe137c1cc7d68a565b06`. The architecture branch was not deployed.

## Verification

- Public restaurant catalogue and admin context return the new website URL.
- GET/POST preflight permits both custom-domain origins and the existing preview.
- An unrelated origin receives no Access-Control-Allow-Origin header.
- Real Chrome, mobile viewport: production website → tomorrow at 18:00 →
  availability → select T19 → contact form. Seven API responses were HTTP 200,
  four table buttons were selectable, and no page/request errors occurred.
- No production booking or email was created by the check.
- Local DNS was inconsistent during rollout; Chrome used a host resolver mapping
  to the published IP returned by a public DNS resolver, preserving the actual
  HTTPS hostname, certificate checks and browser CORS enforcement. This does not
  prove DNS has propagated to every user's resolver.

## Email: deferred by the owner

Cofein currently has `NotificationsEnabled=false` and no tenant-specific Resend
sender/key configured. Its reservations are confirmed automatically in the UI;
restaurant confirmation emails are disabled. A domain migration alone does not
activate email. Existing Casa and platform authentication sender settings were
left unchanged.

Future corporate transactional delivery should use one explicitly verified
platform sender and API credential, with restaurant-specific display name,
content and Reply-To. Keep marketing sender/reputation separate. Existing
`Platform:Email:*` configuration serves guest authentication and waitlist email;
reservation EmailService still resolves tenant-scoped credentials. Implement and
test shared transactional transport resolution before enabling Cofein email;
simply changing Platform:Email:From is insufficient. Also verify the destination
routes of each email template on Cofein's isolated site before enabling them.

The owner deferred corporate domain selection. Do not assume ownership of
seatmap.com or sitmap.com, and do not enable sending with an unverified address.
Resend domain guidance: https://resend.com/docs/dashboard/domains/introduction
