import React, { useState, useEffect } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert, Modal } from "react-native";
import { auth, db } from "../../firebaseConfigs";
import { collection, getDocs, query, where, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";

export default function AddFriend() {
    const [searchQuery, setSearchQuery] = useState("");
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [friends, setFriends] = useState([]);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const navigation = useNavigation();

    useEffect(() => {
        const fetchCurrentUser = async () => {
            const user = auth.currentUser;
            if (user) {
                setCurrentUser(user);
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    setFriends(userDoc.data().friends || []);
                }
            } else {
                setShowLoginModal(true); // Show modal but stay on the current page
            }
        };
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [searchQuery]);

    const fetchUsers = async () => {
        try {
            const usersRef = collection(db, "users");
            const q = searchQuery
                ? query(usersRef, where("name", "==", searchQuery))
                : usersRef; // Use collection reference directly if no query
            const querySnapshot = await getDocs(q);
            const usersList = querySnapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((user) => user.id !== currentUser?.uid); // Exclude the current user
            setUsers(usersList);
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    };

    const toggleFriend = async (friend) => {
        if (!currentUser) {
            setShowLoginModal(true); // Show modal but do not navigate away
            return;
        }

        try {
            const userDoc = doc(db, "users", currentUser.uid);
            if (friends.some((f) => f.id === friend.id)) {
                await updateDoc(userDoc, {
                    friends: arrayRemove(friend),
                });
                setFriends((prev) => prev.filter((f) => f.id !== friend.id));
                Alert.alert("Success", `${friend.name} has been removed from your friend list.`);
            } else {
                await updateDoc(userDoc, {
                    friends: arrayUnion({ id: friend.id, name: friend.name }), // Adjust the structure here
                });
                setFriends((prev) => [...prev, friend]);
                Alert.alert("Success", `${friend.name} has been added to your friend list.`);
            }
        } catch (error) {
            console.error("Error managing friend:", error);
            Alert.alert("Error", "Failed to update friend list. Please try again.");
        }
    };

    const renderUserItem = ({ item }) => {
        const isFriend = friends.some((f) => f.id === item.id);
        return (
            <View style={styles.userItem}>
                <View>
                    <Text style={styles.userName}>{item.name || "Unknown User"}</Text>
                    <Text style={styles.userEmail}>{item.email || "No Email"}</Text>
                    <Text style={styles.userDetails}>Movies: {item.watchlist?.length || 0}</Text>
                    <Text style={styles.userDetails}>Joined: Unknown days ago</Text>
                </View>
                <TouchableOpacity style={styles.addButton} onPress={() => toggleFriend(item)}>
                    <Text style={styles.addButtonText}>{isFriend ? "Remove Friend" : "Add Friend"}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Add Friend</Text>
            <TextInput
                style={styles.searchInput}
                placeholder="Search for users..."
                value={searchQuery}
                onChangeText={setSearchQuery}
            />
            <FlatList
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={renderUserItem}
                ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
            />
            <Modal visible={showLoginModal} transparent animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Login Required</Text>
                        <Text style={styles.modalText}>You must log in or sign up to manage friends.</Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalButton}
                                onPress={() => {
                                    setShowLoginModal(false); // Close modal
                                    navigation.navigate("Login"); // Navigate to login page
                                }}
                            >
                                <Text style={styles.modalButtonText}>Login</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowLoginModal(false)} // Close modal without navigating
                            >
                                <Text style={styles.modalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#FAFAFA",
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#1A237E",
    },
    searchInput: {
        height: 50,
        borderColor: "#E8EAF6",
        borderWidth: 2,
        borderRadius: 10,
        paddingHorizontal: 15,
        marginBottom: 20,
        backgroundColor: "#FFFFFF",
        color: "#3C4858",
    },
    userItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 15,
        backgroundColor: "#E8EAF6",
        borderRadius: 5,
        marginBottom: 10,
    },
    userName: {
        fontSize: 16,
        color: "#3C4858",
        fontWeight: "bold",
    },
    userEmail: {
        fontSize: 14,
        color: "#3C4858",
    },
    userDetails: {
        fontSize: 12,
        color: "#3C4858",
    },
    addButton: {
        backgroundColor: "#5C6BC0",
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 5,
    },
    addButtonText: {
        color: "#FFFFFF",
        fontWeight: "bold",
    },
    emptyText: {
        textAlign: "center",
        color: "#888",
        marginTop: 20,
    },
    modalContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalContent: {
        width: "80%",
        padding: 20,
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        alignItems: "center",
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        color: "#1A237E",
    },
    modalText: {
        fontSize: 16,
        color: "#3C4858",
        textAlign: "center",
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
    },
    modalButton: {
        flex: 1,
        backgroundColor: "#5C6BC0",
        padding: 10,
        borderRadius: 5,
        alignItems: "center",
        marginHorizontal: 5,
    },
    cancelButton: {
        backgroundColor: "#E57373",
    },
    modalButtonText: {
        color: "#FFFFFF",
        fontWeight: "bold",
    },
});