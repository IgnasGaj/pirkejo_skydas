"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Hash entries may have no state of their own when Next remounts the same route.
const mountedGuardByRoute = new Map<string, string>();
function storedGuard(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function rememberGuard(key: string, id: string) {
  try { window.sessionStorage.setItem(key, id); } catch { /* History state still protects this visit. */ }
}
function forgetGuard(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

export function useUnsavedNavigationGuard(dirty: boolean) {
  const router = useRouter();
  const allowLeave = useRef(false);
  const leaveAttempt = useRef(0);
  const historyGuardRef = useRef<{ route: string; href: string; id: string } | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  function resetLeaveOnEdit() { leaveAttempt.current += 1; allowLeave.current = false; }
  function releaseGuard() {
    const route = window.location.pathname + window.location.search;
    mountedGuardByRoute.delete(route);
    forgetGuard(`complaint-leave:${route}`);
  }
  function beginLeaving() {
    const attempt = ++leaveAttempt.current;
    allowLeave.current = true;
    releaseGuard();
    // A cancelled or failed navigation must not grant a lasting unload bypass.
    window.setTimeout(() => { if (leaveAttempt.current === attempt) allowLeave.current = false; }, 2000);
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (allowLeave.current) { allowLeave.current = false; return; } event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const state = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
    const route = window.location.pathname + window.location.search;
    const storageKey = `complaint-leave:${route}`;
    const current = state(window.history.state);
    // React StrictMode runs setup/cleanup/setup. Reclaim that entry instead of pushing twice.
    const onGuard = current.complaintLeaveSlot === route && typeof current.complaintLeaveId === "string";
    const onBase = current.complaintLeaveBaseRoute === route && typeof current.complaintLeaveBase === "string";
    const strictReuse = historyGuardRef.current?.route === route && historyGuardRef.current.href === window.location.href && !onBase;
    const remountId = !onBase ? mountedGuardByRoute.get(route) : undefined;
    const reloadedId = !onBase && performance.getEntriesByType("navigation").some((entry) => (entry as PerformanceNavigationTiming).type === "reload")
      ? storedGuard(storageKey) : null;
    const hashId = current.complaintLeaveHashRoute === route && typeof current.complaintLeaveHashId === "string"
      ? current.complaintLeaveHashId as string : window.location.hash ? remountId ?? reloadedId ?? undefined : undefined;
    const sentinel = strictReuse ? historyGuardRef.current!.id : onGuard ? current.complaintLeaveId as string : onBase ? current.complaintLeaveBase as string
      : hashId ?? remountId ?? reloadedId ?? `complaint-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    historyGuardRef.current = { route, href: window.location.href, id: sentinel };
    mountedGuardByRoute.set(route, sentinel);
    rememberGuard(storageKey, sentinel);
    if (strictReuse || onGuard || ((remountId || reloadedId) && !hashId)) {
      window.history.replaceState({ ...current, complaintLeaveId: sentinel, complaintLeaveSlot: route, complaintLeaveSentinel: sentinel }, "", window.location.href);
    } else if (hashId) {
      window.history.replaceState({ ...current, complaintLeaveHashId: sentinel, complaintLeaveHashRoute: route }, "", window.location.href);
    } else {
      const baseState = { ...current };
      delete baseState.complaintLeaveBase;
      delete baseState.complaintLeaveBaseRoute;
      delete baseState.complaintLeaveId;
      delete baseState.complaintLeaveSlot;
      delete baseState.complaintLeaveSentinel;
      delete baseState.complaintLeaveHashId;
      delete baseState.complaintLeaveHashRoute;
      if (!onBase) window.history.replaceState({ ...baseState, complaintLeaveBase: sentinel, complaintLeaveBaseRoute: route }, "", window.location.href);
      window.history.pushState({ ...baseState, complaintLeaveId: sentinel,
        complaintLeaveSlot: route, complaintLeaveSentinel: sentinel }, "", window.location.href);
    }
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.hasAttribute("download") || (link.target && link.target.toLowerCase() !== "_self")) return;
      if (link.origin === window.location.origin && link.pathname === window.location.pathname && link.search === window.location.search) return;
      if (dirtyRef.current && !window.confirm("Yra neišsaugotų pakeitimų. Išeiti ir juos atmesti?")) { event.preventDefault(); return; }
      // Replace the guard entry on a link exit, so returning to this form has one entry.
      event.preventDefault();
      if (link.origin === window.location.origin) { releaseGuard(); router.replace(link.href); }
      else { beginLeaving(); window.location.replace(link.href); }
    };
    const onBack = (event: PopStateEvent) => {
      // Hash Back/Forward and unrelated traversal never land on this guard's base.
      if (state(event.state).complaintLeaveBase !== sentinel) return;
      if (dirtyRef.current && !window.confirm("Yra neišsaugotų pakeitimų. Išeiti ir juos atmesti?")) {
        window.history.forward();
        return;
      }
      beginLeaving();
      window.history.back();
    };
    document.addEventListener("click", intercept, true);
    window.addEventListener("popstate", onBack);
    return () => {
      document.removeEventListener("click", intercept, true); window.removeEventListener("popstate", onBack);
      if (window.location.pathname + window.location.search !== route) mountedGuardByRoute.delete(route);
      const latest = state(window.history.state);
      if (latest.complaintLeaveSentinel === sentinel) {
        const rest = { ...latest };
        delete rest.complaintLeaveSentinel;
        window.history.replaceState(rest, "", window.location.href);
      } else if (latest.complaintLeaveHashId === sentinel) {
        const rest = { ...latest };
        delete rest.complaintLeaveHashId;
        delete rest.complaintLeaveHashRoute;
        window.history.replaceState(rest, "", window.location.href);
      }
    };
  // One sentinel for the mounted composer, regardless of edit/save cycles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { releaseGuard, resetLeaveOnEdit };
}
