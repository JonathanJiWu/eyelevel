import { Text, View, StyleSheet } from "react-native";

export default function About() {
    return (
        <View style={styles.container}>
            <Text>Sign in to eyelevel</Text>
            <Text>User name</Text>
            {/* TODO: input box for user name */}
            <Text>Password</Text>

            <button>new user</button>
            <button>sign in</button>
            <button>forget password</button>
        </View>
        
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#25292e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#fff',
    },
});