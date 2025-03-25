import { Text, View, StyleSheet } from "react-native";
import { Link } from "expo-router";

export default function Index() {
  return (
    <View style={styles.container}>
      {/* <Text>Home</Text> */}
      <Link href={"/login"} style={styles.button}> login </Link>
      {/* <Link href={"/explore"} style={styles.button}> expore </Link> */}
      <Link href={"/search"} style={styles.button}> search </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#25292e',//dark blue
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',//white
  },
  button: {
    color: '#fff',//white
    padding: 10,
    backgroundColor: '#61dafb',
    borderRadius: 5,
    marginTop: 10,
    fontSize: 20,
  }
});