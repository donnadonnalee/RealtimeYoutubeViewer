// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBPFxOWd29cK-zvVDAVgajvfR3leW1HXC0",
  authDomain: "realtimeviewer-1eee5.firebaseapp.com",
  databaseURL: "https://realtimeviewer-1eee5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "realtimeviewer-1eee5",
  storageBucket: "realtimeviewer-1eee5.firebasestorage.app",
  messagingSenderId: "936554169563",
  appId: "1:936554169563:web:f5ea8a6f7e666603ee38fe",
  measurementId: "G-G4QFBVN6SX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
const analytics = getAnalytics(app);
