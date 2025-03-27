import { Text, View, StyleSheet, TextInput, FlatList, TouchableOpacity } from "react-native";
import { useState } from "react";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";

export default function Index() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState([]);

  const searchMovies = async (text: string) => {
    setQuery(text);
    if (text.length > 2) {
      try {
        const response = await axios.get(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${text}`
        );
        setMovies(response.data.results);
      } catch (error) {
        console.error("Error fetching movies:", error);
      }
    } else {
      setMovies([]);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchBar}
        placeholder="Search for movies..."
        value={query}
        onChangeText={searchMovies}
      />
      <FlatList
        data={movies}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.movieItem}>
            <Text style={styles.movieTitle}>{item.title}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#25292e", // dark blue
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 10,
  },
  searchBar: {
    width: "100%",
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    fontSize: 16,
  },
  movieItem: {
    padding: 10,
    backgroundColor: "#61dafb",
    borderRadius: 5,
    marginVertical: 5,
    width: "100%",
  },
  movieTitle: {
    color: "#fff",
    fontSize: 16,
  },
});