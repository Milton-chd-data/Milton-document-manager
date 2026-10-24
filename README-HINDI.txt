MILTON DOCUMENT MANAGER - ADMIN APPROVAL UPDATE

Files:
- index.html: adds an Admin Dashboard panel for pending registrations.
- app.js: checks approval at sign-in, lists pending users for admin, and adds Approve/Reject.
- approval-setup.sql: adds status, signup trigger, and user_profiles RLS policies.

IMPORTANT:
1. Back up the current files first.
2. Run approval-setup.sql once in Supabase SQL Editor.
3. Replace index.html and app.js in the root of the GitHub Pages repository.
4. Commit the changes, wait for GitHub Pages to deploy, then hard-refresh the website (Ctrl+F5).
5. Test with the admin account and an unapproved test account.
6. Do not put Supabase service_role keys in browser code. The publishable key in app.js is intended for browser use.

SCOPE:
This adds approval workflow only. It does not add Google Drive storage or automatic photo-to-PDF conversion.
The browser UI is not the security boundary by itself; RLS must remain enabled. Review document and Storage policies separately before relying on admin-only edit/delete.
