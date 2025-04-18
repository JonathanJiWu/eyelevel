import { Tabs } from 'expo-router';
import { useTheme } from '../_layout'; // Import the theme context

export default function TabLayout() {
    const { isDarkMode } = useTheme(); // Access the current theme

    return (
        <Tabs
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: isDarkMode ? '#121212' : '#fff', // Dynamic background color
                    borderTopWidth: 0, // Remove border
                },
                tabBarActiveTintColor: isDarkMode ? '#1E88E5' : '#007AFF', // Dynamic active tab color
                tabBarInactiveTintColor: isDarkMode ? '#888' : '#666', // Dynamic inactive tab color
                tabBarLabelStyle: {
                    fontSize: 12, // Label font size
                    fontWeight: 'bold', // Label font weight
                },
                tabBarIndicatorStyle: {
                    backgroundColor: isDarkMode ? '#1E88E5' : '#007AFF', // Dynamic indicator color
                    height: 3, // Indicator height
                },
            }}
        >
            <Tabs.Screen name="index" options={{ title: 'eyelevel', headerShown: false }} />
            {/* <Tabs.Screen name="explore" options={{ title: 'Explore' }} /> */}
            <Tabs.Screen name="user" options={{ title: 'My Movies', headerShown: false }} />
        </Tabs>
    );
}
