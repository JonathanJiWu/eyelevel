import React, { useEffect, useState } from "react";
import { FlatList } from "react-native";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";
import { useRouter } from "expo-router";
import MovieCard from "../components/MovieCard";

export default function ExploreScreen() {
    const [movies, setMovies] = useState([]);
    const [page, setPage] = useState(1);
    const router = useRouter();

    useEffect(() => {
        fetchMovies();
    }, [page]);

    const fetchMovies = async () => {
        try {
            const response = await axios.get(
                `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`
            );
            setMovies((prev) => [...prev, ...response.data.results]);
        } catch (error) {
            console.error("Error fetching popular movies:", error);
        }
    };

    return (
        <FlatList
            data={movies}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
                <MovieCard movie={item} onPress={() => router.push(`/movie/${item.id}`)} />
            )}
            numColumns={3}
            onEndReached={() => setPage((prev) => prev + 1)}
            onEndReachedThreshold={0.5}
        />
    );
}
