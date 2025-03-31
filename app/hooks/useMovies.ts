import { useState, useEffect } from "react";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";

export function useMovies(query: string, page: number) {
    const [movies, setMovies] = useState([]);

    useEffect(() => {
        const fetchMovies = async () => {
            try {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}&page=${page}`
                );
                setMovies(response.data.results);
            } catch (error) {
                console.error("Error fetching movies:", error);
            }
        };

        if (query.length > 2) {
            fetchMovies();
        }
    }, [query, page]);

    return movies;
}
