import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, TextInput } from "react-native";
import { auth, db } from "../config/firebaseConfigs";
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useTheme } from "../_layout";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import HeaderBar from "../components/HeaderBar";

export default function UserScreen() {
    const [userData, setUserData] = useState(null);
    const router = useRouter();
    const { isDarkMode, toggleDarkMode } = useTheme();
    const user = auth.currentUser;

    useEffect(() => {
        const fetchUserData = async () => {
            const userDoc = doc(db, "users", auth.currentUser.uid);
            const userSnapshot = await getDoc(userDoc);
            if (userSnapshot.exists()) {
                setUserData(userSnapshot.data());
            }
        };

        fetchUserData();
    }, []);

    const handleRemoveItem = async (item) => {
        const userDoc = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userDoc, { items: arrayRemove(item) });
        setUserData((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i !== item),
        }));
    };

    return (
        <View style={[styles.container, isDarkMode && styles.darkContainer]}>
            <HeaderBar
                title="My Movies"
                isSignedIn={!!user}
                onSignOut={() => {
                    signOut(auth);
                    router.replace("/login");
                }}
                onToggleDarkMode={toggleDarkMode}
            />
            <FlatList
                data={userData?.items || []}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <Text style={[styles.itemText, { color: isDarkMode ? "white" : "black" }]}>{item}</Text>
                        <TouchableOpacity onPress={() => handleRemoveItem(item)}>
                            <MaterialIcons name="delete" size={24} color="red" />
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
        padding: 20,
    },
    darkContainer: {
        backgroundColor: "#333",
    },
    item: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#ccc",
    },
    itemText: {
        fontSize: 18,
    },
});