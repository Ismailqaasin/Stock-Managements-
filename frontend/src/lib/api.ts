import type { Row } from "./modules";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let access = "",
  language = "en";
let refresh: Promise<any> | null = null;
export const setToken = (token: string) => {
  access = token;
};
export const setLanguage = (v: string) => {
  language = v;
};
export async function request<T = Row>(
  url: string,
  method = "GET",
  body?: unknown,
  retry = true,
  blob = false,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Accept-Language": language,
      ...(access ? { Authorization: "Bearer " + access } : {}),
      ...(body && !form ? { "Content-Type": "application/json" } : {}),
    },
    body: body == null ? undefined : form ? body : JSON.stringify(body),
  });
  if (res.status === 401 && retry && access && !url.startsWith("/auth/")) {
    try {
      await renew();
    } catch {
      access = "";
      window.dispatchEvent(new Event("session-expired"));
      throw new ApiError(401, "Session expired.");
    }
    return request(url, method, body, false, blob);
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      e.title || `Request failed (${res.status}).`,
    );
  }
  if (blob) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  return res.json();
}
export async function renew() {
  if (!refresh) {
    const run = async () => {
      const r = await request("/auth/refresh", "POST", {}, false);
      setToken(r.token);
      return r;
    };
    refresh = (
      navigator.locks
        ? navigator.locks.request("stockroom-refresh", run)
        : run()
    ).finally(() => {
      refresh = null;
    });
  }
  return refresh;
}
export function params(f: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v !== "" && v != null) p.set(k, String(v));
  const s = p.toString();
  return s ? "?" + s : "";
}
export async function download(url: string, name: string, print = false) {
  const tab = print ? window.open("about:blank", "_blank") : null;
  if (print && !tab) throw new Error("Allow pop-ups to print this document.");
  try {
    const b = await request<Blob>(url, "GET", undefined, true, true);
    const href = URL.createObjectURL(b);
    if (tab) {
      tab.opener = null;
      tab.location.href = href;
      tab.addEventListener(
        "load",
        () => {
          try {
            tab.print();
          } catch {}
        },
        { once: true },
      );
    } else {
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(href), 120000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
