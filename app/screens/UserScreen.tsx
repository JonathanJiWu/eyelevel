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
    const [userData, setUserData] = useState<any>(null);
    const router = useRouter();
    const { isDarkMode, toggleDarkMode } = useTheme();
    const user = auth.currentUser;

    useEffect(() => {
        const fetchUserData = async () => {
            if (!auth.currentUser) return;
            const userDoc = doc(db, "users", auth.currentUser.uid);
            const userSnapshot = await getDoc(userDoc);
            if (userSnapshot.exists()) {
                setUserData(userSnapshot.data());
            }
        };

        fetchUserData();
    }, []);

    const handleRemoveItem = async (item: any) => {
        if (!auth.currentUser) return;
        const userDoc = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userDoc, { items: arrayRemove(item) });
        setUserData((prev: any) => ({
            ...prev,
            items: prev?.items?.filter((i: any) => i !== item),
        }));
    };

    return (
        <View style={[styles.container, isDarkMode && styles.darkContainer]}>
            <HeaderBar title="My Movies" />
            <FlatList
                data={userData?.items || []}
                keyExtractor={(_item: any, index: number) => index.toString()}
                renderItem={({ item }: { item: any }) => (
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