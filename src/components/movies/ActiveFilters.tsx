import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button } from "@/src/components/ui/Button";
import { Chip } from "@/src/components/ui/Chip";
import { useReferenceData } from "@/src/context/ReferenceDataContext";
import { countActiveFilters, DEFAULT_FILTERS, RUNTIME_OPTIONS, SORT_OPTIONS, VOTES_OPTIONS, type MovieFilters } from "@/src/lib/filters";

/** Removable chips summarizing the active filters, plus "Clear all". */
export function ActiveFilters({ filters, onChange }: { filters: MovieFilters; onChange: (filters: MovieFilters) => void }) {
  const { genreName, languageName } = useReferenceData();
  const chips: { key: string; label: string; clear: Partial<MovieFilters> }[] = [];
  if (filters.sort !== DEFAULT_FILTERS.sort) {
    chips.push({ key: "sort", label: SORT_OPTIONS.find((o) => o.key === filters.sort)?.label ?? filters.sort, clear: { sort: DEFAULT_FILTERS.sort } });
  }
  for (const id of filters.genres) {
    chips.push({ key: `g${id}`, label: genreName(id) ?? `Genre ${id}`, clear: { genres: filters.genres.filter((g) => g !== id) } });
  }
  if (filters.genres.length > 1 && filters.genreMode === "all") chips.push({ key: "gm", label: "All genres", clear: { genreMode: "any" } });
  if (filters.yearFrom !== null || filters.yearTo !== null) {
    const label =
      filters.yearFrom !== null && filters.yearTo !== null
        ? filters.yearFrom === filters.yearTo
          ? `${filters.yearFrom}`
          : `${filters.yearFrom}–${filters.yearTo}`
        : filters.yearFrom !== null
          ? `From ${filters.yearFrom}`
          : `Until ${filters.yearTo}`;
    chips.push({ key: "year", label, clear: { yearFrom: null, yearTo: null } });
  }
  if (filters.ratingMin !== null) chips.push({ key: "rating", label: `Score ${filters.ratingMin}+`, clear: { ratingMin: null } });
  if (filters.votesMin !== null) {
    chips.push({ key: "votes", label: VOTES_OPTIONS.find((v) => v.value === filters.votesMin)?.label ?? `${filters.votesMin}+ votes`, clear: { votesMin: null } });
  }
  if (filters.language) chips.push({ key: "lang", label: languageName(filters.language) ?? filters.language, clear: { language: null } });
  if (filters.runtime !== "any") chips.push({ key: "runtime", label: RUNTIME_OPTIONS.find((r) => r.key === filters.runtime)?.label ?? "", clear: { runtime: "any" } });
  if (filters.certification) chips.push({ key: "cert", label: `Rated ${filters.certification}`, clear: { certification: null } });

  if (!chips.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="active-filters">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} selected onRemove={() => onChange({ ...filters, ...chip.clear })} />
      ))}
      {countActiveFilters(filters) + (filters.sort !== DEFAULT_FILTERS.sort ? 1 : 0) > 1 ? (
        <Button title="Clear all" variant="ghost" size="sm" onPress={() => onChange({ ...DEFAULT_FILTERS, genres: [] })} testID="filters-clear-all" />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, alignItems: "center", paddingVertical: 4 },
});
