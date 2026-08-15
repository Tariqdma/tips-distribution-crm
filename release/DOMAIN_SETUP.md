# Tips CRM — Custom Domain Setup

## Current web application

The published web application is currently available at:

`https://tipscrm-vevc4ncu.manus.space`

For a company-facing address, use a dedicated subdomain such as **crm.tips-sd.com**. Keeping the main public corporate website at `tips-sd.com` separate avoids accidental replacement of the company site.

## Recommended activation sequence

1. Open the project **Publish / Domains** settings in the management interface and select **Add custom domain**.
2. Enter `crm.tips-sd.com` and copy the exact DNS record and target shown there. The hosting provider is authoritative for this value, so do not use a guessed record.
3. In the DNS panel for `tips-sd.com`, create the requested **CNAME** record for host `crm`, pointing to the exact target provided by the hosting settings.
4. Wait for DNS verification and HTTPS certificate issuance, then open `https://crm.tips-sd.com` and confirm it loads the Tips CRM sign-in page.
5. In Supabase Authentication URL settings, add `https://crm.tips-sd.com` to the allowed redirect URLs. This is required for password recovery and invitation links.
6. Update any email template links that use the current temporary published URL after verification.

## Important safeguards

- Do not change the root record for `tips-sd.com` unless the company website is intentionally being moved.
- Do not point multiple conflicting CNAME records at `crm`.
- Keep the current published URL active as a rollback address until the custom domain is verified.
- The mobile application remains a separate employee app, even though it shares the same accounts, Supabase data, and role permissions with the web portal.
