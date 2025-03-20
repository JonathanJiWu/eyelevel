// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyASbObORAbk-G3M1YcNIB_DRFBIK3dMw8Y",
  authDomain: "eyelevel-2025.firebaseapp.com",
  projectId: "eyelevel-2025",
  storageBucket: "eyelevel-2025.firebasestorage.app",
  messagingSenderId: "55264854878",
  appId: "1:55264854878:web:6ce9df1a485da3710045cf",
  measurementId: "G-QVTLS2DSSC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
