"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { FilterState } from "@/components/FiltersPanel";

const FILTER_KEYS: [keyof FilterState, string][] = [
  ["sources", "src"], ["payers", "pay"], ["clinics", "cln"],
  ["specialties", "spc"], ["therapists", "thr"], ["npis", "npi"],
  ["diagnoses", "dx"], ["statuses", "stat"],
];

export type UrlFilterState = {
  currStart: string | null; currEnd: string | null;
  priorStart: string | null; priorEnd: string | null;
  compare: string | null;
  filters: FilterState;
};

export function useUrlFilters(): {
  state: UrlFilterState;
  updateFilters: (f: FilterState) => void;
  updateDates: (p: { currStart?: string; currEnd?: string; priorStart?: string; priorEnd?: string; compare?: string }) => void;
  preserveSearch: string;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state: UrlFilterState = useMemo(() => {
    const getArr = (k: string) => { const v = searchParams.get(k); return v ? v.split("|").filter(Boolean) : []; };
    const filters: FilterState = {
      sources: [], payers: [], clinics: [], specialties: [],
      therapists: [], npis: [], diagnoses: [], statuses: [],
    };
    for (const [fk, uk] of FILTER_KEYS) filters[fk] = getArr(uk);
    // default sources if none specified in URL
    if (searchParams.get("src") === null && !FILTER_KEYS.some(([fk, uk]) => searchParams.get(uk) !== null)) {
      filters.sources = ["Doctors Office"];
    }
    return {
      currStart: searchParams.get("cs"),
      currEnd: searchParams.get("ce"),
      priorStart: searchParams.get("ps"),
      priorEnd: searchParams.get("pe"),
      compare: searchParams.get("cm"),
      filters,
    };
  }, [searchParams]);

  const buildQs = useCallback((overrides: Record<string, string | string[] | null | undefined>) => {
    const qs = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === undefined) { qs.delete(k); }
      else if (Array.isArray(v)) {
        if (v.length === 0) qs.delete(k);
        else qs.set(k, v.join("|"));
      } else {
        qs.set(k, v);
      }
    }
    return qs.toString();
  }, [searchParams]);

  const updateFilters = useCallback((f: FilterState) => {
    const overrides: Record<string, string[]> = {};
    for (const [fk, uk] of FILTER_KEYS) overrides[uk] = f[fk];
    const qs = buildQs(overrides);
    router.replace(`${pathname}?${qs}`, { scroll: false });
  }, [buildQs, router, pathname]);

  const updateDates = useCallback((p: { currStart?: string; currEnd?: string; priorStart?: string; priorEnd?: string; compare?: string }) => {
    const qs = buildQs({
      cs: p.currStart, ce: p.currEnd,
      ps: p.priorStart, pe: p.priorEnd,
      cm: p.compare,
    });
    router.replace(`${pathname}?${qs}`, { scroll: false });
  }, [buildQs, router, pathname]);

  const preserveSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";

  return { state, updateFilters, updateDates, preserveSearch };
}

export function nullIfEmpty(a: string[]): string[] | null {
  return a.length === 0 ? null : a;
}
