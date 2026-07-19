# Rights, privacy, and provenance checklist

Every image must have a defensible right to be used for machine learning.

Accepted examples:

- Photograph captured by your organisation.
- Photograph supplied under a signed partner agreement.
- Photograph covered by a licence that permits the intended commercial ML use.
- Photograph supplied by a user under product terms and consent that permit model
  development.

Do not assume that public visibility means permission to scrape, redistribute, or
train commercially.

Required manifest evidence:

- `source_owner`
- `source_type`
- `license_or_permission`
- `permission_evidence`
- `country`
- `emirate`
- `photo_session_id`
- `vehicle_id`

Privacy review:

- Remove unnecessary EXIF GPS data before distribution.
- Avoid visible faces where possible.
- Blur licence plates if project policy requires it.
- Do not include identity documents, phone numbers, auction account details, or
  other sensitive information.
- Keep the Kaggle dataset private.
