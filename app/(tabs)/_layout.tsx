import { Tabs } from 'expo-router';

export default function TabLayout() {
    return (
        <Tabs>
            <Tabs.Screen name="index" options={{ title: 'eyelevel' }} />
            <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
            <Tabs.Screen name="user" options={{ title: 'My Account' }} />
        </Tabs>
    );
}
