import { Text, View, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, Platform, Animated } from "react-native";
import { useState, useEffect } from "react";
import axios from "axios";
import { TMDB_API_KEY } from "../../tmdbConfig";
import { auth, db } from "../../firebaseConfigs";
import { useRouter } from "expo-router";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function Index() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState(null);
  const [numColumns, setNumColumns] = useState(2);
  const [addedMovie, setAddedMovie] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
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

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      alert("Signed out successfully.");
    } catch (error) {
      console.error("Error signing out:", error);
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
    <View style={styles.container}>
      <View style={styles.header}>
        {user ? (
          <View style={styles.userContainer}>
            <TouchableOpacity onPress={() => router.push("/(tabs)/user")}>
              <Text style={styles.username}>Hello, {user?.displayName || user?.email || "User"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.signOutButton}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.signInText}>Sign In</Text>
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
        key={numColumns}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={renderMovieTile}
        numColumns={numColumns}
        onEndReached={loadMoreMovies}
        onEndReachedThreshold={0.5}
        columnWrapperStyle={{ justifyContent: "space-evenly" }}
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
  userContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  signOutButton: {
    color: "#DB4437",
    fontWeight: "bold",
    marginLeft: 10,
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
});