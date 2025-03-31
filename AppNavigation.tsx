// Import necessary modules and components
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MovieDetail from './MovieDetail'; // Adjust the path as needed
import { auth } from "./firebaseConfigs";
import { useRouter } from "expo-router";

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
                initialParams={{ id: null }} // Optional: Set default params
                options={{ headerTitle: "Movie Details" }} // Add a title for the screen
            />
        </Stack.Navigator>
    );
}
