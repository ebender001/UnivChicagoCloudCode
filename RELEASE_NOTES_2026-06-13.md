# UnivChicagoCloudCode Release Notes

Release date: 2026-06-13

## Summary

This release expands dashboard support APIs for password reset, exports, seed-data management, device provisioning, and user administration while aligning CloudCode behavior with the latest dashboard app updates.

## Highlights

- Updated the dashboard password reset request flow used by the web login overlay.
- Added role-table based access handling for invitation and export flows.
- Added managed seed-data CloudCode functions to support dashboard administration workflows.
- Extended export support with survey CSV export, frailty score export, activity export format options, and filtered activity export options.

## Survey And Enrollee Data

- Added enrollee number support in survey list responses so the dashboard can label records more clearly.

## Device And Activity Ingestion

- Added watch device provisioning support.
- Linked watch uploads to provisioned devices for cleaner device-to-upload association.
- Added watch app health-data upload support.

## Admin And Account Support

- Added dashboard PIN generation and user-status administration support.
- Updated password reset behavior to support the newer dashboard login recovery flow.

## User Impact

- Dashboard export options are broader and better aligned with operational reporting needs.
- Administrative tooling now supports more of the account lifecycle directly through CloudCode-backed workflows.
- Device ingestion and provisioning flows provide a stronger foundation for watch-based activity collection.

## Deployment Notes

- This backend release is intended to ship alongside the matching `UnivChicagoApp` release dated 2026-06-13.
- Frontend features for forgot password, filtered exports, enrollee-number display, and session-expiration messaging rely on these CloudCode updates being present in the deployed environment where applicable.
