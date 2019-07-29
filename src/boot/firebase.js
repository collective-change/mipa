// Firebase App (the core Firebase SDK) is always required and must be listed first
import * as firebase from "firebase/app";

// Add the Firebase products that you want to use
import "firebase/auth";
import "firebase/firestore";

// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: "AIzaSyAdeJJGRZwCSeE-hc0uALhMrrrInUWHqyY",
  authDomain: "mipa-1.firebaseapp.com",
  databaseURL: "https://mipa-1.firebaseio.com",
  projectId: "mipa-1",
  storageBucket: "",
  messagingSenderId: "960836598374",
  appId: "1:960836598374:web:063890d614348251"
};
// Initialize Firebase
let firebaseApp = firebase.initializeApp(firebaseConfig);
let firebaseAuth = firebaseApp.auth();
let firebaseDb = firebaseApp.firestore();

export { firebaseAuth, firebaseDb };
