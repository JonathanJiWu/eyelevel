import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, Dimensions, ImageBackground } from "react-native";
import axios from "axios";
import { useRoute, useNavigation } from "@react-navigation/native"; // Use this hook to access route params and navigation
import { TMDB_API_KEY } from "../../tmdbConfig";
import { auth, db } from "../../firebaseConfigs";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

export default function MovieDetail() {
    const route = useRoute();
    const navigation = useNavigation();
    const { id } = route.params || {}; // Safely access the id parameter
    const [movie, setMovie] = useState<any>(null);
    const [isHorizontal, setIsHorizontal] = useState(false);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false); // State for dark mode
    const user = auth.currentUser;

    useEffect(() => {
        const updateOrientation = () => {
            const { width, height } = Dimensions.get("window");
            setIsHorizontal(width > height);
        };

        updateOrientation();
        const subscription = Dimensions.addEventListener("change", updateOrientation);

        return () => subscription?.remove();
    }, []);

    useEffect(() => {
        if (!id) return; // Prevent fetching if id is undefined
        const fetchMovie = async () => {
            try {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
                );
                setMovie(response.data);
                navigation.setOptions({
                    title: `${response.data.title} (${response.data.release_date?.split("-")[0] || "N/A"})`,
                });
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

    const backdropUrl = movie.backdrop_path
        ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}`
        : null;

    const director = movie?.credits?.crew?.find((crewMember: any) => crewMember.job === "Director")?.name || "Unknown"; // Define director
    const genres = movie?.genres?.map((genre: any) => genre.name).join(", ") || "N/A";
    const languages = movie?.spoken_languages?.map((lang: any) => lang.english_name).join(", ") || "N/A";
    const cast = movie?.credits?.cast?.slice(0, 5).map((actor: any) => actor.name).join(", ") || "N/A";

    console.log("Backdrop URL:", backdropUrl); // Debugging log
    console.log("isDarkMode:", isDarkMode); // Debugging log

    return (
        <ImageBackground
            source={backdropUrl ? { uri: backdropUrl } : require("../../assets/images/splash-icon.png")} // Fallback image
            style={styles.background}
            imageStyle={styles.imageStyle} // Ensure the image respects styling
        >
            <View
                style={[
                    styles.overlay,
                    isDarkMode ? styles.darkOverlay : styles.lightOverlay,
                ]}
            />
            <ScrollView style={[styles.container, isDarkMode && styles.darkContainer]}>
                <View style={[styles.contentContainer, isHorizontal && styles.horizontalContentContainer]}>
                    <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }}
                        style={[styles.poster, isHorizontal && styles.horizontalPoster]}
                    />
                    <View style={[styles.detailsContainer, isHorizontal && styles.horizontalDetailsContainer]}>
                        <Text style={[styles.title, isDarkMode && styles.darkText]}>{movie.title}</Text>
                        <Text style={[styles.info, isDarkMode && styles.darkText]}>Release Year: {movie.release_date?.split("-")[0]}</Text>
                        <Text style={[styles.info, isDarkMode && styles.darkText]}>Director: {director}</Text>
                        <Text style={[styles.info, isDarkMode && styles.darkText]}>Genres: {genres}</Text>
                        <Text style={[styles.info, isDarkMode && styles.darkText]}>Languages: {languages}</Text>
                        <Text style={[styles.info, isDarkMode && styles.darkText]}>Cast: {cast}</Text>
                        <Text style={[styles.overview, isDarkMode && styles.darkText]}>{movie.overview}</Text>
                        <Text style={styles.watchlistButton} onPress={toggleWatchlist}>
                            {isInWatchlist ? "Remove from My Watchlist" : "Add to My Watchlist"}
                        </Text>
                    </View>
                </View>
                <View style={styles.testingSection}>
                    <Text style={styles.testingTitle}>Testing Section</Text>
                    <Text style={styles.testingContent}>{JSON.stringify(movie, null, 2)}</Text>
                </View>
            </ScrollView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1,
    },
    imageStyle: {
        resizeMode: "cover", // Ensure the image covers the background
    },
    overlay: {
        ...StyleSheet.absoluteFillObject, // Covers the entire background
        zIndex: 1, // Ensure it is above the background image
    },
    darkOverlay: {
        backgroundColor: "rgba(0, 0, 0, 0.7)", // Darker overlay for dark mode
    },
    lightOverlay: {
        backgroundColor: "rgba(255, 255, 255, 0.3)", // Brighter overlay for light mode
    },
    container: {
        flex: 1,
        backgroundColor: "rgba(255, 255, 255, 0.9)", // Add transparency for readability
        padding: 20,
        zIndex: 2, // Ensure content is above the overlay
    },
    darkContainer: {
        backgroundColor: "rgba(18, 18, 18, 0.9)", // Adjusted for dark mode
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
        width: "50%",
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
    darkText: {
        color: "#e0e0e0", // Light gray text for dark mode
    },
    testingSection: {
        marginTop: 20,
        padding: 10,
        backgroundColor: "#f0f0f0",
        borderRadius: 5,
    },
    testingTitle: {
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 10,
    },
    testingContent: {
        fontSize: 14,
        color: "#333",
    },
});
