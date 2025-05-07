# EyeLevel Movie App

EyeLevel is a React Native application that provides detailed information about movies using the TMDB API. Users can explore movie details, including cast, genres, and directors, and manage their personalized watchlist. The app supports both light and dark modes for an enhanced user experience.

## Features

- **Movie Details**: View detailed information about movies, including cast, genres, languages, and directors.
- **Watchlist Management**: Add or remove movies from your personalized watchlist.
- **Responsive Design**: Adapts to both portrait and landscape orientations.
- **Dark Mode Support**: Automatically adjusts the UI for light and dark modes.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/JonathanJiWu/eyelevel.git
   cd eyelevel
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add your TMDB API key:
   - Update the `app/config/tmdbConfig.ts` file:

     ```typescript
     export const TMDB_API_KEY = "your_tmdb_api_key";
     ```

4. Configure Firebase:
   - Update the `app/config/firebaseConfigs.ts` file with your Firebase configuration.

5. Run the app:

   ```bash
   npm run start
   ```

## Technologies Used

- **React Native**: For building the mobile application.
- **Firebase**: For user authentication and watchlist storage.
- **TMDB API**: For fetching movie data.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
