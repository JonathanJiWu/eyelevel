// ...existing code...
useEffect(() => {
    console.log("Route params:", route?.params); // Debugging log
    console.log("Movie ID:", id); // Debugging log

    if (!id) {
        console.error("Invalid movie ID:", id);
        return;
    }

    const fetchMovie = async () => {
        try {
            const response = await axios.get(
                `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`
            );
            setMovie(response.data);
        } catch (error) {
            console.error("Error fetching movie details:", error);
        }
    };
    fetchMovie();
}, [id]);
// ...existing code...
