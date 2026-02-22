# Music Tutorials Hub

A full-stack starter website for hosting music tutorial videos with:

- User registration and login
- Free vs premium tutorial access paywall
- Admin content management for uploading, editing, and deleting tutorials

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

## Demo admin account

- Email: `admin@musicplatform.com`
- Password: `admin123`

## Notes

- Uses SQLite (`data.db`) for persistence.
- "Activate Premium" is a demo subscription endpoint that marks an authenticated user as a subscriber.
- Admin uploads use embeddable video URLs (e.g. YouTube embed links).
