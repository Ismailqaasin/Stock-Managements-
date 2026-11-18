import { NextResponse, type NextRequest } from "next/server";
// A navigation hint only. Every protected API call independently verifies the JWT
// and its unrevoked database session; this cookie never grants data access.
export function middleware(req: NextRequest) {
  const [, locale, page] = req.nextUrl.pathname.split("/");
  if (
    process.env.STOCKROOM_PRIVATE_PREVIEW === "1" ||
    page === "login" ||
    req.cookies.has("stockroom_session")
  )
    return NextResponse.next();
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/${locale}/login${req.nextUrl.searchParams.has("defaultLocale") ? "?defaultLocale=1" : ""}`,
    },
  });
}
export const config = { matcher: ["/en/:path*", "/so/:path*"] };
