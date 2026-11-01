'use strict';
/* Inspection App – deployment configuration (v1.7.0).
   Fill these two values after following GOOGLE-SETUP-GUIDE.pdf. They can also be typed in the app
   (More › Sync with Google Drive › Setup), so the APK does not have to be rebuilt.               */
window.APP_CONFIG = {
  // OAuth 2.0 "Web application" client ID from Google Cloud Console, e.g. 1234-abcd.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: '694974653098-6i8knrg4ot4759f0sbfgvetv0sqt2h84.apps.googleusercontent.com',
  // HTTPS address of the hosted PWA's oauth.html (must be listed as an Authorized redirect URI of the Web client),
  // e.g. https://yourname.github.io/inspection-app/oauth.html
  OAUTH_REDIRECT_URL: 'https://silver-haupia-758dcf.netlify.app/oauth.html',
  // Drive scope: hidden app-data folder – the app can never see or change any of Sir's other Drive files.
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.appdata',
  // v1.7.0: also the team folder (only files this app creates) and Google Calendar events (team Meet meetings)
  SCOPES: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
  SYNC_FILE_NAME: 'inspection-app-sync.json',
  // Android app receives the token on this custom scheme (see AndroidManifest intent-filter)
  APP_SCHEME: 'in.gujarat.excise.batti'
};
