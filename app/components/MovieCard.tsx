import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

export default function MovieCard({ movie, onPress }: { movie: any; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={styles.card}>
            <Image
                source={{ uri: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }}
                style={styles.poster}
            />
            <Text style={styles.title}>{movie.title}</Text>
            <Text style={styles.year}>{movie.release_date?.split("-")[0]}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        margin: 5,
        backgroundColor: "#333",
        borderRadius: 5,
        overflow: "hidden",
        alignItems: "center",
    },
    poster: {
        width: "100%",
        aspectRatio: 27 / 40,
    },
    title: {
        color: "#fff",
        fontSize: 14,
        marginTop: 5,
    },
    year: {
        color: "#aaa",
        fontSize: 12,
        marginBottom: 5,
    },
});
