# Identity

Geek separates authentication credentials from public profile identity.

## Authentication infrastructure

Supabase `auth.users` is authentication infrastructure. It owns
authentication credentials and provider-specific authentication state; it is
not Geek's public user profile model.

Geek's public identity lives in `public.profiles`. A profile's `id` references
`auth.users.id`, and deleting an authentication user removes the corresponding
profile.

A profile may exist before onboarding is complete. `username` may therefore be
null initially, and Geek does not invent a username or display name when the
profile is created.

## Public profile boundary

`public.profiles` contains only information that is safe for public profile
exposure:

- username
- display name
- avatar path
- biography

Private account data must never be added to `public.profiles` merely for
convenience. Exact location, addresses, payment data, private preferences,
authentication credentials, and private notes do not belong in this table.

Public profile identity is conceptually separate from authentication
credentials even though both records share the authentication user's UUID.

## Usernames

When present, usernames are lowercase, between 3 and 30 characters, and contain
only lowercase letters, numbers, and underscores. Usernames are
case-insensitively unique.
