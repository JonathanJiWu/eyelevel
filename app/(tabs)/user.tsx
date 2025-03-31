import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from "react-native";
import { auth, db } from "../../firebaseConfigs";
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function MyMovies() {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [watchlist, setWatchlist] = useState<any[]>([]); // Ensure watchlist is an array

    useEffect(() => {
        const fetchUserData = async () => {
            const user = auth.currentUser;
            if (user) {
                setUserEmail(user.email);
                const userDoc = doc(db, "users", user.uid);
                const docSnap = await getDoc(userDoc);
                if (docSnap.exists()) {
                    setWatchlist(docSnap.data().watchlist || []);
                }
            }
        };
        fetchUserData();
    }, []);

    const removeFromWatchlist = async (movie: any) => {
        const user = auth.currentUser;
        if (!user) return;
        const userDoc = doc(db, "users", user.uid);
        try {
            await updateDoc(userDoc, { watchlist: arrayRemove(movie) });
            setWatchlist((prev) => prev.filter((item) => item.id !== movie.id));
        } catch (error) {
            console.error("Error removing from watchlist:", error);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            alert("Signed out successfully.");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>My Movies</Text>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{userEmail || "Not logged in"}</Text>
            <TouchableOpacity onPress={handleSignOut}>
                <Text style={styles.signOutButton}>Sign Out</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Watchlist</Text>
            <FlatList
                data={watchlist}
                keyExtractor={(item) => item.id?.toString() || Math.random().toString()} // Ensure unique key
                renderItem={({ item }) => (
                    <View style={styles.watchlistItem}>
                        <Image
                            source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
                            style={styles.poster}
                        />
                        <View style={styles.movieDetails}>
                            <Text style={styles.movieTitle}>{item.title || "Unknown Title"}</Text>
                            <Text style={styles.movieInfo}>
                                Year: {item.release_date?.split("-")[0] || "N/A"}
                            </Text>
                            <Text style={styles.movieInfo}>
                                Director: {item.director || "Unknown"}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => removeFromWatchlist(item)}>
                            <Text style={styles.removeButton}>Remove</Text>
                        </TouchableOpacity>
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FAFAFA",
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#1A237E",
    },
    label: {
        fontSize: 18,
        fontWeight: "600",
        marginTop: 10,
        color: "#3C4858",
    },
    value: {
        fontSize: 16,
        color: "#5C6BC0",
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 20,
        marginBottom: 10,
        color: "#1A237E",
    },
    watchlistItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 15,
        backgroundColor: "#E8EAF6",
        borderRadius: 5,
        marginBottom: 15,
    },
    poster: {
        width: 50,
        height: 75,
        marginRight: 15,
    },
    movieDetails: {
        flex: 1,
    },
    movieTitle: {
        fontSize: 16,
        color: "#3C4858",
    },
    movieInfo: {
        fontSize: 14,
        color: "#3C4858",
    },
    removeButton: {
        color: "#DB4437",
        fontWeight: "bold",
    },
    signOutButton: {
        color: "#DB4437",
        fontWeight: "bold",
        marginTop: 10,
    },
});

