import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Chip, ChipRow, Segmented } from "@/src/components/ui/Chip";
import { Sheet } from "@/src/components/ui/Sheet";
import { Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { useReferenceData } from "@/src/context/ReferenceDataContext";
import {
  CERTIFICATIONS,
  defaultFilters,
  maxYear,
  MIN_YEAR,
  RATING_OPTIONS,
  RUNTIME_OPTIONS,
  SORT_OPTIONS,
  VOTES_OPTIONS,
  type MovieFilters,
} from "@/src/lib/filters";

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970];

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.section}>
      <AppText variant="label">{title}</AppText>
      {hint ? <AppText variant="caption">{hint}</AppText> : null}
      {children}
    </View>
  );
}

interface FilterSheetProps {
  visible: boolean;
  filters: MovieFilters;
  searching: boolean;
  onApply: (filters: MovieFilters) => void;
  onClose: () => void;
}

/** Combined filter editor. The draft is created fresh each time it opens. */
export function FilterSheet(props: FilterSheetProps) {
  return props.visible ? <FilterForm {...props} /> : null;
}

function FilterForm({ filters, searching, onApply, onClose }: FilterSheetProps) {
  const { genres, languages } = useReferenceData();
  const [draft, setDraft] = useState<MovieFilters>(filters);
  const [yearFrom, setYearFrom] = useState(filters.yearFrom?.toString() ?? "");
  const [yearTo, setYearTo] = useState(filters.yearTo?.toString() ?? "");
  const [yearError, setYearError] = useState<string | null>(null);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");

  const set = (patch: Partial<MovieFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleGenre = (id: number) =>
    set({ genres: draft.genres.includes(id) ? draft.genres.filter((g) => g !== id) : [...draft.genres, id].slice(0, 10) });

  const shownLanguages = useMemo(() => {
    const q = languageQuery.trim().toLowerCase();
    const list = q ? languages.filter((l) => l.name.toLowerCase().includes(q) || l.code === q) : languages;
    return showAllLanguages || q ? list : list.slice(0, 12);
  }, [languages, showAllLanguages, languageQuery]);

  const apply = () => {
    const parse = (value: string) => (value.trim() ? Number(value.trim()) : null);
    const from = parse(yearFrom);
    const to = parse(yearTo);
    const valid = (y: number | null) => y === null || (Number.isInteger(y) && y >= MIN_YEAR && y <= maxYear());
    if (!valid(from) || !valid(to)) {
      setYearError(`Years must be between ${MIN_YEAR} and ${maxYear()}.`);
      return;
    }
    if (from !== null && to !== null && from > to) {
      setYearError("“From” must be before “To”.");
      return;
    }
    onApply({ ...draft, yearFrom: from, yearTo: to });
    onClose();
  };

  const reset = () => {
    const cleared = { ...defaultFilters(), sort: draft.sort };
    setDraft(cleared);
    setYearFrom("");
    setYearTo("");
    setYearError(null);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Filters"
      testID="filter-sheet"
      maxWidth={640}
      footer={
        <>
          <Button title="Reset" variant="outline" onPress={reset} testID="filters-reset" />
          <Button title="Show results" onPress={apply} testID="filters-apply" />
        </>
      }
    >
      <Section title="Sort by">
        <ChipRow>
          {SORT_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} selected={draft.sort === o.key} onPress={() => set({ sort: o.key })} testID={`sort-${o.key}`} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Genres">
        <ChipRow>
          {genres.map((g) => (
            <Chip key={g.id} label={g.name} selected={draft.genres.includes(g.id)} onPress={() => toggleGenre(g.id)} testID={`genre-${g.id}`} />
          ))}
        </ChipRow>
        {draft.genres.length > 1 ? (
          <Segmented
            value={draft.genreMode}
            onChange={(genreMode) => set({ genreMode })}
            options={[
              { value: "any", label: "Match any genre" },
              { value: "all", label: "Match all genres" },
            ]}
          />
        ) : null}
      </Section>

      <Section title="Release year">
        <View style={styles.yearRow}>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="From"
              value={yearFrom}
              onChangeText={(t) => {
                setYearFrom(t.replace(/\D/g, "").slice(0, 4));
                setYearError(null);
              }}
              keyboardType="number-pad"
              accessibilityLabel="Release year from"
              testID="year-from"
            />
          </View>
          <AppText variant="muted">to</AppText>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="To"
              value={yearTo}
              onChangeText={(t) => {
                setYearTo(t.replace(/\D/g, "").slice(0, 4));
                setYearError(null);
              }}
              keyboardType="number-pad"
              accessibilityLabel="Release year to"
              testID="year-to"
            />
          </View>
        </View>
        {yearError ? <Notice tone="danger">{yearError}</Notice> : null}
        <ChipRow>
          {DECADES.map((d) => (
            <Chip
              key={d}
              label={`${d}s`}
              selected={yearFrom === String(d) && yearTo === String(d + 9)}
              onPress={() => {
                setYearFrom(String(d));
                setYearTo(String(d + 9));
                setYearError(null);
              }}
            />
          ))}
          <Chip
            label="Before 1970"
            selected={yearFrom === "" && yearTo === "1969"}
            onPress={() => {
              setYearFrom("");
              setYearTo("1969");
            }}
          />
        </ChipRow>
      </Section>

      <Section title="TMDB review score">
        <ChipRow>
          {RATING_OPTIONS.map((r) => (
            <Chip key={String(r)} label={r === null ? "Any" : `${r}+`} selected={draft.ratingMin === r} onPress={() => set({ ratingMin: r })} testID={`rating-${r ?? "any"}`} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Popularity" hint="Based on how many people rated the movie on TMDB.">
        <ChipRow>
          {VOTES_OPTIONS.map((v) => (
            <Chip key={String(v.value)} label={v.label} selected={draft.votesMin === v.value} onPress={() => set({ votesMin: v.value })} testID={`votes-${v.value ?? "any"}`} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Original language">
        {showAllLanguages ? (
          <TextField placeholder="Search languages" value={languageQuery} onChangeText={setLanguageQuery} icon="search" accessibilityLabel="Search languages" />
        ) : null}
        <ChipRow>
          <Chip label="Any" selected={draft.language === null} onPress={() => set({ language: null })} testID="language-any" />
          {shownLanguages.map((l) => (
            <Chip key={l.code} label={l.name} selected={draft.language === l.code} onPress={() => set({ language: l.code })} testID={`language-${l.code}`} />
          ))}
        </ChipRow>
        {languages.length > 12 ? (
          <Button
            title={showAllLanguages ? "Show fewer languages" : `Show all ${languages.length} languages`}
            variant="ghost"
            size="sm"
            onPress={() => setShowAllLanguages((v) => !v)}
            style={{ alignSelf: "flex-start" }}
          />
        ) : null}
      </Section>

      {searching ? (
        <Notice>Runtime and age rating apply when browsing. They are ignored while a search term is entered.</Notice>
      ) : null}

      <Section title="Runtime">
        <ChipRow>
          {RUNTIME_OPTIONS.map((r) => (
            <Chip key={r.key} label={r.label} selected={draft.runtime === r.key} disabled={searching} onPress={() => set({ runtime: r.key })} testID={`runtime-${r.key}`} />
          ))}
        </ChipRow>
      </Section>

      <Section title="Age rating (US)">
        <ChipRow>
          <Chip label="Any" selected={draft.certification === null} disabled={searching} onPress={() => set({ certification: null })} />
          {CERTIFICATIONS.map((c) => (
            <Chip key={c} label={c} selected={draft.certification === c} disabled={searching} onPress={() => set({ certification: c })} testID={`cert-${c}`} />
          ))}
        </ChipRow>
      </Section>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 6 },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
