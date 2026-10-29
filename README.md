# 🇫🇷 Frenchy

A personal French learning app. It's plain HTML/CSS/JavaScript with no build step and no dependencies.

## Run it

**Live app: https://natanr610.github.io/Frenchy/**

It's hosted with GitHub Pages (Settings → Pages → Deploy from a branch). On your phone, open the link
and use "Add to Home Screen" so it works like an app. You can also open `index.html` directly in a browser.

Your progress is saved in your browser's local storage.

## Features

- **Talk (small talk practice):** 9 realistic conversations, such as meeting someone at a party, the weather,
  work, your weekend, hobbies, making plans, asking the time and saying goodbye. They speak, and you pick the natural
  reply. The English is blurred until you tap it.
- **Tenses:** drills for 20 common verbs in six tenses: présent, passé composé (including être verbs and
  agreement), imparfait, futur proche, futur simple and conditionnel. Each tense comes with an explanation, an example
  and a full conjugation table.
- **Phrases:** about 130 everyday sentences in 15 topics, such as small talk, opinions and reactions, casual
  French (bof, du coup, carrément…) and telling the time.
- **Flashcards with spaced repetition** for the phrases and about 130 words. Rate each card *Again / Good / Easy*,
  and the app schedules the next review (1 → 3 → 7 → 14 → 30 … days).
- **Quiz:** multiple choice in either direction, or type the French yourself (with accent buttons and lenient
  checking). It also has a **🕐 What time is it?** mode that generates random clock times.
- **Pronunciation:** 🔊 buttons use your device's French voice.
- **Streak, XP and a daily goal.**

Keyboard shortcuts: Space reveals a flashcard, then 1/2/3 rates it. In the quiz and Talk, the number keys pick an answer and Enter moves on.

## Adding content

Edit `data.js`: add words to `VOCAB`, verbs to `VERBS`, sentences to `PHRASES`, or conversations to `DIALOGUES`.
