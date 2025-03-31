import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, Dimensions } from "react-native";
import axios from "axios";
import { useRoute } from "@react-navigation/native"; // Use this hook to access route params
import { TMDB_API_KEY } from "../../tmdbConfig";
import { auth, db } from "../../firebaseConfigs";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

export default function MovieDetail() {
    const route = useRoute();
    const { id } = route.params || {}; // Safely access the id parameter
    const [movie, setMovie] = useState<any>(null);
    const [isHorizontal, setIsHorizontal] = useState(false);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const user = auth.currentUser;

    useEffect(() => {
        const updateOrientation = () => {
            const { width, height } = Dimensions.get("window");
            setIsHorizontal(width > height);
        };

        updateOrientation();
        Dimensions.addEventListener("change", updateOrientation);

        return () => Dimensions.removeEventListener("change", updateOrientation);
    }, []);

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

    useEffect(() => {
        const checkWatchlist = async () => {
            if (!user || !id) return;
            const userDoc = doc(db, "users", user.uid);
            const docSnap = await getDoc(userDoc);
            if (docSnap.exists()) {
                const watchlist = docSnap.data().watchlist || [];
                setIsInWatchlist(watchlist.some((movie: any) => movie.id === id));
            }
        };
        checkWatchlist();
    }, [user, id]);

    const toggleWatchlist = async () => {
        if (!user) {
            alert("Please sign in to manage your watchlist.");
            return;
        }
        const userDoc = doc(db, "users", user.uid);
        try {
            if (isInWatchlist) {
                await updateDoc(userDoc, { watchlist: arrayRemove(movie) });
                setIsInWatchlist(false);
            } else {
                await updateDoc(userDoc, { watchlist: arrayUnion(movie) });
                setIsInWatchlist(true);
            }
        } catch (error) {
            console.error("Error updating watchlist:", error);
        }
    };

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
            <View style={[styles.contentContainer, isHorizontal && styles.horizontalContentContainer]}>
                <Image
                    source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }}
                    style={[styles.poster, isHorizontal && styles.horizontalPoster]}
                />
                <View style={[styles.detailsContainer, isHorizontal && styles.horizontalDetailsContainer]}>
                    <Text style={styles.title}>{movie.title}</Text>
                    <Text style={styles.info}>Release Year: {movie.release_date?.split("-")[0]}</Text>
                    <Text style={styles.info}>Director: {movie.director || "Unknown"}</Text>
                    <Text style={styles.overview}>{movie.overview}</Text>
                    <Text style={styles.watchlistButton} onPress={toggleWatchlist}>
                        {isInWatchlist ? "Remove from My Watchlist" : "Add to My Watchlist"}
                    </Text>
                </View>
            </View>
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
    contentContainer: {
        alignItems: "center",
        marginBottom: 20,
    },
    horizontalContentContainer: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    poster: {
        width: "100%",
        aspectRatio: 2 / 3, // Maintain aspect ratio
        borderRadius: 10,
    },
    horizontalPoster: {
        width: "40%", // Adjust width for horizontal layout
        marginRight: 20,
    },
    detailsContainer: {
        flex: 1,
    },
    horizontalDetailsContainer: {
        flex: 1,
        justifyContent: "flex-start",
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
    watchlistButton: {
        marginTop: 20,
        color: "#1E88E5",
        fontSize: 16,
        fontWeight: "bold",
        textDecorationLine: "underline",
    },
});
