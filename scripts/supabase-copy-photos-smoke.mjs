/** Focused CopyPhoto metadata, Storage, RLS and data-adapter validation. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);

const {
  addCopy,
  addCopyPhoto,
  deleteCopyPhoto,
  getCopyPhotoGallery,
  getCopyPhotos,
  getMyPrimaryCopyPhotos,
} = await import("../packages/data/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const owner = createClient(status.API_URL, status.ANON_KEY, options);
const other = createClient(status.API_URL, status.ANON_KEY, options);
const runId = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const fixtures = {
  userIds: [],
  copyIds: [],
  gameId: null,
  editionId: null,
  otherEditionId: null,
  platformId: null,
};
const uploadedPaths = [];
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function jpegBytes(seed) {
  return Uint8Array.from([0xff, 0xd8, 0xff, seed, 0xff, 0xd9]).buffer;
}

try {
  const beforeMedia = await admin
    .from("catalog_media")
    .select("id", { count: "exact", head: true });

  for (const [client, label] of [
    [owner, "owner"],
    [other, "other"],
  ]) {
    const email = `copy-photo-${label}-${runId}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const userId = created.data.user?.id;
    if (userId) fixtures.userIds.push(userId);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    record(
      `${label} fixture authenticated`,
      Boolean(userId) && signedIn.error === null,
      signedIn.error?.message,
    );
  }

  const platform = await admin
    .from("platforms")
    .insert({ slug: `copy-photo-${runId}`, name: `Copy Photo ${runId}` })
    .select("id")
    .single();
  fixtures.platformId = platform.data?.id ?? null;
  const game = await admin
    .from("games")
    .insert({ canonical_title: `Copy Photo ${runId}` })
    .select("id")
    .single();
  fixtures.gameId = game.data?.id ?? null;
  const edition = await admin
    .from("editions")
    .insert({ game_id: fixtures.gameId, platform_id: fixtures.platformId, edition_name: "Smoke" })
    .select("id")
    .single();
  fixtures.editionId = edition.data?.id ?? null;
  const otherEdition = await admin
    .from("editions")
    .insert({ game_id: fixtures.gameId, platform_id: fixtures.platformId, edition_name: "Other" })
    .select("id")
    .single();
  fixtures.otherEditionId = otherEdition.data?.id ?? null;
  const components = await admin
    .from("edition_components")
    .insert([
      {
        edition_id: fixtures.editionId,
        component_key: "cartridge",
        name: "Cartouche",
        kind: "cartridge",
      },
      {
        edition_id: fixtures.editionId,
        component_key: "box",
        name: "Boîte",
        kind: "box",
      },
      {
        edition_id: fixtures.otherEditionId,
        component_key: "cartridge",
        name: "Cartouche",
        kind: "cartridge",
      },
    ])
    .select("id, edition_id, component_key");
  const componentId =
    components.data?.find(
      ({ edition_id, component_key }) =>
        edition_id === fixtures.editionId && component_key === "cartridge",
    )?.id ?? null;
  const otherComponentId =
    components.data?.find(({ edition_id }) => edition_id === fixtures.otherEditionId)?.id ?? null;
  const neutralComponentId =
    components.data?.find(
      ({ edition_id, component_key }) =>
        edition_id === fixtures.editionId && component_key === "box",
    )?.id ?? null;
  record(
    "catalog fixture created",
    platform.error === null &&
      game.error === null &&
      edition.error === null &&
      otherEdition.error === null &&
      components.error === null,
    platform.error?.message ??
      game.error?.message ??
      edition.error?.message ??
      otherEdition.error?.message ??
      components.error?.message,
  );

  const createdCopy = await addCopy(owner, { editionId: fixtures.editionId });
  const copyId = createdCopy.outcome === "ok" ? createdCopy.data.id : null;
  if (copyId) fixtures.copyIds.push(copyId);
  record("owner creates canonical Copy", copyId !== null);

  const first = await addCopyPhoto(owner, {
    copyId,
    photoId: randomUUID(),
    bytes: jpegBytes(1),
    width: 1200,
    height: 900,
  });
  if (first.outcome === "ok") uploadedPaths.push(first.data.storagePath);
  record(
    "owner uploads private photo and metadata",
    first.outcome === "ok" &&
      first.data.sortOrder === 0 &&
      first.data.mimeType === "image/jpeg" &&
      first.data.editionComponentId === null &&
      first.data.photoRole === null,
    first.outcome === "ok" ? undefined : JSON.stringify(first),
  );

  const initialState = await owner.from("copy_component_states").insert({
    copy_id: copyId,
    edition_id: fixtures.editionId,
    edition_component_id: componentId,
    presence: "present",
    condition_grade: 4,
  });
  const componentPhoto = await addCopyPhoto(owner, {
    copyId,
    editionComponentId: componentId,
    photoRole: "cartridge",
    photoId: randomUUID(),
    bytes: jpegBytes(2),
    width: 1200,
    height: 900,
  });
  if (componentPhoto.outcome === "ok") uploadedPaths.push(componentPhoto.data.storagePath);
  const componentState = await owner
    .from("copy_component_states")
    .select("presence, condition_grade")
    .eq("copy_id", copyId)
    .eq("edition_component_id", componentId)
    .single();
  record(
    "component photo uses canonical component and preserves existing condition",
    initialState.error === null &&
      componentPhoto.outcome === "ok" &&
      componentPhoto.data.editionComponentId === componentId &&
      componentPhoto.data.photoRole === "cartridge" &&
      componentState.data?.presence === "present" &&
      componentState.data.condition_grade === 4,
    initialState.error?.message ??
      componentState.error?.message ??
      (componentPhoto.outcome === "ok" ? undefined : JSON.stringify(componentPhoto)),
  );

  const crossEdition = await addCopyPhoto(owner, {
    copyId,
    editionComponentId: otherComponentId,
    photoId: randomUUID(),
    bytes: jpegBytes(3),
    width: 1200,
    height: 900,
  });
  record("cross-Edition component photo is database-rejected", crossEdition.outcome === "failed");
  const crossEditionUpdate =
    first.outcome === "ok"
      ? await admin
          .from("copy_photos")
          .update({ edition_component_id: otherComponentId })
          .eq("id", first.data.id)
      : { error: new Error("Initial photo insert failed") };
  record(
    "cross-Edition component assignment is rejected on trusted UPDATE",
    crossEditionUpdate.error !== null,
    crossEditionUpdate.error?.message,
  );

  const neutralStateBefore = await owner
    .from("copy_component_states")
    .select("presence, condition_grade, condition_notes")
    .eq("copy_id", copyId)
    .eq("edition_component_id", neutralComponentId)
    .maybeSingle();
  record(
    "no component photo leaves canonical physical presence unassessed",
    neutralStateBefore.error === null && neutralStateBefore.data === null,
    neutralStateBefore.error?.message,
  );

  const neutralPhoto = await addCopyPhoto(owner, {
    copyId,
    editionComponentId: neutralComponentId,
    photoRole: "box",
    photoId: randomUUID(),
    bytes: jpegBytes(4),
    width: 1200,
    height: 900,
  });
  if (neutralPhoto.outcome === "ok") uploadedPaths.push(neutralPhoto.data.storagePath);
  const neutralState = await owner
    .from("copy_component_states")
    .select("presence, condition_grade, condition_notes")
    .eq("copy_id", copyId)
    .eq("edition_component_id", neutralComponentId)
    .maybeSingle();
  record(
    "photo role does not fabricate physical presence or condition",
    neutralPhoto.outcome === "ok" &&
      neutralPhoto.data.photoRole === "box" &&
      neutralState.data === null,
    neutralState.error?.message,
  );

  const ownerGallery = await getCopyPhotoGallery(owner, copyId);
  record(
    "owner reads a short-lived signed gallery URL",
    ownerGallery.outcome === "ok" &&
      ownerGallery.data.length === 3 &&
      ownerGallery.data.every(({ signedUrl }) => signedUrl.length > 0),
  );
  record(
    "other collector cannot read private metadata",
    (await getCopyPhotos(other, copyId)).outcome === "not_found",
  );
  record(
    "anonymous caller cannot read private metadata",
    (await getCopyPhotos(anonymous, copyId)).outcome === "unauthenticated",
  );
  const ownerPrimary = await getMyPrimaryCopyPhotos(owner, [copyId]);
  record(
    "owner batch reads only the primary signed Copy photo",
    ownerPrimary.outcome === "ok" &&
      ownerPrimary.data.length === 1 &&
      ownerPrimary.data[0].photo.copyId === copyId &&
      ownerPrimary.data[0].photo.sortOrder === 0,
  );
  const otherPrimary = await getMyPrimaryCopyPhotos(other, [copyId]);
  record(
    "another collector batch cannot obtain an owner Copy photo",
    otherPrimary.outcome === "ok" && otherPrimary.data.length === 0,
  );
  record(
    "anonymous batch cannot obtain private Copy photos",
    (await getMyPrimaryCopyPhotos(anonymous, [copyId])).outcome === "unauthenticated",
  );

  const otherDownload = await other.storage.from("copy-photos").download(first.data.storagePath);
  record("other collector cannot download private object", otherDownload.error !== null);
  const anonymousDownload = await anonymous.storage
    .from("copy-photos")
    .download(first.data.storagePath);
  record("anonymous caller cannot download private object", anonymousDownload.error !== null);

  const spoofPath = `${copyId}/${randomUUID()}.jpg`;
  const spoofUpload = await other.storage.from("copy-photos").upload(spoofPath, jpegBytes(2), {
    contentType: "image/jpeg",
  });
  record("other collector cannot upload into owner path", spoofUpload.error !== null);

  for (let index = 3; index < 6; index += 1) {
    const result = await addCopyPhoto(owner, {
      copyId,
      photoId: randomUUID(),
      bytes: jpegBytes(index + 3),
      width: 900,
      height: 1200,
    });
    if (result.outcome === "ok") uploadedPaths.push(result.data.storagePath);
  }
  const six = await getCopyPhotos(owner, copyId);
  record(
    "six-photo limit preserves deterministic ordering",
    six.outcome === "ok" &&
      six.data.length === 6 &&
      six.data.every((photo, index) => photo.sortOrder === index),
  );
  const seventh = await addCopyPhoto(owner, {
    copyId,
    photoId: randomUUID(),
    bytes: jpegBytes(9),
    width: 100,
    height: 100,
  });
  record("seventh photo is rejected before upload", seventh.outcome === "limit_reached");

  const photoToDelete = six.outcome === "ok" ? six.data[2] : null;
  const deleted = photoToDelete ? await deleteCopyPhoto(owner, photoToDelete.id) : null;
  if (photoToDelete) {
    const pathIndex = uploadedPaths.indexOf(photoToDelete.storagePath);
    if (pathIndex >= 0) uploadedPaths.splice(pathIndex, 1);
  }
  const afterDelete = await getCopyPhotos(owner, copyId);
  record(
    "delete removes object metadata and compacts ordering",
    deleted?.outcome === "ok" &&
      afterDelete.outcome === "ok" &&
      afterDelete.data.length === 5 &&
      afterDelete.data.every((photo, index) => photo.sortOrder === index),
    deleted?.outcome === "ok"
      ? deleted.data.storageCleanupWarning
        ? "Storage cleanup warning"
        : undefined
      : JSON.stringify(deleted),
  );

  const copiedObject =
    deleted?.outcome === "ok"
      ? await owner.storage.from("copy-photos").download(deleted.data.photo.storagePath)
      : null;
  record("deleted private object is no longer readable", copiedObject?.error !== null);

  const copyDelete = await admin.from("copies").delete().eq("id", copyId);
  const orphanMetadata = await admin
    .from("copy_photos")
    .select("id", { count: "exact", head: true })
    .eq("copy_id", copyId);
  record(
    "Copy deletion cascades photo metadata without orphan rows",
    copyDelete.error === null && orphanMetadata.count === 0,
    copyDelete.error?.message ?? orphanMetadata.error?.message,
  );
  fixtures.copyIds.length = 0;

  const afterMedia = await admin.from("catalog_media").select("id", { count: "exact", head: true });
  record(
    "CatalogMedia remains independent and unchanged",
    beforeMedia.error === null &&
      afterMedia.error === null &&
      beforeMedia.count === afterMedia.count,
  );
} finally {
  if (uploadedPaths.length > 0) {
    await admin.storage.from("copy-photos").remove(uploadedPaths);
  }
  if (fixtures.copyIds.length > 0) await admin.from("copies").delete().in("id", fixtures.copyIds);
  if (fixtures.otherEditionId)
    await admin.from("editions").delete().eq("id", fixtures.otherEditionId);
  if (fixtures.editionId) await admin.from("editions").delete().eq("id", fixtures.editionId);
  if (fixtures.gameId) await admin.from("games").delete().eq("id", fixtures.gameId);
  if (fixtures.platformId) await admin.from("platforms").delete().eq("id", fixtures.platformId);
  for (const userId of fixtures.userIds) await admin.auth.admin.deleteUser(userId);
}

const failures = results.filter((result) => !result.passed);
if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} CopyPhoto smoke check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\n${results.length}/${results.length} CopyPhoto smoke checks passed.\n`);
}
