import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import IndexScreen from '../screens/IndexScreen';
import UserScreen from '../screens/UserScreen';
import { useTheme } from '../_layout';
import { MaterialIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
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
                },
            }}
        >
            <Tab.Screen
                name="Home"
                component={IndexScreen}
                options={{
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <MaterialIcons name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tab.Screen
                name="My Movies"
                component={UserScreen}
                options={{
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
                        <MaterialIcons name="movie" size={size} color={color} />
                    ),
                }}
            />
        </Tab.Navigator>
    );
}