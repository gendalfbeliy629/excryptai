import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:4000/api";

function normalizeBackendUrl(value: string | null | undefined): string {
  const raw = value?.trim();

  if (!raw) {
    return DEFAULT_BACKEND_URL;
  }

  const withProtocol =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const normalizedPath = parsed.pathname === "/" ? "/api" : parsed.pathname.replace(/\/$/, "");
    parsed.pathname = normalizedPath;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_BACKEND_URL;
  }
}

const BACKEND_URL = normalizeBackendUrl(
  process.env.API_URL ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_BACKEND_URL
);

function buildTargetUrl(pathSegments: string[], request: NextRequest): string {
  const path = pathSegments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = new URL(`${BACKEND_URL}/${path}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;

  try {
    const targetUrl = buildTargetUrl(path, request);

    const response = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Backend proxy request failed"
      },
      {
        status: 502
      }
    );
  }
}