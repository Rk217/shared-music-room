import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyDWP6tYKimLbW7wXQKT2qeZzlc58jE8600",
  authDomain: "rk45-f3792.firebaseapp.com",
  projectId: "rk45-f3792",
  storageBucket: "rk45-f3792.firebasestorage.app",
  messagingSenderId: "757856225824",
  appId: "1:757856225824:web:f3f4cf89d882ffef460a45"
};

export const isFirebaseConfigured =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.projectId) &&
  Boolean(firebaseConfig.appId);

console.log("Firebase configured:", isFirebaseConfigured);

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const db = getFirestore(app);
