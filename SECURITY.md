# Security

## Reporting a problem
Please report security problems privately, using GitHub's "Report a vulnerability" button on the Security tab of this repository. Do not open a public issue for them. Expect a first reply within a few days; this is a small side project run by one person.

## What matters most here
- **Pool photos and names.** Sheets show people's handwriting and sometimes phone numbers. Photos are stored in a private bucket and served only through the API; they are never logged. Anything that exposes another person's sheet or photo is in scope.
- **The owner code and personal keys.** Anything that lets someone act without a valid key, or read another person's sheets, is in scope.
- **Spend.** Photo and name reading call a paid model. Ways to bypass the access keys or the daily read cap are in scope.

## Running your own copy
Set `INVITE_CODE` to a long random value (the server refuses to start in production without one), keep the photo bucket private with public access prevention on, and set a billing budget alert. See `docs/DEPLOY.md`.

Never commit real pool photos, names or phone numbers, including in test data.
