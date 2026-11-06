# UnivChicagoCloudCode Release Notes

Release date: 2026-11-06

## Summary

This release adds invitation resend support and case-insensitive username handling.

## Highlights

- Added the `resendDashboardUserInvite` CloudCode function. It applies the same role and institution checks as a new invite, only works for users with a pending invitation, issues a new token with a 7-day expiry (invalidating earlier links), and sends the invitation email.
- `listUsers` now returns `hasPendingInvite` for each user.
- Added shared `userLookup.js`. Login, PIN generation, and password reset now match usernames case-insensitively (or by email).
- Invite activation now rejects usernames that differ from an existing one only by case.

## Deployment Notes

- Deploy this release before the matching `UnivChicagoApp` release dated 2026-11-06.
- Existing usernames that differ only by case should be reviewed; login prefers an exact-case match.
