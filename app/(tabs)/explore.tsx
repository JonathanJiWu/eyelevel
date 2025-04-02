import React, { useEffect, useState } from "react";
import { View, FlatList, Image, StyleSheet, TouchableOpacity, Text, Dimensions } from "react-native";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";
import { useRouter } from "expo-router";
import { useTheme } from "../_layout";

export default function Explore() {
    const [movies, setMovies] = useState([]);
    const [page, setPage] = useState(1);
    const [numColumns, setNumColumns] = useState(6);
    const router = useRouter();
    const { isDarkMode } = useTheme();

    useEffect(() => {
        fetchMovies();
    }, [page]);

    useEffect(() => {
        const updateColumns = () => {
            const { width } = Dimensions.get("window");
            setNumColumns(Math.min(6, Math.floor(width / 150)));
        };

        updateColumns();
        Dimensions.addEventListener("change", updateColumns);

        return () => Dimensions.removeEventListener("change", updateColumns);
    }, []);

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

    const addToWatchlist = (movie: any) => {
        console.log("Added to watchlist:", movie);
    };

    const renderMovieTile = ({ item }: { item: any }) => (
        <View style={[styles.movieTile, isDarkMode && styles.darkTile]}>
            <TouchableOpacity onPress={() => router.push(`/movie/${item.id}`)}>
                <Image
                    source={{ uri: `https://image.tmdb.org/t/p/w500${item.poster_path}` }}
                    style={styles.poster}
                />
            </TouchableOpacity>
            <TouchableOpacity style={styles.watchlistButton} onPress={() => addToWatchlist(item)}>
                <Text style={styles.watchlistText}>Add to My Watchlist</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <FlatList
            data={movies}
            key={numColumns}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderMovieTile}
            numColumns={numColumns}
            columnWrapperStyle={styles.row}
            onEndReached={() => setPage((prev) => prev + 1)}
            onEndReachedThreshold={0.5}
            style={[styles.container, isDarkMode && styles.darkContainer]}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    darkContainer: {
        backgroundColor: "#121212", // Android's default dark mode background
    },
    poster: {
        width: 120,
        height: 180,
        margin: 5,
        borderRadius: 5,
    },
    row: {
        justifyContent: "center",
    },
    movieTile: {
        margin: 5,
        alignItems: "center",
        backgroundColor: "#f5f5f5",
        borderRadius: 5,
    },
    darkTile: {
        backgroundColor: "#1e1e1e", // Dark tile background
    },
    watchlistButton: {
        marginTop: 5,
        backgroundColor: "#1E88E5",
        padding: 5,
        borderRadius: 5,
    },
    watchlistText: {
        color: "#fff",
        fontSize: 12,
    },
});