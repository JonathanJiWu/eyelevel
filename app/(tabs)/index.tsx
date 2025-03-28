import { Text, View, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, Platform } from "react-native";
import { useState, useEffect } from "react";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";
import { auth } from "../../firebaseConfigs";
import { useRouter } from "expo-router";

export default function Index() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const fetchMovies = async (text: string, pageNum = 1) => {
    try {
      const response = await axios.get(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${text}&page=${pageNum}`
      );
      return response.data.results;
    } catch (error) {
      console.error("Error fetching movies:", error);
      return [];
    }
  };

  const searchMovies = async (text: string) => {
    setQuery(text);
    if (text.length > 2) {
      const results = await fetchMovies(text);
      setMovies(results);
    } else {
      setMovies([]);
    }
  };

  const handleAutocomplete = async (text: string) => {
    setQuery(text);
    if (text.length > 2) {
      const results = await fetchMovies(text);
      setAutocompleteResults(results.slice(0, 5));
    } else {
      setAutocompleteResults([]);
    }
  };

  const loadMoreMovies = async () => {
    const nextPage = page + 1;
    const moreMovies = await fetchMovies(query, nextPage);
    setMovies((prevMovies) => [...prevMovies, ...moreMovies]);
    setPage(nextPage);
  };

  const handleKeyPress = (event: any) => {
    if (Platform.OS === "web" && event.key === "Enter") {
      searchMovies(query);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>eyelevel</Text>
        {user ? (
          <Text style={styles.username}>Hello, {user.displayName || "User"}</Text>
        ) : (
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.signInText}>Sign in to personalize</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search for movies..."
          value={query}
          onChangeText={handleAutocomplete}
          onKeyPress={handleKeyPress}
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => searchMovies(query)}>
          <Text style={styles.searchButtonText}>🔍</Text>
        </TouchableOpacity>
        {autocompleteResults.length > 0 && (
          <View style={styles.autocompleteDropdown}>
            {autocompleteResults.map((result) => (
              <TouchableOpacity
                key={result.id}
                onPress={() => {
                  setQuery(result.title);
                  setAutocompleteResults([]);
                  searchMovies(result.title);
                }}
              >
                <Text style={styles.autocompleteItem}>{result.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <FlatList
        data={movies}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.movieTile}>
            <Image
              source={{ uri: `https://image.tmdb.org/t/p/w500${item.poster_path}` }}
              style={styles.moviePoster}
            />
            <Text style={styles.movieTitle}>{item.title}</Text>
            <Text style={styles.movieYear}>{item.release_date?.split("-")[0]}</Text>
          </View>
        )}
        numColumns={Math.floor(Platform.OS === "web" ? window.innerWidth / 150 : 2)}
        onEndReached={loadMoreMovies}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#25292e",
    padding: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  username: {
    color: "#fff",
    fontSize: 16,
  },
  signInText: {
    color: "#61dafb",
    fontSize: 16,
    textDecorationLine: "underline",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#fff",
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  searchBar: {
    flex: 1,
    padding: 10,
    fontSize: 16,
  },
  searchButton: {
    padding: 5,
  },
  searchButtonText: {
    fontSize: 16,
    color: "#333",
  },
  autocompleteDropdown: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 5,
    zIndex: 1,
  },
  autocompleteItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  movieTile: {
    flex: 1,
    margin: 5,
    backgroundColor: "#333",
    borderRadius: 5,
    overflow: "hidden",
    alignItems: "center",
  },
  moviePoster: {
    width: "100%",
    aspectRatio: 27 / 40,
  },
  movieTitle: {
    color: "#fff",
    fontSize: 14,
    marginTop: 5,
  },
  movieYear: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 5,
  },
});