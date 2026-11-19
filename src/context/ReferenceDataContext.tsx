import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { moviesApi } from "@/src/lib/api";
import type { Genre, Language } from "@/src/types/movies";

// Mirrors the server fallback so filters render instantly and offline.
const DEFAULT_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

interface ReferenceData {
  genres: Genre[];
  languages: Language[];
  genreName: (id: number) => string | undefined;
  languageName: (code: string | null | undefined) => string | undefined;
}

const ReferenceDataContext = createContext<ReferenceData | null>(null);

export function ReferenceDataProvider({ children }: { children: React.ReactNode }) {
  const [genres, setGenres] = useState<Genre[]>(DEFAULT_GENRES);
  const [languages, setLanguages] = useState<Language[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    moviesApi
      .genres()
      .then((r) => r.genres.length && setGenres(r.genres))
      .catch(() => undefined);
    moviesApi
      .languages()
      .then((r) => setLanguages(r.languages))
      .catch(() => undefined);
  }, []);

  const value = useMemo<ReferenceData>(() => {
    const genreMap = new Map(genres.map((g) => [g.id, g.name]));
    const langMap = new Map(languages.map((l) => [l.code, l.name]));
    return {
      genres,
      languages,
      genreName: (id) => genreMap.get(id),
      languageName: (code) => (code ? (langMap.get(code) ?? code.toUpperCase()) : undefined),
    };
  }, [genres, languages]);

  return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceData(): ReferenceData {
  const value = useContext(ReferenceDataContext);
  if (!value) throw new Error("useReferenceData must be used inside ReferenceDataProvider");
  return value;
}
