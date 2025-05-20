import React from "react";
import { View, Text } from "react-native";

const HeaderBar = ({ title }: { title: string }) => (
  <View style={{ padding: 16, backgroundColor: '#1A237E' }}>
    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{title}</Text>
  </View>
);

export default HeaderBar;
