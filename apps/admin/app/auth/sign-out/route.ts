import { signOut } from "@geek/supabase";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTH_ROUTES } from "../../../lib/auth/routes";
import { createGeekServerClient } from "../../../lib/supabase/server";

/**
 * Ends the session and clears the Auth cookies.
 *
 * POST only: a GET sign-out can be triggered by any image or link on a page,
 * which makes signing the user out something a third-party site can do.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = await createGeekServerClient();

  await signOut(client);

  return NextResponse.redirect(new URL(AUTH_ROUTES.signIn, request.nextUrl.origin));
}
