// Import necessary modules and components
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MovieDetail from './MovieDetail'; // Adjust the path as needed
import { auth } from './firebaseConfigs'; // Ensure Firebase imports are correct
import { useRouter } from "expo-router";
import { Text } from "react-native"; // Add missing import
import HomeScreen from "./app/(tabs)/index"; // Ensure HomeScreen is imported

const Stack = createStackNavigator();

export default function AppNavigation() {
    const router = useRouter();
    const user = auth.currentUser;

    return (
        <Stack.Navigator>
            <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    headerRight: () => (
                        user ? (
                            <Text onPress={() => router.push("/(tabs)/user")}>
                                {user.displayName || "User"}
                            </Text>
                        ) : (
                            <Text onPress={() => router.push("/login")}>Sign In</Text>
                        )
                    ),
                }}
            />
            <Stack.Screen
                name="MovieDetail"
                component={MovieDetail}
                initialParams={{ id: null }}
                options={{ headerTitle: "Movie Details" }}
            />
        </Stack.Navigator>
    );
}
