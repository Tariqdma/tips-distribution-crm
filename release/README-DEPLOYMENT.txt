Tips CRM — Static Web Release
================================

This folder is prepared for deployment of the static web application.

Contents
--------
- web-dist/      Static SPA build. Upload its contents, not the parent folder.
- DOMAIN_SETUP.md  Custom-domain setup guide.

Deployment requirements
-----------------------
1. Use a host that supports HTTPS and SPA fallback/rewrite to /index.html.
2. Upload every file and directory inside web-dist.
3. Configure unknown paths to return /index.html, preserving the URL.
4. Ensure HTTPS is active before entering the production URL into Supabase redirect settings.

Notes
-----
- This web release contains the administration portal and the web version of the employee experience.
- The native employee application is delivered from the same project via the Publish flow in the management interface; do not attempt to build the Android package manually from this static web folder.
