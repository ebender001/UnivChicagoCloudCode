# UnivChicagoCloudCode Release Notes

Release date: 2026-11-11

## Summary

This release supports the updated grip and gait workflow.

## Highlights

- `listEnrollees` accepts an optional `surveyLinked` parameter: `true` returns enrollees with a linked survey, `false` returns enrollees without one. Omitting it returns all enrollees as before.
- `saveEnrollee` no longer requires an 8-digit enrollee number or start and stop dates, and no longer performs a duplicate-number check. Existing stored values are preserved.

## Deployment Notes

- Deploy this release before the matching `UnivChicagoApp` release dated 2026-11-11.
