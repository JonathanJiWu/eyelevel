import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

export default function WatchlistItem({ item, onRemove }: { item: any; onRemove: () => void }) {
    return (
        <View style={styles.container}>
            <Image
                source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
                style={styles.poster}
            />
            <View style={styles.details}>
                <Text style={styles.title}>{item.title || "Unknown Title"}</Text>
                <Text style={styles.info}>Year: {item.release_date?.split("-")[0] || "N/A"}</Text>
                <Text style={styles.info}>Director: {item.director || "Unknown"}</Text>
            </View>
            <TouchableOpacity onPress={onRemove}>
                <Text style={styles.removeButton}>Remove</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        padding: 15,
        backgroundColor: "#E8EAF6",
        borderRadius: 5,
        marginBottom: 15,
    },
    poster: {
        width: 50,
        height: 75,
        marginRight: 15,
    },
    details: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        color: "#3C4858",
    },
    info: {
        fontSize: 14,
        color: "#3C4858",
    },
    removeButton: {
        color: "#DB4437",
        fontWeight: "bold",
    },
});
