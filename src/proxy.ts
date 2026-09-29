import { NextResponse, type NextRequest } from "next/server";
import { authConfig, isPublicPath, SESSION_COOKIE, verifySessionToken } from "./lib/auth";

/**
 * The first gate in front of Callbook. Every page except the public request
 * form and the sign-in page needs a valid session cookie. Without one, page
 * visits go to sign-in, and anything else (a Server Action call, a POST) is
 * refused.
 *
 * Internal Server Actions check the session again themselves, because an
 * action can be posted to a public page's address and would pass this gate.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const config = authConfig();
  const signedIn = config
    ? await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret)
    : false;
  if (signedIn) return NextResponse.next();

  const isPageVisit = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  if (!isPageVisit) return new NextResponse("Sign in required.", { status: 401 });

  // Come back to the same page after signing in (minus Next's internal `_rsc` marker).
  const returnTo = new URL(request.nextUrl);
  returnTo.searchParams.delete("_rsc");
  const signIn = new URL("/login", request.url);
  signIn.searchParams.set("next", `${returnTo.pathname}${returnTo.search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
