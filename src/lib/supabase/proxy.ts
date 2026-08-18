import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicSupabaseConfig } from "@/lib/env";

const protectedPagePrefixes = ["/requests", "/workflows", "/settings"];
const authPagePrefixes = ["/login"];

function isProtectedPage(pathname: string) {
  return protectedPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPage(pathname: string) {
  return authPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { url, publishableKey, isConfigured } = getPublicSupabaseConfig();
  const pathname = request.nextUrl.pathname;

  if (!isConfigured || !url || !publishableKey) {
    if (isProtectedPage(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  if (!user && isProtectedPage(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
  }

  if (user && isAuthPage(pathname)) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/requests";
    appUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(appUrl));
  }

  return supabaseResponse;
}
