import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import IndexScreen from './index';
import UserScreen from './user';
import { useTheme } from '../_layout'; // Import the theme context
import { Platform } from 'react-native'; // Import Platform for platform-specific font selection
import MaterialIcons from 'react-native-vector-icons/MaterialIcons'; // Import MaterialIcons for tab icons

const Tab = createBottomTabNavigator();

export default function TabLayout() {
    const { isDarkMode } = useTheme(); // Access the current theme

    return (
        <Tab.Navigator
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
                    fontFamily: Platform.select({
                        ios: 'Arial', // Use Arial on iOS
                        android: 'Roboto', // Use Roboto on Android
                        default: 'System', // Fallback to System font
                    }),
                },
            }}
        >
            <Tab.Screen
                name="Index"
                component={IndexScreen}
                options={{
                    headerShown: false,
                    title: 'eyelevel', // Clear title fallback
                    tabBarLabel: 'Home', // Explicitly set a simple label
                    tabBarIcon: ({ color, size }) => (
                        <MaterialIcons name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="User"
                component={UserScreen}
                options={{
                    headerShown: false,
                    tabBarLabel: 'My Movies', // Explicitly set a simple label
                    tabBarIcon: ({ color, size }) => (
                        <MaterialIcons name="movie" size={size} color={color} />
                    ),
                }}
            />
        </Tab.Navigator>
    );
}
