import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";

// Consolidated API-related logic
export const fetchPopularMovies = async (page: number) => {
    const response = await axios.get(
        `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`
    );
    return response.data.results;
};

export const fetchMovieDetails = async (id: string) => {
    const response = await axios.get(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`
    );
    return response.data;
};
