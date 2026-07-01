import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Values come from client/.env (copy .env.example -> .env and fill in
// your Firebase project's web config: Firebase Console > Project Settings).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
