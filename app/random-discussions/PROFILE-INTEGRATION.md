# Random chat authentication and moderation storage

The random chat page uses Firebase Authentication from `app/login/firebase.js`. It waits for the signed-in user, obtains a Firebase ID token, and sends that token in the Socket.IO handshake. The server verifies the token with Firebase Admin and uses the verified token UID; it does not accept a UID supplied by the browser.

Reports are stored in the Firestore `reports` collection, active sanctions in `user_sanctions`, and moderation history in `users/{uid}/moderation_actions`. The server uses Application Default Credentials locally and the Cloud Run runtime service account in production. The runtime identity needs `roles/datastore.user`.

For local development, sign in with Google Cloud CLI Application Default Credentials using the steps in the root README. Do not add a mock UID or service account key to the client or repository.
