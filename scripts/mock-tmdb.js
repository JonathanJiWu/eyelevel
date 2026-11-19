#!/usr/bin/env node
/**
 * Mock TMDB API (v3 subset) for automated tests and offline development.
 *
 * Mirrors the real API's endpoints, parameters, pagination (20/page, max 500
 * pages) and error shapes:
 *   GET /3/movie/popular, /3/discover/movie, /3/search/movie,
 *       /3/movie/:id (append_to_response=credits,videos,recommendations,release_dates),
 *       /3/genre/movie/list, /3/configuration/languages
 * Auth: ?api_key=test-key  or  Authorization: Bearer test-token
 * Test hooks:
 *   search query "servererror" -> 500, "ratelimitonce" -> 429 once then OK,
 *   movie id 999999 -> 404, GET /__stats -> request counts, /__reset,
 *   /__fail -> every API request returns 503 until /__reset
 *   GET /img/:size/:file.svg -> generated poster/backdrop/profile images
 *
 * Usage: node scripts/mock-tmdb.js [port]   (default 4010, or MOCK_TMDB_PORT)
 */
const http = require("http");

const API_KEY = process.env.MOCK_TMDB_KEY || "test-key";
const BEARER = process.env.MOCK_TMDB_TOKEN || "test-token";

const GENRES = [
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

const LANGUAGES = [
  { iso_639_1: "en", english_name: "English", name: "English" },
  { iso_639_1: "fr", english_name: "French", name: "Français" },
  { iso_639_1: "ja", english_name: "Japanese", name: "日本語" },
  { iso_639_1: "ko", english_name: "Korean", name: "한국어/조선말" },
  { iso_639_1: "es", english_name: "Spanish", name: "Español" },
  { iso_639_1: "hi", english_name: "Hindi", name: "हिन्दी" },
  { iso_639_1: "de", english_name: "German", name: "Deutsch" },
  { iso_639_1: "it", english_name: "Italian", name: "Italiano" },
  { iso_639_1: "xx", english_name: "No Language", name: "No Language" },
  { iso_639_1: "sv", english_name: "Swedish", name: "svenska" },
];

// [id, title, year, genres, lang, runtime, cert, vote, votes, popularity, original_title?]
const CURATED = [
  [603, "The Matrix", 1999, [28, 878], "en", 136, "R", 8.2, 26000, 95],
  [604, "The Matrix Reloaded", 2003, [28, 878, 53], "en", 138, "R", 7.0, 11000, 60],
  [157336, "Interstellar", 2014, [12, 18, 878], "en", 169, "PG-13", 8.4, 36000, 140],
  [27205, "Inception", 2010, [28, 878, 12], "en", 148, "PG-13", 8.4, 37000, 120],
  [238, "The Godfather", 1972, [18, 80], "en", 175, "R", 8.7, 20000, 110],
  [240, "The Godfather Part II", 1974, [18, 80], "en", 202, "R", 8.6, 12000, 70],
  [324857, "Spider-Man: Into the Spider-Verse", 2018, [16, 28, 12, 878], "en", 117, "PG", 8.4, 15000, 90],
  [557, "Spider-Man", 2002, [28, 878], "en", 121, "PG-13", 7.3, 19000, 80],
  [120, "The Lord of the Rings: The Fellowship of the Ring", 2001, [12, 14, 28], "en", 179, "PG-13", 8.4, 25000, 100],
  [121, "The Lord of the Rings: The Two Towers", 2002, [12, 14, 28], "en", 179, "PG-13", 8.4, 21000, 90],
  [122, "The Lord of the Rings: The Return of the King", 2003, [12, 14, 28], "en", 201, "PG-13", 8.5, 23000, 95],
  [1366, "Rocky", 1976, [18], "en", 120, "PG", 7.8, 7000, 40],
  [1367, "Rocky II", 1979, [18], "en", 119, "PG", 7.3, 4000, 30],
  [348, "Alien", 1979, [27, 878], "en", 117, "R", 8.2, 14000, 60],
  [679, "Aliens", 1986, [28, 53, 878], "en", 137, "R", 7.9, 9500, 50],
  [194, "Amélie", 2001, [35, 10749], "fr", 122, "R", 7.9, 11000, 45, "Le Fabuleux Destin d'Amélie Poulain"],
  [496243, "Parasite", 2019, [35, 53, 18], "ko", 133, "R", 8.5, 18000, 85, "기생충"],
  [129, "Spirited Away", 2001, [16, 10751, 14], "ja", 125, "PG", 8.5, 16000, 75, "千と千尋の神隠し"],
  [4935, "Howl's Moving Castle", 2004, [14, 16, 12], "ja", 119, "PG", 8.4, 9000, 55, "ハウルの動く城"],
  [372058, "Your Name.", 2016, [10749, 16, 18], "ja", 106, "PG", 8.5, 11000, 65, "君の名は。"],
  [19404, "Dilwale Dulhania Le Jayenge", 1995, [35, 18, 10749], "hi", 190, null, 8.6, 4400, 30],
  [278, "The Shawshank Redemption", 1994, [18, 80], "en", 142, "R", 8.7, 27000, 115],
  [680, "Pulp Fiction", 1994, [53, 80], "en", 154, "R", 8.5, 28000, 90],
  [13, "Forrest Gump", 1994, [35, 18, 10749], "en", 142, "PG-13", 8.5, 27000, 85],
  [550, "Fight Club", 1999, [18], "en", 139, "R", 8.4, 30000, 80],
  [155, "The Dark Knight", 2008, [18, 28, 80, 53], "en", 152, "PG-13", 8.5, 33000, 130],
  [862, "Toy Story", 1995, [16, 12, 10751, 35], "en", 81, "G", 8.0, 18000, 70],
  [12, "Finding Nemo", 2003, [16, 10751], "en", 100, "G", 7.8, 19000, 70],
  [671, "Harry Potter and the Philosopher's Stone", 2001, [12, 14], "en", 152, "PG", 7.9, 27000, 100],
  [11, "Star Wars", 1977, [12, 28, 878], "en", 121, "PG", 8.2, 20000, 95],
  [1891, "The Empire Strikes Back", 1980, [12, 28, 878], "en", 124, "PG", 8.4, 17000, 75],
  [424, "Schindler's List", 1993, [18, 36, 10752], "en", 195, "R", 8.6, 15000, 50],
  [497, "The Green Mile", 1999, [14, 18, 80], "en", 189, "R", 8.5, 17000, 60],
  [769, "GoodFellas", 1990, [18, 80], "en", 145, "R", 8.5, 12000, 55],
  [389, "12 Angry Men", 1957, [18], "en", 97, null, 8.5, 8000, 35],
  [429, "The Good, the Bad and the Ugly", 1966, [37], "it", 161, "R", 8.5, 8000, 40, "Il buono, il brutto, il cattivo"],
  [372754, "Dune: Part Two", 2024, [878, 12], "en", 167, "PG-13", 8.2, 6000, 300],
  [438631, "Dune", 2021, [878, 12], "en", 155, "PG-13", 7.8, 12000, 150],
  [299534, "Avengers: Endgame", 2019, [12, 878, 28], "en", 181, "PG-13", 8.2, 25000, 160],
  [76341, "Mad Max: Fury Road", 2015, [28, 12, 878], "en", 121, "R", 7.6, 22000, 70],
  [313369, "La La Land", 2016, [35, 18, 10749, 10402], "en", 129, "PG-13", 7.9, 16000, 60],
  [419430, "Get Out", 2017, [9648, 53, 27], "en", 104, "R", 7.6, 16000, 55],
  [530385, "Midsommar", 2019, [27, 18, 9648], "en", 148, "R", 7.1, 7500, 40],
  [1124, "The Prestige", 2006, [18, 9648, 878], "en", 130, "PG-13", 8.2, 15000, 55],
  [77, "Memento", 2000, [9648, 53], "en", 113, "R", 8.2, 9500, 45],
  [244786, "Whiplash", 2014, [18, 10402], "en", 107, "R", 8.4, 14000, 50],
  [508442, "Soul", 2020, [16, 10751, 35, 14], "en", 101, "PG", 8.1, 10000, 60],
  [568124, "Encanto", 2021, [16, 35, 10751, 14], "en", 102, "PG", 7.6, 9000, 70],
  [361743, "Top Gun: Maverick", 2022, [28, 18], "en", 131, "PG-13", 8.2, 8000, 120],
  [545611, "Everything Everywhere All at Once", 2022, [28, 12, 878], "en", 140, "R", 7.8, 6000, 90],
  [872585, "Oppenheimer", 2023, [18, 36], "en", 181, "R", 8.1, 9000, 200],
  [346698, "Barbie", 2023, [35, 12], "en", 114, "PG-13", 7.0, 8000, 180],
  [324786, "Hacksaw Ridge", 2016, [18, 36, 10752], "en", 139, "R", 8.2, 13000, 50],
  [530915, "1917", 2019, [10752, 18, 36], "en", 119, "R", 8.0, 12000, 55],
  [11216, "Cinema Paradiso", 1988, [18, 10749], "it", 155, "R", 8.4, 4000, 25, "Nuovo Cinema Paradiso"],
  [598, "City of God", 2002, [18, 80], "es", 130, "R", 8.4, 7000, 30, "Cidade de Deus"],
  [1417, "Pan's Labyrinth", 2006, [14, 18, 10752], "es", 119, "R", 7.8, 10000, 35, "El laberinto del fauno"],
  [592350, "My Hero Academia: Heroes Rising", 2019, [16, 28, 14], "ja", 104, "PG-13", 8.0, 1500, 20, "僕のヒーローアカデミア THE MOVIE"],
  [5156, "Bicycle Thieves", 1948, [18], "it", 89, null, 8.3, 1900, 15, "Ladri di biciclette"],
  [843, "In the Mood for Love", 2000, [18, 10749], "cn", 98, "PG", 8.1, 2600, 18, "花樣年華"],
  [508965, "Klaus", 2019, [16, 10751, 35], "es", 96, "PG", 8.2, 6000, 40],
  [10681, "WALL·E", 2008, [16, 10751, 878], "en", 98, "G", 8.1, 18000, 60],
  [14160, "Up", 2009, [16, 35, 10751, 12], "en", 96, "PG", 8.0, 19000, 65],
  [578, "Jaws", 1975, [27, 53, 12], "en", 124, "PG", 7.7, 10000, 40],
  [694, "The Shining", 1980, [27, 53], "en", 144, "R", 8.2, 17000, 50],
  [185, "A Clockwork Orange", 1971, [878, 80], "en", 137, "R", 8.2, 12000, 35],
  [62, "2001: A Space Odyssey", 1968, [878, 9648, 12], "en", 149, "G", 8.1, 11000, 40],
  [78, "Blade Runner", 1982, [878, 18, 53], "en", 117, "R", 7.9, 13000, 45],
  [335984, "Blade Runner 2049", 2017, [878, 18], "en", 164, "R", 7.6, 13000, 50],
  [329, "Jurassic Park", 1993, [12, 878], "en", 127, "PG-13", 7.9, 16000, 60],
  [105, "Back to the Future", 1985, [12, 35, 878], "en", 116, "PG", 8.3, 19000, 55],
  [601, "E.T. the Extra-Terrestrial", 1982, [878, 12, 10751, 14], "en", 115, "PG", 7.5, 11000, 35],
  [9806, "The Incredibles", 2004, [28, 12, 16, 10751], "en", 115, "PG", 7.7, 17000, 50],
  [8587, "The Lion King", 1994, [10751, 16, 18], "en", 89, "G", 8.3, 18000, 70],
  [10193, "Toy Story 3", 2010, [16, 10751, 35], "en", 103, "G", 7.8, 14000, 45],
  [637, "Life Is Beautiful", 1997, [35, 18], "it", 116, "PG-13", 8.5, 13000, 40, "La vita è bella"],
  [24428, "The Avengers", 2012, [878, 28, 12], "en", 143, "PG-13", 7.7, 30000, 100],
  [118340, "Guardians of the Galaxy", 2014, [28, 878, 12], "en", 121, "PG-13", 7.9, 27000, 90],
  [284054, "Black Panther", 2018, [28, 12, 878], "en", 134, "PG-13", 7.4, 21000, 80],
  [920, "Cars", 2006, [16, 12, 35, 10751], "en", 117, "G", 7.0, 13000, 45],
  [150540, "Inside Out", 2015, [16, 10751, 12, 18, 35], "en", 95, "PG", 7.9, 21000, 75],
  [1022789, "Inside Out 2", 2024, [16, 10751, 12, 18, 35], "en", 97, "PG", 7.6, 4500, 250],
];

const ADJ = ["Silent", "Crimson", "Hidden", "Last", "Golden", "Broken", "Midnight", "Electric", "Lost", "Northern", "Paper", "Velvet", "Iron", "Glass", "Wild", "Secret", "Burning", "Frozen", "Distant", "Little"];
const NOUN = ["Harbor", "Garden", "Signal", "Orchard", "Kingdom", "Horizon", "Echo", "River", "Summer", "Theory", "Empire", "Lantern", "Voyage", "Season", "Machine", "Island", "Letter", "Frontier", "Mirror", "Orbit"];
const LANGS = ["en", "en", "en", "en", "fr", "ja", "ko", "es", "hi", "de", "it", "sv"];
const CERTS = ["G", "PG", "PG-13", "R", "NC-17", null];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildMovies() {
  const movies = CURATED.map(([id, title, year, genre_ids, lang, runtime, cert, vote, votes, popularity, original]) => ({
    id,
    title,
    original_title: original || title,
    year,
    genre_ids,
    original_language: lang,
    runtime,
    certification: cert,
    vote_average: vote,
    vote_count: votes,
    popularity,
  }));
  const rand = rng(42);
  let id = 900000;
  for (const a of ADJ) {
    for (const n of NOUN) {
      if (rand() < 0.5) continue;
      const genre = GENRES[Math.floor(rand() * GENRES.length)].id;
      const second = GENRES[Math.floor(rand() * GENRES.length)].id;
      movies.push({
        id: id++,
        title: `The ${a} ${n}`,
        original_title: `The ${a} ${n}`,
        year: 1950 + Math.floor(rand() * 76),
        genre_ids: Array.from(new Set([genre, second])),
        original_language: LANGS[Math.floor(rand() * LANGS.length)],
        runtime: 75 + Math.floor(rand() * 110),
        certification: CERTS[Math.floor(rand() * CERTS.length)],
        vote_average: Math.round((3 + rand() * 6.5) * 10) / 10,
        vote_count: Math.floor(rand() * 20000),
        popularity: Math.round(rand() * 900) / 10,
      });
    }
  }
  return movies.map((m, index) => {
    const month = String(1 + (m.id % 12)).padStart(2, "0");
    const day = String(1 + (m.id % 28)).padStart(2, "0");
    return {
      ...m,
      // A few entries intentionally have missing fields, like real TMDB data.
      release_date: index % 37 === 5 ? "" : `${m.year}-${month}-${day}`,
      poster_path: index % 23 === 7 ? null : `/p${m.id}.svg`,
      backdrop_path: index % 11 === 3 ? null : `/b${m.id}.svg`,
      overview: index % 29 === 4 ? "" : `${m.title} is a ${m.year} film. A mock overview used for automated testing.`,
    };
  });
}

const MOVIES = buildMovies();
const BY_ID = new Map(MOVIES.map((m) => [m.id, m]));
const stats = { total: 0, byPath: {} };
const rateLimited = new Set();
let failAll = false;

function fold(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summary(m) {
  return {
    adult: false,
    backdrop_path: m.backdrop_path,
    genre_ids: m.genre_ids,
    id: m.id,
    original_language: m.original_language,
    original_title: m.original_title,
    overview: m.overview,
    popularity: m.popularity,
    poster_path: m.poster_path,
    release_date: m.release_date,
    title: m.title,
    video: false,
    vote_average: m.vote_average,
    vote_count: m.vote_count,
  };
}

function paginate(list, page) {
  const totalResults = list.length;
  const totalPages = Math.min(500, Math.ceil(totalResults / 20));
  return { page, results: list.slice((page - 1) * 20, page * 20).map(summary), total_pages: totalPages, total_results: totalResults };
}

function sortBy(list, key) {
  const [field, dir] = (key || "popularity.desc").split(".");
  const sign = dir === "asc" ? 1 : -1;
  const value = (m) =>
    field === "primary_release_date" || field === "release_date"
      ? m.release_date || (sign === 1 ? "9999" : "0000")
      : field === "title" || field === "original_title"
        ? m[field].toLowerCase()
        : m[field] ?? 0;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -1 * sign;
    if (va > vb) return 1 * sign;
    return a.id - b.id;
  });
}

function discover(q) {
  let list = MOVIES;
  const genres = q.get("with_genres");
  if (genres) {
    const all = genres.includes(",");
    const ids = genres.split(/[,|]/).map(Number);
    list = list.filter((m) => (all ? ids.every((g) => m.genre_ids.includes(g)) : ids.some((g) => m.genre_ids.includes(g))));
  }
  const gte = q.get("primary_release_date.gte");
  const lte = q.get("primary_release_date.lte");
  if (gte) list = list.filter((m) => m.release_date && m.release_date >= gte);
  if (lte) list = list.filter((m) => m.release_date && m.release_date <= lte);
  const vGte = q.get("vote_average.gte");
  if (vGte) list = list.filter((m) => m.vote_average >= Number(vGte));
  const vLte = q.get("vote_average.lte");
  if (vLte) list = list.filter((m) => m.vote_average <= Number(vLte));
  const cGte = q.get("vote_count.gte");
  if (cGte) list = list.filter((m) => m.vote_count >= Number(cGte));
  const lang = q.get("with_original_language");
  if (lang) list = list.filter((m) => m.original_language === lang);
  const rGte = q.get("with_runtime.gte");
  if (rGte) list = list.filter((m) => m.runtime >= Number(rGte));
  const rLte = q.get("with_runtime.lte");
  if (rLte) list = list.filter((m) => m.runtime <= Number(rLte));
  const cert = q.get("certification");
  if (cert && q.get("certification_country") === "US") list = list.filter((m) => m.certification === cert);
  return sortBy(list, q.get("sort_by"));
}

function search(query) {
  const tokens = fold(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const matches = MOVIES.filter((m) => {
    const words = `${fold(m.title)} ${fold(m.original_title)}`.split(" ");
    return tokens.every((t, i) => words.some((w) => (i === tokens.length - 1 ? w.startsWith(t) : w === t || w.startsWith(t))));
  });
  const q = fold(query);
  return matches.sort((a, b) => {
    const score = (m) => (fold(m.title) === q ? 3 : fold(m.title).startsWith(q) ? 2 : 1);
    return score(b) - score(a) || b.popularity - a.popularity;
  });
}

function details(m, append) {
  const parts = new Set((append || "").split(","));
  const body = {
    ...summary(m),
    genres: m.genre_ids.map((id) => GENRES.find((g) => g.id === id)).filter(Boolean),
    runtime: m.runtime,
    tagline: m.id % 3 === 0 ? `Every ${m.title.split(" ").pop()} has a story.` : "",
    status: "Released",
    budget: m.id % 4 === 0 ? 0 : 1000000 * ((m.id % 150) + 5),
    revenue: m.id % 5 === 0 ? 0 : 1000000 * ((m.id % 900) + 10),
    homepage: m.id % 2 === 0 ? `https://example.com/movies/${m.id}` : "",
    imdb_id: `tt${String(m.id).padStart(7, "0")}`,
    spoken_languages: [{ english_name: (LANGUAGES.find((l) => l.iso_639_1 === m.original_language) || {}).english_name || "English", iso_639_1: m.original_language, name: "" }],
    production_countries: [{ iso_3166_1: "US", name: "United States of America" }],
  };
  if (parts.has("credits")) {
    body.credits = {
      cast: Array.from({ length: 8 }, (_, i) => ({ id: m.id * 10 + i, name: `Actor ${i + 1} ${m.title.split(" ")[0]}`, character: `Role ${i + 1}`, order: i, profile_path: i % 3 === 2 ? null : `/c${m.id * 10 + i}.svg` })),
      crew: [
        { id: m.id * 10 + 100, name: `Director of ${m.title}`, job: "Director", department: "Directing" },
        { id: m.id * 10 + 101, name: `Writer of ${m.title}`, job: "Screenplay", department: "Writing" },
      ],
    };
  }
  if (parts.has("videos")) {
    body.videos = { results: m.id % 2 === 0 ? [{ key: `trailer${m.id}`, site: "YouTube", type: "Trailer", name: "Official Trailer", official: true }] : [] };
  }
  if (parts.has("recommendations")) {
    const recs = MOVIES.filter((o) => o.id !== m.id && o.genre_ids.some((g) => m.genre_ids.includes(g))).slice(0, 8);
    body.recommendations = { page: 1, results: recs.map(summary), total_pages: 1, total_results: recs.length };
  }
  if (parts.has("release_dates")) {
    body.release_dates = { results: m.certification ? [{ iso_3166_1: "US", release_dates: [{ certification: m.certification, type: 3, release_date: `${m.release_date}T00:00:00.000Z` }] }] : [] };
  }
  return body;
}

function svgImage(file, size) {
  const match = /^([pbc])(\d+)\.svg$/.exec(file);
  const kind = match ? match[1] : "p";
  const id = match ? Number(match[2]) : 0;
  const movie = BY_ID.get(kind === "c" ? Math.floor(id / 10) : id);
  const hue = (id * 47) % 360;
  const w = kind === "b" ? 1280 : 500;
  const h = kind === "b" ? 720 : 750;
  const label = (kind === "c" ? "Cast" : movie ? movie.title : "Movie").replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},60%,18%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="${kind === "b" ? 55 : 62}%" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${kind === "b" ? 64 : 40}" font-weight="700" fill="rgba(255,255,255,0.92)">${label.length > 22 ? label.slice(0, 21) + "…" : label}</text><text x="50%" y="${kind === "b" ? 66 : 70}%" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.7)">${movie ? movie.year : size}</text></svg>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json;charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__stats") return send(res, 200, stats);
  if (path === "/__reset") {
    stats.total = 0;
    stats.byPath = {};
    rateLimited.clear();
    failAll = false;
    return send(res, 200, { ok: true });
  }
  if (path === "/__fail") {
    failAll = true;
    return send(res, 200, { ok: true });
  }
  const img = /^\/img\/(w\d+|original)\/([\w.-]+)$/.exec(path);
  if (img) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" });
    return res.end(svgImage(img[2], img[1]));
  }
  if (!path.startsWith("/3/")) return send(res, 404, { success: false, status_code: 34, status_message: "The resource you requested could not be found." });

  stats.total++;
  stats.byPath[path] = (stats.byPath[path] || 0) + 1;
  if (failAll) return send(res, 503, { success: false, status_code: 9, status_message: "Service offline: This service is temporarily offline, try again later." });
  const auth = req.headers.authorization;
  if (url.searchParams.get("api_key") !== API_KEY && auth !== `Bearer ${BEARER}`) {
    return send(res, 401, { status_code: 7, status_message: "Invalid API key: You must be granted a valid key.", success: false });
  }
  const page = Number(url.searchParams.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    return send(res, 400, { success: false, status_code: 22, status_message: "Invalid page: Pages start at 1 and max at 500. They are expected to be an integer." });
  }

  if (path === "/3/genre/movie/list") return send(res, 200, { genres: GENRES });
  if (path === "/3/configuration/languages") return send(res, 200, LANGUAGES);
  if (path === "/3/movie/popular") return send(res, 200, paginate(sortBy(MOVIES, "popularity.desc"), page));
  if (path === "/3/discover/movie") return send(res, 200, paginate(discover(url.searchParams), page));
  if (path === "/3/search/movie") {
    const query = url.searchParams.get("query") || "";
    if (query === "servererror") return send(res, 500, { success: false, status_code: 11, status_message: "Internal error: Something went wrong, contact TMDB." });
    if (query === "ratelimitonce" && !rateLimited.has(query)) {
      rateLimited.add(query);
      return send(res, 429, { success: false, status_code: 25, status_message: "Your request count (#) is over the allowed limit of (40)." }, { "Retry-After": "1" });
    }
    return send(res, 200, paginate(search(query), page));
  }
  const detail = /^\/3\/movie\/(\d+)$/.exec(path);
  if (detail) {
    const movie = BY_ID.get(Number(detail[1]));
    if (!movie) return send(res, 404, { success: false, status_code: 34, status_message: "The resource you requested could not be found." });
    return send(res, 200, details(movie, url.searchParams.get("append_to_response")));
  }
  return send(res, 404, { success: false, status_code: 34, status_message: "The resource you requested could not be found." });
}

function startMockTmdb(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { startMockTmdb, MOVIES, GENRES };

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.MOCK_TMDB_PORT || 4010);
  startMockTmdb(port).then(() => console.log(`Mock TMDB listening on http://127.0.0.1:${port} (key: ${API_KEY})`));
}
