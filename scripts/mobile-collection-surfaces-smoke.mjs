import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isWishlistTargetOwned,
  selectUnambiguousCopyId,
} from "../apps/mobile/navigation/collection-surface-rules.ts";
import {
  getCopyPhotoRolePrompt,
  OWNED_COPY_PHOTO_ROLES,
  resolveAlbumMedia,
  resolveCatalogMedia,
  resolveOwnedCopyPhotoRole,
  resolveOwnedCopyMedia,
  resolveRevealMediaUrl,
  resolveWishlistMedia,
  selectCopyPhotosForRole,
} from "../apps/mobile/navigation/presentation-media.ts";

const copies = [
  { id: "copy-a", gameId: "game-a", editionId: "edition-a" },
  { id: "copy-b", gameId: "game-a", editionId: "edition-b" },
];

assert.equal(
  isWishlistTargetOwned({ gameId: "game-a", editionId: null }, copies),
  true,
  "a broad WishlistIntent remains Game-level",
);
assert.equal(
  isWishlistTargetOwned({ gameId: "game-a", editionId: "edition-a" }, copies),
  true,
  "an exact WishlistIntent keeps exact Edition identity",
);
assert.equal(
  isWishlistTargetOwned({ gameId: "game-a", editionId: "edition-c" }, copies),
  false,
  "another Edition of an owned Game does not satisfy an exact intent",
);

assert.equal(selectUnambiguousCopyId([]), undefined);
assert.equal(selectUnambiguousCopyId(["copy-a"]), "copy-a");
assert.equal(
  selectUnambiguousCopyId(["copy-a", "copy-b"]),
  undefined,
  "multiple satisfying Copies never select a random primary Copy",
);

assert.deepEqual(
  resolveOwnedCopyMedia({
    copyPhotoUrl: "private-copy-photo",
    editionCatalogUrl: "edition-cover",
    gameCatalogUrl: "game-cover",
  }),
  { uri: "private-copy-photo" },
);
assert.deepEqual(
  resolveCatalogMedia({ editionCatalogUrl: "edition-cover", gameCatalogUrl: "game-cover" }),
  { uri: "edition-cover" },
  "catalog contexts never accept Copy-photo input",
);
assert.deepEqual(
  resolveWishlistMedia(
    { editionCatalogUrl: "arbitrary-edition-cover", gameCatalogUrl: "game-cover" },
    false,
  ),
  { uri: "game-cover" },
  "a broad WishlistIntent never borrows arbitrary Edition media",
);
assert.deepEqual(
  resolveAlbumMedia(
    {
      copyPhotoUrl: "private-copy-photo",
      editionCatalogUrl: "edition-cover",
      gameCatalogUrl: "game-cover",
    },
    0,
  ),
  { uri: "edition-cover" },
  "a missing Album slot never uses a private Copy photo",
);
assert.deepEqual(
  resolveAlbumMedia(
    {
      copyPhotoUrl: "private-copy-photo",
      editionCatalogUrl: "edition-cover",
      gameCatalogUrl: "game-cover",
    },
    1,
  ),
  { uri: "private-copy-photo" },
  "one exact owner-visible Copy may supply its primary photo",
);
assert.deepEqual(
  resolveAlbumMedia(
    {
      copyPhotoUrl: "private-copy-photo",
      editionCatalogUrl: "edition-cover",
      gameCatalogUrl: "game-cover",
    },
    2,
  ),
  { uri: "edition-cover" },
  "ambiguous ownership falls back to catalog media",
);
assert.equal(resolveCatalogMedia({}), undefined, "missing safe media uses the Geek placeholder");

assert.equal(
  resolveRevealMediaUrl({
    copyPhotoUrl: "new-copy-photo",
    editionCatalogUrl: "edition-cover",
    gameCatalogUrl: "game-cover",
  }),
  "new-copy-photo",
  "a newly uploaded Copy photo leads the stable reveal media",
);
assert.equal(
  resolveRevealMediaUrl({ editionCatalogUrl: "edition-cover", gameCatalogUrl: "game-cover" }),
  "edition-cover",
  "an Edition cover leads when no Copy photo exists",
);
assert.equal(
  resolveRevealMediaUrl({ gameCatalogUrl: "game-cover" }),
  "game-cover",
  "a Game cover leads when exact Edition media is unavailable",
);

const rolePhotos = [
  {
    photo: { editionComponentId: null, photoRole: null },
    signedUrl: "general",
  },
  {
    photo: { editionComponentId: null, photoRole: "cartridge" },
    signedUrl: "cartridge",
  },
  {
    photo: { editionComponentId: "canonical-box-component", photoRole: "box" },
    signedUrl: "box",
  },
  {
    photo: { editionComponentId: null, photoRole: "manual" },
    signedUrl: "manual",
  },
];
assert.deepEqual(
  OWNED_COPY_PHOTO_ROLES,
  ["cartridge", "box", "manual"],
  "Owned Copy always renders exactly three photo-role selectors in stable product order",
);
assert.equal(
  resolveOwnedCopyPhotoRole(null),
  "cartridge",
  "a fresh Owned Copy entry always selects Cartouche",
);
assert.equal(
  resolveOwnedCopyPhotoRole("manual"),
  "manual",
  "an active component remains selected when resolved again",
);
assert.deepEqual(
  selectCopyPhotosForRole(rolePhotos, "cartridge").map(({ signedUrl }) => signedUrl),
  ["cartridge"],
  "Cartouche context never shows an unrelated generic Copy photo",
);
assert.deepEqual(
  selectCopyPhotosForRole(rolePhotos, "box").map(({ signedUrl }) => signedUrl),
  ["box"],
  "Box role is independent from its optional canonical component association",
);
assert.deepEqual(
  selectCopyPhotosForRole(rolePhotos, "manual").map(({ signedUrl }) => signedUrl),
  ["manual"],
  "switching to Notice deterministically replaces the top component media",
);
assert.deepEqual(
  selectCopyPhotosForRole([rolePhotos[0]], "cartridge"),
  [],
  "a selected role without a photo cannot borrow a generic photo",
);
assert.deepEqual(
  resolveCatalogMedia({ editionCatalogUrl: "edition-cover", gameCatalogUrl: "game-cover" }),
  { uri: "edition-cover" },
  "missing component media falls back to the exact Edition cover first",
);
assert.deepEqual(
  resolveCatalogMedia({ gameCatalogUrl: "game-cover" }),
  { uri: "game-cover" },
  "missing Edition cover falls back to the canonical Game cover",
);
assert.equal(getCopyPhotoRolePrompt("cartridge"), "Add a photo of your copy");
assert.equal(getCopyPhotoRolePrompt("box"), "Add a photo of your box");
assert.equal(getCopyPhotoRolePrompt("manual"), "Add a photo of your Notice");
assert.ok(
  readFileSync("apps/mobile/navigation/owned-copy-detail-screen.tsx", "utf8").includes(
    'emptyTitle="Objet manquant"',
  ),
  "selected photo-role context renders the photo-missing title",
);
const ownedCopyDetailSource = readFileSync(
  "apps/mobile/navigation/owned-copy-detail-screen.tsx",
  "utf8",
);
assert.ok(
  ownedCopyDetailSource.includes("fallbackArtwork={artwork}") &&
    ownedCopyDetailSource.includes(
      "if (activePhotoRole !== photoRole) onSelectedPhotoRoleChange(photoRole);",
    ),
  "the hero retains cover fallback and tapping the active selector cannot deselect it",
);
const componentCardSource = readFileSync("apps/mobile/ui/copy-component-card.tsx", "utf8");
assert.ok(
  componentCardSource.includes('mediaState === "photo-present"') &&
    componentCardSource.includes('"Photo ajoutée"') &&
    componentCardSource.includes('"Objet manquant"'),
  "component selector labels are explicitly driven by photo state",
);

for (const file of [
  "apps/mobile/navigation/add-game-search-screen.tsx",
  "apps/mobile/navigation/album-detail-screen.tsx",
  "apps/mobile/navigation/album-reveal-screen.tsx",
  "apps/mobile/navigation/collection-screen.tsx",
  "apps/mobile/navigation/game-regions-screen.tsx",
  "apps/mobile/navigation/marketplace-screen.tsx",
  "apps/mobile/navigation/owned-copy-detail-screen.tsx",
  "apps/mobile/navigation/platform-catalog-screen.tsx",
  "apps/mobile/navigation/screens.tsx",
]) {
  const source = readFileSync(file, "utf8");
  assert.equal(source.includes("CatalogAttribution"), false, `${file} renders no attribution UI`);
  assert.equal(source.includes("Data by MobyGames.com"), false, `${file} renders no provider text`);
}
