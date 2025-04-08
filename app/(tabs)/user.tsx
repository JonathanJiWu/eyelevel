import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Switch, Alert, TextInput } from "react-native";
import { auth, db } from "../../firebaseConfigs";
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useTheme } from "../_layout"; // Import useTheme
import { MaterialIcons } from "@expo/vector-icons"; // Add this import
import { useRouter } from "expo-router"; // Import useRouter for navigation

export default function MyMovies() {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null); // Add state for user name
    const [watchlist, setWatchlist] = useState<any[]>([]); // Ensure watchlist is an array
    const { isDarkMode, toggleDarkMode } = useTheme(); // Use theme context
    const router = useRouter(); // Initialize router

    const fetchUserData = async () => {
        const user = auth.currentUser;
        if (user) {
            setUserEmail(user.email);
            const userDoc = doc(db, "users", user.uid);
            const docSnap = await getDoc(userDoc);
            if (docSnap.exists()) {
                setWatchlist(docSnap.data().watchlist || []);
                setUserName(docSnap.data().name || ""); // Fetch user name
            }
        } else {
            setUserEmail(null);
            setWatchlist([]);
            setUserName(null); // Clear user name
        }
    };

    useEffect(() => {
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

    const updateUserName = async (newName: string) => {
        const user = auth.currentUser;
        if (!user) return;
        const userDoc = doc(db, "users", user.uid);
        try {
            await updateDoc(userDoc, { name: newName });
            setUserName(newName); // Update state with new name
        } catch (error) {
            console.error("Error updating user name:", error);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth); // Ensure signOut is called correctly
            setUserEmail(null); // Clear user email
            setWatchlist([]); // Clear watchlist
            setUserName(null); // Clear user name
            Alert.alert("Success", "Signed out successfully."); // Use Alert for consistent UI feedback
        } catch (error) {
            console.error("Error signing out:", error);
            Alert.alert("Error", "Failed to sign out. Please try again."); // Use Alert for error feedback
        }
    };

    const renderHeaderRight = () => (
        <View style={styles.headerRight}>
            <MaterialIcons
                name={isDarkMode ? "nights-stay" : "wb-sunny"}
                size={24}
                color={isDarkMode ? "#fff" : "#000"}
            />
            <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
            {userEmail ? (
                <TouchableOpacity onPress={handleSignOut}>
                    <Text style={[styles.signOutButton, isDarkMode && styles.darkText]}>Sign Out</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity onPress={() => router.push("/login")}> {/* Navigate to login page */}
                    <Text style={[styles.signOutButton, isDarkMode && styles.darkText]}>Sign In</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderWatchlistItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={[styles.watchlistItem, isDarkMode && styles.darkItem]}
            onPress={() => router.push(`/movie/${item.id}`)} // Navigate to movie detail page
        >
            <Image
                source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
                style={styles.poster}
            />
            <View style={styles.movieDetails}>
                <Text style={[styles.movieTitle, isDarkMode && styles.darkText]}>
                    {item.title || "Unknown Title"}
                </Text>
                <Text style={[styles.movieInfo, isDarkMode && styles.darkText]}>
                    Year: {item.release_date?.split("-")[0] || "N/A"}
                </Text>
                <Text style={[styles.movieInfo, isDarkMode && styles.darkText]}>
                    Director: {item.director || "Unknown"}
                </Text>
            </View>
            <TouchableOpacity onPress={() => removeFromWatchlist(item)}>
                <Text style={[styles.removeButton, isDarkMode && styles.darkText]}>
                    Remove
                </Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, isDarkMode && styles.darkContainer]}>
            <View style={styles.header}>
                <Text
                    style={[styles.title, isDarkMode && styles.darkText]}
                    onPress={async () => {
                        setMovies([]); // Clear search results
                        setPopularMovies([]); // Reset popular movies
                        await fetchPopularMovies(1, 5); // Reload 100 movies (5 pages of 20 movies each)
                        router.replace("/"); // Use replace to ensure a full refresh of the index page
                    }}
                >
                    eyelevel
                </Text>
                {renderHeaderRight()}
            </View>
            <Text style={[styles.label, isDarkMode && styles.darkText]}>Name:</Text>
            <TextInput
                style={[styles.input, isDarkMode && styles.darkInput]} // Add input styling
                value={userName || ""}
                onChangeText={updateUserName} // Update name on change
                placeholder="Enter your name"
                placeholderTextColor={isDarkMode ? "#888" : "#ccc"}
            />
            <Text style={[styles.label, isDarkMode && styles.darkText]}>Email:</Text>
            <Text style={[styles.value, isDarkMode && styles.darkText]}>
                {userEmail || "Not logged in"}
            </Text>
            <Text style={[styles.sectionTitle, isDarkMode && styles.darkText]}>
                Watchlist
            </Text>
            <FlatList
                data={watchlist}
                keyExtractor={(item) => item.id?.toString() || Math.random().toString()} // Ensure unique key
                renderItem={renderWatchlistItem} // Use the updated render function
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
    darkContainer: {
        backgroundColor: "#121212", // Dark mode background
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
    },
    headerRight: {
        flexDirection: "row",
        alignItems: "center",
    },
    toggle: {
        marginHorizontal: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
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
    darkItem: {
        backgroundColor: "#1e1e1e", // Dark mode item background
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
        fontSize: 16,
        color: "#000",
    },
    darkText: {
        color: "#fff",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        padding: 10,
        marginBottom: 10,
        color: "#000",
    },
    darkInput: {
        borderColor: "#555",
        color: "#fff",
    },
});

