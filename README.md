# 🇫🇷 Frenchy

A personal French learning app. It's plain HTML/CSS/JavaScript with no build step and no dependencies.

## Run it

**Live app: https://natanr610.github.io/Frenchy/**

It's hosted with GitHub Pages (Settings → Pages → Deploy from a branch). On your phone, open the link
and use "Add to Home Screen" so it works like an app. You can also open `index.html` directly in a browser.

Your progress is saved in your browser's local storage.

## Features

- **Flashcards with spaced repetition.** About 130 words across Basics, Numbers, Food, People, Places, Time,
  Adjectives and Verbs. Rate each card *Again / Good / Easy*, and the app schedules
  the next review (1 → 3 → 7 → 14 → 30 … days). You get a set number of new words per day.
- **Quiz.** 10 questions, either French → English, English → French, or typing the French yourself
  (with accent buttons and lenient checking for accents and articles).
- **Verb drills.** Conjugate 20 common verbs (être, avoir, aller, faire, -er/-ir/-re…) in the
  present tense. You can show a full conjugation table for each verb.
- **Phrases.** Useful sentences for greetings, cafés, travel and shopping. You can hide the English to test yourself.
- **Pronunciation.** 🔊 buttons use your device's French voice.
- **Streak, XP and a daily goal.** These track your progress from day to day.

Keyboard shortcuts: Space reveals a flashcard, then 1/2/3 rates it. In the quiz, 1–4 picks an answer and Enter moves on.

## Adding content

Edit `data.js`: add words to `VOCAB`, verbs to `VERBS`, or sentences to `PHRASES`.
