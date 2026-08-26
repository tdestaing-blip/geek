# Copy photo storage

Copy photos use two coordinated private resources:

- `public.copy_photos` stores canonical identity, Copy relationship, order,
  normalized dimensions, MIME type, byte size, and creation time.
- the private `copy-photos` Supabase Storage bucket stores normalized JPEG
  objects at `<copy_id>/<photo_id>.jpg`.

Client code uploads the object first and inserts metadata second. The database
insert trigger locks the Copy, enforces the six-photo limit, assigns the next
order, and refuses metadata without its matching object. If metadata insertion
fails, the data adapter makes a best-effort object cleanup and returns the
original structured failure. No public or durable URL is stored; Owned Copy
reads create five-minute signed URLs for the current display session.

Deletion is owner-scoped through a fixed-output `SECURITY DEFINER` function
that derives `auth.uid()` internally, locks the Copy, deletes metadata, and
compacts ordering atomically. Storage deletion follows through the owner-only
Storage API. Copy deletion cascades metadata; application cleanup removes the
private object separately.

CatalogMedia remains an unrelated catalog/provenance model. Copy photos cannot
become catalog cover sources through this feature.
