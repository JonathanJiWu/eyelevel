import { Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import React, { useState } from 'react';
import { auth } from '../firebaseConfigs';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { router } from 'expo-router';

const index = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const signIn = async () => {
        try {
            const user = await signInWithEmailAndPassword(auth, email, password);
            if (user) router.replace('/(tabs)');
        } catch (error: any) {
            console.log(error);
            alert('Sign in failed: ' + error.message);
        }
    };

    const signUp = async () => {
        try {
            const user = await createUserWithEmailAndPassword(auth, email, password);
            if (user) router.replace('/(tabs)');
        } catch (error: any) {
            console.log(error);
            alert('Sign up failed: ' + error.message);
        }
    };

    const signInWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            if (result.user) router.replace('/(tabs)');
        } catch (error: any) {
            console.log(error);
            alert('Google sign-in failed: ' + error.message);
        }
    };

    const resetPassword = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address to reset your password.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert('Success', 'Password reset email sent! Check your inbox.');
        } catch (error: any) {
            console.log(error);
            Alert.alert('Error', 'Failed to send password reset email: ' + error.message);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.title}>Login</Text>
            <TextInput style={styles.textInput} placeholder="email" value={email} onChangeText={setEmail} />
            <TextInput style={styles.textInput} placeholder="password" value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={styles.button} onPress={signIn}>
                <Text style={styles.text}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={signUp}>
                <Text style={styles.text}>Make Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle}>
                <Text style={styles.text}>Sign in with Google</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={resetPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

export default index;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FAFAFA',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 40,
        color: '#1A237E',
    },
    textInput: {
        height: 50,
        width: '90%',
        backgroundColor: '#FFFFFF',
        borderColor: '#E8EAF6',
        borderWidth: 2,
        borderRadius: 15,
        marginVertical: 15,
        paddingHorizontal: 25,
        fontSize: 16,
        color: '#3C4858',
        shadowColor: '#9E9E9E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    button: {
        width: '90%',
        marginVertical: 15,
        backgroundColor: '#5C6BC0',
        padding: 20,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#5C6BC0',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
        elevation: 5,
    },
    googleButton: {
        width: '90%',
        marginVertical: 15,
        backgroundColor: '#DB4437', // Google red color
        padding: 20,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#DB4437',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
        elevation: 5,
    },
    text: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    forgotPasswordText: {
        color: '#1A237E',
        fontSize: 16,
        fontWeight: '600',
        marginTop: 10,
    },
});