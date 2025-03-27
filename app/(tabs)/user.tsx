import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { auth } from '../../firebaseConfigs';

export default function UserProfile() {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userPassword, setUserPassword] = useState<string | null>('********'); // Placeholder for password

    useEffect(() => {
        const user = auth.currentUser;
        if (user) {
            setUserEmail(user.email);
            // Password is not retrievable for security reasons, so we use a placeholder.
        }
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>User Profile</Text>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{userEmail || 'Not logged in'}</Text>
            <Text style={styles.label}>Password:</Text>
            <Text style={styles.value}>{userPassword}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FAFAFA',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#1A237E',
    },
    label: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 10,
        color: '#3C4858',
    },
    value: {
        fontSize: 16,
        color: '#5C6BC0',
        marginBottom: 10,
    },
});

