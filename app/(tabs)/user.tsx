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
    const [isEditingName, setIsEditingName] = useState(false); // State to toggle edit mode

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

    const handleEditNameToggle = async () => {
        if (isEditingName && userName) {
            await updateUserName(userName); // Save the new name when toggling off
        }
        setIsEditingName((prev) => !prev); // Toggle edit mode
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
            <TouchableOpacity onPress={() => router.push("/screens/addFriend")}> {/* Navigate to addFriend page */}
                <Text style={[styles.addFriendButton, isDarkMode && styles.darkText]}>Add Friend</Text>
            </TouchableOpacity>
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
                    onPress={() => {
                        router.replace("/"); // Navigate to the index page
                    }}
                >
                    eyelevel
                </Text>
                {renderHeaderRight()}
            </View>
            <Text style={[styles.label, isDarkMode && styles.darkText]}>Name:</Text>
            <TextInput
                style={[
                    styles.input,
                    isDarkMode && styles.darkInput,
                    !isEditingName && styles.disabledInput, // Apply disabled style when not editing
                ]}
                value={userName || ""}
                onChangeText={setUserName} // Update state directly
                editable={isEditingName} // Disable input when not in edit mode
                placeholder="Enter your name"
                placeholderTextColor={isDarkMode ? "#888" : "#ccc"}
            />
            <TouchableOpacity onPress={handleEditNameToggle} style={styles.editButton}>
                <Text style={[styles.editButtonText, isDarkMode && styles.darkText]}>
                    {isEditingName ? "Save My New Name" : "Edit My Name"}
                </Text>
            </TouchableOpacity>
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
            <FriendsList /> {/* Add FriendsList component */}
        </View>
    );
}

const FriendsList = () => {
    const [friends, setFriends] = useState([]);
    const { isDarkMode } = useTheme(); // Use theme context

    useEffect(() => {
        const fetchFriends = async () => {
            const user = auth.currentUser;
            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    setFriends(userDoc.data().friends || []);
                }
            }
        };
        fetchFriends();
    }, []);

    const renderFriendItem = ({ item }) => (
        <View style={[styles.friendItem, isDarkMode && styles.darkItem]}>
            <Text style={[styles.friendName, isDarkMode && styles.darkText]}>
                {item.name || "Unknown User"}
            </Text>
            <Text style={[styles.friendEmail, isDarkMode && styles.darkText]}>
                {item.email}
            </Text>
        </View>
    );

    return (
        <View style={[styles.friendsContainer, isDarkMode && styles.darkContainer]}>
            <Text style={[styles.friendsTitle, isDarkMode && styles.darkText]}>
                Friends List
            </Text>
            <FlatList
                data={friends}
                keyExtractor={(item) => item.id}
                renderItem={renderFriendItem}
                ListEmptyComponent={
                    <Text style={[styles.emptyText, isDarkMode && styles.darkText]}>
                        No friends found.
                    </Text>
                }
                contentContainerStyle={{ flexGrow: 1 }} // Ensure FlatList expands fully
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FAFAFA",
        paddingHorizontal: 30, // Increase horizontal padding for better spacing
        paddingVertical: 20,
        width: "100%", // Ensure the container takes full width
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
        label: {
            fontSize: 20, // Increase font size for better readability
            fontWeight: "600",
            marginTop: 15, // Add more spacing for clarity
            color: "#3C4858",
        },
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
    disabledInput: {
        backgroundColor: "#f0f0f0", // Greyed-out background
        color: "#888", // Greyed-out text
    },
    editButton: {
        marginVertical: 10,
        padding: 10,
        backgroundColor: "#1A237E",
        borderRadius: 5,
        alignItems: "center",
    },
    editButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    addFriendButton: {
        fontSize: 16,
        color: "#000",
        marginLeft: 10,
    friendsContainer: {
        flex: 1,
        padding: 20,
        backgroundColor: "#FAFAFA",
        borderRadius: 5, // Add rounded corners
        width: "100%", // Ensure full width
    },
    },
    friendsTitle: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#1A237E",
    },
    friendItem: {
        padding: 15,
        backgroundColor: "#E8EAF6",
        borderRadius: 5,
        marginBottom: 10,
    },
    darkItem: {
        backgroundColor: "#1e1e1e", // Dark mode item background
    },
    friendName: {
        fontSize: 16,
        color: "#3C4858",
        fontWeight: "bold",
    },
    friendEmail: {
        fontSize: 14,
        color: "#3C4858",
    },
    emptyText: {
        textAlign: "center",
        color: "#888",
        marginTop: 20,
    },
});

