/**
 * Firebase JS SDK (modular) — Analytics + lectura de stats públicas
 * Proyecto: godbot-d5aa2
 *
 * La apiKey web es pública por diseño; restríngela a botgod.pro en Google Cloud Console.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

// Defaults del proyecto Godbot (sobrescribibles con window.FIREBASE_CONFIG)
const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: 'AIzaSyBvCh7rdPW35SME3VKnKO9Fo-bm4GmRbMw',
  authDomain: 'godbot-d5aa2.firebaseapp.com',
  projectId: 'godbot-d5aa2',
  storageBucket: 'godbot-d5aa2.firebasestorage.app',
  messagingSenderId: '135271463932',
  appId: '1:135271463932:web:0288c0c19337c49c229079',
  measurementId: 'G-02ZJFJD3TN',
};

let app;
try {
  app = initializeApp(firebaseConfig);
  window.GOD_FIREBASE_APP = app;
} catch (e) {
  console.warn('Firebase init:', e);
}

// Analytics (solo en browser con soporte)
if (app) {
  isSupported()
    .then((ok) => {
      if (ok) {
        window.GOD_ANALYTICS = getAnalytics(app);
      }
    })
    .catch(() => {});

  const db = getFirestore(app);
  window.GOD_FIRESTORE_STATS = async () => {
    try {
      const snap = await getDoc(doc(db, 'public', 'stats'));
      if (snap.exists()) return snap.data();
    } catch (e) {
      console.warn('Firestore stats:', e.message);
    }
    return null;
  };
}
