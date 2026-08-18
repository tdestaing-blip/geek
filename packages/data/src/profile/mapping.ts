import type { Profile } from "@geek/domain";
import type { Tables } from "@geek/supabase";

type ProfileFields = Pick<
  Tables<"profiles">,
  "id" | "username" | "display_name" | "avatar_path" | "bio"
>;

export function toProfile(row: ProfileFields): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    bio: row.bio,
  };
}
