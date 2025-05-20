import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import IndexScreen from './index';
import UserScreen from './user';
import { useTheme } from '../_layout';
import { Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

export default function TabLayout() {
    const { isDarkMode } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: isDarkMode ? '#121212' : '#fff',
                    borderTopWidth: 0,
                },
                tabBarActiveTintColor: isDarkMode ? '#1E88E5' : '#007AFF',
                tabBarInactiveTintColor: isDarkMode ? '#888' : '#666',
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: 'bold',
                    fontFamily: Platform.select({
                        ios: 'Arial',
                        android: 'Roboto',
                        default: 'System',
                    }),
                },
            }}
        >
            <Tab.Screen
                name="Index"
                component={IndexScreen}
                options={{
                    headerShown: false,
                    title: 'eyelevel',
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <MaterialIcons name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="User"
                component={UserScreen}
                options={{
                    headerShown: false,
                    tabBarLabel: 'My Movies',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <MaterialIcons name="movie" size={size} color={color} />
                    ),
                }}
            />
        </Tab.Navigator>
    );
}
