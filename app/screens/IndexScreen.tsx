import { Text, View, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, Platform, Animated, Switch } from "react-native";
import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import axios from "axios";
import { TMDB_API_KEY } from "../config/tmdbConfig";
import { auth, db } from "../config/firebaseConfigs";
import { useRouter } from "expo-router";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useTheme } from "../_layout";
import { MaterialIcons } from "@expo/vector-icons";
import HeaderBar from "../components/HeaderBar";

export default function IndexScreen() {
    const { isDarkMode, toggleDarkMode } = useTheme();
    const router = useRouter();
    const user = auth.currentUser;

    return (
        <View style={[styles.container, isDarkMode && styles.darkContainer]}>
            <HeaderBar
                title="Home"
                isSignedIn={!!user}
                onSignOut={() => {
                    signOut(auth);
                    router.replace("/login");
                }}
                onToggleDarkMode={toggleDarkMode}
            />
            {/* ...existing content of IndexScreen... */}
        </View>
    );
}