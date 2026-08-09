/**
 * A Geek user as the product knows them.
 *
 * Profile is Geek's own representation of a person and is deliberately separate
 * from the Auth identity that proves who they are.
 *
 * Every descriptive field is nullable because a Profile is created by the
 * database the moment an Auth user exists, carrying nothing but an id. A
 * Profile without a username is a normal, valid, freshly created Profile, not a
 * broken one.
 */
export type Profile = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatarPath: string | null;
  readonly bio: string | null;
};
