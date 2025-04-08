import { Text, View, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, Platform, Animated, Switch } from "react-native";
import { useState, useEffect } from "react";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";
import { auth, db } from "../../firebaseConfigs";
import { useRouter } from "expo-router";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useTheme } from "../_layout"; // Import useTheme
import { MaterialIcons } from "@expo/vector-icons"; // Add this import

export default function Index() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]); // Add popular movies state
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState(null);
  const [numColumns, setNumColumns] = useState(2);
  const [addedMovie, setAddedMovie] = useState<string | null>(null);
  const router = useRouter();
  const { isDarkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetchPopularMovies(1, 5); // Fetch 100 movies (20 movies per page * 5 pages)
  }, []);

  useEffect(() => {
    const updateColumns = () => {
      const width = Platform.OS === "web" ? window.innerWidth : 360;
      setNumColumns(Math.floor(width / 150));
    };
    updateColumns();
    if (Platform.OS === "web") {
      window.addEventListener("resize", updateColumns);
      return () => window.removeEventListener("resize", updateColumns);
    }
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

  const fetchPopularMovies = async (startPage = 1, totalPages = 1) => {
    try {
      let allMovies = [];
      for (let page = startPage; page < startPage + totalPages; page++) {
        const response = await axios.get(
          `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`
        );
        const weightedMovies = response.data.results
          .filter((movie) => !movie.adult)
          .sort(
            (a, b) =>
              new Date(b.release_date).getTime() -
              new Date(a.release_date).getTime()
          );
        allMovies = [...allMovies, ...weightedMovies];
      }
      setPopularMovies((prev) => [...prev, ...allMovies]);
    } catch (error) {
      console.error("Error fetching popular movies:", error);
    }
  };

  const searchMovies = async (text: string) => {
    setQuery(text);
    setAutocompleteResults([]); // Clear autocomplete dropdown when a search action occurs
    if (text.length > 2) {
      setMovies([]); // Clear current movies to show a blank page
      setPopularMovies([]); // Forcefully clear popular movies
      const results = await fetchMovies(text);
      setMovies(results); // Replace with search results
    } else {
      setMovies([]);
      setPopularMovies([]); // Ensure popular movies are cleared if search is invalid
      fetchPopularMovies(); // Refresh popular movie feeds
    }
  };

  const handleAutocomplete = async (text: string) => {
    setQuery(text);
    if (text.length > 2) {
      const results = await fetchMovies(text);
      setAutocompleteResults(results.slice(0, 5));
    } else {
      setAutocompleteResults([]);
      fetchPopularMovies(); // Reload popular movies if autocomplete is cleared
    }
  };

  const loadMoreMovies = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
  };

  const addToWatchlist = async (movie: any) => {
    if (!user) {
      alert("Please sign in to add movies to your watchlist.");
      return;
    }
    const userDoc = doc(db, "users", user.uid);
    try {
      await setDoc(userDoc, { watchlist: arrayUnion(movie) }, { merge: true });
      setAddedMovie(movie.title);
      setTimeout(() => setAddedMovie(null), 3000);
    } catch (error) {
      console.error("Error adding to watchlist:", error);
    }
  };

  const renderMovieTile = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.movieTile, { flex: 1 / numColumns }]}
      onPress={() => router.push(`/movie/${item.id}`)}
    >
      <Image
        source={{ uri: `https://image.tmdb.org/t/p/w500${item.poster_path}` }}
        style={styles.moviePoster}
      />
      <TouchableOpacity
        style={styles.watchlistButton}
        onPress={() => addToWatchlist(item)}
      >
        <Text style={styles.watchlistText}>+</Text>
      </TouchableOpacity>
      <Text style={styles.movieTitle}>{item.title}</Text>
      <Text style={styles.movieYear}>{item.release_date?.split("-")[0]}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, isDarkMode && styles.darkContainer]}>
      <View style={styles.header}>
        <Text
          style={[styles.title, isDarkMode && styles.darkText]}
          onPress={() => {
            setMovies([]); // Clear search results
            setPopularMovies([]); // Reset popular movies
            fetchPopularMovies(); // Reload popular movies
            router.push("/"); // Navigate to home page
          }}
        >
          eyelevel
        </Text>
        <View style={styles.headerRight}>
          <MaterialIcons
            name={isDarkMode ? "nights-stay" : "wb-sunny"}
            size={24}
            color={isDarkMode ? "#fff" : "#000"}
          />
          <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
          {user ? (
            <TouchableOpacity onPress={() => router.push("/(tabs)/user")}>
              <Text style={[styles.signInText, isDarkMode && styles.darkText]}>
                Hello, {user?.displayName || user?.email || "User"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={[styles.signInText, isDarkMode && styles.darkText]}>Sign In</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push("/screens/addFriend")}> {/* Navigate to addFriend page */}
            <Text style={[styles.addFriendButton, isDarkMode && styles.darkText]}>Add Friend</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={{
          ...styles.searchContainer,
          zIndex: 200, // Ensure parent container has a high zIndex
        }}
      >
        <TextInput
          style={styles.searchBar}
          placeholder="Search for movies..."
          value={query}
          onChangeText={handleAutocomplete}
          onSubmitEditing={() => searchMovies(query)}
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => searchMovies(query)}>
          <Text style={[styles.searchButtonText, { color: isDarkMode ? "#fff" : "#000" }]}>🔍</Text>
        </TouchableOpacity>
        {autocompleteResults.length > 0 && (
          <View
            style={{
              ...styles.autocompleteDropdown,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              zIndex: 300, // Ensure dropdown has the highest zIndex
              elevation: 20, // Add sufficient elevation for Android
              overflow: "visible", // Ensure dropdown is not clipped
            }}
          >
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
        data={movies.length > 0 ? movies : popularMovies} // Show search results or popular movies
        key={numColumns}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={renderMovieTile}
        numColumns={numColumns}
        onEndReached={loadMoreMovies}
        onEndReachedThreshold={0.5}
        columnWrapperStyle={{ justifyContent: "space-evenly" }}
        extraData={movies} // Ensure FlatList updates when movies change
      />
      {addedMovie && (
        <Animated.View style={styles.addedMovieOverlay}>
          <Text style={styles.addedMovieText}>Added "{addedMovie}" to your watchlist</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  darkContainer: {
    backgroundColor: "#121212", // Dark mode background
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    marginTop: 15,
    paddingHorizontal: 25,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  username: {
    color: "#fff",
    fontSize: 16,
  },
  darkText: {
    color: "#e0e0e0", // Light gray text for dark mode
  },
  signInText: {
    fontSize: 16,
    color: "#000",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#fff", // Default background color
    borderRadius: 8, // Match searchBar borderRadius
    borderWidth: 1,
    borderColor: "#ccc", // Default border color
    marginHorizontal: 25, // Match container padding
  },
  searchBar: {
    flex: 1,
    padding: 10,
    fontSize: 16,
    // paddingVertical: 5,
    // marginHorizontal: 10,
    backgroundColor: "#f0f0f0", // Light grey color for light mode
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },
  searchButton: {
    padding: 5,
  },
  searchButtonText: {
    fontSize: 16,
    // Removed dynamic logic from styles
    color: "#000",
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
    position: "relative",
  },
  moviePoster: {
    width: "100%",
    aspectRatio: 27 / 40,
  },
  watchlistButton: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 15,
    padding: 5,
  },
  watchlistText: {
    color: "#fff",
    fontSize: 16,
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
  addedMovieOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -100 }, { translateY: -20 }],
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 10,
    borderRadius: 5,
  },
  addedMovieText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggle: {
    marginHorizontal: 10,
  },
  addFriendButton: {
    fontSize: 16,
    color: "#000",
    marginLeft: 10,
  },
});