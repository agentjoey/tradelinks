/**
 * Task6-T3-r4 regression contract: admin Server Action requests are non-GET,
 * but Neon Auth's get-session endpoint only answers GET. The middleware must
 * run the existing Neon Auth middleware for every /admin/** request, handing
 * it a GET probe (same URL and headers, method normalized) when the original
 * method is neither GET nor HEAD.
 *
 *  - allowed admin POST: auth middleware sees a GET probe with the original
 *    cookie/headers; its next() lets the ORIGINAL request proceed untouched;
 *  - denied admin POST: the auth middleware redirect propagates unchanged and
 *    is never converted into NextResponse.next();
 *  - admin GET/HEAD keep their original methods;
 *  - non-admin locale rewrite/header behavior is unchanged.
 *
 * The Neon Auth instance is mocked so the test is deterministic and never
 * touches the network; the mock records exactly what the auth middleware
 * receives and can play both the allow and the deny path.
 */

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AuthProbe {
  method: string;
  pathname: string;
  cookie: string | null;
  action: string | null;
}

const authState = vi.hoisted(() => ({
  behavior: "allow" as "allow" | "deny",
  probes: [] as AuthProbe[],
}));

vi.mock("../app/lib/auth.js", () => ({
  auth: {
    middleware: () => async (req: NextRequest) => {
      authState.probes.push({
        method: req.method,
        pathname: req.nextUrl.pathname,
        cookie: req.headers.get("cookie"),
        action: req.headers.get("x-nextjs-action"),
      });
      if (authState.behavior === "deny") {
        return NextResponse.redirect(new URL("/auth/sign-in", req.url), 307);
      }
      return NextResponse.next();
    },
  },
}));

import middleware from "../middleware.js";

const SESSION_COOKIE =
  "neon-auth.session_token=tok; neon-auth.session_data=data";

beforeEach(() => {
  authState.behavior = "allow";
  authState.probes = [];
});

describe("admin non-GET auth probe (Task6-T3-r4)", () => {
  it("checks an allowed admin POST as a GET probe with the original cookie and action header", async () => {
    const req = new NextRequest("https://example.com/admin/review", {
      method: "POST",
      headers: {
        cookie: SESSION_COOKIE,
        "x-nextjs-action": "action-id-1",
      },
    });

    const res = await middleware(req);

    // The auth middleware was consulted exactly once, with a GET probe that
    // preserves the URL and the session/action headers.
    expect(authState.probes).toHaveLength(1);
    expect(authState.probes[0]?.method).toBe("GET");
    expect(authState.probes[0]?.pathname).toBe("/admin/review");
    expect(authState.probes[0]?.cookie).toBe(SESSION_COOKIE);
    expect(authState.probes[0]?.action).toBe("action-id-1");

    // Its next() continues the request instead of redirecting it.
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.status).not.toBe(307);
  });

  it("propagates the auth middleware denial for an unauthenticated admin POST", async () => {
    authState.behavior = "deny";
    const req = new NextRequest("https://example.com/admin/review", {
      method: "POST",
      headers: { "x-nextjs-action": "action-id-2" },
    });

    const res = await middleware(req);

    expect(authState.probes).toHaveLength(1);
    expect(authState.probes[0]?.method).toBe("GET");
    // The redirect is propagated unchanged, never turned into next().
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://example.com/auth/sign-in",
    );
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("keeps the original method for admin GET and HEAD", async () => {
    const getRes = await middleware(
      new NextRequest("https://example.com/admin/review", {
        method: "GET",
        headers: { cookie: SESSION_COOKIE },
      }),
    );
    const headRes = await middleware(
      new NextRequest("https://example.com/admin/review", {
        method: "HEAD",
        headers: { cookie: SESSION_COOKIE },
      }),
    );

    expect(authState.probes.map((p) => p.method)).toEqual(["GET", "HEAD"]);
    expect(getRes.headers.get("x-middleware-next")).toBe("1");
    expect(headRes.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves non-admin locale routing untouched (no auth probe)", async () => {
    const res = await middleware(
      new NextRequest("https://example.com/zh/daily", { method: "GET" }),
    );

    expect(authState.probes).toHaveLength(0);
    // /zh/daily rewrites to /daily and carries the locale request headers.
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://example.com/daily",
    );
    expect(res.headers.get("x-middleware-request-x-tl-lang")).toBe("zh");
    expect(res.headers.get("x-middleware-request-x-tl-path")).toBe("/zh/daily");
  });
});
