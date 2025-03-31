// Import necessary modules and components
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MovieDetail from './MovieDetail'; // Adjust the path as needed

const Stack = createStackNavigator();

// ...existing code...
<Stack.Screen
    name="MovieDetail"
    component={MovieDetail}
    initialParams={{ id: null }} // Optional: Set default params
    options={{ headerTitle: "Movie Details" }} // Add a title for the screen
/>
// ...existing code...
