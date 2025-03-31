import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView } from "react-native";
import axios from "axios";
import { useRoute } from "@react-navigation/native"; // Use this hook to access route params
import { TMDB_API_KEY } from "../../tmdbConfig";

export default function MovieDetail() {
    const route = useRoute();
    const { id } = route.params || {}; // Safely access the id parameter
    const [movie, setMovie] = useState<any>(null);

    useEffect(() => {
        if (!id) return; // Prevent fetching if id is undefined
        const fetchMovie = async () => {
            try {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`
                );
                setMovie(response.data);
            } catch (error) {
                console.error("Error fetching movie details:", error);
            }
        };
        fetchMovie();
    }, [id]);

    if (!id) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Invalid movie ID.</Text>
            </View>
        );
    }

    if (!movie) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Image
                source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }}
                style={styles.poster}
            />
            <Text style={styles.title}>{movie.title}</Text>
            <Text style={styles.info}>Release Year: {movie.release_date?.split("-")[0]}</Text>
            <Text style={styles.info}>Director: {movie.director || "Unknown"}</Text>
            <Text style={styles.overview}>{movie.overview}</Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FAFAFA",
        padding: 20,
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    errorText: {
        fontSize: 18,
        color: "red",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        fontSize: 18,
        color: "#333",
    },
    poster: {
        width: "100%",
        height: 300,
        borderRadius: 10,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 10,
        color: "#1A237E",
    },
    info: {
        fontSize: 16,
        color: "#3C4858",
        marginBottom: 5,
    },
    overview: {
        fontSize: 14,
        color: "#3C4858",
        marginTop: 10,
    },
});
