/**
 * firebase/init.js
 * Run once to seed your Firebase Realtime Database.
 * Usage: node firebase/init.js
 *
 * Prerequisites:
 *   npm install firebase-admin
 *   Set FIREBASE_SERVICE_ACCOUNT env var (path to your serviceAccountKey.json)
 *   Set FIREBASE_DATABASE_URL env var
 */

const admin = require('firebase-admin');
const path  = require('path');
const seed  = require('./seed.json');

const serviceAccount = require(
  process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, 'serviceAccountKey.json')
);

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function seedDatabase() {
  console.log('🌱 Seeding Firebase Realtime Database...');
  try {
    await db.ref('/').set(seed);
    console.log('✅ Seed complete. All data written to /site');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seedDatabase();
