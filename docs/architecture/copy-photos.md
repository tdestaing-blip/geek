# Copy photo storage

Copy photos use two coordinated private resources:

- `public.copy_photos` stores canonical identity, Copy relationship, order,
  normalized dimensions, MIME type, byte size, creation time, and an optional
  canonical `edition_component_id`.
- the private `copy-photos` Supabase Storage bucket stores normalized JPEG
  objects at `<copy_id>/<photo_id>.jpg`.

Client code uploads the object first and inserts metadata second. The database
insert trigger locks the Copy, enforces the six-photo limit, assigns the next
order, and refuses metadata without its matching object. If metadata insertion
fails, the data adapter makes a best-effort object cleanup and returns the
original structured failure. No public or durable URL is stored; Owned Copy
reads create five-minute signed URLs for the current display session.

A component-linked photo is still an ordinary private Copy photo and counts
toward the same six-photo Copy limit. The insert trigger verifies that the
component belongs to the Copy's exact Edition. Photo availability and physical
component assessment remain separate: adding or removing a photo never creates
or updates `copy_component_states`, presence, condition, grading, or notes.
General Copy photos keep a null component relationship. Edition correction is
rejected while Edition-specific component photos exist.

Deletion is owner-scoped through a fixed-output `SECURITY DEFINER` function
that derives `auth.uid()` internally, locks the Copy, deletes metadata, and
compacts ordering atomically. Storage deletion follows through the owner-only
Storage API. Copy deletion cascades metadata; application cleanup removes the
private object separately.

CatalogMedia remains an unrelated catalog/provenance model. Copy photos cannot
become catalog cover sources through this feature.

The nullable `photo_role` is Copy-media metadata with the closed vocabulary
`cartridge`, `box`, and `manual`; null remains a generic Copy photo. It is not
Edition catalog truth and does not participate in completeness, condition,
Wishlist, or Match evaluation. Existing photos linked to canonical components
of those exact kinds are non-destructively assigned the matching role.

Owned Copy Detail starts on `cartridge`, always shows the three photo-role
selectors in product order, and shows only photos linked to the active role. A
generic role-null Copy photo never overrides role context. The active role uses
the same private picker, normalization, Storage, metadata, and limit pipeline.
Here, `Objet manquant` means that no photo has been attached to that role; it is
not a physical presence assertion. Without an exact role photo, the hero falls
back through Edition cover, Game cover, and Geek placeholder rather than
becoming blank.

## Presentation resolution

Owner-visible exact Copy surfaces may resolve the Copy's `sort_order = 0`
photo before an exact Edition cover, Game cover, and finally the Geek
placeholder. Collection grids use one bounded owner-scoped metadata read and
one batched Storage signing request rather than signing per tile.

Catalog, Wishlist, missing Album, and public surfaces never receive a private
Copy-photo candidate. An owned Album slot may use a private photo only when one
and only one caller-owned Copy satisfies that slot; ambiguous multi-Copy slots
fall back to rights-safe CatalogMedia instead of selecting an arbitrary Copy.
