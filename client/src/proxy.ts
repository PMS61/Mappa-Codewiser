import { NextRequest, NextResponse } from "next/server";
import { verify } from "jsonwebtoken";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token || !process.env.JWT_SECRET) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    verify(token, process.env.JWT_SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: "/dashboard/:path*",
};
